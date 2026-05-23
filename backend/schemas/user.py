from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List


# -----------------------------------------------------------------------
# Aquí se definen los objetos de comunicación entre el cliente y servidor.
# Estos objetos son necesarios siempre que se necesite leer o guardar datos
# permanentes en el servidor.
# -----------------------------------------------------------------------

# [CLIENTE] => objeto que le envía el cliente al servidor
# [SERVIDOR] => objeto que le envía el servidor al cliente


# REGISTRO [CLIENTE]
class UserCreate(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str

    @field_validator('password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('La contraseña debe tener al menos 8 caracteres')
        return v

# REGISTRO [SERVIDOR]
class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: str
    is_active: bool
    is_admin: bool
    roles: List[str]
    requested_role: Optional[str] = None
    request_message: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime
    wallet_address: Optional[str] = None

    class Config:
        from_attributes = True

# INICIO SESIÓN [CLIENTE]
class UserLogin(BaseModel):
    identifier: str  
    password: str

# INICIO SESIÓN [SERVIDOR]
class LoginSuccess(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse 

# IMPORTAR WALLET DE METAMASK [CLIENTE]
class AuthChallenge(BaseModel):
    address: str

# IMPORTAR WALLET DE METAMASK [SERVIDOR]
class AuthVerify(BaseModel):
    address: str
    signature: str
    nonce: str
    
# PEDIR ROL [CLIENTE]
class RoleRequest(BaseModel):
    role: str       
    message: str 

# LISTAR RELOJ EN EL MARKETPLACE [CLIENTE]
class ListWatchRequest(BaseModel):
    price_usdc: float
    tx_hash: str

    @field_validator('price_usdc')
    @classmethod
    def price_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('El precio debe ser mayor que 0')
        return v

# ACTUALIZAR PRECIO DE RELOJ LISTADO [CLIENTE]
class UpdatePriceRequest(BaseModel):
    new_price_usdc: float
    tx_hash: str

    @field_validator('new_price_usdc')
    @classmethod
    def price_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('El precio debe ser mayor que 0')
        return v

# CANCELAR ANUNCIO [CIENTE]
class CancelListingRequest(BaseModel):
    tx_hash: str

# HACER PÚBLICO UN RELOJ [CLIENTE]
class TogglePublicRequest(BaseModel):
    is_public: bool

# RECIBIR UNA NUEVA CONTRASEÑA[SERVIDOR]
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# CAMBIO DE ESTADO DE SEGURIDAD [SERVIDOR]
class SecurityStateUpdate(BaseModel):
    state: int
    tx_hash: str = None

# SOLICITUD TRANSFERENCIA NFT [FRONTEND -> BACKEND]
class TransferRequest(BaseModel):
    new_owner: str
    tx_hash: str

# USUARIOS REGISTRADOS EN EL SISTEMA [BACKEND -> FRONTEND]
class UserPublic(BaseModel):
    id: int
    username: str
    wallet_address: Optional[str] = None
    is_admin: bool = False
    roles: List[str] = [] 

    class Config:
        from_attributes = True

# ESTRUCTURA BASE DE NOTIFICACIONES (CAMPOS COMUNES)
class NotificationBase(BaseModel):
    title: str
    message: str
    type: str  # PENDING, APPROVED, REJECTED, INFO

# NOTIFICACIONES DEL SISTEMA [BACKEND -> FRONTEND]
class Notification(NotificationBase):
    id: int
    user_id: int
    watch_id: Optional[int] = None
    reference_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

from pydantic import BaseModel
from typing import Literal

# NOTIFICACIONES DEL SISTEMA [METAMASK -> BACKEND]
class BalanceNotificationRequest(BaseModel):
    amount: str
    from_address: str
    tx_type: Literal["RECEIVED", "SENT"]

# REGISTRO DE RELOJ MINTEADO DESDE LA HERRAMIENTA DEL FABRICANTE [CLIENTE -> BACKEND]
class MintRegisterRequest(BaseModel):
    token_id: int
    brand: str
    model: str
    serial_number: str
    year: int
    image_url: str
    token_uri: str
    owner_wallet: str
    hash_uid: str
    mint_date: Optional[str] = None