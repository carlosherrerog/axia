"""
AXIA Manufacturer Tool
Herramienta de escritorio para fabricantes de relojes de lujo.
Permite mintear NFTs vinculados a chips NFC y gestionar el stock.
"""

import warnings
warnings.filterwarnings('ignore', message='The log with transaction hash')

import os
import sys
import json
import math
import platform
import threading
import requests
from pathlib import Path
from dotenv import load_dotenv, set_key

# --- Paths (compatibles con PyInstaller) ---------------------------------
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
    BUNDLE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).parent
    BUNDLE_DIR = BASE_DIR

ABI_DIR = BUNDLE_DIR / "abi"
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE)

# --- Dependencias opcionales ---------------------------------------------
try:
    from web3 import Web3
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False

try:
    from smartcard.System import readers as nfc_readers
    NFC_AVAILABLE = True
except ImportError:
    NFC_AVAILABLE = False

try:
    from PIL import Image, ImageTk
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

ICONS = {}  # {name: PhotoImage} — cargado en AxiaMfgApp.__init__

try:
    import cairosvg, io as _io
    CAIRO_AVAILABLE = True
except ImportError:
    CAIRO_AVAILABLE = False

def _load_svg(path, width):
    """Carga un SVG como PhotoImage escalado al ancho dado."""
    png = cairosvg.svg2png(url=str(path), output_width=width)
    img = Image.open(_io.BytesIO(png)).convert("RGBA")
    return ImageTk.PhotoImage(img)

def _load_icons():
    global ICONS
    if not PIL_AVAILABLE:
        return
    icons_dir = BUNDLE_DIR / "icons"

    # PNGs de UI
    for name in ("logo", "mint", "stock", "settings", "wallet", "logout"):
        path = icons_dir / f"{name}.png"
        if path.exists():
            try:
                img = Image.open(path)
                ICONS[name] = ImageTk.PhotoImage(img)
            except Exception as e:
                print(f"Icon load error ({name}): {e}")

    # SVGs de marca (requieren cairosvg)
    if CAIRO_AVAILABLE:
        svgs = {
            "axia_logo":     ("axia-logo-transparent.svg", 220),  # login
            "axia_wordmark": ("axia-wordmark.svg",     130),  # header
        }
        for key, (fname, w) in svgs.items():
            path = icons_dir / fname
            if path.exists():
                try:
                    ICONS[key] = _load_svg(path, w)
                except Exception as e:
                    print(f"SVG load error ({key}): {e}")


# ─────────────────────────────────────────────────────────────────────────────
# PALETA AXIA  (misma que frontend/src/themes/styles.js → darkColors)
# ─────────────────────────────────────────────────────────────────────────────
C = {
    "bg":        "#07070e",
    "bg_alt":    "#0f0e1c",
    "surface":   "#171530",
    "surface2":  "#1e1b38",
    "border":    "#26234a",
    "primary":   "#8b5cf6",
    "primary_h": "#a78bfa",
    "text":      "#f0f0f8",
    "text2":     "#a09dc5",
    "muted":     "#706da0",
    "success":   "#10b981",
    "error":     "#ef4444",
    "warning":   "#f59e0b",
    "gold":      "#d4a017",
}

_OS = platform.system()
if _OS == "Windows":
    _SANS, _MONO = "Segoe UI", "Consolas"
elif _OS == "Darwin":
    _SANS, _MONO = "Helvetica Neue", "Menlo"
else:
    _SANS, _MONO = "DejaVu Sans", "DejaVu Sans Mono"

FONT_TITLE  = (_SANS, 20, "bold")
FONT_HEAD   = (_SANS, 13, "bold")
FONT_SUBHEAD= (_SANS, 11, "bold")
FONT_BODY   = (_SANS, 10)
FONT_SMALL  = (_SANS,  9)
FONT_MONO   = (_MONO,  9)


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
# Valores de producción — Polygon Amoy + backend Render
DEFAULTS = {
    "API_URL":             "https://axia-8ivf.onrender.com",
    "RPC_URL":             "https://rpc-amoy.polygon.technology",
    "WATCH_NFT_ADDRESS":   "0xbBfCa1b8404Dc43238C4A359E8454632f00c292F",
    "MARKETPLACE_ADDRESS": "0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6",
    "USDC_ADDRESS":        "0x967187957d31d0912aE57cad1B51F764339AaEe6",
}

ENV_TEMPLATE = """\
# AXIA Manufacturer Tool — Configuración
# Rellena PRIVATE_KEY, PINATA_API_KEY y PINATA_SECRET_KEY.
# El resto de valores ya están preconfigurados para Polygon Amoy.

API_URL={API_URL}
RPC_URL={RPC_URL}
WATCH_NFT_ADDRESS={WATCH_NFT_ADDRESS}
MARKETPLACE_ADDRESS={MARKETPLACE_ADDRESS}
USDC_ADDRESS={USDC_ADDRESS}

# Tu clave privada (nunca la compartas)
PRIVATE_KEY=

# Claves de tu cuenta Pinata (https://app.pinata.cloud/developers/api-keys)
PINATA_API_KEY=
PINATA_SECRET_KEY=
"""

def _bootstrap_env():
    """Crea un .env pre-configurado en el primer arranque si no existe."""
    if not ENV_FILE.exists():
        ENV_FILE.write_text(ENV_TEMPLATE.format(**DEFAULTS), encoding="utf-8")
        load_dotenv(ENV_FILE)

_bootstrap_env()

def get_cfg(key, default=""):
    val = os.getenv(key)
    if val:
        return val
    return DEFAULTS.get(key, default)

def save_cfg(key, value):
    if not ENV_FILE.exists():
        ENV_FILE.write_text(ENV_TEMPLATE.format(**DEFAULTS), encoding="utf-8")
    set_key(str(ENV_FILE), key, value)
    os.environ[key] = value

def derived_wallet_address():
    pk = os.getenv("PRIVATE_KEY", "").strip()
    if not pk or not WEB3_AVAILABLE:
        return None
    try:
        return Web3().eth.account.from_key(pk).address
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE API
# ─────────────────────────────────────────────────────────────────────────────
class ApiClient:
    def __init__(self):
        self.token         = None
        self.refresh_token = None
        self.user          = None

    @property
    def base(self):
        return get_cfg("API_URL", "http://localhost:8000").rstrip("/")

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _try_refresh(self):
        if not self.refresh_token:
            raise RuntimeError("Sesión caducada. Vuelve a iniciar sesión.")
        r = requests.post(f"{self.base}/refresh",
                          json={"refresh_token": self.refresh_token}, timeout=10)
        if r.status_code != 200:
            self.token = self.refresh_token = None
            raise RuntimeError("Sesión caducada. Vuelve a iniciar sesión.")
        data = r.json()
        self.token         = data["access_token"]
        self.refresh_token = data.get("refresh_token", self.refresh_token)

    def _request(self, method, path, **kwargs):
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", 15)
        r = getattr(requests, method)(f"{self.base}{path}", **kwargs)
        if r.status_code == 401:
            self._try_refresh()
            kwargs["headers"] = self._headers()
            r = getattr(requests, method)(f"{self.base}{path}", **kwargs)
        r.raise_for_status()
        return r

    def login(self, identifier, password):
        r = requests.post(f"{self.base}/login",
                          json={"identifier": identifier, "password": password},
                          timeout=10)
        r.raise_for_status()
        data = r.json()
        self.token         = data["access_token"]
        self.refresh_token = data.get("refresh_token")
        self.user          = data["user"]
        if "FABRICANTE" not in (self.user.get("roles") or []):
            self.token = self.refresh_token = None
            raise ValueError("Este usuario no tiene el rol FABRICANTE.")
        return self.user

    def get_stock(self):
        return self._request("get", "/nfts/my-collection").json()

    def register_minted(self, payload: dict):
        return self._request("post", "/nfts/mint-register", json=payload, timeout=30).json()

    def list_for_sale(self, token_id: int, tx_hash: str, price_usdc: float):
        return self._request("post", f"/nfts/{token_id}/list",
                             json={"price_usdc": price_usdc, "tx_hash": tx_hash}).json()

    def get_user_by_wallet(self, address: str):
        """Devuelve el usuario AXIA para esa wallet, o None si no está registrado."""
        try:
            return self._request("get", f"/users/by-wallet/{address}").json()
        except Exception:
            return None

    def transfer_watch(self, token_id: int, new_owner: str, tx_hash: str):
        return self._request("post", f"/nfts/{token_id}/transfer",
                             json={"new_owner": new_owner, "tx_hash": tx_hash}).json()

    def sdm_setup(self, token_id: int, sdm_key_hex: str):
        """Envía la clave SDM derivada al backend para almacenarla.
        La clave se deriva localmente: keccak256(PRIVATE_KEY)[:16]. Nunca sale la PK."""
        return self._request("post", f"/nfts/{token_id}/sdm-setup",
                             json={"sdm_key": sdm_key_hex}).json()


api = ApiClient()


