from fastapi import APIRouter, FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Body, Form, Query, Request, BackgroundTasks
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload
from passlib.context import CryptContext
import jwt
import secrets
import os
import random
import time
import json
from eth_account.messages import encode_defunct
from eth_account import Account
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database import database
from database import models

from database import database, models
from schemas import user as user_schemas
import blockchain
from pydantic import BaseModel

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from fastapi.responses import HTMLResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from sqlalchemy import or_, and_
from sqlalchemy.orm import joinedload
from contextlib import asynccontextmanager
from sqlalchemy import cast, String

load_dotenv()

# --- 1. CONFIGURACIÓN DE CORREO ---
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://axia-sandy.vercel.app")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

REFRESH_TOKEN_EXPIRE_DAYS = 30
ACCESS_TOKEN_EXPIRE_MINUTES = 15

# Almacén temporal de nonces
temporary_nonces = {}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

models.Base.metadata.create_all(bind=database.engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- CÓDIGO DE INICIO (Startup) ---
    # Solo intentar configurar la logística si el nodo blockchain está activo
    # y todas las variables de entorno necesarias están presentes.
    if (
        blockchain.LOGISTICS_PRIVATE_KEY
        and blockchain.marketplace_contract
        and blockchain.w3.is_connected()
    ):
        try:
            blockchain.initialize_logistics_system_onchain()
            print("Sistema logístico inicializado correctamente en el arranque.")
        except Exception as e:
            print(f"Aviso: no se pudo registrar el sistema logístico on-chain: {e}")
    else:
        missing = []
        if not blockchain.LOGISTICS_PRIVATE_KEY:
            missing.append("LOGISTICS_PRIVATE_KEY")
        if not blockchain.marketplace_contract:
            missing.append("MARKETPLACE_ADDRESS")
        if not blockchain.w3.is_connected():
            missing.append("nodo RPC no disponible")
        if missing:
            print(f"Logística on-chain omitida (falta: {', '.join(missing)}).")

    yield  # La aplicación FastAPI queda corriendo aquí

    # --- CÓDIGO DE APAGADO (Shutdown) ---

# 2. Pasamos el lifespan al inicializar FastAPI
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AXIA Backend", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

compra_venta = APIRouter(prefix="/nfts", tags=["Marketplace"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://axia-sandy.vercel.app"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"], 
    allow_headers=["Authorization", "Content-Type"],
)

# ---------- WEBSOCKET MANAGER ----------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: dict = {}  # {user_id: [ws, ...]}

    async def connect(self, websocket: WebSocket, user_id: Optional[int] = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if user_id is not None:
            self.user_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: Optional[int] = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id is not None:
            conns = self.user_connections.get(user_id, [])
            self.user_connections[user_id] = [ws for ws in conns if ws != websocket]
            if not self.user_connections.get(user_id):
                self.user_connections.pop(user_id, None)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                pass

    async def send_to_user(self, user_id: int, message: str):
        """Envía un mensaje solo a las conexiones del usuario indicado."""
        for ws in list(self.user_connections.get(user_id, [])):
            try:
                await ws.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws/admin")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/{user_id}")
async def websocket_user_personal(websocket: WebSocket, user_id: int, token: str = Query(None)):
    """Conexión personal: los mensajes dirigidos a user_id llegan solo aquí."""
    if not token:
        await websocket.close(code=1008)
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_user_id = int(payload.get("sub"))
        if token_user_id != user_id:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


@app.websocket("/ws")
async def websocket_user_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ---------- FUNCIONES AUXILIARES ----------
def get_password_hash(password):
    return pwd_context.hash(password[:72])

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)) -> models.User:
    payload = decode_token(token)
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Identidad del token corrupta")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

def send_email(to_email: str, subject: str, html_body: str):
    try:
        config = sib_api_v3_sdk.Configuration()
        config.api_key['api-key'] = BREVO_API_KEY
        api = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(config))
        api.send_transac_email(sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email}],
            sender={"name": "AXIA", "email": "axiawatches@gmail.com"},
            subject=subject,
            html_content=html_body,
        ))
    except Exception as e:
        print(f"Error enviando correo: {e}")

def get_axia_template(titulo: str, mensaje: str, contenido_extra: str):
    """Genera un HTML con la estética profesional y futurista de AXIA (Polygon style)."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{titulo} · AXIA</title>
</head>
<body style="margin:0;padding:0;background-color:#080812;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#080812;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

        <!-- Header con logo -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f0c1a 0%,#1a1030 100%);border-radius:20px 20px 0 0;padding:36px 40px 28px;text-align:center;border:1px solid #2a2050;border-bottom:none;">
            <div style="display:inline-block;">
              <!-- Símbolo hexagonal AXIA -->
              <span style="display:inline-block;width:48px;height:48px;line-height:48px;background:linear-gradient(135deg,#8247e5,#a855f7);border-radius:12px;font-size:22px;color:#fff;font-weight:900;letter-spacing:-1px;text-align:center;">⬡</span>
            </div>
            <h1 style="margin:14px 0 4px;color:#f8f8ff;font-size:26px;font-weight:700;letter-spacing:6px;text-transform:uppercase;">AXIA</h1>
            <p style="margin:0;color:#7c60a8;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Alta Relojería Digital · Blockchain</p>
          </td>
        </tr>

        <!-- Línea degradado -->
        <tr>
          <td style="border-left:1px solid #2a2050;border-right:1px solid #2a2050;">
            <div style="height:2px;background:linear-gradient(to right,#8247e5,#a855f7,#8247e5);"></div>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="background-color:#0f0d1c;padding:40px 40px 32px;border-left:1px solid #2a2050;border-right:1px solid #2a2050;">
            <h2 style="margin:0 0 16px;color:#f8f8ff;font-size:20px;font-weight:600;">{titulo}</h2>
            <p style="margin:0 0 28px;color:#9080b4;line-height:1.7;font-size:15px;">{mensaje}</p>
            <div style="text-align:center;">
              {contenido_extra}
            </div>
          </td>
        </tr>

        <!-- Aviso de seguridad -->
        <tr>
          <td style="background-color:#0c0a18;padding:20px 40px;border-left:1px solid #2a2050;border-right:1px solid #2a2050;">
            <p style="margin:0;color:#4a3870;font-size:12px;line-height:1.6;">
              🔒 Si no has solicitado este correo, puedes ignorarlo con total seguridad. Nunca te pediremos tu contraseña por email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#080812;border:1px solid #2a2050;border-top:none;border-radius:0 0 20px 20px;padding:24px 40px;text-align:center;">
            <div style="height:1px;background:linear-gradient(to right,transparent,#2a2050,transparent);margin-bottom:20px;"></div>
            <p style="margin:0 0 6px;color:#3a2d5a;font-size:11px;letter-spacing:1px;">© 2026 AXIA — Todos los derechos reservados</p>
            <p style="margin:0;color:#2a2042;font-size:10px;">Ecosistema de blockchain para alta relojería · Polygon Network</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>"""

async def create_notification(
    db: Session, 
    user_id: int, 
    title: str, 
    message: str, 
    notification_type: str, 
    watch_id: Optional[int] = None
):
    """
    Crea una notificación en la DB y emite un broadcast por WebSocket.
    Tipos sugeridos: 'PENDING', 'APPROVED', 'REJECTED', 'INFO', 'SALE', 'OFFER'
    """
    try:
        new_notif = models.Notification(
            user_id=user_id,
            watch_id=watch_id, # Recordando que apunta a watches.token_id
            title=title,
            message=message,
            type=notification_type
        )
        db.add(new_notif)
        db.commit()
        db.refresh(new_notif)

        # Avisamos solo al usuario destinatario para que refresque
        await manager.send_to_user(user_id, "update_users")
        
        return new_notif
    except Exception as e:
        db.rollback()
        print(f"Error creando notificación: {e}")
        return None

# --------------------- ENDPOINTS ---------------------

# ---------- LOGIN Y REGISTRO ---------------
@app.get("/status")
def get_status():
    return {"status": "online", "architecture": "MVC Hybrid"}

def _verify_sdm(picc_hex: str, cmac_hex: str, sdm_key_hex: str):
    """Verifica SDM del NTAG 424 DNA. Retorna (ok, uid_bytes, counter)."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.cmac import CMAC as CRY_CMAC
    from cryptography.hazmat.primitives.ciphers import algorithms as cry_alg
    from cryptography.hazmat.backends import default_backend
    sdm_key   = bytes.fromhex(sdm_key_hex)
    enc_picc  = bytes.fromhex(picc_hex)      # 16 bytes cifrados AES-128-CBC
    recv_cmac = bytes.fromhex(cmac_hex)      # 8 bytes CMAC truncado
    # Descifrar picc → UID(7B) || counter(3B LE) || padding(6B)
    cipher = Cipher(algorithms.AES(sdm_key), modes.CBC(b'\x00' * 16), backend=default_backend())
    dec = cipher.decryptor()
    plain = dec.update(enc_picc) + dec.finalize()
    uid_bytes = plain[:7]
    counter   = int.from_bytes(plain[7:10], 'little')
    # Verificar CMAC: AES-CMAC(key, enc_picc)[:8]
    c = CRY_CMAC(cry_alg.AES(sdm_key), backend=default_backend())
    c.update(enc_picc)
    expected_cmac = c.finalize()[:8]
    return recv_cmac == expected_cmac, uid_bytes, counter

@app.get("/nfc/{token_id}")
def nfc_redirect(
    token_id: int,
    picc: Optional[str] = Query(None),
    cmac: Optional[str] = Query(None),
    db: Session = Depends(database.get_db)
):
    """
    Punto de entrada para tarjetas NFC NTAG 424 DNA.
    Sin picc/cmac → URL estática (Fase 1).
    Con picc/cmac → verificación SDM (Fase 2); redirige con ?verified=true/false.
    """
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    verified_param = ""
    if picc and cmac and watch.sdm_key:
        try:
            ok, uid_bytes, counter = _verify_sdm(picc, cmac, watch.sdm_key)
            if ok and counter > watch.last_sdm_counter:
                watch.last_sdm_counter = counter
                db.commit()
                verified_param = "?verified=true"
            else:
                verified_param = "?verified=false"
        except Exception:
            verified_param = "?verified=false"

    return RedirectResponse(url=f"{FRONTEND_URL}/nfc-scan/{token_id}{verified_param}")

@app.post("/register", response_model=user_schemas.UserResponse)
@limiter.limit("5/minute")
def register_user(request: Request, background_tasks: BackgroundTasks, user: user_schemas.UserCreate, db: Session = Depends(database.get_db)):
    existing_user = db.query(models.User).filter(
        (models.User.email == user.email) | (models.User.username == user.username)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="El email o nombre de usuario ya existe")
    
    new_user = models.User(
        username=user.username, full_name=user.full_name, email=user.email,
        password_hash=get_password_hash(user.password), is_active=True, is_verified=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    verify_payload = {"sub": str(new_user.id), "type": "verify", "exp": datetime.now(timezone.utc) + timedelta(hours=24)}
    token = jwt.encode(verify_payload, SECRET_KEY, algorithm=ALGORITHM)
    verify_link = f"{BACKEND_URL}/verify-email?token={token}"
    
    extra = f"""
    <a href="{verify_link}"
       style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#8247e5,#a855f7);color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.5px;box-shadow:0 4px 20px rgba(130,71,229,0.4);">
      Verificar mi cuenta
    </a>
    <p style="margin:24px 0 0;color:#4a3870;font-size:12px;">
      El enlace expira en <strong style="color:#7c60a8;">24 horas</strong>. Si el botón no funciona, copia y pega esta URL en tu navegador:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;font-size:11px;color:#3a2d5a;">{verify_link}</p>
    """
    html = get_axia_template(
        "Confirma tu cuenta",
        f"Hola <strong style='color:#f8f8ff;'>{user.full_name}</strong>,<br><br>Gracias por unirte a AXIA. Haz clic en el botón de abajo para verificar tu dirección de correo y activar tu cuenta.",
        extra
    )
    background_tasks.add_task(send_email, new_user.email, "AXIA · Confirma tu correo electrónico", html)
    background_tasks.add_task(manager.broadcast, {"type": "new_user_registered"})

    return new_user

@app.post("/login", response_model=user_schemas.LoginSuccess)
@limiter.limit("10/minute")
def login_user(request: Request, user_credentials: user_schemas.UserLogin, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(
        (models.User.email == user_credentials.identifier) | 
        (models.User.username == user_credentials.identifier)
    ).first()
    
    if not user or not verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Debes verificar tu correo electrónico antes de iniciar sesión.")
    
    if user.is_admin and user.roles != []:
        user.roles = []
        db.commit()
    
    token = create_access_token(data={"sub": str(user.id), "is_admin": user.is_admin})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return {
        "access_token": token, 
        "refresh_token": refresh_token,
        "token_type": "bearer", 
        "user": user 
    }
@app.get("/verify-email", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(database.get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "verify":
            raise jwt.InvalidTokenError
        user_id = int(payload.get("sub"))
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user:
            user.is_verified = True
            db.commit()
            return """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AXIA · Cuenta verificada</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .card{background:#13112a;border:1px solid #2a2542;border-radius:20px;padding:48px 40px;max-width:420px;width:90%;text-align:center;box-shadow:0 0 60px rgba(130,71,229,0.15);}
    .logo{font-size:22px;font-weight:800;letter-spacing:3px;color:#f8f8ff;margin-bottom:32px;}
    .logo span{color:#8247e5;}
    .icon{width:72px;height:72px;background:linear-gradient(135deg,#8247e5,#a855f7);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px;}
    h1{color:#f8f8ff;font-size:22px;font-weight:700;margin-bottom:12px;}
    p{color:#9ca3af;font-size:14px;line-height:1.6;margin-bottom:28px;}
    .badge{display:inline-flex;align-items:center;gap:6px;background:#0c1a0c;border:1px solid #16a34a;border-radius:999px;padding:6px 16px;color:#4ade80;font-size:13px;font-weight:600;margin-bottom:32px;}
    .btn{display:inline-block;background:linear-gradient(135deg,#8247e5,#a855f7);color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;}
    .footer{margin-top:32px;color:#4b5563;font-size:12px;}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AX<span>I</span>A</div>
    <div class="icon">✓</div>
    <div class="badge">✔ Verificación completada</div>
    <h1>¡Tu cuenta está activa!</h1>
    <p>Tu dirección de correo ha sido verificada correctamente. Ya puedes iniciar sesión en AXIA y empezar a explorar el marketplace de alta relojería.</p>
    <a class="btn" href="https://axia-sandy.vercel.app/login">Iniciar sesión</a>
    <div class="footer">AXIA · Alta Relojería · Blockchain</div>
  </div>
</body>
</html>"""
    except Exception:
        return """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AXIA · Enlace inválido</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .card{background:#13112a;border:1px solid #2a2542;border-radius:20px;padding:48px 40px;max-width:420px;width:90%;text-align:center;box-shadow:0 0 60px rgba(229,71,71,0.1);}
    .logo{font-size:22px;font-weight:800;letter-spacing:3px;color:#f8f8ff;margin-bottom:32px;}
    .logo span{color:#8247e5;}
    .icon{width:72px;height:72px;background:linear-gradient(135deg,#7f1d1d,#dc2626);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px;}
    h1{color:#f8f8ff;font-size:22px;font-weight:700;margin-bottom:12px;}
    p{color:#9ca3af;font-size:14px;line-height:1.6;margin-bottom:28px;}
    .badge{display:inline-flex;align-items:center;gap:6px;background:#1a0a0a;border:1px solid #dc2626;border-radius:999px;padding:6px 16px;color:#f87171;font-size:13px;font-weight:600;margin-bottom:32px;}
    .btn{display:inline-block;background:linear-gradient(135deg,#8247e5,#a855f7);color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;}
    .footer{margin-top:32px;color:#4b5563;font-size:12px;}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AX<span>I</span>A</div>
    <div class="icon">✕</div>
    <div class="badge">✕ Enlace inválido</div>
    <h1>Enlace expirado o inválido</h1>
    <p>Este enlace de verificación no es válido o ha expirado. Regístrate de nuevo en la aplicación para recibir un correo actualizado.</p>
    <a class="btn" href="https://axia-sandy.vercel.app/login">Iniciar sesión</a>
    <div class="footer">AXIA · Alta Relojería · Blockchain</div>
  </div>
</body>
</html>"""

@app.post("/forgot-password")
def forgot_password(background_tasks: BackgroundTasks, email: str = Body(..., embed=True), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == email.lower().strip()).first()
    if not user:
        return {"message": "Si el correo existe, se han enviado las instrucciones."}
    
    reset_token = create_access_token(data={"sub": str(user.id), "type": "reset"})
    
    extra = f"""
    <p style="margin:0 0 12px;color:#7c60a8;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Código de verificación</p>
    <div style="background-color:#0c0a18;border:1px solid #3a2d6a;border-radius:12px;padding:18px 20px;">
      <code style="color:#c084fc;font-family:'Courier New',monospace;font-size:11px;word-break:break-all;display:block;line-height:1.6;">
        {reset_token}
      </code>
    </div>
    <div style="margin-top:18px;display:inline-block;background-color:#1a0f0f;border:1px solid #7c2d12;border-radius:8px;padding:10px 16px;">
      <p style="margin:0;color:#fb923c;font-size:12px;font-weight:600;">⏱ Válido durante 15 minutos</p>
    </div>
    """

    html = get_axia_template(
        "Recuperación de acceso",
        "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta AXIA.<br><br>Copia el código de seguridad que aparece a continuación y pégalo en la aplicación para continuar.",
        extra
    )

    background_tasks.add_task(send_email, user.email, "AXIA · Código de recuperación de contraseña", html)
    return {"message": "Si el correo existe, se han enviado las instrucciones."}

@app.post("/reset-password")
def reset_password(request: user_schemas.ResetPasswordRequest, db: Session = Depends(database.get_db)):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "reset":
            raise HTTPException(status_code=400, detail="Token inválido")
            
        user_id = int(payload.get("sub"))
        user = db.query(models.User).filter(models.User.id == user_id).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
            
        user.password_hash = get_password_hash(request.new_password)
        db.commit()
        return {"message": "Contraseña actualizada correctamente"}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="El código ha caducado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Código corrupto o inválido")

@app.post("/refresh")
def refresh_access_token(refresh_token: str = Body(..., embed=True), db: Session = Depends(database.get_db)):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user = db.query(models.User).filter(models.User.id == user_id).first()
        
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Usuario inactivo o eliminado")
        
        new_access_token = create_access_token(data={"sub": str(user.id), "is_admin": user.is_admin})
        new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        return {"access_token": new_access_token, "refresh_token": new_refresh_token}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Refresh token inválido")

@app.get("/users/me", response_model=user_schemas.UserResponse)
def get_user_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.patch("/users/me")
def update_user_me(
    full_name: str = Form(None),
    location: str = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if full_name is not None:
        current_user.full_name = full_name.strip()
    if location is not None:
        current_user.location = location.strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/users/me", status_code=204)
def delete_account(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_user.is_active = False
    current_user.full_name = f"Usuario eliminado"
    current_user.location = None
    current_user.wallet_address = None
    current_user.requested_role = None
    current_user.request_message = None
    db.commit()


@app.post("/users/me/change-password")
def change_password(
    current_password: str = Body(...),
    new_password: str = Body(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres.")
    current_user.password_hash = get_password_hash(new_password)
    db.commit()
    return {"detail": "Contraseña actualizada correctamente."}

# LISTA DE TODOS LOS USUARIOS DEL SISTEMA
@app.get("/users", response_model=List[user_schemas.UserPublic])
def get_all_users(db: Session = Depends(database.get_db)):
    users = db.query(models.User).all()
    return users


@app.get("/users/by-wallet/{address}", response_model=user_schemas.UserPublic)
def get_user_by_wallet(
    address: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(
        models.User.wallet_address.ilike(address)
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado para esa wallet.")
    return user

# ============================================
#  WEB3 AUTH 
# ============================================
@app.post("/auth/challenge")
def get_challenge(challenge: user_schemas.AuthChallenge):
    nonce = f"AXIA Authentication Request: {secrets.token_hex(8)}"
    temporary_nonces[challenge.address.lower()] = nonce
    return {"nonce": nonce}

@app.post("/auth/verify")
def verify_signature(auth: user_schemas.AuthVerify, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    address_key = auth.address.lower()
    expected_nonce = temporary_nonces.get(address_key)
    
    if not expected_nonce or expected_nonce != auth.nonce:
        raise HTTPException(status_code=400, detail="Nonce inválido")

    try:
        message_hash = encode_defunct(text=auth.nonce)
        recovered_address = Account.recover_message(message_hash, signature=auth.signature)
    except Exception as e:
        print(f"Error recuperando firma: {e}")
        raise HTTPException(status_code=400, detail="Error en la verificación de la firma")

    if recovered_address.lower() != address_key:
        raise HTTPException(status_code=401, detail="Firma no válida")

    existing_user = db.query(models.User).filter(
        models.User.wallet_address == recovered_address,
        models.User.id != current_user.id
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Esta wallet ya está vinculada a otra cuenta en la plataforma.")

    current_user.wallet_address = recovered_address
    db.commit()
    db.refresh(current_user)

    if address_key in temporary_nonces:
        del temporary_nonces[address_key]

    # Registrar en blockchain los roles profesionales que ya tenga aprobados
    # (el admin los aprobó cuando aún no había wallet vinculada)
    professional_roles = [r for r in (current_user.roles or []) if r in ("FABRICANTE", "DEALER", "RELOJERO")]
    for role in professional_roles:
        try:
            blockchain.set_blockchain_role(recovered_address, role, True)
        except Exception as e:
            print(f"[wallet_link] No se pudo registrar {role} en blockchain: {e}")

    return current_user
    
@app.post("/auth/disconnect")
def disconnect_wallet(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    try:
        wallet = current_user.wallet_address
        professional_roles = [r for r in (current_user.roles or []) if r in ("FABRICANTE", "DEALER", "RELOJERO")]

        current_user.wallet_address = None
        db.commit()
        db.refresh(current_user)

        # Revocar roles profesionales en el smart contract
        if wallet:
            for role in professional_roles:
                try:
                    blockchain.set_blockchain_role(wallet, role, False)
                except Exception as e:
                    print(f"[wallet_disconnect] No se pudo revocar {role} en blockchain: {e}")

        return current_user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al desvincular la wallet")


# ======================================================
#  GESTIÓN Y SINCRONIZACIÓN DE NFTS 
# ======================================================
@app.post("/nfts/import/{token_id}")
def import_and_save_nft(token_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    try:
        # Se extrae el perfil completo desde la blockchain
        profile = blockchain.get_full_watch_profile(token_id)
        w_data = profile["watch"]
        
        # --- LÓGICA DE SINCRONIZACIÓN DE MERCADO ---
        listing_data = profile.get("listing")
        is_now_listed = True if listing_data else False
        current_price = listing_data.get("price") if is_now_listed else None

        # Seguridad Web3
        owner_blockchain = str(w_data.get("owner_wallet", "")).strip().lower()
        mi_wallet = str(current_user.wallet_address).strip().lower() if current_user.wallet_address else "vacio"

        if not mi_wallet or mi_wallet == "vacio" or owner_blockchain != mi_wallet:
            raise HTTPException(
                status_code=403, 
                detail="No puedes importar este reloj porque la wallet conectada no coincide con la del propietario en la blockchain."
            )

        # 1. Procesar la tabla Watch principal
        watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
        
        if watch:
            if watch.owner_id == current_user.id and getattr(watch, 'is_imported', False):
                raise HTTPException(
                    status_code=400, 
                    detail="Este reloj ya está importado en tu colección."
                )
            
            # Actualizar atributos (ELIMINADO watch.price = current_price)
            watch.owner_id = current_user.id
            watch.is_imported = True
            watch.is_listed = is_now_listed  
            if is_now_listed:
                watch.is_public = True
            
            for key, value in w_data.items():
                if hasattr(watch, key):
                    setattr(watch, key, value)
        else:
            # Crear nuevo reloj (ELIMINADO price=current_price del constructor)
            watch_kwargs = {k: v for k, v in w_data.items() if hasattr(models.Watch, k)}
            watch = models.Watch(
                owner_id=current_user.id, 
                is_listed=is_now_listed, 
                **watch_kwargs
            )
            db.add(watch)
        
        db.commit()

        # 2. Sincronizar Historial
        db.query(models.WatchRevision).filter(models.WatchRevision.token_id == token_id).delete()
        db.query(models.WatchVerification).filter(models.WatchVerification.token_id == token_id).delete()
        db.query(models.MarketplaceListing).filter(models.MarketplaceListing.token_id == token_id).delete()
        db.query(models.WatchAuction).filter(models.WatchAuction.token_id == token_id).delete()
        db.query(models.WatchOwnershipHistory).filter(models.WatchOwnershipHistory.token_id == token_id).delete()

        for rev in profile.get("revisions", []):
            db.add(models.WatchRevision(token_id=token_id, **rev))

        for verif in profile.get("verifications", []):
            db.add(models.WatchVerification(token_id=token_id, **verif))

        # Insertar listado de mercado
        if listing_data:
            db.add(models.MarketplaceListing(token_id=token_id, **listing_data))

        # Insertar subasta
        if profile.get("auction"):
            db.add(models.WatchAuction(token_id=token_id, **profile["auction"]))

        # 3. Reconstruir historial de propietarios desde eventos blockchain
        try:
            chain_history = blockchain.get_ownership_history_from_chain(token_id)
            print(f"[import] Historial blockchain token {token_id}: {len(chain_history)} entradas")
            for entry in chain_history:
                db.add(models.WatchOwnershipHistory(
                    token_id=token_id,
                    previous_owner_wallet=entry.get("previous_owner_wallet"),
                    new_owner_wallet=entry.get("new_owner_wallet"),
                    via_contract_wallet=entry.get("via_contract_wallet"),
                    price_usdc=entry.get("price_usdc"),
                    transferred_at=entry.get("transferred_at"),
                ))
        except Exception as e:
            print(f"[import] Aviso: no se pudo reconstruir historial de propietarios desde blockchain: {e}")

        db.commit()
        
        return {
            "id": token_id, 
            "brand": watch.brand, 
            "model": watch.model, 
            "is_listed": watch.is_listed, 
            "price": current_price # Ajustado para devolver current_price en lugar de watch.price
        }
        
    except HTTPException as e:
        db.rollback()
        raise e
    except Exception as e:
        db.rollback()
        print(f"Error interno: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/nfts/my-collection")
def get_my_collection(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    # 1. Relojes que el usuario POSEE (y puede estar vendiendo)
    # Solo unimos el listing si está activo (1-4); ignoramos los completados (5) y cancelados (0)
    raw_owned = db.query(models.Watch, models.MarketplaceListing).outerjoin(
        models.MarketplaceListing,
        and_(
            models.MarketplaceListing.token_id == models.Watch.token_id,
            models.MarketplaceListing.listing_state.between(1, 4)
        )
    ).filter(
        models.Watch.owner_id == current_user.id,
        models.Watch.is_imported.in_([True, 1])
    ).all()

    # Deduplicar: si un reloj tiene varios listings activos, quedarse con el de mayor id
    seen_owned: dict = {}
    for w, listing in raw_owned:
        tid = w.token_id
        prev_listing = seen_owned.get(tid, (w, None))[1]
        if tid not in seen_owned or (listing and (prev_listing is None or listing.id > prev_listing.id)):
            seen_owned[tid] = (w, listing)
    owned_watches = list(seen_owned.values())

    # 2. Relojes que el usuario ESTÁ COMPRANDO (en proceso de Escrow)
    buying_watches = []
    if current_user.wallet_address:
        buying_watches = db.query(models.Watch, models.MarketplaceListing).join(
            models.MarketplaceListing,
            models.MarketplaceListing.token_id == models.Watch.token_id
        ).filter(
            models.MarketplaceListing.buyer.ilike(current_user.wallet_address),
            models.MarketplaceListing.listing_state.between(2, 4) # Solo activos en Escrow (no completados)
        ).all()

    # Precargar subastas activas para todos los relojes propios (evitar N+1)
    owned_token_ids = [w.token_id for w, _ in owned_watches]
    now = int(time.time())
    active_auctions_map = {
        a.token_id: a
        for a in db.query(models.WatchAuction).filter(
            models.WatchAuction.token_id.in_(owned_token_ids),
            models.WatchAuction.is_active == True,
        ).all()
    }

    results = []

    # Formatear los del vendedor
    for w, listing in owned_watches:
        auction = active_auctions_map.get(w.token_id)
        results.append({
            "id": w.token_id,
            "brand": w.brand,
            "model": w.model,
            "serial_number": w.serial_number,
            "image": w.image_url,
            "manufacturing_year": w.manufacturing_year,
            "is_listed": w.is_listed,
            "price": listing.price if listing else 0,
            "security_state": w.security_state,
            "marketplace_state": listing.listing_state if listing else 0,
            "listing_id": listing.id if listing else None,
            "is_p2p": listing.is_p2p if listing else True,
            "is_buyer": False,
            "is_reverification": bool(listing and listing.buyer is None and listing.price == 0),
            "is_auction": bool(auction),
            "auction_data": {
                "highest_bid": auction.highest_bid / 10**6,
                "min_price": auction.min_price / 10**6,
                "seconds_remaining": max(0, auction.end_time - now),
            } if auction else None,
        })

    # Formatear los del comprador
    for w, listing in buying_watches:
        results.append({
            "id": w.token_id,
            "brand": w.brand,
            "model": w.model,
            "serial_number": w.serial_number,
            "image": w.image_url,
            "manufacturing_year": w.manufacturing_year,
            "is_listed": w.is_listed,
            "price": listing.price if listing else 0,
            "security_state": w.security_state,
            "marketplace_state": listing.listing_state if listing else 0,
            "listing_id": listing.id if listing else None,
            "is_buyer": True,
            "is_p2p": listing.is_p2p if listing else True,
            "watchmaker_approved": listing.watchmaker_approved if listing else False,
        })
        
    return results

@app.delete("/nfts/import/{token_id}")
def remove_nft_from_view(token_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    watch = db.query(models.Watch).filter(
        models.Watch.token_id == token_id,
        models.Watch.owner_id == current_user.id
    ).first()

    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado en tu base de datos.")

    # Borrar todos los datos derivados del reloj — se reconstruirán desde blockchain al reimportar
    db.query(models.WatchOwnershipHistory).filter(models.WatchOwnershipHistory.token_id == token_id).delete()
    db.query(models.WatchRevision).filter(models.WatchRevision.token_id == token_id).delete()
    db.query(models.WatchVerification).filter(models.WatchVerification.token_id == token_id).delete()
    db.query(models.MarketplaceListing).filter(models.MarketplaceListing.token_id == token_id).delete()
    db.query(models.WatchAuction).filter(models.WatchAuction.token_id == token_id).delete()

    watch.is_imported = False
    db.commit()
    return {"status": "success"}

# ==============================================================================
#   CONTEO DE RELOJES MINTEADOS POR EL FABRICANTE (incluyendo vendidos)
# ==============================================================================
@app.get("/nfts/minted-count")
def get_minted_count(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.wallet_address:
        return {"count": 0}
    count = db.query(models.Watch).filter(
        models.Watch.manufacturer_wallet.ilike(current_user.wallet_address)
    ).count()
    return {"count": count}


# ==============================================================================
#   REGISTRO DE RELOJ MINTEADO (Herramienta de fabricante)
# ==============================================================================
@app.post("/nfts/mint-register")
async def register_minted_nft(
    data: user_schemas.MintRegisterRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Registra en la BD un reloj recién minteado desde la herramienta de escritorio.
    Solo accesible por usuarios con rol FABRICANTE.
    """
    if "FABRICANTE" not in (current_user.roles or []):
        raise HTTPException(status_code=403, detail="Solo fabricantes pueden registrar relojes.")

    existing = db.query(models.Watch).filter(models.Watch.token_id == data.token_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"El token #{data.token_id} ya está registrado.")

    mint_dt = None
    if data.mint_date:
        try:
            mint_dt = datetime.fromisoformat(data.mint_date.replace("Z", "+00:00"))
        except Exception:
            pass

    # Determinar el propietario real: si la wallet destino es de otro usuario AXIA,
    # el reloj le pertenece a él desde el primer momento (el fabricante nunca lo poseyó).
    fabricante_wallet = (current_user.wallet_address or "").lower()
    destino_wallet    = (data.owner_wallet or "").lower()
    destinatario      = None
    if destino_wallet and destino_wallet != fabricante_wallet:
        destinatario = db.query(models.User).filter(
            models.User.wallet_address.ilike(destino_wallet)
        ).first()

    final_owner_id    = destinatario.id if destinatario else current_user.id
    # El fabricante ve el reloj en su stock; el destinatario debe importarlo manualmente
    final_is_imported = False if (destino_wallet and destino_wallet != fabricante_wallet) else True

    watch = models.Watch(
        token_id=data.token_id,
        owner_id=final_owner_id,
        brand=data.brand,
        model=data.model,
        serial_number=data.serial_number,
        manufacturing_year=data.year,
        image_url=data.image_url,
        owner_wallet=data.owner_wallet,
        manufacturer_wallet=current_user.wallet_address or data.owner_wallet,
        hash_uid=data.hash_uid,
        is_imported=final_is_imported,
        is_listed=False,
        is_public=False,
        watch_state=0,
        security_state=0,
        mint_date=mint_dt,
    )
    db.add(watch)
    db.flush()

    # Verificación de origen: espeja la que el contrato escribe en mintWatch
    mint_ts = int(mint_dt.timestamp()) if mint_dt else int(datetime.utcnow().timestamp())
    origin_verification = models.WatchVerification(
        token_id=data.token_id,
        watchmaker=current_user.wallet_address or data.owner_wallet,
        date=mint_ts,
        comment="Certificado de fabricacion original. Reloj vinculado a chip NFC y registrado en blockchain por el fabricante.",
    )
    db.add(origin_verification)
    db.commit()
    db.refresh(watch)

    # Registrar el evento de minteo directamente (from=0x000...000 → fabricante)
    try:
        from datetime import timezone as _tz
        mint_ts_dt = mint_dt.replace(tzinfo=_tz.utc) if mint_dt and mint_dt.tzinfo is None else mint_dt
        mint_history = models.WatchOwnershipHistory(
            token_id=data.token_id,
            previous_owner_wallet="0x0000000000000000000000000000000000000000",
            new_owner_wallet=data.owner_wallet,
            via_contract_wallet=None,
            price_usdc=None,
            transferred_at=mint_ts_dt,
        )
        db.add(mint_history)
        db.commit()
    except Exception as e:
        print(f"[register_minted] No se pudo guardar historial de minteo: {e}")

    await create_notification(
        db, current_user.id,
        "Reloj minteado con éxito",
        f"{data.brand} {data.model} (#{data.token_id}) registrado en blockchain.",
        "INFO",
        watch_id=data.token_id,
    )

    # Notificar al destinatario para que importe el reloj manualmente
    if destinatario:
        await create_notification(
            db, destinatario.id,
            f"Nuevo reloj asignado: {data.brand} {data.model}",
            f"{current_user.full_name} te ha asignado el reloj #{data.token_id}. "
            f"Ve a tu colección, conéctate a tu wallet e impórtalo.",
            "WATCH_ASSIGNED",
            watch_id=data.token_id,
        )

    await manager.broadcast("update_marketplace")

    return {
        "token_id": watch.token_id,
        "brand": watch.brand,
        "model": watch.model,
        "serial_number": watch.serial_number,
        "image_url": watch.image_url,
        "owner_wallet": watch.owner_wallet,
    }

# ==============================================================================
#   GESTIÓN DE LA SEGURIDAD
# ==============================================================================
@app.patch("/nfts/{watch_id}/security-state")
async def update_security_state(
    watch_id: int,
    payload: user_schemas.SecurityStateUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Buscar el reloj en la base de datos (Usando models.Watch para coincidir con tu otro endpoint)
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    
    if not watch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Reloj no encontrado"
        )

    # 2. Seguridad: Validar que el usuario logueado sea el dueño
    # (Ajustado para usar owner_address o la relación que tengas con current_user)
    if watch.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="No tienes permiso para modificar la seguridad de este reloj"
        )

    # 3. Validar que el estado sea correcto según el Smart Contract (0, 1, 2, 3, 4)
    if payload.state not in [0, 1, 2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Estado de seguridad no válido"
        )

    # 4. Actualizar la base de datos
    watch.security_state = payload.state
    
    if payload.state != 0 and watch.is_listed:
        watch.is_listed = False
        
        # Buscar el listing activo en el marketplace y cancelarlo
        active_listing = db.query(models.MarketplaceListing).filter(
            models.MarketplaceListing.token_id == watch_id,
            models.MarketplaceListing.listing_state == 1 # 1 indica Activo en tu lógica
        ).first()
        
        if active_listing:
            # Puedes usar 0, 2 o el número que represente "Cancelado" en tu sistema
            active_listing.listing_state = 0 

    db.commit()
    db.refresh(watch)

    # 5. Notificar a toda la plataforma a través del WebSocket
    try:
        await manager.broadcast("update_nfts")
        await manager.broadcast("update_marketplace")
    except Exception as e:
        print(f"Error enviando websocket: {e}")

    # 6. Devolver respuesta de éxito
    return {
        "message": "Estado de seguridad actualizado correctamente",
        "watch_id": watch.token_id,
        "new_security_state": watch.security_state,
        "tx_hash": payload.tx_hash
    }

# =====================================================================================
#  RELOJERO
# =====================================================================================
@app.get("/nfts/assigned-watchmaker")
def get_assigned_watches_for_watchmaker(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """
    Devuelve los relojes que han sido enviados (listing_state == 3)
    y están asignados a la wallet de este relojero.
    """
    from sqlalchemy import or_
    wallet_filter = models.MarketplaceListing.assigned_watchmaker.ilike(current_user.wallet_address) if current_user.wallet_address else None
    id_filter = models.MarketplaceListing.assigned_watchmaker_id == current_user.id

    results = db.query(models.Watch, models.MarketplaceListing).join(
        models.MarketplaceListing,
        models.MarketplaceListing.token_id == models.Watch.token_id
    ).filter(
        or_(wallet_filter, id_filter) if wallet_filter is not None else id_filter,
        models.MarketplaceListing.listing_state == 3
    ).all()

    watches = []
    for w, listing in results:
        seller_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.seller)).first() if listing.seller else None
        buyer_user  = db.query(models.User).filter(models.User.wallet_address.ilike(listing.buyer)).first()  if listing.buyer  else None
        watches.append({
            "token_id": w.token_id,
            "brand": w.brand,
            "model": w.model,
            "serial_number": w.serial_number,
            "image": w.image_url,
            "manufacturing_year": w.manufacturing_year,
            "price": listing.price,
            "seller_wallet": listing.seller,
            "seller_username": seller_user.username if seller_user else None,
            "buyer_wallet": listing.buyer,
            "buyer_username": buyer_user.username if buyer_user else None,
            "is_p2p": listing.is_p2p,
        })

    return watches

# ====================================================
#  DETALLES DEL RELOJ (LECTURA RÁPIDA) 
# ====================================================
@app.get("/nfts/{token_id}")
def get_nft_details(token_id: int, db: Session = Depends(database.get_db)):
    """
    Devuelve los datos indexados del reloj en milisegundos desde la base de datos local.
    """
    watch = db.query(models.Watch).options(
        joinedload(models.Watch.revisions),
        joinedload(models.Watch.verifications)
    ).filter(models.Watch.token_id == token_id).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado en la base de datos local. Por favor, impórtalo primero.")

    # Leer historial desde la BD (se sincroniza al importar/reimportar)
    db_history = db.query(models.WatchOwnershipHistory).filter(
        models.WatchOwnershipHistory.token_id == token_id
    ).order_by(models.WatchOwnershipHistory.transferred_at.asc()).all()

    return {
        "token_id": watch.token_id,
        "brand": watch.brand,
        "model": watch.model,
        "serialNumber": watch.serial_number,
        "manufacturingYear": watch.manufacturing_year,
        "image": watch.image_url,
        "owner_wallet": watch.owner_wallet,
        "hash_uid": watch.hash_uid,
        "watch_state": watch.watch_state,
        "manufacturer_wallet": watch.manufacturer_wallet,
        "is_public": watch.is_public,
        "revisions": watch.revisions,
        "verifications": watch.verifications,
        "security_state": watch.security_state,
        "mint_date": watch.mint_date.isoformat() if watch.mint_date else None,
        "history": [
            {
                "previous_owner_wallet": h.previous_owner_wallet,
                "new_owner_wallet": h.new_owner_wallet,
                "via_contract_wallet": h.via_contract_wallet,
                "price_usdc": h.price_usdc,
                "transferred_at": h.transferred_at.isoformat() if h.transferred_at else None,
            }
            for h in db_history
        ],
    }

@app.get("/nfts/{token_id}/listing")
def get_nft_listing_status(token_id: int, db: Session = Depends(database.get_db)):
    """
    Devuelve el estado actual de mercado para WatchScreen.
    """
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == token_id
    ).order_by(models.MarketplaceListing.id.desc()).first()

    if listing and 0 < listing.listing_state < 5:
        return {
            "id": listing.id,
            "is_listed": True,
            "seller": listing.seller,
            "price": listing.price,
            "listing_state": listing.listing_state,
            "is_p2p": listing.is_p2p
        }

    return {"is_listed": False}

# ==============================================
#  GESTIÓN DE ROLES Y ADMIN 

@app.post("/users/request-role")
async def request_role(
    request: user_schemas.RoleRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    if request.role in (current_user.roles or []):
        raise HTTPException(status_code=400, detail="Ya tienes este rol profesional activo.")

    # PARTICULAR se asigna directamente sin aprobación de admin
    if request.role == "PARTICULAR":
        new_roles = list(current_user.roles or [])
        if "PARTICULAR" not in new_roles:
            new_roles.append("PARTICULAR")
            current_user.roles = new_roles
        db.commit()
        return {"message": "Perfil de particular activado"}

    # Roles profesionales: guardar solicitud y notificar al admin
    current_user.requested_role = request.role
    current_user.request_message = request.message
    db.commit()

    # Notificación al usuario solicitante
    await create_notification(
        db=db,
        user_id=current_user.id,
        title="Solicitud de perfil enviada",
        message=f"Has solicitado el perfil de {request.role}. Un administrador revisará tu caso pronto.",
        notification_type="PENDING"
    )

    # Broadcast específico para el panel de admin (actualiza la lista de solicitudes)
    await manager.broadcast(f"new_role_request:{current_user.username}:{request.role}")

    return {"message": "Solicitud enviada con éxito"}

@app.get("/admin/users", response_model=list[user_schemas.UserResponse])
def get_all_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requiere ser Administrador.")
    
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@app.get("/admin/logistics-status")
def get_logistics_status(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    return blockchain.get_logistics_status()


@app.post("/admin/approve-role/{user_id}")
async def handle_role_request(
    user_id: int, 
    action: str, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # 1. Verificación de permisos de administrador
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    # 2. Búsqueda del usuario y validación de solicitud
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user or not target_user.requested_role:
        raise HTTPException(status_code=400, detail="No hay solicitud pendiente.")

    requested_role = target_user.requested_role

    if action == "approve":
        # Lógica de Blockchain
        if target_user.wallet_address:
            try:
                blockchain.set_blockchain_role(target_user.wallet_address, requested_role, True)
            except Exception as e:
                print(f"Error en blockchain al asignar rol: {e}")
                raise HTTPException(status_code=500, detail="Error al procesar la operación en blockchain")
        
        # Actualización de Roles en la base de datos
        new_roles = list(target_user.roles)
        if requested_role not in new_roles:
            new_roles.append(requested_role)
            target_user.roles = new_roles 
            
        # Notificación in-app indicando que vuelva a iniciar sesión
        await create_notification(
            db=db,
            user_id=target_user.id,
            title="¡Solicitud Aprobada!",
            message=f"Felicidades, tu perfil de {requested_role} ha sido activado. Por favor, cierra sesión y vuelve a entrar para acceder a tu nuevo panel profesional.",
            notification_type="APPROVED" 
        )
        mensaje = f"Rol {requested_role} aprobado para {target_user.username}."
    
    else:
        await create_notification(
            db=db,
            user_id=target_user.id,
            title="Solicitud Rechazada",
            message=f"Tu solicitud para el rol {requested_role} no ha sido aceptada por el administrador.",
            notification_type="REJECTED"
        )
        mensaje = f"Solicitud de {requested_role} rechazada."
    
    # 3. Limpieza de campos de solicitud
    target_user.requested_role = None
    target_user.request_message = None
    
    db.commit()
    
    return {"detail": mensaje}

@app.post("/admin/revoke-role/{user_id}")
async def revoke_role(
    user_id: int, 
    role: str, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # 1. Verificación de permisos de administrador
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    # 2. Búsqueda del usuario objetivo
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    # 3. Lógica de Blockchain
    if target_user.wallet_address:
        try:
            blockchain.set_blockchain_role(target_user.wallet_address, role, False)
        except Exception as e:
            # Logeamos el error pero permitimos que la DB local se actualice
            print(f"Error revocando en blockchain: {str(e)}")

    # 4. Actualización de Roles en DB local
    current_roles = list(target_user.roles)
    if role in current_roles:
        current_roles.remove(role)
        target_user.roles = current_roles 
        
        await create_notification(
            db=db,
            user_id=target_user.id,
            title="Rol Revocado",
            message=f"Se ha revocado tu acceso como {role}. Si crees que es un error, contacta con soporte.",
            notification_type="REJECTED"
        )
        
        # Se guarda la actualización de la lista de roles del usuario
        db.commit()
    
    return {"detail": f"Permiso de {role} revocado para {target_user.username}."}

@app.get("/admin/marketplace-status")
async def get_marketplace_status(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        is_paused = blockchain.marketplace_contract.functions.paused().call()
        return {"paused": is_paused}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando estado: {e}")

@app.post("/admin/marketplace-pause")
async def pause_marketplace(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        tx = blockchain.marketplace_contract.functions.pauseMarketplace().build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 100000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        await manager.broadcast({"type": "marketplace_paused"})
        return {"paused": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error pausando marketplace: {e}")

@app.post("/admin/marketplace-resume")
async def resume_marketplace(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        tx = blockchain.marketplace_contract.functions.resumeMarketplace().build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 100000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        await manager.broadcast({"type": "marketplace_resumed"})
        return {"paused": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reanudando marketplace: {e}")

@app.get("/admin/fees")
async def get_fees(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        c = blockchain.marketplace_contract.functions
        return {
            "platform":   c.marketPlaceFeePercent().call(),
            "royalty":    c.royaltyPercent().call(),
            "watchmaker": c.watchmakerFeePercent().call(),
            "deposit":    c.sellerDepositPercent().call(),
            "recipient":  c.feeRecipient().call(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo comisiones: {e}")

class FeesRequest(BaseModel):
    platform:   int
    royalty:    int
    watchmaker: int
    deposit:    int

@app.post("/admin/fees")
async def set_fees(body: FeesRequest, current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    if body.platform > 1000 or body.royalty > 1000:
        raise HTTPException(status_code=400, detail="Plataforma y regalía máximo 10%.")
    if body.watchmaker > 500 or body.deposit > 500:
        raise HTTPException(status_code=400, detail="Relojero y depósito máximo 5%.")
    if any(v < 0 for v in [body.platform, body.royalty, body.watchmaker, body.deposit]):
        raise HTTPException(status_code=400, detail="Los valores no pueden ser negativos.")
    try:
        tx = blockchain.marketplace_contract.functions.setFees(
            body.platform, body.royalty, body.watchmaker, body.deposit
        ).build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 150000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"ok": True, "platform": body.platform, "royalty": body.royalty,
                "watchmaker": body.watchmaker, "deposit": body.deposit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando comisiones: {e}")

class FeeRecipientRequest(BaseModel):
    address: str

@app.post("/admin/fee-recipient")
async def update_fee_recipient(body: FeeRecipientRequest, current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        checksum = blockchain.w3.to_checksum_address(body.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Dirección de wallet inválida.")
    try:
        tx = blockchain.marketplace_contract.functions.updateFeeRecipient(checksum).build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 100000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"ok": True, "recipient": checksum}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando destinatario: {e}")

class AddressRequest(BaseModel):
    address: str

@app.post("/admin/set-logistics-system")
async def set_logistics_system(body: AddressRequest, current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        checksum = blockchain.w3.to_checksum_address(body.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Dirección de wallet inválida.")
    try:
        tx = blockchain.marketplace_contract.functions.setLogisticsSystem(checksum).build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 100000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"ok": True, "address": checksum}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando sistema logístico: {e}")

@app.post("/admin/set-auction-contract")
async def set_auction_contract(body: AddressRequest, current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    try:
        checksum = blockchain.w3.to_checksum_address(body.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Dirección de contrato inválida.")
    try:
        tx = blockchain.marketplace_contract.functions.setAuctionContract(checksum).build_transaction({
            "from": blockchain.ADMIN_ADDRESS,
            "nonce": blockchain.w3.eth.get_transaction_count(blockchain.ADMIN_ADDRESS),
            "gas": 100000,
            "gasPrice": blockchain.w3.eth.gas_price,
        })
        signed = blockchain.w3.eth.account.sign_transaction(tx, private_key=blockchain.ADMIN_PRIVATE_KEY)
        blockchain.w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"ok": True, "address": checksum}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando contrato de subastas: {e}")

# ===============================================================================
#  COMPRA VENTA VISUALIZACIÓN
# ===============================================================================
@app.post("/nfts/{token_id}/list")
async def list_watch_for_sale(token_id: int, data: user_schemas.ListWatchRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado en la base de datos.")
        
    if watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este reloj.")
        
    # --- COMPROBACIÓN DE SEGURIDAD (Estado Activo == 0) ---
    if watch.security_state != 0:
        raise HTTPException(
            status_code=400, 
            detail="No se puede listar un reloj que está reportado como robado, perdido, destruido o alterado."
        )
        
    # --- COMPROBACIÓN DE LISTADO PREVIO ---
    if watch.is_listed:
        raise HTTPException(status_code=400, detail="Este reloj ya está a la venta.")
        
    # Actualizar el estado del reloj
    watch.is_listed = True
    watch.is_public = True
    
    # Diferenciar lógica y calcular precios entre Dealer y P2P
    price_en_enteros = int(data.price_usdc * 10**6) 
    
    is_trusted = current_user.roles and (
        "DEALER" in current_user.roles or "FABRICANTE" in current_user.roles
    )
    watch_name = watch.model if watch else "desconocido"

    if is_trusted:
        fianza_vendedor = 0
        is_p2p = False
        watchmaker_approved = True
        mensaje_notificacion = f"Has subido un anuncio del reloj {watch_name} por el precio de {data.price_usdc} USDC."
    else:
        fianza_vendedor = int(price_en_enteros * 0.02)
        fianza_usdc = data.price_usdc * 0.02
        is_p2p = True
        watchmaker_approved = False
        mensaje_notificacion = f"Has subido un anuncio del reloj {watch_name} por el precio de {data.price_usdc} USDC. Al ser una venta particular, se te retendrá una fianza de {fianza_usdc:.2f} USDC si un usuario te lo compra."
    
    # Crear el registro en MarketplaceListing sin shipping_deadline
    nuevo_listing = models.MarketplaceListing(
        token_id=token_id,
        seller=current_user.wallet_address,
        price=price_en_enteros,
        seller_deposit=fianza_vendedor, 
        is_p2p=is_p2p,
        watchmaker_approved=watchmaker_approved,
        is_shipped=False,
        listing_state=1, # 1 = Active
    )
    db.add(nuevo_listing)
    
    # Crear la notificación para el vendedor
    notificacion = models.Notification(
        user_id=current_user.id,
        watch_id=token_id,
        title="Anuncio Publicado",
        message=mensaje_notificacion,
        type="MARKET",
        created_at=datetime.now(timezone.utc)
    )
    db.add(notificacion)
    
    # Guardar cambios
    try:
        db.commit()
        db.refresh(watch)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al listar el reloj y crear la notificación.")
    
    # Actualizar marketplace para todos + notificar solo al vendedor
    await manager.broadcast("update_marketplace")
    await manager.send_to_user(current_user.id, "update_users")

    return {"message": f"Anuncio del reloj {token_id} creado y publicado con éxito"}

@app.put("/nfts/{token_id}/update-price")
async def update_watch_price_in_db(token_id: int, request: user_schemas.UpdatePriceRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
   
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    
    if not watch or watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado. No eres el propietario.")
    if not watch.is_listed:
        raise HTTPException(status_code=400, detail="El reloj no está a la venta.")

    # Buscar el listado activo
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == token_id,
        models.MarketplaceListing.listing_state == 1
    ).first()
    
    if listing:
        price_en_enteros = int(request.new_price_usdc * 10**6)
        listing.price = price_en_enteros
        
        # Recalcular fianza solo si es venta particular (P2P)
        is_dealer = current_user.roles and "DEALER" in current_user.roles
        if not is_dealer:
            listing.seller_deposit = int(price_en_enteros * 0.02)
            
        # Notificar al usuario (Dealer o P2P) del cambio de precio
        watch_name = watch.model if watch else "desconocido"
        notificacion = models.Notification(
            user_id=current_user.id,
            watch_id=token_id,
            title="Precio Actualizado",
            message=f"Has actualizado el precio de tu {watch_name} a {request.new_price_usdc} USDC.",
            type="MARKET",
            created_at=datetime.now(timezone.utc)
        )
        db.add(notificacion)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al actualizar el precio en la base de datos.")
        
    await manager.broadcast("update_marketplace")
    
    # getattr o get para evitar errores
    tx_hash = getattr(request, 'tx_hash', None)
    
    return {"detail": f"Precio actualizado a {request.new_price_usdc} USDC.", "tx_hash": tx_hash}

    
@app.patch("/nfts/{token_id}/privacy")
async def toggle_watch_privacy(
    token_id: int, 
    data: user_schemas.TogglePublicRequest, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado.")
        
    if watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso.")
        
    if watch.is_listed and data.is_public == False:
        raise HTTPException(status_code=400, detail="No puedes hacer privado un reloj que está a la venta.")
        
    # Tratamiento explícito de True o False
    watch.is_public = True if data.is_public else False
    
    db.commit()
    db.refresh(watch)

    # Solo actualizar el marketplace: la visibilidad no afecta datos de usuario
    await manager.broadcast("update_marketplace")

    return {"message": "Privacidad actualizada", "is_public": watch.is_public}

class SdmSetupRequest(BaseModel):
    sdm_key: str  # 32 hex chars = 16 bytes AES-128, derivados localmente por el fabricante

@app.post("/nfts/{token_id}/sdm-setup")
def sdm_setup(
    token_id: int,
    data: SdmSetupRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Almacena la clave SDM del chip NTAG 424 DNA para el reloj indicado.
    El manufacturer_tool deriva keccak256(PRIVATE_KEY)[:16] localmente y la
    envía aquí. La clave privada del fabricante nunca sale de su máquina."""
    if "FABRICANTE" not in (current_user.roles or []):
        raise HTTPException(status_code=403, detail="Solo fabricantes pueden configurar SDM.")
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado.")
    if watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el propietario de este reloj.")
    if len(data.sdm_key) != 32:
        raise HTTPException(status_code=400, detail="sdm_key debe tener 32 caracteres hex (16 bytes).")
    watch.sdm_key = data.sdm_key.lower()
    watch.last_sdm_counter = 0
    db.commit()
    return {"ok": True, "token_id": token_id}

@app.post("/nfts/{token_id}/cancel")
async def cancel_watch_listing(token_id: int, data: user_schemas.CancelListingRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    #  Poner a 0 (False) is_listed en watches
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    
    if not watch or watch.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reloj no encontrado o sin permisos.")
        
    watch.is_listed = False
    watch.is_public = False
    
    # Borrar por el token_id en la tabla marketplaceListing
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == token_id
    ).first()
    
    if listing:
        db.delete(listing)

    # Notificar al vendedor
    watch_name = watch.model if watch and watch.model else "desconocido"
    notificacion = models.Notification(
        user_id=current_user.id,
        watch_id=token_id,
        title="Anuncio Cancelado",
        message=f"Has cancelado el anuncio del reloj {watch_name}. Por favor, refresca la sección de tus relojes para no ver el anuncio.",
        type="MARKET",
        created_at=datetime.now(timezone.utc)
    )
    db.add(notificacion)
        
    # Guardar cambios
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al cancelar el anuncio en la base de datos.")
    
    # Notificación por WebSockets para que el frontend se actualice
    await manager.broadcast("update_marketplace")
    
    # En FastAPI, usa getattr por si data.tx_hash no es obligatorio en tu schema
    tx_hash = getattr(data, 'tx_hash', None)
    
    return {"message": "Anuncio cancelado y eliminado de la base de datos", "tx_hash": tx_hash}

# ===============================================================================
#  COMPRA VENTA P2P
# ===============================================================================
# En esta función si el vendedor es dealer está programada para que el sistema logístico confirme el envío directamente
@app.post("/marketplace/buy/{watch_id}")
async def buy_watch(watch_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    # 1. Buscar el reloj
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail=f"Reloj con token_id {watch_id} no encontrado en BD")

    if watch.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes comprar tu propio reloj")

    # 2. Buscar el anuncio activo con bloqueo de fila para evitar doble compra simultánea
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == watch_id,
        models.MarketplaceListing.listing_state == 1
    ).with_for_update().first()

    if not listing:
        raise HTTPException(status_code=400, detail="El reloj no tiene un anuncio activo")

    # 3. Estado inicial: Reservado/Escrow
    listing.listing_state = 2
    listing.buyer = current_user.wallet_address

    precio_usdc = listing.price / 10**6
    tx_hash = None

    # 4. Lógica dinámica: Atajo logístico para Fabricantes y Dealers (non-P2P)
    if not listing.is_p2p:
        # Verificar que la wallet logística tiene saldo antes de intentar la tx
        logistics_info = blockchain.get_logistics_status()
        if logistics_info.get("balance_eth", 1) == 0:
            raise HTTPException(
                status_code=503,
                detail="El sistema logístico no tiene fondos suficientes para procesar la transacción. Contacta con el administrador."
            )

        # Llamada a la blockchain para confirmar el envío automáticamente
        try:
            tx_result = blockchain.confirm_shipment(token_id=watch.token_id)
            if not tx_result.get("success"):
                raise HTTPException(status_code=500, detail=tx_result.get("error", "Error en blockchain al marcar envío"))
            tx_hash = tx_result.get("tx_hash")
        except Exception as e:
            print(f"Error ejecutando transacción blockchain: {e}")
            raise HTTPException(status_code=500, detail="Error al ejecutar la transacción blockchain")

        # Vendedor de confianza: se marca enviado y avanza a estado 3 (Enviado)
        listing.is_shipped = True
        listing.listing_state = 3
        
        mensaje_comprador = f"Has comprado el reloj {watch.model} al precio de {precio_usdc} USDC. Cuando lo recibas puedes confirmar la recepción directamente, no es necesario que un relojero lo certifique."
        mensaje_vendedor = f"Tu reloj {watch.model} ha sido comprado por {precio_usdc} USDC. Por favor, procede con el envío físico del paquete al comprador."
    else:
        # Es P2P: Sigue el flujo normal (is_shipped se mantiene False)
        mensaje_comprador = f"Has comprado el reloj {watch.model} al precio de {precio_usdc} USDC. Cuando el vendedor confirme el envío, se asignará un relojero para su peritaje."
        mensaje_vendedor = f"Tu reloj {watch.model} ha sido comprado por {precio_usdc} USDC. Por favor, confirma el envío en la aplicación para que se le asigne un relojero."

    # 5. Crear notificaciones
    notify_seller = models.Notification(
        user_id=watch.owner_id,
        watch_id=watch.token_id,
        title="¡Reloj vendido!",
        message=mensaje_vendedor,
        type="SALE",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )

    notify_buyer = models.Notification(
        user_id=current_user.id,
        watch_id=watch.token_id,
        title="Reloj comprado",
        message=mensaje_comprador,
        type="SALE",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )

    db.add(notify_seller)
    db.add(notify_buyer)
    
    # 6. Guardar en base de datos
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error interno actualizando la base de datos.")

    # Actualizar marketplace para todos + notificar solo a vendedor y comprador
    await manager.broadcast("update_marketplace")
    await manager.send_to_user(watch.owner_id, "update_users")
    await manager.send_to_user(current_user.id, "update_users")

    response_data = {"message": "Compra registrada con éxito"}
    if tx_hash:
        response_data["tx_hash_ship"] = tx_hash

    return response_data





# =================================================================
#  ENVÍO Y RECIBO DEL RELOJ
# =================================================================
@app.post("/marketplace/ship/{watch_id}")
async def confirm_shipment(watch_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == watch_id,
        models.MarketplaceListing.listing_state == 2 # 2 = Reservado
    ).first()

    if not watch or not listing:
        raise HTTPException(status_code=404, detail="Reloj no encontrado o no está reservado")

    if not current_user.wallet_address or (listing.seller or "").lower() != current_user.wallet_address.lower():
        raise HTTPException(status_code=403, detail="No eres el vendedor de este reloj")

    # Se elige un relojero de forma aleatoria AHORA (solo con wallet registrada)
    watchmakers = db.query(models.User).filter(
        cast(models.User.roles, String).like('%"RELOJERO"%'),
        models.User.wallet_address.isnot(None),
    ).all()

    if not watchmakers:
        raise HTTPException(status_code=500, detail="No hay relojeros con wallet disponibles en el sistema")

    assigned_watchmaker = random.choice(watchmakers)

    # Se busca comprador para la notificación
    buyer_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.buyer)).first()

    # Llamadas a la blockchain (no fatales: si fallan se actualiza BD igualmente)
    blockchain_warning = None
    tx_result_ship = None
    tx_result_assign = None
    try:
        tx_result_ship = blockchain.confirm_shipment(token_id=watch.token_id)
        if not tx_result_ship.get("success"):
            blockchain_warning = tx_result_ship.get("error", "Error blockchain al marcar envío")
        elif tx_result_ship.get("success"):
            tx_result_assign = blockchain.assign_watchmaker(
                token_id=watch.token_id,
                watchmaker_address=assigned_watchmaker.wallet_address
            )
            if not tx_result_assign.get("success"):
                blockchain_warning = tx_result_assign.get("error", "Error blockchain al asignar relojero")
    except Exception as blockchain_exc:
        blockchain_warning = str(blockchain_exc)
        print(f"[BLOCKCHAIN WARNING] confirm_shipment token={watch.token_id}: {blockchain_warning}")

    # Actualizar BD independientemente del resultado blockchain
    listing.listing_state = 3
    listing.is_shipped = True
    listing.assigned_watchmaker = assigned_watchmaker.wallet_address
    listing.assigned_watchmaker_id = assigned_watchmaker.id

    notify_seller = models.Notification(
        user_id=current_user.id,
        watch_id=watch.token_id,
        title="Reloj Enviado",
        message=f"Relojero {assigned_watchmaker.username} asignado para verificar el reloj {watch.model}.",
        type="SHIPPING",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )
    notify_buyer = models.Notification(
        user_id=buyer_user.id if buyer_user else None,
        watch_id=watch.token_id,
        title="Reloj en tránsito",
        message=f"Relojero {assigned_watchmaker.username} asignado para verificar el reloj {watch.model}.",
        type="SHIPPING",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )
    notify_watchmaker = models.Notification(
        user_id=assigned_watchmaker.id,
        watch_id=watch.token_id,
        title="Nuevo peritaje",
        message=f"Se te ha asignado el reloj {watch.model} para verificar.",
        type="INFO",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )

    db.add(notify_seller)
    if buyer_user:
        db.add(notify_buyer)
    db.add(notify_watchmaker)
    db.commit()

    await manager.broadcast("update_marketplace")
    await manager.send_to_user(current_user.id, "update_users")
    if buyer_user:
        await manager.send_to_user(buyer_user.id, "update_users")
    await manager.send_to_user(assigned_watchmaker.id, "update_users")

    return {
        "message": "Envío registrado" + (" (blockchain no disponible)" if blockchain_warning else " y relojero asignado en blockchain"),
        "blockchain_warning": blockchain_warning,
        "tx_hash_ship": tx_result_ship.get("tx_hash") if tx_result_ship else None,
        "tx_hash_assign": tx_result_assign.get("tx_hash") if tx_result_assign else None,
    }


@app.post("/marketplace/verify/{watch_id}")
async def verify_watch(watch_id: int, success: bool, comment: str = "", db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == watch_id,
        models.MarketplaceListing.listing_state.between(1, 4),
    ).order_by(models.MarketplaceListing.id.desc()).first()

    if not watch or not listing:
        raise HTTPException(status_code=404, detail="Datos no encontrados")

    # Confirmar que sea el relojero asignado (por wallet o por ID)
    watchmaker_wallet = (current_user.wallet_address or "").lower()
    assigned_wallet   = (listing.assigned_watchmaker or "").lower()
    assigned_by_id    = listing.assigned_watchmaker_id == current_user.id
    if not assigned_wallet or (watchmaker_wallet != assigned_wallet and not assigned_by_id):
        raise HTTPException(status_code=403, detail="No eres el relojero asignado para este peritaje")

    buyer_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.buyer)).first() if listing.buyer else None

    if success:
        if listing.buyer is None:
            # Re-verificación post-rechazo (sin comprador): restaurar watch y cerrar listing
            watch.security_state = 0
            watch.is_listed = False
            listing.listing_state = 5

            notify_seller = models.Notification(
                user_id=watch.owner_id,
                watch_id=watch.token_id,
                title="Reloj Certificado",
                message=f"Tu reloj {watch.model} ha sido certificado como auténtico y ya puedes ponerlo a la venta.",
                type="SUCCESS",
                reference_id=listing.id,
                created_at=datetime.now(timezone.utc)
            )
            notify_watchmaker = models.Notification(
                user_id=current_user.id,
                watch_id=watch.token_id,
                title="Certificación Completada",
                message=f"Has certificado el reloj {watch.model} como auténtico.",
                type="INFO",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_seller)
            db.add(notify_watchmaker)
        else:
            # Venta P2P normal: el comprador aún debe confirmar la entrega
            listing.listing_state = 4
            listing.watchmaker_approved = True

            notify_buyer = models.Notification(
                user_id=buyer_user.id,
                watch_id=watch.token_id,
                title="Autenticidad Verificada",
                message=f"Reloj {watch.model} verificado, cuando le llegue el reloj puede confirmar la entrega del reloj.",
                type="VERIFIED",
                reference_id=listing.id,
                created_at=datetime.now(timezone.utc)
            )
            notify_seller = models.Notification(
                user_id=watch.owner_id,
                watch_id=watch.token_id,
                title="Peritaje Finalizado",
                message=f"Reloj {watch.model} verificado, cuando el comprador confirme la entrega se liberará el pago.",
                type="VERIFIED",
                reference_id=listing.id,
                created_at=datetime.now(timezone.utc)
            )
            notify_watchmaker = models.Notification(
                user_id=current_user.id,
                watch_id=watch.token_id,
                title="Verificación Completada",
                message=f"Ha verificado el reloj {watch.model}, cuando el comprador confirme la entrega cobrará su comisión.",
                type="VERIFIED",
                reference_id=listing.id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_buyer)
            db.add(notify_seller)
            db.add(notify_watchmaker)

    else:
        is_recert = listing.buyer is None and listing.price == 0
        listing.listing_state = 6

        if is_recert:
            # Rechazo de re-certificación: restablecer is_listed para que el vendedor pueda reintentar
            watch.is_listed = False
            recert_comment = comment.strip() if comment and comment.strip() else None
            recert_msg = f"El relojero no ha podido certificar el reloj {watch.model} como auténtico. El reloj sigue marcado como alterado."
            if recert_comment:
                recert_msg += f" Opinión del relojero: \"{recert_comment}\"."
            notify_seller = models.Notification(
                user_id=watch.owner_id,
                watch_id=watch.token_id,
                title="Certificación Denegada",
                message=recert_msg,
                type="INFO",
                created_at=datetime.now(timezone.utc)
            )
            notify_watchmaker = models.Notification(
                user_id=current_user.id,
                watch_id=watch.token_id,
                title="Certificación Denegada",
                message=f"Has denegado la certificación del reloj {watch.model}.",
                type="INFO",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_seller)
            db.add(notify_watchmaker)
        else:
            # Rechazo en venta P2P: marcar como alterado, notificar con fianza
            listing_id = listing.id
            fianza_usdc = listing.seller_deposit / 1_000_000 if listing.seller_deposit else 0
            watchmaker_comment = comment or "Reloj rechazado: falsificación o alteración detectada."

            watch.security_state = 4
            watch.is_listed = False
            watch.is_public = True

            if buyer_user:
                notify_buyer = models.Notification(
                    user_id=buyer_user.id,
                    watch_id=watch.token_id,
                    title="Verificación Fallida",
                    message=f"El relojero ha rechazado la autenticidad del {watch.model}. Tu dinero ha sido reembolsado íntegramente.",
                    type="SECURITY",
                    reference_id=listing_id,
                    created_at=datetime.now(timezone.utc)
                )
                db.add(notify_buyer)

            notify_seller = models.Notification(
                user_id=watch.owner_id,
                watch_id=watch.token_id,
                title="Reloj Falso o Alterado",
                message=f"Tu reloj {watch.model} no ha superado el peritaje. Opinión: \"{watchmaker_comment}\". Has perdido la fianza de {fianza_usdc:.2f} USDC.",
                type="SECURITY",
                reference_id=listing_id,
                created_at=datetime.now(timezone.utc)
            )
            notify_watchmaker = models.Notification(
                user_id=current_user.id,
                watch_id=watch.token_id,
                title="Peritaje Finalizado (Rechazado)",
                message=f"Has marcado el reloj {watch.model} como alterado. Tu comisión ha sido enviada a tu wallet desde la fianza del vendedor.",
                type="INFO",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_seller)
            db.add(notify_watchmaker)

    # Registro de verificación en BD (con comentario del relojero)
    import time as _time
    verification = models.WatchVerification(
        token_id=watch_id,
        watchmaker=current_user.wallet_address or "",
        date=int(_time.time()),
        comment=comment or ("Autenticidad verificada." if success else "Peritaje rechazado — se detectó que el reloj no es auténtico."),
    )
    db.add(verification)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error guardando en la base de datos.")

    # Actualizar marketplace para todos + notificar solo a los implicados
    await manager.broadcast("update_marketplace")
    await manager.send_to_user(watch.owner_id, "update_users")   # vendedor
    await manager.send_to_user(current_user.id, "update_users")  # relojero
    if buyer_user:
        await manager.send_to_user(buyer_user.id, "update_users")

    return {"message": "Notificaciones enviadas y estado actualizado correctamente"}


@app.post("/marketplace/request-reverification/{watch_id}")
async def request_reverification(watch_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Solicitar una nueva certificación para un reloj marcado como alterado (gratuito, sin contrato)."""
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    if watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el propietario de este reloj")

    if watch.security_state != 4:
        raise HTTPException(status_code=400, detail="El reloj no está marcado como alterado")

    if watch.is_listed:
        raise HTTPException(status_code=400, detail="Ya hay una verificación en curso para este reloj")

    watchmakers = db.query(models.User).filter(
        cast(models.User.roles, String).like('%"RELOJERO"%'),
        models.User.wallet_address.isnot(None),
    ).all()
    if not watchmakers:
        raise HTTPException(status_code=500, detail="No hay relojeros con wallet disponibles en el sistema")

    assigned_watchmaker = random.choice(watchmakers)

    new_listing = models.MarketplaceListing(
        token_id=watch_id,
        seller=current_user.wallet_address,
        buyer=None,
        price=0,
        seller_deposit=0,
        is_p2p=True,
        watchmaker_approved=False,
        is_shipped=True,
        assigned_watchmaker=assigned_watchmaker.wallet_address,
        assigned_watchmaker_id=assigned_watchmaker.id,
        verifying_watchmaker=assigned_watchmaker.wallet_address,
        listing_state=3,
    )
    db.add(new_listing)
    watch.is_listed = True
    db.flush()

    notify_seller = models.Notification(
        user_id=current_user.id,
        watch_id=watch_id,
        title="Re-verificación solicitada",
        message=f"Relojero {assigned_watchmaker.username} ha sido asignado para certificar el reloj {watch.model}. El proceso es gratuito.",
        type="INFO",
        reference_id=new_listing.id,
        created_at=datetime.now(timezone.utc)
    )
    notify_watchmaker = models.Notification(
        user_id=assigned_watchmaker.id,
        watch_id=watch_id,
        title="Nuevo peritaje",
        message=f"Se te ha asignado el reloj {watch.model} para re-certificar.",
        type="INFO",
        reference_id=new_listing.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(notify_seller)
    db.add(notify_watchmaker)
    db.commit()

    await manager.broadcast("update_marketplace")
    await manager.send_to_user(current_user.id, "update_users")
    await manager.send_to_user(assigned_watchmaker.id, "update_users")

    return {"message": "Re-verificación solicitada correctamente", "listing_id": new_listing.id}


@app.post("/marketplace/confirm-delivery/{watch_id}")
async def confirm_delivery(watch_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
   
    watch = db.query(models.Watch).filter(models.Watch.token_id == watch_id).first()
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == watch_id,
        models.MarketplaceListing.listing_state.in_([2, 3, 4]),
    ).order_by(models.MarketplaceListing.id.desc()).first()

    if not watch or not listing:
        raise HTTPException(status_code=404, detail="Datos no encontrados")

    # Comprobación extra de que se trate del comprador
    buyer_wallet_check = (current_user.wallet_address or "").lower()
    if not listing.buyer or buyer_wallet_check != listing.buyer.lower():
        raise HTTPException(status_code=403, detail="Solo el comprador puede confirmar la entrega")

    # Verificar que el estado del anuncio permite confirmar la entrega
    required_state = 4 if listing.is_p2p else 3
    if listing.listing_state < required_state:
        detail = (
            "El relojero aún no ha verificado el reloj. Podrás confirmar la entrega cuando concluya el peritaje."
            if listing.is_p2p
            else "El vendedor aún no ha confirmado el envío."
        )
        raise HTTPException(status_code=409, detail=detail)

    # Verificación on-chain de propiedad (no-fatal: si la blockchain está desincronizada
    # con la BD, se continúa igualmente para no bloquear el flujo de entrega)
    try:
        onchain_owner = blockchain.watchNFT_contract.functions.ownerOf(watch_id).call()
        buyer_w = (current_user.wallet_address or "").lower()
        if onchain_owner.lower() != buyer_w:
            print(f"[WARN] confirm-delivery: ownerOf={onchain_owner} pero comprador={buyer_w}. Continuando con BD.")
    except Exception as e:
        print(f"[WARN] confirm-delivery: no se pudo verificar ownerOf: {e}")

    old_owner_id = watch.owner_id
    old_owner_wallet = watch.owner_wallet
    precio_usdc = listing.price / 10**6

    # Buscar al relojero para poder notificarle (solo si hay relojero asignado, en ventas P2P)
    watchmaker_user = None
    if listing.assigned_watchmaker:
        watchmaker_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.assigned_watchmaker)).first()

    # Transferencia de propiedad en la BD local
    watch.owner_id = current_user.id
    watch.owner_wallet = current_user.wallet_address
    watch.is_listed = False
    watch.is_public = False

    # Marcar el anuncio como completado (state 5) para que SaleScreen pueda seguir mostrándolo
    listing.listing_state = 5

    # Notificaciones (comprador, vendedor, relojero)
    notify_buyer = models.Notification(
        user_id=current_user.id,
        watch_id=watch.token_id,
        title="Entrega Confirmada",
        message=f"El reloj {watch.brand} {watch.model} ya es tuyo. Puedes verlo en tu colección.",
        type="SALE",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )

    notify_seller = models.Notification(
        user_id=old_owner_id,
        watch_id=watch.token_id,
        title="Venta Finalizada",
        message=f"El comprador ha confirmado la recepción del {watch.brand} {watch.model} por {precio_usdc:.2f} USDC. El pago ya ha sido liberado a tu wallet.",
        type="SUCCESS",
        reference_id=listing.id,
        created_at=datetime.now(timezone.utc)
    )

    db.add(notify_buyer)
    db.add(notify_seller)

    # Notificar al relojero si existe
    if watchmaker_user:
        notify_watchmaker = models.Notification(
            user_id=watchmaker_user.id,
            watch_id=watch.token_id,
            title="Entrega Confirmada",
            message=f"Reloj {watch.model} recibido por el comprador.",
            type="INFO",
            reference_id=listing.id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(notify_watchmaker)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error guardando en la base de datos.")

    # Re-sincronizar historial desde la blockchain (incluye la transferencia final marketplace→buyer)
    _resync_ownership_history(watch.token_id, db)
    try:
        db.commit()
    except Exception:
        db.rollback()

    # Actualizar marketplace para todos + notificar solo a los implicados
    await manager.broadcast("update_marketplace")
    await manager.send_to_user(current_user.id, "update_users")  # comprador
    await manager.send_to_user(old_owner_id, "update_users")     # vendedor
    if watchmaker_user:
        await manager.send_to_user(watchmaker_user.id, "update_users")

    return {"message": "Venta finalizada y propiedad transferida en la base de datos"}


# ===========================================================
# HOMESCREEN
# ==========================================================
@app.get("/marketplace/sale/listing/{listing_id}")
def get_sale_detail(
    listing_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Devuelve el detalle completo de una venta por listing_id para SaleScreen."""
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.id == listing_id,
    ).first()

    if not listing:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    watch = db.query(models.Watch).filter(models.Watch.token_id == listing.token_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    seller_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.seller)).first()
    buyer_user  = db.query(models.User).filter(models.User.wallet_address.ilike(listing.buyer)).first() if listing.buyer else None

    last_verif = (
        db.query(models.WatchVerification)
        .filter(models.WatchVerification.token_id == listing.token_id)
        .order_by(models.WatchVerification.id.desc())
        .first()
    )

    return {
        "token_id": watch.token_id,
        "brand": watch.brand,
        "model": watch.model,
        "image": watch.image_url,
        "manufacturing_year": watch.manufacturing_year,
        "price_usdc": listing.price / 10**6,
        "seller_deposit_usdc": listing.seller_deposit / 1_000_000 if listing.seller_deposit else 0,
        "listing_state": listing.listing_state,
        "is_p2p": listing.is_p2p,
        "is_shipped": listing.is_shipped,
        "seller_wallet": listing.seller,
        "buyer_wallet": listing.buyer,
        "assigned_watchmaker": listing.assigned_watchmaker,
        "watchmaker_comment": last_verif.comment if last_verif else None,
        "seller": {
            "username": seller_user.username if seller_user else None,
            "roles": seller_user.roles if seller_user else [],
        } if seller_user else None,
        "buyer": {
            "username": buyer_user.username if buyer_user else None,
            "roles": buyer_user.roles if buyer_user else [],
        } if buyer_user else None,
        "is_seller": (listing.seller or "").lower() == (current_user.wallet_address or "").lower(),
        "is_buyer":  (listing.buyer or "").lower() == (current_user.wallet_address or "").lower(),
    }


@app.get("/marketplace/sale/{token_id}")
def get_sale_detail_by_token(
    token_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fallback: devuelve el listing más reciente activo de un reloj (para notificaciones sin reference_id)."""
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == token_id,
        models.MarketplaceListing.listing_state >= 1,
    ).order_by(models.MarketplaceListing.id.desc()).first()

    if not listing:
        raise HTTPException(status_code=404, detail="No hay venta activa para este reloj")

    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    seller_user = db.query(models.User).filter(models.User.wallet_address.ilike(listing.seller)).first()
    buyer_user  = db.query(models.User).filter(models.User.wallet_address.ilike(listing.buyer)).first() if listing.buyer else None

    last_verif = (
        db.query(models.WatchVerification)
        .filter(models.WatchVerification.token_id == token_id)
        .order_by(models.WatchVerification.id.desc())
        .first()
    )

    return {
        "token_id": watch.token_id,
        "brand": watch.brand,
        "model": watch.model,
        "image": watch.image_url,
        "manufacturing_year": watch.manufacturing_year,
        "price_usdc": listing.price / 10**6,
        "seller_deposit_usdc": listing.seller_deposit / 1_000_000 if listing.seller_deposit else 0,
        "listing_state": listing.listing_state,
        "is_p2p": listing.is_p2p,
        "is_shipped": listing.is_shipped,
        "seller_wallet": listing.seller,
        "buyer_wallet": listing.buyer,
        "assigned_watchmaker": listing.assigned_watchmaker,
        "watchmaker_comment": last_verif.comment if last_verif else None,
        "seller": {
            "username": seller_user.username if seller_user else None,
            "roles": seller_user.roles if seller_user else [],
        } if seller_user else None,
        "buyer": {
            "username": buyer_user.username if buyer_user else None,
            "roles": buyer_user.roles if buyer_user else [],
        } if buyer_user else None,
        "is_seller": (listing.seller or "").lower() == (current_user.wallet_address or "").lower(),
        "is_buyer":  (listing.buyer or "").lower() == (current_user.wallet_address or "").lower(),
    }


@app.get("/marketplace")
def get_marketplace(
    brand: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    seller_type: Optional[str] = None, # "DEALER" o "PARTICULAR"
    db: Session = Depends(database.get_db)
):
    # Base de la consulta: Relojes que sean públicos o estén listados
    query = db.query(models.Watch).options(
        joinedload(models.Watch.owner),
        joinedload(models.Watch.listings)
    ).filter(or_(models.Watch.is_public == True, models.Watch.is_listed == True))

    # Filtro por Marca
    if brand:
        query = query.filter(models.Watch.brand.ilike(f"%{brand}%"))

    # Filtro por Tipo de Vendedor
    if seller_type:
        if seller_type == "DEALER":
            query = query.join(models.User).filter(models.User.roles.contains("DEALER"))
        else:
            query = query.join(models.User).filter(~models.User.roles.contains("DEALER"))

    # Filtro por Rango de Precio
    if min_price is not None or max_price is not None:
        query = query.join(models.MarketplaceListing)
        if min_price is not None:
            query = query.filter(models.MarketplaceListing.price >= min_price * 1000000) # Ajuste a USDC
        if max_price is not None:
            query = query.filter(models.MarketplaceListing.price <= max_price * 1000000)

    # Orden por defecto: Token ID menor a mayor
    results = query.order_by(models.Watch.token_id.asc()).all()

    # Precargar subastas activas (evitar N+1)
    market_token_ids = [w.token_id for w in results]
    mkt_now = int(time.time())
    market_auctions_map = {
        a.token_id: a
        for a in db.query(models.WatchAuction).filter(
            models.WatchAuction.token_id.in_(market_token_ids),
            models.WatchAuction.is_active == True,
        ).all()
    }

    # Formatear respuesta profesional
    formatted_data = []
    for w in results:
        # Buscamos anuncios activos (1) o en Escrow (2-4); ignoramos los completados (5) y cancelados (0)
        current_listing = next((l for l in w.listings if 1 <= l.listing_state <= 4), None)
        auction = market_auctions_map.get(w.token_id)

        formatted_data.append({
            "token_id": w.token_id,
            "brand": w.brand,
            "model": w.model,
            "image": w.image_url,
            "is_listed": w.is_listed,

            # Mantenemos el precio bloqueado visible aunque esté reservado
            "price": (current_listing.price / 1000000) if current_listing else 0,

            "seller_name": w.owner.username,
            "is_dealer": "DEALER" in w.owner.roles if w.owner.roles else False,
            "is_manufacturer": "FABRICANTE" in w.owner.roles if w.owner.roles else False,
            "security_state": w.security_state,
            "marketplace_state": current_listing.listing_state if current_listing else 0,
            "auction_data": {
                "highest_bid": auction.highest_bid / 10**6,
                "min_price": auction.min_price / 10**6,
                "seconds_remaining": max(0, auction.end_time - mkt_now),
            } if auction else None,
        })

    return formatted_data

@app.get("/public/nfts/{token_id}")
def get_public_watch_details(token_id: int, db: Session = Depends(database.get_db)):
    watch = db.query(models.Watch).options(
        joinedload(models.Watch.owner),
        joinedload(models.Watch.revisions),
        joinedload(models.Watch.verifications),
    ).filter(models.Watch.token_id == token_id).first()

    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado en la base de datos")

    db_history = db.query(models.WatchOwnershipHistory).filter(
        models.WatchOwnershipHistory.token_id == token_id
    ).order_by(models.WatchOwnershipHistory.transferred_at.asc()).all()

    return {
        "token_id": watch.token_id,
        "brand": watch.brand,
        "model": watch.model,
        "serialNumber": watch.serial_number,
        "manufacturingYear": watch.manufacturing_year,
        "is_verified": getattr(watch, 'is_verified', False),
        "security_state": watch.security_state,
        "image": watch.image_url,
        "owner_id": watch.owner_id,
        "seller_name": watch.owner.username if watch.owner else "Usuario",
        "seller_roles": watch.owner.roles if watch.owner else [],
        "owner_wallet": watch.owner_wallet,
        "manufacturer_wallet": watch.manufacturer_wallet,
        "history": [
            {
                "previous_owner_wallet": h.previous_owner_wallet,
                "new_owner_wallet": h.new_owner_wallet,
                "via_contract_wallet": h.via_contract_wallet,
                "price_usdc": h.price_usdc,
                "transferred_at": h.transferred_at.isoformat() if h.transferred_at else None,
            }
            for h in db_history
        ],
        "revisions": watch.revisions,
        "verifications": watch.verifications,
        "mint_date": watch.mint_date.isoformat() if watch.mint_date else None,
        "is_public": bool(watch.is_public),
        "is_imported": bool(watch.is_imported),
    }

@app.get("/public/nfts/{token_id}/listing")
def get_public_watch_listing(token_id: int, db: Session = Depends(database.get_db)):
    listing = db.query(models.MarketplaceListing).filter(
        models.MarketplaceListing.token_id == token_id
    ).order_by(models.MarketplaceListing.id.desc()).first()

    # Si no hay anuncio, está cancelado (0) o completado (5), devolvemos is_listed false
    if not listing or listing.listing_state == 0 or listing.listing_state >= 5:
        return {
            "is_listed": False,
            "price": None,
            "listing_state": 0
        }

    # Si está Activo (1) o en Escrow (2-4), devolvemos los datos completos
    return {
        "is_listed": True,
        "price": listing.price,
        "listing_state": listing.listing_state,
        "is_p2p": listing.is_p2p,
    }

@app.get("/public/users/{user_id}")
def get_public_user_profile(user_id: int, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # 1. Buscamos los relojes haciendo un join con los anuncios (listings)
    watches = db.query(models.Watch).options(
        joinedload(models.Watch.listings)
    ).filter(
        models.Watch.owner_id == user_id,
        or_(models.Watch.is_public == True, models.Watch.is_listed == True)
    ).all()
    
    # 2. Formateamos los datos EXACTAMENTE como los espera el PublicWatchCard
    formatted_watches = []
    for w in watches:
        active_listing = next((l for l in w.listings if l.listing_state == 1), None)
        formatted_watches.append({
            "token_id": w.token_id,
            "brand": w.brand,
            "model": w.model,
            "image": w.image_url,           
            "is_listed": w.is_listed,
            "price": (active_listing.price / 1000000) if active_listing else 0,
            "seller_name": user.username,  
            "security_state": w.security_state
        })
    
    return {
        "username": user.username,
        "wallet_address": user.wallet_address,
        "roles": user.roles or [],
        "location": user.location,
        "watches": formatted_watches
    }

# ===============================================
#   TRANSFERENCIA P2P
# ===============================================
@app.post("/nfts/{token_id}/transfer")
async def transfer_nft(
    token_id: int,
    request: user_schemas.TransferRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Se busca el reloj
    nft = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if not nft:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    if nft.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el propietario puede transferir este reloj")

    # 2. Se busca al nuevo usuario por su dirección de wallet
    new_user = db.query(models.User).filter(models.User.wallet_address.ilike(request.new_owner)).first()
    
    if not new_user:
        raise HTTPException(status_code=404, detail="El destinatario no existe en la base de datos")

    # 3. Actualización de todos los campos de propiedad y seguridad
    nft.owner_wallet = request.new_owner
    nft.owner_id = new_user.id  
    nft.is_public = False
    nft.is_listed = False 

    db.commit()

    # 4. Notificamos por WebSocket para que las listas se refresquen solas
    if manager:
        await manager.broadcast("update_marketplace")

    return {"status": "success", "message": "Propiedad actualizada correctamente"}

# ==========================================
# NOTIFICACIONES 
# ==========================================
@app.get("/notifications", response_model=list[user_schemas.Notification])
async def get_notifications(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Obtiene todas las notificaciones del usuario actual, de la más reciente a la más antigua."""
    return db.query(models.Notification)\
             .filter(models.Notification.user_id == current_user.id)\
             .order_by(models.Notification.created_at.desc())\
             .all()

@app.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Borra una notificación específica si pertenece al usuario."""
    db_notif = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    
    if not db_notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
        
    db.delete(db_notif)
    db.commit()
    return {"message": "Notificación eliminada"}

# =============================================
#    SUBASTAS
# ==============================================
@app.post("/auctions/{token_id}/create")
async def create_auction(token_id: int, payload: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    
    # Verificar si es Dealer
    is_dealer = current_user.roles and "DEALER" in current_user.roles
    if not is_dealer:
        raise HTTPException(status_code=403, detail="Solo las joyerías autorizadas (Dealers) pueden crear subastas.")

    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if not watch or watch.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el propietario de este reloj o el reloj no existe.")

    # Verificar que no esté ya listado o en otra subasta activa
    if watch.is_listed:
        raise HTTPException(status_code=400, detail="El reloj ya está a la venta o en otra subasta.")

    min_price_usdc = payload.get("min_price_usdc")
    duration_seconds = payload.get("duration_seconds")

    if not min_price_usdc or not duration_seconds:
        raise HTTPException(status_code=400, detail="Faltan datos: min_price_usdc o duration_seconds.")

    min_price_int = int(min_price_usdc * 10**6)
    end_time = int(time.time()) + int(duration_seconds)

    # Crear la subasta
    new_auction = models.WatchAuction(
        token_id=token_id,
        seller=current_user.wallet_address,
        min_price=min_price_int,
        highest_bid=0,
        end_time=end_time,
        is_active=True
    )
    db.add(new_auction)
    
    # Bloquear el reloj para otras operaciones
    watch.is_listed = True 
    watch.is_public = True

    # Notificar al Dealer
    watch_name = watch.model if watch else "desconocido"
    duration_hours = duration_seconds / 3600
    notify_dealer = models.Notification(
        user_id=current_user.id,
        watch_id=token_id,
        title="Subasta Creada",
        message=f"Has creado una subasta del reloj {watch_name} con un precio de salida de {min_price_usdc} USDC y una duración de {duration_hours:.1f} horas.",
        type="AUCTION",
        created_at=datetime.now(timezone.utc)
    )
    db.add(notify_dealer)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al crear la subasta.")

    await manager.broadcast(json.dumps({"type": "update_marketplace"}))
    return {"message": "Subasta creada con éxito."}


@app.post("/auctions/{token_id}/bid")
async def place_bid(token_id: int, payload: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):

    auction = db.query(models.WatchAuction).filter(
        models.WatchAuction.token_id == token_id,
        models.WatchAuction.is_active == True
    ).with_for_update().first()

    if not auction:
        raise HTTPException(status_code=404, detail="No hay una subasta activa para este reloj.")

    # Comprobar que no haya caducado el tiempo
    if int(time.time()) > auction.end_time:
        raise HTTPException(status_code=400, detail="La subasta ya ha finalizado el tiempo permitido.")

    # El propietario no puede pujar en su propia subasta
    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    if watch and watch.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes pujar en tu propia subasta.")

    bid_amount_usdc = payload.get("bid_amount_usdc")
    if not bid_amount_usdc:
        raise HTTPException(status_code=400, detail="Debes enviar la cantidad de la puja (bid_amount_usdc).")

    bid_int = int(bid_amount_usdc * 10**6)

    # Validar que la puja supere el mínimo y la puja anterior
    if bid_int < auction.min_price:
        raise HTTPException(status_code=400, detail="La puja no supera el precio mínimo de salida.")
    if bid_int <= auction.highest_bid:
        raise HTTPException(status_code=400, detail="La puja debe ser superior a la puja actual más alta.")

    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    watch_name = watch.model if watch else "desconocido"

    # Notificar al postor anterior que ha sido superado (capturar id antes del commit)
    prev_bidder_id = None
    if auction.highest_bidder:
        prev_bidder_user = db.query(models.User).filter(models.User.wallet_address == auction.highest_bidder).first()
        if prev_bidder_user and prev_bidder_user.id != current_user.id:
            prev_bidder_id = prev_bidder_user.id
            db.add(models.Notification(
                user_id=prev_bidder_user.id,
                watch_id=token_id,
                title="Tu puja ha sido superada",
                message=f"Alguien ha pujado {bid_amount_usdc} USDC por {watch_name}. Tu dinero ha sido devuelto automáticamente.",
                type="AUCTION",
                created_at=datetime.now(timezone.utc)
            ))

    # Actualizar la subasta con el nuevo postor
    auction.highest_bid = bid_int
    auction.highest_bidder = current_user.wallet_address

    # Notificar al nuevo postor
    notify_bidder = models.Notification(
        user_id=current_user.id,
        watch_id=token_id,
        title="Puja más alta",
        message=f"Tienes la puja más alta ({bid_amount_usdc} USDC) por el reloj {watch_name}.",
        type="AUCTION",
        created_at=datetime.now(timezone.utc)
    )
    db.add(notify_bidder)

    # Registrar la puja en el historial
    db.add(models.AuctionBid(
        token_id=token_id,
        bidder_wallet=current_user.wallet_address,
        amount_usdc=bid_amount_usdc,
    ))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al procesar la puja.")

    # Refrescar AuctionScreen en todos los clientes y notificar al postor anterior y al actual
    await manager.broadcast(json.dumps({"type": "update_auction", "token_id": token_id}))
    await manager.send_to_user(current_user.id, "update_users")
    if prev_bidder_id:
        await manager.send_to_user(prev_bidder_id, "update_users")

    return {"message": "Puja registrada correctamente."}


def _resync_ownership_history(token_id: int, db: Session):
    """Re-sincroniza watch_ownership_history desde la blockchain para un token dado."""
    try:
        new_history = blockchain.get_ownership_history_from_chain(token_id)
    except Exception as e:
        print(f"[resync] Error leyendo cadena para token {token_id}: {e}")
        return
    db.query(models.WatchOwnershipHistory).filter(
        models.WatchOwnershipHistory.token_id == token_id
    ).delete()
    for h in new_history:
        db.add(models.WatchOwnershipHistory(
            token_id=token_id,
            previous_owner_wallet=h.get("previous_owner_wallet") or "",
            new_owner_wallet=h.get("new_owner_wallet") or "",
            via_contract_wallet=h.get("via_contract_wallet"),
            price_usdc=h.get("price_usdc"),
            transferred_at=h.get("transferred_at"),
        ))


@app.post("/auctions/{token_id}/end")
async def end_auction(token_id: int, db: Session = Depends(database.get_db)):
   
    auction = db.query(models.WatchAuction).filter(
        models.WatchAuction.token_id == token_id, 
        models.WatchAuction.is_active == True
    ).first()

    if not auction:
        raise HTTPException(status_code=404, detail="No hay una subasta activa para este reloj.")

    if int(time.time()) < auction.end_time:
        raise HTTPException(status_code=400, detail="La subasta aún no ha terminado su tiempo establecido.")

    # Cerrar la subasta
    auction.is_active = False

    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    watch_name = watch.model if watch else "desconocido"
    seller_user = db.query(models.User).filter(models.User.wallet_address == auction.seller).first()

    # Si hubo un ganador
    if auction.highest_bidder and auction.highest_bid >= auction.min_price:
        winner_user = db.query(models.User).filter(models.User.wallet_address == auction.highest_bidder).first()
        winning_price_usdc = auction.highest_bid / 10**6

        # Crear el registro de Listing y hacer flush para obtener su id
        new_listing = models.MarketplaceListing(
            token_id=token_id,
            seller=auction.seller,
            buyer=auction.highest_bidder,
            price=auction.highest_bid,
            seller_deposit=0,
            is_p2p=False,
            watchmaker_approved=True,
            is_shipped=False,
            listing_state=2
        )
        db.add(new_listing)
        db.flush()

        # Auto-ship: el sistema logístico marca el envío automáticamente (igual que en compra dealer normal)
        ship_result = blockchain.confirm_shipment(token_id=token_id)
        if ship_result.get("success"):
            new_listing.is_shipped = True
            new_listing.listing_state = 3

        # Notificar al ganador con reference_id para navegar a SaleScreen
        if winner_user:
            notify_winner = models.Notification(
                user_id=winner_user.id,
                watch_id=token_id,
                reference_id=new_listing.id,
                title="¡Has ganado la subasta!",
                message=f"Has ganado la puja del reloj {watch_name} con un precio de {winning_price_usdc} USDC. El reloj está en camino — confirma la entrega cuando lo recibas.",
                type="AUCTION",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_winner)

        # Notificar al Dealer (Vendedor)
        if seller_user:
            notify_seller = models.Notification(
                user_id=seller_user.id,
                watch_id=token_id,
                reference_id=new_listing.id,
                title="Subasta Finalizada",
                message=f"La subasta de tu reloj {watch_name} ha finalizado con {winning_price_usdc} USDC. Recibirás el pago cuando el cliente confirme la recepción.",
                type="AUCTION",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_seller)

    else:
        # Sin ganador: el reloj vuelve a estar disponible para el dealer
        watch.is_listed = False
        watch.is_public = False

        if seller_user:
            notify_seller = models.Notification(
                user_id=seller_user.id,
                watch_id=token_id,
                title="Subasta Desierta",
                message=f"La subasta de tu reloj {watch_name} ha terminado sin ningún comprador.",
                type="AUCTION",
                created_at=datetime.now(timezone.utc)
            )
            db.add(notify_seller)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al cerrar la subasta.")

    # Re-sincronizar historial de cadena con el nuevo estado (subasta cerrada)
    _resync_ownership_history(token_id, db)
    try:
        db.commit()
    except Exception:
        db.rollback()

    # Notificar a todos los clientes
    await manager.broadcast(json.dumps({"type": "update_marketplace"}))
    if auction.highest_bidder and auction.highest_bid >= auction.min_price:
        if winner_user:
            await manager.send_to_user(winner_user.id, "update_users")
        if seller_user:
            await manager.send_to_user(seller_user.id, "update_users")
    else:
        if seller_user:
            await manager.send_to_user(seller_user.id, "update_users")

    return {"message": "Subasta procesada y cerrada correctamente."}


# ==============================================
# ENDPOINTS GET — SUBASTAS Y OFERTAS
# ==============================================
@app.get("/auctions/my")
def list_my_auctions(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Subastas activas creadas por el usuario autenticado (rol DEALER)."""
    if not current_user.wallet_address:
        return []
    auctions = db.query(models.WatchAuction).filter(
        models.WatchAuction.seller == current_user.wallet_address,
        models.WatchAuction.is_active == True,
    ).all()
    now = int(time.time())
    result = []
    for auction in auctions:
        watch = db.query(models.Watch).filter(models.Watch.token_id == auction.token_id).first()
        result.append({
            "token_id": auction.token_id,
            "seller": auction.seller,
            "highest_bidder": auction.highest_bidder,
            "highest_bid": auction.highest_bid / 10**6 if auction.highest_bid else 0,
            "min_price": auction.min_price / 10**6,
            "end_time": auction.end_time,
            "seconds_remaining": max(0, auction.end_time - now),
            "is_active": auction.is_active,
            "watch": {
                "brand": watch.brand if watch else None,
                "model": watch.model if watch else None,
                "image": watch.image_url if watch else None,
                "manufacturing_year": watch.manufacturing_year if watch else None,
                "token_id": watch.token_id if watch else auction.token_id,
            } if watch else None,
        })
    return result


@app.get("/auctions")
def list_active_auctions(db: Session = Depends(database.get_db)):
    """Lista todas las subastas activas con datos del reloj."""
    auctions = db.query(models.WatchAuction).filter(
        models.WatchAuction.is_active == True
    ).all()

    result = []
    now = int(time.time())
    for auction in auctions:
        watch = db.query(models.Watch).filter(models.Watch.token_id == auction.token_id).first()
        seller_user = db.query(models.User).filter(
            models.User.wallet_address == auction.seller
        ).first()
        result.append({
            "token_id": auction.token_id,
            "seller": auction.seller,
            "seller_name": seller_user.username if seller_user else auction.seller,
            "highest_bidder": auction.highest_bidder,
            "highest_bid": auction.highest_bid / 10**6,
            "min_price": auction.min_price / 10**6,
            "end_time": auction.end_time,
            "seconds_remaining": max(0, auction.end_time - now),
            "is_active": auction.is_active,
            "watch": {
                "brand": watch.brand if watch else None,
                "model": watch.model if watch else None,
                "image": watch.image_url if watch else None,
                "manufacturing_year": watch.manufacturing_year if watch else None,
            } if watch else None,
        })

    return result


@app.get("/auctions/{token_id}")
def get_auction_detail(token_id: int, db: Session = Depends(database.get_db)):
    """Devuelve el detalle de la subasta activa de un reloj."""
    auction = db.query(models.WatchAuction).filter(
        models.WatchAuction.token_id == token_id,
        models.WatchAuction.is_active == True
    ).first()

    if not auction:
        raise HTTPException(status_code=404, detail="No hay subasta activa para este reloj.")

    watch = db.query(models.Watch).filter(models.Watch.token_id == token_id).first()
    seller_user = db.query(models.User).filter(
        models.User.wallet_address == auction.seller
    ).first()

    bids = db.query(models.AuctionBid).filter(
        models.AuctionBid.token_id == token_id
    ).order_by(models.AuctionBid.created_at.desc()).all()

    now = int(time.time())
    return {
        "token_id": auction.token_id,
        "seller": auction.seller,
        "seller_name": seller_user.username if seller_user else auction.seller,
        "highest_bidder": auction.highest_bidder,
        "highest_bid": auction.highest_bid / 10**6,
        "min_price": auction.min_price / 10**6,
        "end_time": auction.end_time,
        "seconds_remaining": max(0, auction.end_time - now),
        "is_active": auction.is_active,
        "watch": {
            "brand": watch.brand if watch else None,
            "model": watch.model if watch else None,
            "image": watch.image_url if watch else None,
            "serial_number": watch.serial_number if watch else None,
            "manufacturing_year": watch.manufacturing_year if watch else None,
        } if watch else None,
        "bids": [
            {
                "wallet": b.bidder_wallet,
                "amount": b.amount_usdc,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bids
        ],
    }