# ─────────────────────────────────────────────────────────────────────────────
# BLOCKCHAIN
# ─────────────────────────────────────────────────────────────────────────────
class BlockchainClient:
    def __init__(self):
        self._w3     = None
        self._nft    = None
        self._market = None

    def _connect(self):
        rpc = get_cfg("RPC_URL", "http://127.0.0.1:8545")
        w3  = Web3(Web3.HTTPProvider(rpc))
        try:
            from web3.middleware import ExtraDataToPOAMiddleware
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except Exception:
            pass
        if not w3.is_connected():
            raise ConnectionError(f"No se puede conectar a {rpc}")
        return w3

    @property
    def w3(self):
        if self._w3 is None or not self._w3.is_connected():
            self._w3 = self._connect()
        return self._w3

    def _load_contract(self, abi_file, address_key):
        abi_path = ABI_DIR / abi_file
        with open(abi_path) as f:
            abi = json.load(f)["abi"]
        addr = get_cfg(address_key)
        if not addr:
            raise ValueError(f"Variable de entorno {address_key} no configurada.")
        return self.w3.eth.contract(address=self.w3.to_checksum_address(addr), abi=abi)

    @property
    def nft(self):
        if self._nft is None:
            self._nft = self._load_contract("WatchNFT.json", "WATCH_NFT_ADDRESS")
        return self._nft

    @property
    def market(self):
        if self._market is None:
            self._market = self._load_contract("WatchMarketplace.json", "MARKETPLACE_ADDRESS")
        return self._market

    @property
    def wallet_address(self):
        return derived_wallet_address()

    def _credentials(self):
        pk = os.getenv("PRIVATE_KEY", "").strip()
        if not pk:
            raise ValueError("Wallet no conectada. Configura tu private key.")
        try:
            sender = self.w3.eth.account.from_key(pk).address
        except Exception as e:
            raise ValueError(f"PRIVATE_KEY inválida: {e}")
        return sender, pk

    def _tx_opts(self, sender):
        return {
            "from":     sender,
            "nonce":    self.w3.eth.get_transaction_count(sender),
            "gas":      600000,
            "gasPrice": self.w3.eth.gas_price,
        }

    def _sign_and_send(self, tx, private_key):
        signed   = self.w3.eth.account.sign_transaction(tx, private_key)
        tx_hash  = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt  = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status != 1:
            raise RuntimeError("Transacción revertida en la blockchain.")
        return tx_hash.hex(), receipt

    def get_nfc_status(self, uid_str: str):
        hash_uid = self.w3.keccak(text=uid_str)
        try:
            token_id = self.nft.functions.getTokenByNFC(hash_uid).call()
            return (False, 0) if token_id == 0 else (True, token_id)
        except Exception:
            # El contrato revierte con NFCNotRegistered cuando el chip no está vinculado
            return False, 0

    def mint_watch(self, brand, model, serial, year, uid_str, token_uri, recipient):
        sender, pk    = self._credentials()
        hash_uid      = self.w3.keccak(text=uid_str)
        recipient_cs  = self.w3.to_checksum_address(recipient)
        fn = self.nft.functions.mintWatch(
            brand, model, serial, int(year), hash_uid, token_uri, recipient_cs
        )
        opts = self._tx_opts(sender)
        opts["gas"] = int(fn.estimate_gas({"from": sender}) * 1.3)
        tx = fn.build_transaction(opts)
        tx_hash, receipt = self._sign_and_send(tx, pk)
        logs = self.nft.events.WatchMinted().process_receipt(receipt)
        if not logs:
            raise RuntimeError("No se encontró el evento WatchMinted en el recibo.")
        return tx_hash, logs[0]["args"]["tokenId"]

    def approve_marketplace(self, token_id):
        sender, pk  = self._credentials()
        market_addr = get_cfg("MARKETPLACE_ADDRESS")
        fn = self.nft.functions.approve(self.w3.to_checksum_address(market_addr), token_id)
        opts = self._tx_opts(sender)
        opts["gas"] = int(fn.estimate_gas({"from": sender}) * 1.3)
        self._sign_and_send(fn.build_transaction(opts), pk)

    def list_watch(self, token_id, price_usdc):
        sender, pk = self._credentials()
        price_raw  = int(price_usdc * 1_000_000)
        fn = self.market.functions.listWatch(token_id, price_raw)
        opts = self._tx_opts(sender)
        opts["gas"] = int(fn.estimate_gas({"from": sender}) * 1.3)
        tx_hash, _ = self._sign_and_send(fn.build_transaction(opts), pk)
        return tx_hash

    def transfer_nft(self, token_id, to_address):
        sender, pk = self._credentials()
        to_cs      = self.w3.to_checksum_address(to_address)
        tx = self.nft.functions.safeTransferFrom(
            sender, to_cs, token_id
        ).build_transaction(self._tx_opts(sender))
        tx_hash, _ = self._sign_and_send(tx, pk)
        return tx_hash


bc = BlockchainClient()




# ─────────────────────────────────────────────────────────────────────────────
# PINATA
# ─────────────────────────────────────────────────────────────────────────────
def upload_image_pinata(file_path: str) -> str:
    api_key = get_cfg("PINATA_API_KEY")
    secret  = get_cfg("PINATA_SECRET_KEY")
    if not api_key or not secret:
        raise ValueError("PINATA_API_KEY y PINATA_SECRET_KEY no están configuradas.")
    headers = {"pinata_api_key": api_key, "pinata_secret_api_key": secret}
    with open(file_path, "rb") as f:
        r = requests.post("https://api.pinata.cloud/pinning/pinFileToIPFS",
                          files={"file": (os.path.basename(file_path), f)},
                          headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()["IpfsHash"]

def upload_json_pinata(data: dict, name: str) -> str:
    api_key = get_cfg("PINATA_API_KEY")
    secret  = get_cfg("PINATA_SECRET_KEY")
    headers = {
        "pinata_api_key": api_key,
        "pinata_secret_api_key": secret,
        "Content-Type": "application/json",
    }
    body = {"pinataContent": data, "pinataMetadata": {"name": name}}
    r = requests.post("https://api.pinata.cloud/pinning/pinJSONToIPFS",
                      json=body, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()["IpfsHash"]


# ─────────────────────────────────────────────────────────────────────────────
# NFC
# ─────────────────────────────────────────────────────────────────────────────
def read_nfc_uid() -> str:
    r_list = nfc_readers()
    if not r_list:
        raise IOError("No se detecta ningún lector NFC por USB.")
    conn = r_list[0].createConnection()
    conn.connect()
    data, sw1, sw2 = conn.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
    if sw1 != 0x90:
        raise IOError("Error de lectura NFC (sin tarjeta o error APDU).")
    return ":".join(f"{b:02X}" for b in data)


def _nfc_open_connection():
    """Abre y devuelve una conexión PC/SC al primer lector disponible."""
    r_list = nfc_readers()
    if not r_list:
        raise IOError("No se detecta ningún lector NFC por USB.")
    conn = r_list[0].createConnection()
    conn.connect()
    return conn


def write_ndef_url(token_id: int) -> None:
    """
    Escribe la URL SDM del reloj en el chip NTAG 424 DNA.

    Secuencia ISO 7816-4 T4T verificada en laboratorio (25/05/2026):
      (A) SELECT NDEF Application  (AID D2760000850101)
      (B) SELECT NDEF File         (FID E104)
      (C) UPDATE BINARY            (offset 0x0000)

    Fase 2 SDM: la URL contiene 32 'P' (enc_picc placeholder) y 16 'C' (cmac placeholder).
    El chip NTAG 424 DNA sobreescribe estos caracteres en cada escaneo con los datos SDM reales.
    Formato: {API_URL}/nfc/{token_id}?picc=PPPP...PPPP&cmac=CCCC...CCCC
    """
    base_url = get_cfg("API_URL", "https://axia-8ivf.onrender.com").rstrip("/")
    url_full = f"{base_url}/nfc/{token_id}?picc={'P' * 32}&cmac={'C' * 16}"

    if url_full.startswith("https://"):
        url_suffix = url_full[8:].encode("utf-8")
        prefix_byte = 0x04          # NFC Forum URI prefix code para "https://"
    elif url_full.startswith("http://"):
        url_suffix = url_full[7:].encode("utf-8")
        prefix_byte = 0x03
    else:
        url_suffix = url_full.encode("utf-8")
        prefix_byte = 0x00

    payload     = bytes([prefix_byte]) + url_suffix
    ndef_record = bytes([0xD1, 0x01, len(payload), 0x55]) + payload
    nlen        = len(ndef_record)
    file_data   = bytes([0x00, nlen]) + ndef_record  # prefijo NLEN (2 bytes big-endian)

    conn = _nfc_open_connection()
    try:
        # (A) SELECT NDEF Application
        _, sw1, sw2 = conn.transmit(
            [0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00])
        if (sw1, sw2) != (0x90, 0x00):
            raise IOError(f"SELECT NDEF App falló: SW {sw1:02X} {sw2:02X}")

        # (B) SELECT NDEF File (FID = E104 — estándar T4T para NTAG 424 DNA)
        _, sw1, sw2 = conn.transmit(
            [0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04, 0x00])
        if (sw1, sw2) != (0x90, 0x00):
            raise IOError(f"SELECT NDEF File falló: SW {sw1:02X} {sw2:02X}")

        # (C) UPDATE BINARY desde offset 0x0000
        apdu = [0x00, 0xD6, 0x00, 0x00, len(file_data)] + list(file_data)
        _, sw1, sw2 = conn.transmit(apdu)
        if (sw1, sw2) != (0x90, 0x00):
            raise IOError(f"UPDATE BINARY falló: SW {sw1:02X} {sw2:02X}")
    finally:
        conn.disconnect()


# ── Clave NFC derivada de la PRIVATE_KEY ──────────────────────────────────────

def _derive_nfc_key() -> bytes:
    """
    Deriva la clave maestra AES-128 del chip NFC a partir de la PRIVATE_KEY
    del fabricante usando keccak256. Determinista: misma wallet → misma clave.
    No almacena nada extra; se calcula en el momento en que se necesita.
    """
    pk = os.getenv("PRIVATE_KEY", "").strip()
    if not pk:
        raise ValueError("PRIVATE_KEY no configurada. Conéctala en Configuración antes de mintear.")
    if not WEB3_AVAILABLE:
        raise RuntimeError("web3.py no disponible.")
    pk_hex = pk[2:] if pk.startswith("0x") else pk
    digest = Web3().keccak(hexstr=pk_hex)  # bytes32
    return bytes(digest[:16])              # primeros 16 bytes → clave AES-128


# ── Autenticación AES-128 EV2 y bloqueo de escritura ──────────────────────────

def _aes_cbc(key: bytes, iv: bytes, data: bytes, encrypt: bool) -> bytes:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    op = cipher.encryptor() if encrypt else cipher.decryptor()
    return op.update(data) + op.finalize()


def _aes_cmac(key: bytes, data: bytes) -> bytes:
    from cryptography.hazmat.primitives.cmac import CMAC
    from cryptography.hazmat.primitives.ciphers import algorithms
    from cryptography.hazmat.backends import default_backend
    c = CMAC(algorithms.AES(key), backend=default_backend())
    c.update(data)
    return c.finalize()


def _authenticate_ev2(conn, key: bytes, key_no: int = 0):
    """
    Autenticación EV2 con NTAG 424 DNA (protocolo AES-128 NXP).
    Protocolo descrito en NXP AN12343 sección 10 / NT4H2421G datasheet.

    Retorna (session_enc_key, session_mac_key, ti, cmd_ctr).
    'ti' es el Transaction Identifier de 4 bytes usado para calcular MACs.
    'cmd_ctr' empieza en 1 después de la autenticación (la auth ya cuenta como cmd 0).
    """
    import os

    # ── Paso 1: AuthEV2First — enviar número de clave ──────────────────────
    # INS=71, Lc=02, Data=[keyNo, PCDCap2_length=00]
    resp, sw1, sw2 = conn.transmit(
        [0x90, 0x71, 0x00, 0x00, 0x02, key_no, 0x00, 0x00])
    if sw1 != 0x91 or sw2 != 0xAF:
        raise IOError(f"AuthEV2First: SW inesperado {sw1:02X} {sw2:02X}")
    enc_rnd_b = bytes(resp)  # 16 bytes: AES-CBC(key, IV=0, RndB)

    # ── Paso 2: Descifrar RndB ────────────────────────────────────────────
    rnd_b = _aes_cbc(key, b'\x00' * 16, enc_rnd_b, encrypt=False)

    # ── Paso 3-4: Generar RndA y rotar RndB a la izquierda 1 byte ────────
    rnd_a   = os.urandom(16)
    rnd_b_r = rnd_b[1:] + rnd_b[:1]

    # ── Paso 5: Cifrar (RndA || RndB_rot) con IV = enc_rnd_b ─────────────
    token = _aes_cbc(key, enc_rnd_b, rnd_a + rnd_b_r, encrypt=True)  # 32 bytes

    # ── Paso 6: AuthContinue ──────────────────────────────────────────────
    resp, sw1, sw2 = conn.transmit(
        [0x90, 0xAF, 0x00, 0x00, 0x20] + list(token) + [0x00])
    if sw1 != 0x91 or sw2 != 0x00:
        raise IOError(
            f"AuthEV2Continue: SW {sw1:02X} {sw2:02X} — clave incorrecta o protocolo no soportado")

    enc_resp = bytes(resp)  # 16 bytes (RndA_rot enc) o 32 bytes (+ TI + caps)

    # ── Paso 7: Descifrar y verificar RndA_rot ───────────────────────────
    # IV para descifrar = últimos 16 bytes del token que enviamos
    rnd_a_rot_recv = _aes_cbc(key, token[16:], enc_resp[:16], encrypt=False)
    if rnd_a_rot_recv != rnd_a[1:] + rnd_a[:1]:
        raise IOError("AuthEV2: verificación de RndA fallida")

    # ── Extracción de TI (Transaction Identifier) ─────────────────────────
    # Si la respuesta es ≥ 32 bytes, TI está en los bytes 0-3 del segundo bloque descifrado
    ti = b'\x00' * 4
    if len(enc_resp) >= 32:
        block2 = _aes_cbc(key, enc_resp[:16], enc_resp[16:32], encrypt=False)
        ti = block2[:4]

    # ── Paso 8: Derivar session keys (NXP EV2 KDF vía AES-CMAC) ─────────
    # Input vectors según AN12343:
    #   SV_ENC = A5 5A 00 91 87 28 10 80 || RndA[0:2] || RndB[0:2] || RndA[2:8] || RndB[2:8]
    #   SV_MAC = 5A A5 00 91 87 28 10 80 || RndA[0:2] || RndB[0:2] || RndA[2:8] || RndB[2:8]
    sv_suffix = rnd_a[:2] + rnd_b[:2] + rnd_a[2:8] + rnd_b[2:8]
    sv_enc = bytes([0xA5, 0x5A, 0x00, 0x91, 0x87, 0x28, 0x10, 0x80]) + sv_suffix
    sv_mac = bytes([0x5A, 0xA5, 0x00, 0x91, 0x87, 0x28, 0x10, 0x80]) + sv_suffix

    session_enc_key = _aes_cmac(key, sv_enc)
    session_mac_key = _aes_cmac(key, sv_mac)

    return session_enc_key, session_mac_key, ti, 1  # cmd_ctr=1 tras la autenticación


def _compute_mac(session_mac_key: bytes, ins: int, cmd_ctr: int,
                 ti: bytes, cmd_data: bytes) -> bytes:
    """
    Calcula el MAC truncado (8 bytes) para un comando CommMode.MAC.
    MAC_input = INS || CmdCtr[LE 2B] || TI[4B] || CmdData
    Truncado: bytes en posiciones impares del CMAC (1,3,5,7,9,11,13,15) → 8 bytes.
    """
    mac_input = bytes([ins]) + cmd_ctr.to_bytes(2, 'little') + ti + cmd_data
    full_mac  = _aes_cmac(session_mac_key, mac_input)
    return bytes([full_mac[i] for i in range(1, 16, 2)])  # 8 bytes


def _sdm_offsets(token_id: int, base_url: str) -> tuple:
    """
    Calcula los offsets de EncPICCData y SDMMAC dentro del fichero NDEF.

    Estructura del fichero (desde offset 0):
      [00][nlen]  NLEN big-endian (2 bytes)
      [D1][01][payload_len][55]  cabecera NDEF record (4 bytes)
      [prefix_byte]  código de prefijo URI NFC Forum (1 byte)
      [url_suffix...]  URL sin el prefijo

    EncPICCDataOffset = offset de los 32 chars 'PPPP...' dentro del fichero.
    SDMMACInputOffset = igual que EncPICCDataOffset (MAC cubre enc_picc).
    SDMMACOffset      = offset de los 16 chars 'CCCC...' dentro del fichero.
    """
    if base_url.startswith("https://"):
        part = base_url[8:]
    elif base_url.startswith("http://"):
        part = base_url[7:]
    else:
        part = base_url
    url_part_before_picc = f"{part}/nfc/{token_id}?picc="
    header_bytes = 7  # NLEN(2) + D1 01 payload_len 55(4) + prefix_byte(1)
    enc_picc_off = header_bytes + len(url_part_before_picc.encode("utf-8"))
    mac_in_off   = enc_picc_off
    mac_off      = enc_picc_off + 32 + len("&cmac=")
    return enc_picc_off, mac_in_off, mac_off


def setup_nfc_chip(token_id: int) -> None:
    """
    Configura el chip NTAG 424 DNA para SDM (Secure Dynamic Messaging) y
    protege la escritura contra modificación no autorizada.

    Secuencia (chip virgen, Key 0 = 00*16):
      1. AuthEV2First con Key 0 = 00*16
      2. ChangeFileSettings: habilita SDM con VCUID + ReadCtr + CMAC usando Key 0
      3. ChangeKey: cambia Key 0 a keccak256(PRIVATE_KEY)[:16]

    Tras esto, cada escaneo NFC genera una URL única con enc_picc y cmac
    distintos, verificables criptográficamente en el backend.
    La nueva clave es determinista: misma wallet → misma clave NFC.
    """
    current_key = bytes(16)        # chip virgen: Key 0 = 00*16
    new_key     = _derive_nfc_key()
    base_url    = get_cfg("API_URL", "https://axia-8ivf.onrender.com").rstrip("/")
    enc_picc_off, mac_in_off, mac_off = _sdm_offsets(token_id, base_url)

    def _off3(v):
        return bytes([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF])

    conn = _nfc_open_connection()
    try:
        # ── 1. Autenticación EV2 ──────────────────────────────────────────
        sess_enc, sess_mac, ti, cmd_ctr = _authenticate_ev2(conn, current_key, key_no=0)

        # ── 2. ChangeFileSettings con SDM habilitado ──────────────────────
        # FileNo   = 0x02 (NDEF file)
        # FileOption = 0x40: SDM_EN=1, CommMode=Plain (bit5:4=00)
        # AccessRights: RW=0, Change=0, Read=E(libre), Write=0 → [0x00, 0xE0]
        # SDMOptions = 0xC1: VCUID=1, SDMReadCtr=1, SDMMAC=1
        # SDMAccessRights: SDMMetaRead=F(libre), SDMFileRead=0(Key0), CtrRet=F → [0xF0, 0x0F]
        # EncPICCDataOffset, SDMMACInputOffset, SDMMACOffset (3 bytes LE cada uno)
        cmd_data_cfs = bytes([
            0x02,          # FileNo
            0x40,          # FileOption: SDM_EN=1
            0x00, 0xE0,    # AccessRights
            0xC1,          # SDMOptions
            0xF0, 0x0F,    # SDMAccessRights: FileReadKey=0 (Key0)
        ]) + _off3(enc_picc_off) + _off3(mac_in_off) + _off3(mac_off)
        mac_cfs = _compute_mac(sess_mac, 0x5F, cmd_ctr, ti, cmd_data_cfs)
        apdu_cfs = [0x90, 0x5F, 0x00, 0x00, len(cmd_data_cfs) + 8] + \
                   list(cmd_data_cfs) + list(mac_cfs) + [0x00]
        _, sw1, sw2 = conn.transmit(apdu_cfs)
        if sw1 != 0x91 or sw2 != 0x00:
            raise IOError(f"ChangeFileSettings (SDM) falló: SW {sw1:02X} {sw2:02X}")
        cmd_ctr += 1

        # ── 3. ChangeKey: cambiar Key 0 a la clave secreta del fabricante ─
        enc_new_key = _aes_cbc(sess_enc, b'\x00' * 16, new_key, encrypt=True)
        key_ver = 0x01
        cmd_data_ck = bytes([0x00]) + enc_new_key + bytes([key_ver])
        mac_ck = _compute_mac(sess_mac, 0xC4, cmd_ctr, ti, cmd_data_ck)
        apdu_ck = [0x90, 0xC4, 0x00, 0x00, len(cmd_data_ck) + 8] + \
                  list(cmd_data_ck) + list(mac_ck) + [0x00]
        _, sw1, sw2 = conn.transmit(apdu_ck)
        if sw1 != 0x91 or sw2 != 0x00:
            raise IOError(f"ChangeKey falló: SW {sw1:02X} {sw2:02X}")

    finally:
        conn.disconnect()


def lock_nfc_chip() -> None:
    """Alias de setup_nfc_chip sin token_id (solo protección de escritura, sin SDM)."""
    current_key = bytes(16)
    new_key     = _derive_nfc_key()
    conn = _nfc_open_connection()
    try:
        sess_enc, sess_mac, ti, cmd_ctr = _authenticate_ev2(conn, current_key, key_no=0)
        cmd_data_cfs = bytes([0x02, 0x00, 0x00, 0xE0])
        mac_cfs = _compute_mac(sess_mac, 0x5F, cmd_ctr, ti, cmd_data_cfs)
        apdu_cfs = [0x90, 0x5F, 0x00, 0x00, len(cmd_data_cfs) + 8] + \
                   list(cmd_data_cfs) + list(mac_cfs) + [0x00]
        _, sw1, sw2 = conn.transmit(apdu_cfs)
        if sw1 != 0x91 or sw2 != 0x00:
            raise IOError(f"ChangeFileSettings falló: SW {sw1:02X} {sw2:02X}")
        cmd_ctr += 1
        enc_new_key = _aes_cbc(sess_enc, b'\x00' * 16, new_key, encrypt=True)
        key_ver = 0x01
        cmd_data_ck = bytes([0x00]) + enc_new_key + bytes([key_ver])
        mac_ck = _compute_mac(sess_mac, 0xC4, cmd_ctr, ti, cmd_data_ck)
        apdu_ck = [0x90, 0xC4, 0x00, 0x00, len(cmd_data_ck) + 8] + \
                  list(cmd_data_ck) + list(mac_ck) + [0x00]
        _, sw1, sw2 = conn.transmit(apdu_ck)
        if sw1 != 0x91 or sw2 != 0x00:
            raise IOError(f"ChangeKey falló: SW {sw1:02X} {sw2:02X}")
    finally:
        conn.disconnect()


# ─────────────────────────────────────────────────────────────────────────────
# WIDGETS HELPER
# ─────────────────────────────────────────────────────────────────────────────
def _apply_scrollbar_style(root: tk.Tk):
    s = ttk.Style(root)
    s.theme_use("clam")
    s.configure("Slim.Vertical.TScrollbar",
        gripcount=0, background=C["surface2"], darkcolor=C["surface2"],
        lightcolor=C["surface2"], troughcolor=C["bg_alt"],
        bordercolor=C["bg_alt"], arrowcolor=C["muted"],
        relief="flat", arrowsize=10,
    )
    s.map("Slim.Vertical.TScrollbar",
        background=[("active", C["border"])],
        arrowcolor=[("active", C["text2"])],
    )

_scroll_target = None  # canvas sobre el que está el ratón

def _bind_scroll_to(widget, canvas):
    """Propaga los eventos de scroll de widget y sus hijos al canvas dado."""
    def _scroll(event):
        canvas.yview_scroll(-1 if (event.num == 4 or event.delta > 0) else 1, "units")
    widget.bind("<MouseWheel>", _scroll, add="+")
    widget.bind("<Button-4>",   _scroll, add="+")
    widget.bind("<Button-5>",   _scroll, add="+")
    for child in widget.winfo_children():
        _bind_scroll_to(child, canvas)

def scrollable(parent):
    """Devuelve (outer_frame, inner_frame) con scrollbar fina y scroll de ratón."""
    outer = tk.Frame(parent, bg=C["bg"])
    canvas = tk.Canvas(outer, bg=C["bg"], highlightthickness=0)
    vsb    = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview,
                           style="Slim.Vertical.TScrollbar")
    canvas.configure(yscrollcommand=vsb.set)
    vsb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)

    inner = tk.Frame(canvas, bg=C["bg"])
    win   = canvas.create_window((0, 0), window=inner, anchor="nw")

    def _on_frame_configure(e):
        canvas.configure(scrollregion=canvas.bbox("all"))
        _bind_scroll_to(inner, canvas)

    inner.bind("<Configure>",  _on_frame_configure)
    canvas.bind("<Configure>", lambda e: canvas.itemconfig(win, width=e.width))

    def _scroll(event):
        canvas.yview_scroll(-1 if (event.num == 4 or event.delta > 0) else 1, "units")
    canvas.bind("<MouseWheel>", _scroll)
    canvas.bind("<Button-4>",   _scroll)
    canvas.bind("<Button-5>",   _scroll)

    return outer, inner

def styled_frame(parent, bg=None, **kw):
    return tk.Frame(parent, bg=bg or C["bg_alt"], **kw)

def styled_label(parent, text, font=FONT_BODY, fg=None, bg=None, **kw):
    return tk.Label(parent, text=text, font=font,
                    fg=fg or C["text"], bg=bg or C["bg_alt"], **kw)

def styled_entry(parent, textvariable=None, width=30, show=None):
    e = tk.Entry(parent, textvariable=textvariable, width=width,
                 font=FONT_BODY, fg=C["text"], bg=C["surface"],
                 insertbackground=C["text"], relief="flat",
                 highlightthickness=1, highlightbackground=C["border"],
                 highlightcolor=C["primary"])
    if show:
        e.config(show=show)
    return e

def styled_button(parent, text, command, color=None, fg="#ffffff", width=None):
    kw = dict(text=text, command=command, font=FONT_BODY,
              fg=fg, bg=color or C["primary"],
              activeforeground=fg, activebackground=C["primary_h"],
              relief="flat", cursor="hand2", padx=14, pady=7)
    if width:
        kw["width"] = width
    return tk.Button(parent, **kw)

def card_frame(parent, padx=28):
    """Frame tipo tarjeta con borde fino."""
    f = tk.Frame(parent, bg=C["surface"],
                 highlightthickness=1, highlightbackground=C["border"])
    f.pack(fill="x", padx=padx, pady=4, ipadx=16, ipady=12)
    return f

def separator(parent, bg=None):
    return tk.Frame(parent, bg=bg or C["border"], height=1)

def section_label(parent, text, padx=28):
    tk.Label(parent, text=text, font=FONT_SUBHEAD,
             fg=C["primary_h"], bg=C["bg"]).pack(anchor="w", padx=padx, pady=(14, 3))


# ─────────────────────────────────────────────────────────────────────────────
# DIÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────
class ConnectWalletDialog(tk.Toplevel):
    def __init__(self, parent, expected_address=None):
        super().__init__(parent)
        self.result = None
        self.expected_address = (expected_address or "").lower()

        self.title("Conectar Wallet")
        self.geometry("520x390")
        self.configure(bg=C["bg_alt"])
        self.resizable(False, False)
        self.lift()
        self.focus_force()
        self.grab_set()

        f = styled_frame(self, C["bg_alt"])
        f.pack(fill="both", expand=True, padx=28, pady=24)

        tk.Label(f, text="⬡  Vincular Wallet",
                 font=FONT_HEAD, fg=C["text"], bg=C["bg_alt"]).pack(anchor="w")
        tk.Label(f, text="Pega la clave privada de la wallet que registraste\n"
                         "en la web/app AXIA. Se guardará en tu .env local.",
                 font=FONT_SMALL, fg=C["text2"], bg=C["bg_alt"],
                 justify="left").pack(anchor="w", pady=(4, 16))

        tk.Label(f, text="Private key", font=FONT_SMALL,
                 fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w")
        self.pk_var = tk.StringVar()
        entry = styled_entry(f, self.pk_var, 56, show="•")
        entry.pack(fill="x", pady=(2, 12))
        self.pk_var.trace_add("write", lambda *_: self._update_preview())

        tk.Label(f, text="Dirección derivada", font=FONT_SMALL,
                 fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w")
        self.preview_var = tk.StringVar(value="—")
        self.preview_lbl = tk.Label(f, textvariable=self.preview_var,
                                    font=FONT_MONO, fg=C["muted"], bg=C["bg_alt"])
        self.preview_lbl.pack(anchor="w", pady=(2, 6))

        if self.expected_address:
            tk.Label(f, text=f"Wallet registrada en AXIA: {self.expected_address}",
                     font=FONT_SMALL, fg=C["muted"], bg=C["bg_alt"]).pack(anchor="w", pady=(0, 8))

        self.warn_var = tk.StringVar(value="")
        tk.Label(f, textvariable=self.warn_var, font=FONT_SMALL, fg=C["warning"],
                 bg=C["bg_alt"], wraplength=460, justify="left").pack(anchor="w")

        btn_row = styled_frame(f, C["bg_alt"])
        btn_row.pack(fill="x", pady=(20, 0))
        styled_button(btn_row, "Cancelar", self.destroy,
                      color=C["surface"]).pack(side="left")
        self.ok_btn = styled_button(btn_row, "Vincular", self._confirm, C["primary"])
        self.ok_btn.pack(side="right")
        self.ok_btn.config(state="disabled")

    def _update_preview(self):
        pk = self.pk_var.get().strip()
        if not pk:
            self.preview_var.set("—")
            self.preview_lbl.config(fg=C["muted"])
            self.warn_var.set("")
            self.ok_btn.config(state="disabled")
            return
        if not WEB3_AVAILABLE:
            self.warn_var.set("web3.py no disponible.")
            return
        try:
            addr = Web3().eth.account.from_key(pk).address
            self.preview_var.set(addr)
            self.ok_btn.config(state="normal")
            if self.expected_address and addr.lower() != self.expected_address:
                self.preview_lbl.config(fg=C["warning"])
                self.warn_var.set("⚠  Esta wallet NO coincide con la registrada en AXIA.")
            else:
                self.preview_lbl.config(fg=C["success"])
                self.warn_var.set("")
        except Exception:
            self.preview_var.set("Clave inválida")
            self.preview_lbl.config(fg=C["error"])
            self.ok_btn.config(state="disabled")

    def _confirm(self):
        pk = self.pk_var.get().strip()
        if pk and not pk.startswith("0x"):
            pk = "0x" + pk

        self.ok_btn.config(state="disabled", text="Verificando…")
        self.warn_var.set("")

        def do_check():
            try:
                addr = Web3().eth.account.from_key(pk).address
            except Exception:
                self.after(0, lambda: (
                    self.warn_var.set("⚠  Clave privada inválida."),
                    self.ok_btn.config(state="normal", text="Vincular")
                ))
                return

            try:
                user = api.get_user_by_wallet(addr)
            except Exception:
                user = None

            if not user:
                self.after(0, lambda: (
                    self.warn_var.set("⚠  Esta wallet no está registrada en AXIA.\n"
                                      "   Crea una cuenta y solicita el rol FABRICANTE primero."),
                    self.ok_btn.config(state="normal", text="Vincular")
                ))
                return

            if "FABRICANTE" not in (user.get("roles") or []):
                self.after(0, lambda: (
                    self.warn_var.set("⚠  Esta wallet no tiene el rol FABRICANTE en AXIA."),
                    self.ok_btn.config(state="normal", text="Vincular")
                ))
                return

            save_cfg("PRIVATE_KEY", pk)
            self.result = pk
            self.after(0, self.destroy)

        threading.Thread(target=do_check, daemon=True).start()


class AssignDialog(tk.Toplevel):
    def __init__(self, parent, token_id, brand, model):
        super().__init__(parent)
        self.result   = None
        self.token_id = token_id

        self.title("Asignar Reloj")
        self.geometry("460x240")
        self.configure(bg=C["bg_alt"])
        self.resizable(False, False)
        self.grab_set()

        f = styled_frame(self, C["bg_alt"])
        f.pack(fill="both", expand=True, padx=24, pady=24)

        watch_title = f"{brand} {model}"
        if len(watch_title) > 28:
            watch_title = watch_title[:26] + "…"
        tk.Label(f, text=f"Asignar #{token_id}",
                 font=FONT_HEAD, fg=C["text"], bg=C["bg_alt"]).pack(anchor="w")
        tk.Label(f, text=watch_title,
                 font=FONT_BODY, fg=C["text2"], bg=C["bg_alt"],
                 wraplength=390).pack(anchor="w", pady=(0, 4))
        styled_label(f, "Wallet del destinatario (0x...)",
                     font=FONT_SMALL, fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w", pady=(8, 2))
        self.wallet_var = tk.StringVar()
        styled_entry(f, self.wallet_var, width=48).pack(fill="x", pady=(0, 16))

        btn_row = styled_frame(f, C["bg_alt"])
        btn_row.pack(fill="x")
        styled_button(btn_row, "Cancelar", self.destroy,
                      color=C["surface"]).pack(side="left")
        styled_button(btn_row, "Asignar en Blockchain",
                      self._confirm, C["primary"]).pack(side="right")

    def _confirm(self):
        wallet = self.wallet_var.get().strip()
        if not wallet.startswith("0x") or len(wallet) != 42:
            messagebox.showerror("Error", "Dirección inválida.", parent=self)
            return
        self.result = wallet
        self.destroy()


class ListForSaleDialog(tk.Toplevel):
    def __init__(self, parent, token_id, brand, model):
        super().__init__(parent)
        self.result   = None
        self.token_id = token_id

        self.title("Poner a la Venta")
        self.geometry("400x220")
        self.configure(bg=C["bg_alt"])
        self.resizable(False, False)
        self.grab_set()

        f = styled_frame(self, C["bg_alt"])
        f.pack(fill="both", expand=True, padx=24, pady=24)

        watch_title = f"{brand} {model}"
        if len(watch_title) > 28:
            watch_title = watch_title[:26] + "…"
        tk.Label(f, text=f"Publicar #{token_id}",
                 font=FONT_HEAD, fg=C["text"], bg=C["bg_alt"]).pack(anchor="w")
        tk.Label(f, text=watch_title,
                 font=FONT_BODY, fg=C["text2"], bg=C["bg_alt"],
                 wraplength=340).pack(anchor="w", pady=(0, 4))
        styled_label(f, "Precio en USDC",
                     font=FONT_SMALL, fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w", pady=(8, 2))
        self.price_var = tk.StringVar()
        styled_entry(f, self.price_var, width=20).pack(anchor="w", pady=(0, 16))

        btn_row = styled_frame(f, C["bg_alt"])
        btn_row.pack(fill="x")
        styled_button(btn_row, "Cancelar", self.destroy,
                      color=C["surface"]).pack(side="left")
        styled_button(btn_row, "Publicar en Marketplace",
                      self._confirm, C["success"]).pack(side="right")

    def _confirm(self):
        try:
            price = float(self.price_var.get().strip())
            if price <= 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Error", "Introduce un precio válido.", parent=self)
            return
        self.result = price
        self.destroy()


# ─────────────────────────────────────────────────────────────────────────────
# PANTALLA LOGIN
# ─────────────────────────────────────────────────────────────────────────────
class LoginFrame(tk.Frame):
    def __init__(self, parent, on_success):
        super().__init__(parent, bg=C["bg"])
        self.on_success = on_success
        self._build()

    def _build(self):
        self.pack(fill="both", expand=True)
        center = styled_frame(self, C["bg"])
        center.place(relx=0.5, rely=0.5, anchor="center")

        if "axia_logo" in ICONS:
            tk.Label(center, image=ICONS["axia_logo"],
                     bg=C["bg"]).pack(pady=(0, 4))
        else:
            tk.Label(center, text="AXIA", font=(_SANS, 30, "bold"),
                     fg=C["primary"], bg=C["bg"]).pack(pady=(0, 4))
        tk.Label(center, text="Manufacturer Tool",
                 font=(_SANS, 12), fg=C["text2"], bg=C["bg"]).pack(pady=(0, 28))

        card = styled_frame(center, C["bg_alt"])
        card.configure(highlightthickness=1, highlightbackground=C["border"])
        card.pack(ipadx=32, ipady=24)

        styled_label(card, "Iniciar sesión", font=FONT_HEAD,
                     bg=C["bg_alt"]).pack(pady=(0, 18))

        styled_label(card, "Usuario o correo", font=FONT_SMALL,
                     fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w")
        self.id_var = tk.StringVar()
        styled_entry(card, self.id_var, 34).pack(pady=(2, 10))

        styled_label(card, "Contraseña", font=FONT_SMALL,
                     fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w")
        self.pw_var = tk.StringVar()
        styled_entry(card, self.pw_var, 34, show="•").pack(pady=(2, 4))

        self.status_label = tk.Label(card, text="", font=FONT_SMALL,
                                     fg=C["text2"], bg=C["bg_alt"])
        self.status_label.pack(pady=(0, 2))

        self.err_label = tk.Label(card, text="", font=FONT_SMALL,
                                  fg=C["error"], bg=C["bg_alt"])
        self.err_label.pack(pady=(0, 8))

        self.btn = styled_button(card, "Entrar", self._login, width=20)
        self.btn.pack(pady=(0, 4))

        tk.Label(card, text="Solo usuarios con rol FABRICANTE pueden acceder.",
                 font=FONT_SMALL, fg=C["muted"], bg=C["bg_alt"]).pack(pady=(8, 0))

        card.bind_all("<Return>", lambda e: self._login())

        self._retrying    = False
        self._retry_after = None

    def _login(self):
        ident = self.id_var.get().strip()
        pw    = self.pw_var.get()
        if not ident or not pw:
            self.err_label.config(text="Completa todos los campos.")
            return
        self._stop_retry()
        self.btn.config(state="disabled", text="Conectando…")
        self.err_label.config(text="")
        self.status_label.config(text="")
        self._try_login(ident, pw)

    def _try_login(self, ident, pw):
        self._retrying = True

        def do_login():
            try:
                api.login(ident, pw)
                self.after(0, self.on_success)
            except requests.HTTPError as e:
                # Error real de credenciales — mostrar en rojo y parar
                msg = "Credenciales incorrectas."
                try:
                    msg = e.response.json().get("detail", msg)
                except Exception:
                    pass
                self.after(0, lambda m=msg: self._set_error(m))
            except (requests.ConnectionError, requests.Timeout):
                # Servidor no disponible — reintentar silenciosamente
                self.after(0, self._schedule_retry_ui)
            except Exception as e:
                self.after(0, lambda msg=str(e): self._set_error(msg))

        threading.Thread(target=do_login, daemon=True).start()

    def _schedule_retry_ui(self):
        """Muestra el estado 'conectando' y reintenta en 4 segundos."""
        if not self._retrying:
            return
        self._animate_dots(0)

    def _animate_dots(self, tick):
        if not self._retrying:
            return
        dots = "." * (tick % 4)
        self.status_label.config(text=f"Servidor no disponible, reintentando{dots}")
        if tick % 16 == 0 and tick > 0:
            # Cada ~4 segundos (16 ticks × 250 ms) reintentar
            ident = self.id_var.get().strip()
            pw    = self.pw_var.get()
            self._try_login(ident, pw)
        else:
            self._retry_after = self.after(250, lambda: self._animate_dots(tick + 1))

    def _stop_retry(self):
        self._retrying = False
        if self._retry_after:
            self.after_cancel(self._retry_after)
            self._retry_after = None

    def _set_error(self, msg):
        self._stop_retry()
        self.status_label.config(text="")
        self.err_label.config(text=msg)
        self.btn.config(state="normal", text="Entrar")


# ─────────────────────────────────────────────────────────────────────────────
# PANTALLA PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────
class MainFrame(tk.Frame):
    def __init__(self, parent, on_logout):
        super().__init__(parent, bg=C["bg"])
        self.on_logout    = on_logout
        self._current_tab = None
        self._build()

    def _build(self):
        self.pack(fill="both", expand=True)

        # ── Cabecera ──────────────────────────────────────────────────────
        self.header = tk.Frame(self, bg=C["bg_alt"], height=52)
        self.header.pack(fill="x", side="top")
        self.header.pack_propagate(False)

        # Logo + título
        logo_frame = tk.Frame(self.header, bg=C["bg_alt"])
        logo_frame.pack(side="left", padx=(16, 0))
        if "axia_wordmark" in ICONS:
            tk.Label(logo_frame, image=ICONS["axia_wordmark"],
                     bg=C["bg_alt"]).pack(side="left", padx=(0, 8))
        else:
            tk.Label(logo_frame, text="AXIA", font=(_SANS, 15, "bold"),
                     fg=C["primary"], bg=C["bg_alt"]).pack(side="left")
        tk.Label(logo_frame, text="Manufacturer", font=(_SANS, 11),
                 fg=C["text2"], bg=C["bg_alt"]).pack(side="left")

        user_info = api.user or {}
        if user_info.get("username"):
            tk.Frame(self.header, bg=C["border"], width=1).pack(side="left", fill="y", padx=14, pady=10)
            tk.Label(self.header, text=user_info.get("username", ""),
                     font=FONT_BODY, fg=C["text"], bg=C["bg_alt"]
                     ).pack(side="left")

        # Chip de red
        api_host  = get_cfg("API_URL").replace("https://", "").replace("http://", "").split("/")[0]
        net_color = C["success"] if "onrender.com" in get_cfg("API_URL") else C["warning"]
        net_frame = tk.Frame(self.header, bg=C["bg_alt"])
        net_frame.pack(side="left", padx=14)
        tk.Label(net_frame, text="●", font=FONT_SMALL, fg=net_color, bg=C["bg_alt"]).pack(side="left")
        tk.Label(net_frame, text=f"  Amoy · {api_host}", font=FONT_SMALL,
                 fg=C["text2"], bg=C["bg_alt"]).pack(side="left")

        # Cerrar sesión (derecha)
        logout_kw = dict(image=ICONS["logout"]) if "logout" in ICONS else {}
        tk.Button(self.header, text=" Salir", compound="left",
                  font=FONT_SMALL, fg=C["error"], bg=C["bg_alt"],
                  activeforeground=C["error"], activebackground=C["surface"],
                  relief="flat", cursor="hand2", command=self.on_logout,
                  **logout_kw
                  ).pack(side="right", padx=16)

        # Chip de wallet
        self.wallet_container = tk.Frame(self.header, bg=C["bg_alt"])
        self.wallet_container.pack(side="right", padx=6)
        self._refresh_wallet_header()

        separator(self).pack(fill="x", side="top")

        # ── Cuerpo ────────────────────────────────────────────────────────
        body = tk.Frame(self, bg=C["bg"])
        body.pack(fill="both", expand=True)

        # Sidebar
        self.sidebar = tk.Frame(body, bg=C["bg_alt"], width=210)
        self.sidebar.pack(fill="y", side="left")
        self.sidebar.pack_propagate(False)
        separator(self.sidebar, C["border"]).pack(fill="x")

        self._nav_buttons = {}
        for key, label, icon_key in [
            ("mint",     "Mintear Reloj",  "mint"),
            ("stock",    "Mi Stock",       "stock"),
            ("settings", "Configuración",  "settings"),
        ]:
            img = ICONS.get(icon_key)
            btn = tk.Button(self.sidebar,
                            text=f"   {label}",
                            image=img, compound="left" if img else "none",
                            font=FONT_BODY, anchor="w",
                            fg=C["text"], bg=C["bg_alt"],
                            activeforeground=C["primary"],
                            activebackground=C["surface2"],
                            relief="flat", cursor="hand2",
                            command=lambda k=key: self.show_tab(k))
            btn.pack(fill="x", ipady=12)
            separator(self.sidebar, C["border"]).pack(fill="x")
            self._nav_buttons[key] = btn

        # Área de contenido
        self.content = tk.Frame(body, bg=C["bg"])
        self.content.pack(fill="both", expand=True, side="left")

        self._tabs = {
            "mint":     MintTab(self.content),
            "stock":    StockTab(self.content),
            "settings": SettingsTab(self.content),
        }
        self.show_tab("mint")

    # ── Tabs ──────────────────────────────────────────────────────────────
    def show_tab(self, key):
        if self._current_tab:
            self._tabs[self._current_tab].pack_forget()
            self._nav_buttons[self._current_tab].config(bg=C["bg_alt"], fg=C["text"])
        self._current_tab = key
        self._nav_buttons[key].config(bg=C["surface2"], fg=C["primary"])
        tab = self._tabs[key]
        tab.pack(fill="both", expand=True)
        if hasattr(tab, "on_show"):
            tab.on_show()

    # ── Wallet header ─────────────────────────────────────────────────────
    def _refresh_wallet_header(self):
        try:
            if not self.wallet_container.winfo_exists():
                return
        except Exception:
            return
        for w in self.wallet_container.winfo_children():
            w.destroy()

        addr     = derived_wallet_address()
        expected = (api.user or {}).get("wallet_address")

        if addr:
            short    = f"{addr[:6]}…{addr[-4:]}"
            mismatch = expected and addr.lower() != expected.lower()
            color    = C["warning"] if mismatch else C["success"]
            pill     = tk.Frame(self.wallet_container, bg=C["bg_alt"])
            pill.pack(side="left")
            if "wallet" in ICONS:
                tk.Label(pill, image=ICONS["wallet"], bg=C["bg_alt"]).pack(side="left", padx=(0, 4))
            tk.Label(pill, text="●", font=FONT_SMALL, fg=color,
                     bg=C["bg_alt"]).pack(side="left")
            tk.Label(pill, text=f" {short}", font=FONT_MONO,
                     fg=C["text"], bg=C["bg_alt"]).pack(side="left", padx=(2, 4))
            tk.Button(pill, text="Cambiar", font=FONT_SMALL,
                      fg=C["text2"], bg=C["bg_alt"],
                      activeforeground=C["primary"], activebackground=C["surface"],
                      relief="flat", cursor="hand2",
                      command=self._open_connect_dialog).pack(side="left")
            if mismatch:
                tk.Label(self.wallet_container, text="  ⚠ no coincide",
                         font=FONT_SMALL, fg=C["warning"],
                         bg=C["bg_alt"]).pack(side="left")
        else:
            tk.Label(self.wallet_container, text="Sin wallet",
                     font=FONT_SMALL, fg=C["warning"], bg=C["bg_alt"]
                     ).pack(side="left", padx=(0, 6))
            styled_button(self.wallet_container, "Conectar wallet",
                          self._open_connect_dialog,
                          color=C["primary"]).pack(side="left")

    def _open_connect_dialog(self):
        expected = (api.user or {}).get("wallet_address")
        dlg = ConnectWalletDialog(self, expected_address=expected)
        self.wait_window(dlg)
        bc._nft = bc._market = bc._w3 = None
        self._refresh_wallet_header()
        cur = self._tabs.get(self._current_tab)
        if cur and hasattr(cur, "on_show"):
            cur.on_show()


# ─────────────────────────────────────────────────────────────────────────────
# TAB: MINTEAR
# ─────────────────────────────────────────────────────────────────────────────
class MintTab(tk.Frame):
    def __init__(self, parent):
        super().__init__(parent, bg=C["bg"])
        self.img_path  = ""
        self.uid_var   = tk.StringVar(value="—")
        self.uid_status= tk.StringVar(value="")
        self._build()

    def _build(self):
        outer, inner = scrollable(self)
        outer.pack(fill="both", expand=True)

        # Título
        tk.Label(inner, text="Mintear Nuevo Reloj",
                 font=FONT_TITLE, fg=C["text"], bg=C["bg"]).pack(anchor="w", padx=28, pady=(22, 2))
        tk.Label(inner, text="Registro del gemelo digital en blockchain",
                 font=FONT_BODY, fg=C["text2"], bg=C["bg"]).pack(anchor="w", padx=28)
        separator(inner).pack(fill="x", padx=28, pady=14)

        # 1 · NFC
        section_label(inner, "1 · Chip NFC")
        nfc_card = card_frame(inner)
        row = tk.Frame(nfc_card, bg=C["surface"])
        row.pack(fill="x", pady=(0, 8))
        tk.Label(row, text="UID detectado:", font=FONT_BODY,
                 fg=C["text2"], bg=C["surface"]).pack(side="left")
        self.uid_label = tk.Label(row, textvariable=self.uid_var,
                                  font=FONT_MONO, fg=C["primary"], bg=C["surface"])
        self.uid_label.pack(side="left", padx=8)
        tk.Label(row, textvariable=self.uid_status,
                 font=FONT_SMALL, fg=C["muted"], bg=C["surface"]).pack(side="left")

        btn_row = tk.Frame(nfc_card, bg=C["surface"])
        btn_row.pack(fill="x")
        styled_button(btn_row, "● Leer UID", self._read_nfc,
                      color=C["surface2"]).pack(side="left", padx=(0, 8))
        styled_button(btn_row, "Verificar estado", self._verify_nfc,
                      color=C["surface2"]).pack(side="left")

        if not NFC_AVAILABLE:
            tk.Label(nfc_card, text="⚠  pyscard no instalado — introduce el UID manualmente",
                     font=FONT_SMALL, fg=C["warning"], bg=C["surface"]).pack(anchor="w", pady=(8, 0))
            styled_entry(nfc_card, self.uid_var, 36).pack(fill="x", pady=(4, 0))

        # 2 · Datos
        section_label(inner, "2 · Datos del Reloj")
        form_card = card_frame(inner)
        self._entries = {}
        for label, key, _ in [
            ("Marca",         "brand",  ""),
            ("Modelo",        "model",  ""),
            ("Nº de Serie",   "serial", ""),
            ("Año de fabric.","year",   ""),
        ]:
            r = tk.Frame(form_card, bg=C["surface"])
            r.pack(fill="x", pady=3)
            tk.Label(r, text=label, font=FONT_BODY, fg=C["text2"],
                     bg=C["surface"], width=16, anchor="w").pack(side="left")
            var = tk.StringVar()
            styled_entry(r, var, 32).pack(side="left", fill="x", expand=True)
            self._entries[key] = var

        # 3 · Destinatario
        section_label(inner, "3 · Destinatario (opcional)")
        dest_card = card_frame(inner)
        tk.Label(dest_card, text="Wallet del propietario inicial  (vacío = tu propio stock)",
                 font=FONT_SMALL, fg=C["text2"], bg=C["surface"]).pack(anchor="w", pady=(0, 4))
        self.dest_var = tk.StringVar()
        styled_entry(dest_card, self.dest_var, 52).pack(fill="x")

        # 4 · Imagen
        section_label(inner, "4 · Imagen del Reloj")
        img_card = card_frame(inner)
        img_row  = tk.Frame(img_card, bg=C["surface"])
        img_row.pack(fill="x")
        styled_button(img_row, "Seleccionar imagen", self._select_image,
                      color=C["surface2"]).pack(side="left")
        self.img_name_label = tk.Label(img_row, text="(ninguna)",
                                       font=FONT_SMALL, fg=C["muted"], bg=C["surface"])
        self.img_name_label.pack(side="left", padx=12)
        if PIL_AVAILABLE:
            self.img_preview = tk.Label(img_card, bg=C["surface"])
            self.img_preview.pack(pady=(8, 0))

        # Botón Mint
        separator(inner).pack(fill="x", padx=28, pady=14)
        self.mint_btn = tk.Button(inner, text="⬡  MINTEAR RELOJ EN BLOCKCHAIN",
                                  command=self._start_mint,
                                  font=("Segoe UI", 12, "bold"),
                                  fg="#ffffff", bg=C["primary"],
                                  activeforeground="#ffffff",
                                  activebackground=C["primary_h"],
                                  relief="flat", cursor="hand2")
        self.mint_btn.pack(fill="x", padx=28, pady=(0, 8), ipady=12)

        self.log_var   = tk.StringVar(value="")
        self.log_label = tk.Label(inner, textvariable=self.log_var,
                                  font=FONT_SMALL, fg=C["text2"], bg=C["bg"],
                                  wraplength=680, justify="left")
        self.log_label.pack(anchor="w", padx=28, pady=(0, 28))

    # ── NFC ───────────────────────────────────────────────────────────────
    def _read_nfc(self):
        if not NFC_AVAILABLE:
            self.uid_status.set("pyscard no disponible")
            return
        try:
            uid = read_nfc_uid()
            self.uid_var.set(uid)
            self.uid_status.set("")
            self.uid_label.config(fg=C["success"])
        except Exception as e:
            self.uid_var.set("Error")
            self.uid_status.set(str(e))
            self.uid_label.config(fg=C["error"])

    def _verify_nfc(self):
        uid = self.uid_var.get().strip()
        if uid in ("—", "Error", ""):
            messagebox.showwarning("Aviso", "Lee primero el UID del chip.")
            return
        if not WEB3_AVAILABLE:
            messagebox.showwarning("Aviso", "web3.py no está instalado.")
            return
        try:
            registered, token_id = bc.get_nfc_status(uid)
            if registered:
                messagebox.showinfo("Estado NFC",
                    f"UID: {uid}\n\n⚠  Chip ya registrado\nToken ID: #{token_id}")
            else:
                messagebox.showinfo("Estado NFC",
                    f"UID: {uid}\n\n✓  Chip libre — puede vincularse a un nuevo reloj.")
        except Exception as e:
            messagebox.showerror("Error blockchain", str(e))

    # ── Imagen ────────────────────────────────────────────────────────────
    def _select_image(self):
        path = filedialog.askopenfilename(
            filetypes=[("Imágenes", "*.jpg *.jpeg *.png *.webp"), ("Todos", "*.*")])
        if path:
            self.img_path = path
            self.img_name_label.config(text=os.path.basename(path), fg=C["success"])
            if PIL_AVAILABLE:
                try:
                    img = Image.open(path)
                    img.thumbnail((160, 160))
                    photo = ImageTk.PhotoImage(img)
                    self.img_preview.config(image=photo)
                    self.img_preview.image = photo
                except Exception:
                    pass

    # ── Mint ──────────────────────────────────────────────────────────────
    def _start_mint(self):
        uid   = self.uid_var.get().strip()
        brand = self._entries["brand"].get().strip()
        model = self._entries["model"].get().strip()
        serial= self._entries["serial"].get().strip()
        year  = self._entries["year"].get().strip()
        dest  = self.dest_var.get().strip()

        if not all([uid, brand, model, serial, year]):
            messagebox.showwarning("Faltan datos", "Completa todos los campos del formulario.")
            return
        if not self.img_path:
            messagebox.showwarning("Sin imagen", "Selecciona una imagen para el reloj.")
            return
        if uid in ("—", "Error"):
            messagebox.showwarning("Sin UID", "Lee el UID del chip NFC primero.")
            return

        sender = bc.wallet_address
        if not sender:
            messagebox.showerror("Wallet no conectada",
                "Conecta tu wallet desde la cabecera de la aplicación.")
            return

        recipient = dest if (dest and dest.startswith("0x") and len(dest) == 42) else sender

        self.mint_btn.config(state="disabled", text="Procesando…")
        self._log("Comprobando saldo…", C["text2"])

        threading.Thread(
            target=self._mint_worker,
            args=(uid, brand, model, serial, year, recipient),
            daemon=True
        ).start()

    def _mint_worker(self, uid, brand, model, serial, year, recipient):
        try:
            if not WEB3_AVAILABLE:
                raise RuntimeError("web3.py no está instalado.")

            # 0a. Comprobar saldo POL para el gas
            self._log("Comprobando saldo…", C["text2"])
            sender = bc.wallet_address
            balance_wei = bc.w3.eth.get_balance(bc.w3.to_checksum_address(sender))
            balance_pol = balance_wei / 10 ** 18
            if balance_pol < 0.01:
                self._log(
                    f"✗  Saldo insuficiente: {balance_pol:.4f} POL.\n"
                    f"   Necesitas al menos 0.01 POL para cubrir el gas del minteo.\n"
                    f"   Consigue POL gratis en faucet.polygon.technology",
                    C["error"]
                )
                return
            self._log(f"Saldo: {balance_pol:.4f} POL  ✓", C["success"])

            # 0b. Comprobar que el UID no está ya registrado en la blockchain
            self._log("Verificando UID en blockchain…", C["text2"])
            registered, existing_token = bc.get_nfc_status(uid)
            if registered:
                self._log(
                    f"✗  UID ya registrado — Token #{existing_token}\n"
                    f"   Este chip NFC ya está vinculado a un reloj existente.",
                    C["error"]
                )
                return

            # 1. Subir imagen a Pinata
            self._log("Subiendo imagen a IPFS…", C["text2"])
            img_cid = upload_image_pinata(self.img_path)
            img_url = f"ipfs://{img_cid}"
            self._log("Imagen subida. Generando metadata…", C["text2"])

            # 2. Subir metadata JSON
            from datetime import datetime as _dt, timezone as _tz
            mint_iso = _dt.now(_tz.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            metadata = {
                "name":        f"AXIA: {brand} {model}",
                "description": f"Autenticidad AXIA. Serial: {serial}",
                "image":       img_url,
                "attributes":  [
                    {"trait_type": "Brand",              "value": brand},
                    {"trait_type": "Model",              "value": model},
                    {"trait_type": "Serial",             "value": serial},
                    {"trait_type": "Year",               "value": int(year)},
                    {"trait_type": "Fecha de Fabr.",     "value": mint_iso},
                    {"trait_type": "Ultima Verificacion","value": mint_iso},
                ],
            }
            meta_cid  = upload_json_pinata(metadata, f"axia_{uid.replace(':','')}.json")
            token_uri = f"ipfs://{meta_cid}"
            self._log("Metadata lista. Firmando transacción blockchain…", C["text2"])

            # 3. Mint en blockchain
            tx_hash, token_id = bc.mint_watch(
                brand, model, serial, int(year), uid, token_uri, recipient
            )
            hash_uid = "0x" + bc.w3.keccak(text=uid).hex()
            self._log(f"Minteado — Token #{token_id}. Registrando en AXIA…", C["success"])

            # 4. Registrar en el backend
            api.register_minted({
                "token_id":      int(token_id),
                "brand":         brand,
                "model":         model,
                "serial_number": serial,
                "year":          int(year),
                "image_url":     img_url,
                "token_uri":     token_uri,
                "owner_wallet":  recipient,
                "hash_uid":      hash_uid,
                "mint_date":     mint_iso,
            })

            self._log(f"✓  Registrado en AXIA. Programando chip NFC…", C["success"])

            # 5. Escribir URL SDM en el chip (con placeholders picc/cmac)
            if NFC_AVAILABLE:
                try:
                    write_ndef_url(int(token_id))
                    self._log(f"✓  NDEF escrito — URL SDM: {get_cfg('API_URL')}/nfc/{token_id}?picc=…&cmac=…", C["success"])
                except Exception as e_nfc:
                    self._log(f"⚠  NDEF: {e_nfc}\n   El reloj está minteado. Puedes programar la tarjeta manualmente.", C["warning"])

            # 6. Configurar SDM y bloquear escritura (ChangeFileSettings + ChangeKey)
            if NFC_AVAILABLE:
                try:
                    setup_nfc_chip(int(token_id))
                    self._log(f"✓  SDM configurado — cada escaneo genera URL única e irrepetible.", C["success"])
                    # Enviar la clave SDM derivada al backend para almacenarla
                    try:
                        sdm_key_hex = _derive_nfc_key().hex()  # keccak256(PK)[:16]
                        api.sdm_setup(int(token_id), sdm_key_hex)
                        self._log(f"✓  Clave SDM registrada en AXIA.", C["success"])
                    except Exception as e_sdm_api:
                        self._log(f"⚠  sdm-setup API: {e_sdm_api}\n   El chip está configurado. El backend puede no verificar escaneos hasta que se corrija.", C["warning"])
                except Exception as e_setup:
                    self._log(f"⚠  Setup NFC: {e_setup}\n   La URL está escrita. La configuración SDM puede hacerse después.", C["warning"])

            self._log(
                f"✓  Reloj registrado con éxito.\n"
                f"   Token ID: #{token_id}\n"
                f"   TX Hash:  {tx_hash[:20]}…\n"
                f"   Propietario: {recipient[:12]}…",
                C["success"]
            )
            self.after(0, self._reset_form)

        except Exception as e:
            self._log(f"✗  Error: {e}", C["error"])
        finally:
            self.after(0, lambda: self.mint_btn.config(
                state="normal", text="⬡  MINTEAR RELOJ EN BLOCKCHAIN"))

    def _log(self, msg, color=None):
        self.after(0, lambda: (
            self.log_var.set(msg),
            self.log_label.config(fg=color or C["text2"])
        ))

    def _reset_form(self):
        for v in self._entries.values():
            v.set("")
        self.uid_var.set("—")
        self.dest_var.set("")
        self.img_path = ""
        self.img_name_label.config(text="(ninguna)", fg=C["muted"])
        if PIL_AVAILABLE and hasattr(self, "img_preview"):
            self.img_preview.config(image="")


# ─────────────────────────────────────────────────────────────────────────────
# TAB: MI STOCK
# ─────────────────────────────────────────────────────────────────────────────
class StockTab(tk.Frame):
    def __init__(self, parent):
        super().__init__(parent, bg=C["bg"])
        self._build()

    def on_show(self):
        self._load()

    def _build(self):
        top = tk.Frame(self, bg=C["bg"])
        top.pack(fill="x", padx=24, pady=(18, 8))
        tk.Label(top, text="Mi Stock de Relojes",
                 font=FONT_TITLE, fg=C["text"], bg=C["bg"]).pack(side="left")
        styled_button(top, "↻ Actualizar", self._load,
                      color=C["surface2"]).pack(side="right")
        separator(self).pack(fill="x", padx=24)

        self.status_label = tk.Label(self, text="",
                                     font=FONT_BODY, fg=C["text2"], bg=C["bg"])
        self.status_label.pack(pady=4)

        outer, self.list_frame = scrollable(self)
        outer.pack(fill="both", expand=True)

    def _load(self):
        self.status_label.config(text="Cargando stock…", fg=C["text2"])
        for w in self.list_frame.winfo_children():
            w.destroy()
        threading.Thread(target=self._fetch, daemon=True).start()

    def _fetch(self):
        try:
            watches = api.get_stock()
            self.after(0, lambda: self._render(watches))
        except Exception as e:
            self.after(0, lambda msg=str(e): self.status_label.config(
                text=f"Error: {msg}", fg=C["error"]))

    def _render(self, watches):
        self.status_label.config(text="")
        for w in self.list_frame.winfo_children():
            w.destroy()
        if not watches:
            tk.Label(self.list_frame, text="No hay relojes en tu stock.",
                     font=FONT_BODY, fg=C["text2"], bg=C["bg"]).pack(pady=48)
            return
        for item in watches:
            self._watch_row(self.list_frame, item.get("watch", item))

    def _watch_row(self, parent, w):
        row = tk.Frame(parent, bg=C["bg_alt"],
                       highlightthickness=1, highlightbackground=C["border"])
        row.pack(fill="x", padx=20, pady=4, ipadx=14, ipady=10)

        info = tk.Frame(row, bg=C["bg_alt"])
        info.pack(side="left", fill="x", expand=True)

        token_id = w.get("token_id") or w.get("id", "?")
        brand    = w.get("brand", "")
        model    = w.get("model", "")
        serial   = w.get("serial_number", "")
        listed   = w.get("is_listed", False)

        tk.Label(info, text=f"{brand} {model}",
                 font=FONT_SUBHEAD, fg=C["text"], bg=C["bg_alt"]).pack(anchor="w")
        tk.Label(info, text=f"Token #{token_id}  ·  S/N: {serial}",
                 font=FONT_SMALL, fg=C["text2"], bg=C["bg_alt"]).pack(anchor="w")
        tk.Label(info, text="En venta" if listed else "En stock",
                 font=FONT_SMALL,
                 fg=C["warning"] if listed else C["success"],
                 bg=C["bg_alt"]).pack(anchor="w")

        actions = tk.Frame(row, bg=C["bg_alt"])
        actions.pack(side="right")
        if not listed:
            styled_button(actions, "Poner a la venta",
                          lambda tid=token_id, b=brand, m=model:
                              self._list_for_sale(tid, b, m),
                          color=C["success"]).pack(side="right", padx=(4, 0))
        styled_button(actions, "Asignar",
                      lambda tid=token_id, b=brand, m=model:
                          self._assign(tid, b, m),
                      color=C["surface2"]).pack(side="right", padx=(4, 0))

    def _assign(self, token_id, brand, model):
        if not bc.wallet_address:
            messagebox.showerror("Wallet no conectada", "Conecta tu wallet primero.")
            return
        dlg = AssignDialog(self, token_id, brand, model)
        self.wait_window(dlg)
        if not dlg.result:
            return
        self._run_in_thread(
            f"Asignando #{token_id}…",
            lambda: self._do_assign(token_id, dlg.result)
        )

    def _do_assign(self, token_id, new_owner):
        user = api.get_user_by_wallet(new_owner)
        if user and "RELOJERO" in (user.get("roles") or []):
            self.after(0, lambda: messagebox.showerror(
                "Destinatario no válido",
                f"La wallet {new_owner[:10]}… pertenece a un Relojero.\n\n"
                "Los relojeros no pueden recibir relojes como propietarios en AXIA.\n"
                "Elige otro destinatario."
            ))
            return
        if not user:
            self.after(0, lambda: messagebox.showerror(
                "Destinatario no registrado",
                f"La wallet {new_owner[:10]}…{new_owner[-6:]} no está registrada en AXIA.\n\n"
                "El destinatario debe crear una cuenta en la app AXIA y vincular\n"
                "esta wallet antes de poder recibir el reloj.\n\n"
                "La transacción blockchain NO se ha ejecutado."
            ))
            return
        tx_hash = bc.transfer_nft(token_id, new_owner)
        api.transfer_watch(token_id, new_owner, tx_hash)
        self.after(0, lambda: (
            messagebox.showinfo("Éxito", f"Reloj #{token_id} asignado.\nTX: {tx_hash[:22]}…"),
            self._load()
        ))

    def _list_for_sale(self, token_id, brand, model):
        if not bc.wallet_address:
            messagebox.showerror("Wallet no conectada", "Conecta tu wallet primero.")
            return
        dlg = ListForSaleDialog(self, token_id, brand, model)
        self.wait_window(dlg)
        if not dlg.result:
            return
        self._run_in_thread(
            f"Publicando #{token_id}…",
            lambda: self._do_list(token_id, dlg.result)
        )

    def _do_list(self, token_id, price):
        bc.approve_marketplace(token_id)
        tx_hash = bc.list_watch(token_id, price)
        api.list_for_sale(token_id, tx_hash, price)
        self.after(0, lambda: (
            messagebox.showinfo("Éxito",
                f"Reloj #{token_id} publicado a {price} USDC.\nTX: {tx_hash[:22]}…"),
            self._load()
        ))

    def _run_in_thread(self, msg, fn):
        self.status_label.config(text=msg, fg=C["text2"])
        def worker():
            try:
                fn()
            except Exception as e:
                self.after(0, lambda msg=str(e): messagebox.showerror("Error", msg))
            finally:
                self.after(0, lambda: self.status_label.config(text=""))
        threading.Thread(target=worker, daemon=True).start()


# ─────────────────────────────────────────────────────────────────────────────
# TAB: CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
class SettingsTab(tk.Frame):
    def __init__(self, parent):
        super().__init__(parent, bg=C["bg"])
        self._entries = {}
        self._build()

    def on_show(self):
        self._refresh_wallet_status()

    def _build(self):
        outer, inner = scrollable(self)
        outer.pack(fill="both", expand=True)

        tk.Label(inner, text="Configuración",
                 font=FONT_TITLE, fg=C["text"], bg=C["bg"]).pack(anchor="w", padx=28, pady=(22, 2))
        tk.Label(inner, text="Necesitas tu private key y las claves de Pinata para mintear.",
                 font=FONT_BODY, fg=C["text2"], bg=C["bg"]).pack(anchor="w", padx=28)
        separator(inner).pack(fill="x", padx=28, pady=12)

        # Wallet
        section_label(inner, "Wallet del fabricante")
        wallet_card = card_frame(inner)
        self.wallet_status_var = tk.StringVar()
        self._wallet_lbl = tk.Label(wallet_card, textvariable=self.wallet_status_var,
                                    font=FONT_MONO, fg=C["text"], bg=C["surface"])
        self._wallet_lbl.pack(anchor="w")
        tk.Label(wallet_card,
                 text="Se deriva automáticamente de tu PRIVATE_KEY.\n"
                      "Debe coincidir con la wallet que vinculaste en la web/app AXIA.",
                 font=FONT_SMALL, fg=C["muted"], bg=C["surface"],
                 wraplength=600, justify="left").pack(anchor="w", pady=(6, 0))

        # Grupos de configuración
        groups = [
            ("Credenciales", [
                ("PRIVATE_KEY",       "Clave privada",      "0xTuClavePrivada",    True),
            ]),
            ("Pinata IPFS", [
                ("PINATA_API_KEY",    "API Key",            "",                    False),
                ("PINATA_SECRET_KEY", "Secret Key",         "",                    True),
            ]),
            ("Red y contratos (opcional)", [
                ("API_URL",             "URL del backend",   DEFAULTS["API_URL"],   False),
                ("RPC_URL",             "RPC URL",           DEFAULTS["RPC_URL"],   False),
                ("WATCH_NFT_ADDRESS",   "Dirección WatchNFT",DEFAULTS["WATCH_NFT_ADDRESS"], False),
                ("MARKETPLACE_ADDRESS", "Marketplace",       DEFAULTS["MARKETPLACE_ADDRESS"], False),
                ("USDC_ADDRESS",        "MockUSDC / USDC",   DEFAULTS["USDC_ADDRESS"], False),
            ]),
        ]

        for group_title, fields in groups:
            section_label(inner, group_title)
            grp_card = card_frame(inner)
            for env_key, label, placeholder, secret in fields:
                row = tk.Frame(grp_card, bg=C["surface"])
                row.pack(fill="x", pady=4)
                tk.Label(row, text=label, font=FONT_SMALL, fg=C["text2"],
                         bg=C["surface"], width=24, anchor="w").pack(side="left")
                current = os.getenv(env_key, "") or (placeholder if env_key in DEFAULTS else "")
                var = tk.StringVar(value=current)
                e   = styled_entry(row, var, 44)
                if secret:
                    e.config(show="•")
                e.pack(side="left", fill="x", expand=True)
                self._entries[env_key] = var

        separator(inner).pack(fill="x", padx=28, pady=14)
        self.save_status = tk.StringVar(value="")
        styled_button(inner, "Guardar configuración", self._save,
                      C["primary"]).pack(anchor="w", padx=28, pady=(0, 6))
        tk.Label(inner, textvariable=self.save_status, font=FONT_SMALL,
                 fg=C["success"], bg=C["bg"]).pack(anchor="w", padx=28, pady=(0, 28))

        self._refresh_wallet_status()

    def _refresh_wallet_status(self):
        addr = derived_wallet_address()
        if addr:
            self.wallet_status_var.set(f"●  {addr}")
            self._wallet_lbl.config(fg=C["success"])
        else:
            self.wallet_status_var.set("⚠  Sin wallet (introduce tu private key abajo)")
            self._wallet_lbl.config(fg=C["warning"])

    def _save(self):
        for key, var in self._entries.items():
            val = var.get().strip()
            if val:
                save_cfg(key, val)
        bc._nft = bc._market = bc._w3 = None
        self._refresh_wallet_status()
        self.save_status.set("✓  Guardado")
        self.after(3000, lambda: self.save_status.set(""))
        app = self.winfo_toplevel()
        if hasattr(app, "_refresh_wallet_header"):
            app._refresh_wallet_header()


# ─────────────────────────────────────────────────────────────────────────────
# APP PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────
class AxiaMfgApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("AXIA · Manufacturer Tool")
        self.geometry("1080x720")
        self.minsize(860, 560)
        self.configure(bg=C["bg"])
        _apply_scrollbar_style(self)

        ico = BASE_DIR / "axia.ico"
        if ico.exists():
            try:
                self.iconbitmap(str(ico))
            except Exception:
                pass

        _load_icons()
        self._current_frame = None
        self.show_login()

    def show_login(self):
        self._clear()
        self._current_frame = LoginFrame(self, self.show_main)

    def show_main(self):
        self._clear()
        self._current_frame = MainFrame(self, self.show_login)

    def _clear(self):
        for w in self.winfo_children():
            w.destroy()


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = AxiaMfgApp()
    app.mainloop()
