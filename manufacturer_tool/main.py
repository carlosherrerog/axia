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
import platform
import threading
import requests
from pathlib import Path
from dotenv import load_dotenv, set_key
from tkinter import filedialog, messagebox

# --- Paths (compatibles con PyInstaller) ---------------------------------
if getattr(sys, "frozen", False):
    BASE_DIR   = Path(sys.executable).parent
    BUNDLE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR   = Path(__file__).parent
    BUNDLE_DIR = BASE_DIR

ABI_DIR  = BUNDLE_DIR / "abi"
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
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

import customtkinter as ctk
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# ─────────────────────────────────────────────────────────────────────────────
# PALETA AXIA
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
    _SANS, _MONO = "Segoe UI",      "Consolas"
elif _OS == "Darwin":
    _SANS, _MONO = "Helvetica Neue","Menlo"
else:
    _SANS, _MONO = "DejaVu Sans",   "DejaVu Sans Mono"

def _font(size, weight="normal", mono=False):
    family = _MONO if mono else _SANS
    return (family, size, weight) if weight != "normal" else (family, size)

FONT_TITLE   = _font(20, "bold")
FONT_HEAD    = _font(13, "bold")
FONT_SUBHEAD = _font(11, "bold")
FONT_BODY    = _font(10)
FONT_SMALL   = _font(9)
FONT_MONO    = _font(9, mono=True)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
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
        try:
            return self._request("get", f"/users/by-wallet/{address}").json()
        except Exception:
            return None

    def transfer_watch(self, token_id: int, new_owner: str, tx_hash: str):
        return self._request("post", f"/nfts/{token_id}/transfer",
                             json={"new_owner": new_owner, "tx_hash": tx_hash}).json()


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
        signed  = self.w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status != 1:
            raise RuntimeError("Transacción revertida en la blockchain.")
        return tx_hash.hex(), receipt

    def get_nfc_status(self, uid_str: str):
        hash_uid = self.w3.keccak(text=uid_str)
        try:
            token_id = self.nft.functions.getTokenByNFC(hash_uid).call()
            return (False, 0) if token_id == 0 else (True, token_id)
        except Exception:
            return False, 0

    def mint_watch(self, brand, model, serial, year, uid_str, token_uri, recipient):
        sender, pk   = self._credentials()
        hash_uid     = self.w3.keccak(text=uid_str)
        recipient_cs = self.w3.to_checksum_address(recipient)
        fn = self.nft.functions.mintWatch(
            brand, model, serial, int(year), hash_uid, token_uri, recipient_cs
        )
        opts = self._tx_opts(sender)
        opts["gas"] = int(fn.estimate_gas({"from": sender}) * 1.3)
        tx_hash, receipt = self._sign_and_send(fn.build_transaction(opts), pk)
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


# ─────────────────────────────────────────────────────────────────────────────
# ICONOS (CTkImage)
# ─────────────────────────────────────────────────────────────────────────────
ICONS = {}

def _load_icons():
    global ICONS
    if not PIL_AVAILABLE:
        return
    icons_dir = BUNDLE_DIR / "icons"
    sizes = {
        "logo": 32, "logo_big": 48,
        "mint": 20, "stock": 20, "settings": 20, "wallet": 20, "logout": 20,
    }
    for name, sz in sizes.items():
        fname = "logo" if name == "logo_big" else name
        path  = icons_dir / f"{fname}.png"
        if path.exists():
            try:
                img = Image.open(path).resize((sz, sz), Image.LANCZOS).convert("RGBA")
                ICONS[name] = ctk.CTkImage(light_image=img, dark_image=img, size=(sz, sz))
            except Exception as e:
                print(f"Icon load error ({name}): {e}")
        else:
            # buscar cualquier PNG en la carpeta con ese nombre
            for ext in (".png", ".PNG"):
                alt = icons_dir / f"{fname}{ext}"
                if alt.exists():
                    try:
                        img = Image.open(alt).resize((sz, sz), Image.LANCZOS).convert("RGBA")
                        ICONS[name] = ctk.CTkImage(light_image=img, dark_image=img, size=(sz, sz))
                    except Exception:
                        pass
                    break


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE WIDGETS
# ─────────────────────────────────────────────────────────────────────────────
def separator(parent):
    return ctk.CTkFrame(parent, height=1, fg_color=C["border"], corner_radius=0)

def section_label(parent, text, padx=24):
    lbl = ctk.CTkLabel(parent, text=text, font=FONT_SUBHEAD,
                       text_color=C["primary_h"], fg_color="transparent")
    lbl.pack(anchor="w", padx=padx, pady=(14, 3))
    return lbl

def card(parent, padx=24, pady=4, corner_radius=8):
    f = ctk.CTkFrame(parent, fg_color=C["surface"],
                     border_color=C["border"], border_width=1,
                     corner_radius=corner_radius)
    f.pack(fill="x", padx=padx, pady=pady, ipadx=14, ipady=12)
    return f

def lbl(parent, text, font=None, color=None, bg="transparent", **kw):
    return ctk.CTkLabel(parent, text=text,
                        font=font or FONT_BODY,
                        text_color=color or C["text"],
                        fg_color=bg, **kw)

def entry(parent, textvariable=None, width=300, show="", placeholder=""):
    return ctk.CTkEntry(parent,
                        textvariable=textvariable,
                        width=width,
                        fg_color=C["surface"],
                        border_color=C["border"],
                        text_color=C["text"],
                        font=FONT_BODY,
                        show=show,
                        placeholder_text=placeholder)

def btn(parent, text, command, color=None, hover=None, fg="#ffffff",
        width=120, height=34, corner_radius=6, icon=None, anchor="center", font=None):
    kw = dict(
        text=text, command=command,
        fg_color=color or C["primary"],
        hover_color=hover or C["primary_h"],
        text_color=fg,
        font=font or FONT_BODY,
        width=width, height=height,
        corner_radius=corner_radius,
        cursor="hand2",
    )
    if icon:
        kw["image"]    = icon
        kw["compound"] = "left"
        kw["anchor"]   = anchor
    return ctk.CTkButton(parent, **kw)


# ─────────────────────────────────────────────────────────────────────────────
# DIÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────
class ConnectWalletDialog(ctk.CTkToplevel):
    def __init__(self, parent, expected_address=None):
        super().__init__(parent)
        self.result           = None
        self.expected_address = (expected_address or "").lower()

        self.title("Conectar Wallet")
        self.geometry("540x400")
        self.configure(fg_color=C["bg_alt"])
        self.resizable(False, False)
        self.grab_set()
        self.lift()

        f = ctk.CTkFrame(self, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=28, pady=24)

        lbl(f, "⬡  Vincular Wallet", font=FONT_HEAD).pack(anchor="w")
        lbl(f, "Pega la clave privada de la wallet que registraste\n"
               "en la web/app AXIA. Se guardará en tu .env local.",
            font=FONT_SMALL, color=C["text2"]).pack(anchor="w", pady=(4, 16))

        lbl(f, "Private key", font=FONT_SMALL, color=C["text2"]).pack(anchor="w")
        self.pk_var = ctk.StringVar()
        self.pk_entry = entry(f, self.pk_var, width=460, show="•")
        self.pk_entry.pack(fill="x", pady=(2, 12))
        self.pk_var.trace_add("write", lambda *_: self._update_preview())

        lbl(f, "Dirección derivada", font=FONT_SMALL, color=C["text2"]).pack(anchor="w")
        self.preview_var = ctk.StringVar(value="—")
        self.preview_lbl = ctk.CTkLabel(f, textvariable=self.preview_var,
                                        font=FONT_MONO, text_color=C["muted"],
                                        fg_color="transparent")
        self.preview_lbl.pack(anchor="w", pady=(2, 6))

        if self.expected_address:
            lbl(f, f"Wallet registrada en AXIA: {self.expected_address}",
                font=FONT_SMALL, color=C["muted"]).pack(anchor="w", pady=(0, 8))

        self.warn_var = ctk.StringVar(value="")
        ctk.CTkLabel(f, textvariable=self.warn_var, font=FONT_SMALL,
                     text_color=C["warning"], fg_color="transparent",
                     wraplength=480).pack(anchor="w")

        btn_row = ctk.CTkFrame(f, fg_color="transparent")
        btn_row.pack(fill="x", pady=(20, 0))
        btn(btn_row, "Cancelar", self.destroy,
            color=C["surface"], hover=C["surface2"], fg=C["text2"]).pack(side="left")
        self.ok_btn = btn(btn_row, "Vincular", self._confirm)
        self.ok_btn.pack(side="right")
        self.ok_btn.configure(state="disabled")

    def _update_preview(self):
        pk = self.pk_var.get().strip()
        if not pk:
            self.preview_var.set("—")
            self.preview_lbl.configure(text_color=C["muted"])
            self.warn_var.set("")
            self.ok_btn.configure(state="disabled")
            return
        if not WEB3_AVAILABLE:
            self.warn_var.set("web3.py no disponible.")
            return
        try:
            addr = Web3().eth.account.from_key(pk).address
            self.preview_var.set(addr)
            self.ok_btn.configure(state="normal")
            if self.expected_address and addr.lower() != self.expected_address:
                self.preview_lbl.configure(text_color=C["warning"])
                self.warn_var.set("⚠  Esta wallet NO coincide con la registrada en AXIA.")
            else:
                self.preview_lbl.configure(text_color=C["success"])
                self.warn_var.set("")
        except Exception:
            self.preview_var.set("Clave inválida")
            self.preview_lbl.configure(text_color=C["error"])
            self.ok_btn.configure(state="disabled")

    def _confirm(self):
        pk = self.pk_var.get().strip()
        if pk and not pk.startswith("0x"):
            pk = "0x" + pk
        save_cfg("PRIVATE_KEY", pk)
        self.result = pk
        self.destroy()


class AssignDialog(ctk.CTkToplevel):
    def __init__(self, parent, token_id, brand, model):
        super().__init__(parent)
        self.result   = None
        self.token_id = token_id

        self.title("Asignar Reloj")
        self.geometry("480x260")
        self.configure(fg_color=C["bg_alt"])
        self.resizable(False, False)
        self.grab_set()
        self.lift()

        f = ctk.CTkFrame(self, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=24, pady=24)

        watch_title = f"{brand} {model}"
        if len(watch_title) > 28:
            watch_title = watch_title[:26] + "…"
        lbl(f, f"Asignar #{token_id}", font=FONT_HEAD).pack(anchor="w")
        lbl(f, watch_title, color=C["text2"]).pack(anchor="w", pady=(0, 4))
        lbl(f, "Wallet del destinatario (0x...)", font=FONT_SMALL,
            color=C["text2"]).pack(anchor="w", pady=(8, 2))
        self.wallet_var = ctk.StringVar()
        entry(f, self.wallet_var, width=420).pack(fill="x", pady=(0, 16))

        row = ctk.CTkFrame(f, fg_color="transparent")
        row.pack(fill="x")
        btn(row, "Cancelar", self.destroy,
            color=C["surface"], hover=C["surface2"], fg=C["text2"]).pack(side="left")
        btn(row, "Asignar en Blockchain", self._confirm).pack(side="right")

    def _confirm(self):
        wallet = self.wallet_var.get().strip()
        if not wallet.startswith("0x") or len(wallet) != 42:
            messagebox.showerror("Error", "Dirección inválida.")
            return
        self.result = wallet
        self.destroy()


class ListForSaleDialog(ctk.CTkToplevel):
    def __init__(self, parent, token_id, brand, model):
        super().__init__(parent)
        self.result   = None
        self.token_id = token_id

        self.title("Poner a la Venta")
        self.geometry("420x240")
        self.configure(fg_color=C["bg_alt"])
        self.resizable(False, False)
        self.grab_set()
        self.lift()

        f = ctk.CTkFrame(self, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=24, pady=24)

        watch_title = f"{brand} {model}"
        if len(watch_title) > 28:
            watch_title = watch_title[:26] + "…"
        lbl(f, f"Publicar #{token_id}", font=FONT_HEAD).pack(anchor="w")
        lbl(f, watch_title, color=C["text2"]).pack(anchor="w", pady=(0, 4))
        lbl(f, "Precio en USDC", font=FONT_SMALL,
            color=C["text2"]).pack(anchor="w", pady=(8, 2))
        self.price_var = ctk.StringVar()
        entry(f, self.price_var, width=200).pack(anchor="w", pady=(0, 16))

        row = ctk.CTkFrame(f, fg_color="transparent")
        row.pack(fill="x")
        btn(row, "Cancelar", self.destroy,
            color=C["surface"], hover=C["surface2"], fg=C["text2"]).pack(side="left")
        btn(row, "Publicar en Marketplace", self._confirm,
            color=C["success"], hover="#0ea271").pack(side="right")

    def _confirm(self):
        try:
            price = float(self.price_var.get().strip())
            if price <= 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Error", "Introduce un precio válido.")
            return
        self.result = price
        self.destroy()


# ─────────────────────────────────────────────────────────────────────────────
# PANTALLA LOGIN
# ─────────────────────────────────────────────────────────────────────────────
class LoginFrame(ctk.CTkFrame):
    def __init__(self, parent, on_success):
        super().__init__(parent, fg_color=C["bg"], corner_radius=0)
        self.on_success    = on_success
        self._retrying     = False
        self._retry_after  = None
        self._build()

    def _build(self):
        self.pack(fill="both", expand=True)

        center = ctk.CTkFrame(self, fg_color="transparent")
        center.place(relx=0.5, rely=0.5, anchor="center")

        # Logo + título
        logo_row = ctk.CTkFrame(center, fg_color="transparent")
        logo_row.pack(pady=(0, 4))
        if "logo_big" in ICONS:
            ctk.CTkLabel(logo_row, image=ICONS["logo_big"], text="",
                         fg_color="transparent").pack(side="left", padx=(0, 10))
        ctk.CTkLabel(logo_row, text="AXIA",
                     font=(_SANS, 30, "bold"),
                     text_color=C["primary"], fg_color="transparent").pack(side="left")

        lbl(center, "Manufacturer Tool", font=_font(12),
            color=C["text2"]).pack(pady=(0, 28))

        # Card de login
        card_frame = ctk.CTkFrame(center, fg_color=C["bg_alt"],
                                  border_color=C["border"], border_width=1,
                                  corner_radius=12)
        card_frame.pack(ipadx=32, ipady=24)

        lbl(card_frame, "Iniciar sesión", font=FONT_HEAD).pack(pady=(0, 18))

        lbl(card_frame, "Usuario o correo", font=FONT_SMALL,
            color=C["text2"]).pack(anchor="w")
        self.id_var = ctk.StringVar()
        entry(card_frame, self.id_var, width=320).pack(pady=(2, 10))

        lbl(card_frame, "Contraseña", font=FONT_SMALL,
            color=C["text2"]).pack(anchor="w")
        self.pw_var = ctk.StringVar()
        entry(card_frame, self.pw_var, width=320, show="•").pack(pady=(2, 4))

        self.status_var = ctk.StringVar(value="")
        ctk.CTkLabel(card_frame, textvariable=self.status_var,
                     font=FONT_SMALL, text_color=C["text2"],
                     fg_color="transparent").pack(pady=(0, 2))

        self.err_var = ctk.StringVar(value="")
        ctk.CTkLabel(card_frame, textvariable=self.err_var,
                     font=FONT_SMALL, text_color=C["error"],
                     fg_color="transparent").pack(pady=(0, 8))

        self.login_btn = btn(card_frame, "Entrar", self._login, width=200, height=38)
        self.login_btn.pack(pady=(0, 4))

        lbl(card_frame, "Solo usuarios con rol FABRICANTE pueden acceder.",
            font=FONT_SMALL, color=C["muted"]).pack(pady=(8, 0))

        card_frame.bind_all("<Return>", lambda e: self._login())

    def _login(self):
        ident = self.id_var.get().strip()
        pw    = self.pw_var.get()
        if not ident or not pw:
            self.err_var.set("Completa todos los campos.")
            return
        self._stop_retry()
        self.login_btn.configure(state="disabled", text="Conectando…")
        self.err_var.set("")
        self.status_var.set("")
        self._try_login(ident, pw)

    def _try_login(self, ident, pw):
        self._retrying = True

        def do_login():
            try:
                api.login(ident, pw)
                self.after(0, self.on_success)
            except requests.HTTPError as e:
                msg = "Credenciales incorrectas."
                try:
                    msg = e.response.json().get("detail", msg)
                except Exception:
                    pass
                self.after(0, lambda m=msg: self._set_error(m))
            except (requests.ConnectionError, requests.Timeout):
                self.after(0, self._schedule_retry_ui)
            except Exception as e:
                self.after(0, lambda msg=str(e): self._set_error(msg))

        threading.Thread(target=do_login, daemon=True).start()

    def _schedule_retry_ui(self):
        if not self._retrying:
            return
        self._animate_dots(0)

    def _animate_dots(self, tick):
        if not self._retrying:
            return
        dots = "." * (tick % 4)
        self.status_var.set(f"Servidor no disponible, reintentando{dots}")
        if tick % 16 == 0 and tick > 0:
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
        self.status_var.set("")
        self.err_var.set(msg)
        self.login_btn.configure(state="normal", text="Entrar")


# ─────────────────────────────────────────────────────────────────────────────
# PANTALLA PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────
class MainFrame(ctk.CTkFrame):
    def __init__(self, parent, on_logout):
        super().__init__(parent, fg_color=C["bg"], corner_radius=0)
        self.on_logout     = on_logout
        self._current_tab  = None
        self._nav_buttons  = {}
        self._build()

    def _build(self):
        self.pack(fill="both", expand=True)

        # ── Cabecera ──────────────────────────────────────────────────────
        self.header = ctk.CTkFrame(self, fg_color=C["bg_alt"], height=52,
                                   corner_radius=0)
        self.header.pack(fill="x", side="top")
        self.header.pack_propagate(False)

        # Logo
        logo_f = ctk.CTkFrame(self.header, fg_color="transparent")
        logo_f.pack(side="left", padx=(16, 0))
        if "logo" in ICONS:
            ctk.CTkLabel(logo_f, image=ICONS["logo"], text="",
                         fg_color="transparent").pack(side="left", padx=(0, 8))
        ctk.CTkLabel(logo_f, text="AXIA",
                     font=(_SANS, 15, "bold"),
                     text_color=C["primary"], fg_color="transparent").pack(side="left")
        ctk.CTkLabel(logo_f, text=" Manufacturer", font=_font(13),
                     text_color=C["text2"], fg_color="transparent").pack(side="left")

        # Usuario
        user_info = api.user or {}
        if user_info.get("username"):
            ctk.CTkFrame(self.header, fg_color=C["border"],
                         width=1, corner_radius=0).pack(side="left", fill="y",
                                                        padx=14, pady=10)
            lbl(self.header, user_info.get("username", ""),
                bg=C["bg_alt"]).pack(side="left")

        # Chip de red
        api_host  = get_cfg("API_URL").replace("https://","").replace("http://","").split("/")[0]
        net_color = C["success"] if "onrender.com" in get_cfg("API_URL") else C["warning"]
        net_f = ctk.CTkFrame(self.header, fg_color="transparent")
        net_f.pack(side="left", padx=14)
        ctk.CTkLabel(net_f, text="●", font=FONT_SMALL,
                     text_color=net_color, fg_color="transparent").pack(side="left")
        ctk.CTkLabel(net_f, text=f"  Amoy · {api_host}", font=FONT_SMALL,
                     text_color=C["text2"], fg_color="transparent").pack(side="left")

        # Cerrar sesión
        logout_kw = {"image": ICONS["logout"]} if "logout" in ICONS else {}
        ctk.CTkButton(self.header, text=" Salir", compound="left",
                      font=FONT_SMALL, text_color=C["error"],
                      fg_color="transparent", hover_color=C["surface"],
                      cursor="hand2", width=70, height=32,
                      command=self.on_logout, **logout_kw
                      ).pack(side="right", padx=16)

        # Chip de wallet
        self.wallet_container = ctk.CTkFrame(self.header, fg_color="transparent")
        self.wallet_container.pack(side="right", padx=6)
        self._refresh_wallet_header()

        separator(self).pack(fill="x", side="top")

        # ── Cuerpo ────────────────────────────────────────────────────────
        body = ctk.CTkFrame(self, fg_color=C["bg"], corner_radius=0)
        body.pack(fill="both", expand=True)

        # Sidebar
        self.sidebar = ctk.CTkFrame(body, fg_color=C["bg_alt"],
                                    width=210, corner_radius=0)
        self.sidebar.pack(fill="y", side="left")
        self.sidebar.pack_propagate(False)
        separator(self.sidebar).pack(fill="x")

        for key, label, icon_key in [
            ("mint",     "Mintear Reloj", "mint"),
            ("stock",    "Mi Stock",      "stock"),
            ("settings", "Configuración", "settings"),
        ]:
            icon = ICONS.get(icon_key)
            b = ctk.CTkButton(
                self.sidebar, text=f"  {label}",
                image=icon, compound="left" if icon else "none",
                anchor="w", font=FONT_BODY,
                fg_color=C["bg_alt"], hover_color=C["surface2"],
                text_color=C["text"], corner_radius=0, height=46,
                command=lambda k=key: self.show_tab(k)
            )
            b.pack(fill="x")
            separator(self.sidebar).pack(fill="x")
            self._nav_buttons[key] = b

        # Área de contenido
        self.content = ctk.CTkFrame(body, fg_color=C["bg"], corner_radius=0)
        self.content.pack(fill="both", expand=True, side="left")

        self._tabs = {
            "mint":     MintTab(self.content),
            "stock":    StockTab(self.content),
            "settings": SettingsTab(self.content),
        }
        self.show_tab("mint")

    def show_tab(self, key):
        if self._current_tab:
            self._tabs[self._current_tab].pack_forget()
            self._nav_buttons[self._current_tab].configure(
                fg_color=C["bg_alt"], text_color=C["text"])
        self._current_tab = key
        self._nav_buttons[key].configure(
            fg_color=C["surface2"], text_color=C["primary"])
        tab = self._tabs[key]
        tab.pack(fill="both", expand=True)
        if hasattr(tab, "on_show"):
            tab.on_show()

    def _refresh_wallet_header(self):
        for w in self.wallet_container.winfo_children():
            w.destroy()

        addr     = derived_wallet_address()
        expected = (api.user or {}).get("wallet_address")

        if addr:
            short    = f"{addr[:6]}…{addr[-4:]}"
            mismatch = expected and addr.lower() != expected.lower()
            color    = C["warning"] if mismatch else C["success"]
            pill     = ctk.CTkFrame(self.wallet_container, fg_color="transparent")
            pill.pack(side="left")
            if "wallet" in ICONS:
                ctk.CTkLabel(pill, image=ICONS["wallet"], text="",
                             fg_color="transparent").pack(side="left", padx=(0, 4))
            ctk.CTkLabel(pill, text="●", font=FONT_SMALL,
                         text_color=color, fg_color="transparent").pack(side="left")
            ctk.CTkLabel(pill, text=f" {short}", font=FONT_MONO,
                         text_color=C["text"], fg_color="transparent").pack(side="left", padx=(2, 4))
            ctk.CTkButton(pill, text="Cambiar", font=FONT_SMALL,
                          text_color=C["text2"], fg_color="transparent",
                          hover_color=C["surface"], width=60, height=26,
                          command=self._open_connect_dialog).pack(side="left")
            if mismatch:
                ctk.CTkLabel(self.wallet_container, text="  ⚠ no coincide",
                             font=FONT_SMALL, text_color=C["warning"],
                             fg_color="transparent").pack(side="left")
        else:
            ctk.CTkLabel(self.wallet_container, text="Sin wallet",
                         font=FONT_SMALL, text_color=C["warning"],
                         fg_color="transparent").pack(side="left", padx=(0, 6))
            btn(self.wallet_container, "Conectar wallet",
                self._open_connect_dialog, width=130, height=30).pack(side="left")

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
class MintTab(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color=C["bg"], corner_radius=0)
        self.img_path   = ""
        self.uid_var    = ctk.StringVar(value="—")
        self.uid_status = ctk.StringVar(value="")
        self._build()

    def _build(self):
        scroll = ctk.CTkScrollableFrame(
            self, fg_color=C["bg"],
            scrollbar_button_color=C["surface2"],
            scrollbar_button_hover_color=C["border"],
            corner_radius=0,
        )
        scroll.pack(fill="both", expand=True)
        inner = scroll

        lbl(inner, "Mintear Nuevo Reloj", font=FONT_TITLE).pack(
            anchor="w", padx=24, pady=(22, 2))
        lbl(inner, "Registro del gemelo digital en blockchain",
            color=C["text2"]).pack(anchor="w", padx=24)
        separator(inner).pack(fill="x", padx=24, pady=14)

        # 1 · NFC
        section_label(inner, "1 · Chip NFC")
        nfc_card = card(inner)

        uid_row = ctk.CTkFrame(nfc_card, fg_color="transparent")
        uid_row.pack(fill="x", pady=(0, 8))
        lbl(uid_row, "UID detectado:", color=C["text2"]).pack(side="left")
        self.uid_label = ctk.CTkLabel(uid_row, textvariable=self.uid_var,
                                      font=FONT_MONO, text_color=C["primary"],
                                      fg_color="transparent")
        self.uid_label.pack(side="left", padx=8)
        ctk.CTkLabel(uid_row, textvariable=self.uid_status,
                     font=FONT_SMALL, text_color=C["muted"],
                     fg_color="transparent").pack(side="left")

        btn_row = ctk.CTkFrame(nfc_card, fg_color="transparent")
        btn_row.pack(fill="x")
        btn(btn_row, "● Leer UID", self._read_nfc,
            color=C["surface2"], hover=C["border"],
            fg=C["text"], width=110).pack(side="left", padx=(0, 8))
        btn(btn_row, "Verificar estado", self._verify_nfc,
            color=C["surface2"], hover=C["border"],
            fg=C["text"], width=130).pack(side="left")

        if not NFC_AVAILABLE:
            lbl(nfc_card, "⚠  pyscard no instalado — introduce el UID manualmente",
                font=FONT_SMALL, color=C["warning"]).pack(anchor="w", pady=(8, 0))
            entry(nfc_card, self.uid_var, width=380).pack(fill="x", pady=(4, 0))

        # 2 · Datos
        section_label(inner, "2 · Datos del Reloj")
        form_card = card(inner)
        self._entries = {}
        for label_text, key in [
            ("Marca",          "brand"),
            ("Modelo",         "model"),
            ("Nº de Serie",    "serial"),
            ("Año de fabric.", "year"),
        ]:
            row = ctk.CTkFrame(form_card, fg_color="transparent")
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(row, text=label_text, font=FONT_BODY,
                         text_color=C["text2"], fg_color="transparent",
                         width=120, anchor="w").pack(side="left")
            var = ctk.StringVar()
            entry(row, var, width=340).pack(side="left", fill="x", expand=True)
            self._entries[key] = var

        # 3 · Destinatario
        section_label(inner, "3 · Destinatario (opcional)")
        dest_card = card(inner)
        lbl(dest_card, "Wallet del propietario inicial  (vacío = tu propio stock)",
            font=FONT_SMALL, color=C["text2"]).pack(anchor="w", pady=(0, 4))
        self.dest_var = ctk.StringVar()
        entry(dest_card, self.dest_var, width=480).pack(fill="x")

        # 4 · Imagen
        section_label(inner, "4 · Imagen del Reloj")
        img_card = card(inner)
        img_row  = ctk.CTkFrame(img_card, fg_color="transparent")
        img_row.pack(fill="x")
        btn(img_row, "Seleccionar imagen", self._select_image,
            color=C["surface2"], hover=C["border"], fg=C["text"],
            width=160).pack(side="left")
        self.img_name_lbl = ctk.CTkLabel(img_row, text="(ninguna)",
                                         font=FONT_SMALL, text_color=C["muted"],
                                         fg_color="transparent")
        self.img_name_lbl.pack(side="left", padx=12)
        if PIL_AVAILABLE:
            self.img_preview = ctk.CTkLabel(img_card, text="",
                                            fg_color="transparent")
            self.img_preview.pack(pady=(8, 0))

        # Botón Mint
        separator(inner).pack(fill="x", padx=24, pady=14)
        self.mint_btn = ctk.CTkButton(
            inner, text="⬡  MINTEAR RELOJ EN BLOCKCHAIN",
            command=self._start_mint,
            font=(_SANS, 12, "bold"),
            fg_color=C["primary"], hover_color=C["primary_h"],
            text_color="#ffffff", height=50, corner_radius=8,
        )
        self.mint_btn.pack(fill="x", padx=24, pady=(0, 8))

        self.log_var = ctk.StringVar(value="")
        self.log_lbl = ctk.CTkLabel(inner, textvariable=self.log_var,
                                    font=FONT_SMALL, text_color=C["text2"],
                                    fg_color="transparent",
                                    wraplength=700, justify="left")
        self.log_lbl.pack(anchor="w", padx=24, pady=(0, 28))

    def _read_nfc(self):
        if not NFC_AVAILABLE:
            self.uid_status.set("pyscard no disponible")
            return
        try:
            uid = read_nfc_uid()
            self.uid_var.set(uid)
            self.uid_status.set("")
            self.uid_label.configure(text_color=C["success"])
        except Exception as e:
            self.uid_var.set("Error")
            self.uid_status.set(str(e))
            self.uid_label.configure(text_color=C["error"])

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

    def _select_image(self):
        path = filedialog.askopenfilename(
            filetypes=[("Imágenes", "*.jpg *.jpeg *.png *.webp"), ("Todos", "*.*")])
        if path:
            self.img_path = path
            self.img_name_lbl.configure(text=os.path.basename(path),
                                        text_color=C["success"])
            if PIL_AVAILABLE:
                try:
                    img = Image.open(path)
                    img.thumbnail((160, 160))
                    photo = ctk.CTkImage(light_image=img, dark_image=img,
                                         size=(img.width, img.height))
                    self.img_preview.configure(image=photo)
                    self.img_preview.image = photo
                except Exception:
                    pass

    def _start_mint(self):
        uid    = self.uid_var.get().strip()
        brand  = self._entries["brand"].get().strip()
        model  = self._entries["model"].get().strip()
        serial = self._entries["serial"].get().strip()
        year   = self._entries["year"].get().strip()
        dest   = self.dest_var.get().strip()

        if not all([uid, brand, model, serial, year]):
            messagebox.showwarning("Faltan datos", "Completa todos los campos.")
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
        self.mint_btn.configure(state="disabled", text="Procesando…")
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

            self._log("Verificando UID en blockchain…", C["text2"])
            registered, existing_token = bc.get_nfc_status(uid)
            if registered:
                self._log(
                    f"✗  UID ya registrado — Token #{existing_token}\n"
                    f"   Este chip NFC ya está vinculado a un reloj existente.",
                    C["error"])
                return

            self._log("Subiendo imagen a IPFS…", C["text2"])
            img_cid = upload_image_pinata(self.img_path)
            img_url = f"ipfs://{img_cid}"
            self._log("Imagen subida. Generando metadata…", C["text2"])

            from datetime import datetime as _dt, timezone as _tz
            mint_iso = _dt.now(_tz.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            metadata = {
                "name":        f"AXIA: {brand} {model}",
                "description": f"Autenticidad AXIA. Serial: {serial}",
                "image":       img_url,
                "attributes":  [
                    {"trait_type": "Brand",               "value": brand},
                    {"trait_type": "Model",               "value": model},
                    {"trait_type": "Serial",              "value": serial},
                    {"trait_type": "Year",                "value": int(year)},
                    {"trait_type": "Fecha de Fabr.",      "value": mint_iso},
                    {"trait_type": "Ultima Verificacion", "value": mint_iso},
                ],
            }
            meta_cid  = upload_json_pinata(metadata, f"axia_{uid.replace(':','')}.json")
            token_uri = f"ipfs://{meta_cid}"
            self._log("Metadata lista. Firmando transacción blockchain…", C["text2"])

            tx_hash, token_id = bc.mint_watch(
                brand, model, serial, int(year), uid, token_uri, recipient)
            hash_uid = "0x" + bc.w3.keccak(text=uid).hex()
            self._log(f"Minteado — Token #{token_id}. Registrando en AXIA…", C["success"])

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

            self._log(
                f"✓  Reloj registrado con éxito.\n"
                f"   Token ID: #{token_id}\n"
                f"   TX Hash:  {tx_hash[:20]}…\n"
                f"   Propietario: {recipient[:12]}…",
                C["success"])
            self.after(0, self._reset_form)

        except Exception as e:
            self._log(f"✗  Error: {e}", C["error"])
        finally:
            self.after(0, lambda: self.mint_btn.configure(
                state="normal", text="⬡  MINTEAR RELOJ EN BLOCKCHAIN"))

    def _log(self, msg, color=None):
        self.after(0, lambda: (
            self.log_var.set(msg),
            self.log_lbl.configure(text_color=color or C["text2"])
        ))

    def _reset_form(self):
        for v in self._entries.values():
            v.set("")
        self.uid_var.set("—")
        self.dest_var.set("")
        self.img_path = ""
        self.img_name_lbl.configure(text="(ninguna)", text_color=C["muted"])
        if PIL_AVAILABLE and hasattr(self, "img_preview"):
            self.img_preview.configure(image=None)


# ─────────────────────────────────────────────────────────────────────────────
# TAB: MI STOCK
# ─────────────────────────────────────────────────────────────────────────────
class StockTab(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color=C["bg"], corner_radius=0)
        self._build()

    def on_show(self):
        self._load()

    def _build(self):
        top = ctk.CTkFrame(self, fg_color="transparent")
        top.pack(fill="x", padx=24, pady=(18, 8))
        lbl(top, "Mi Stock de Relojes", font=FONT_TITLE).pack(side="left")
        btn(top, "↻ Actualizar", self._load,
            color=C["surface2"], hover=C["border"],
            fg=C["text"], width=110).pack(side="right")

        separator(self).pack(fill="x", padx=24)

        self.status_lbl = ctk.CTkLabel(self, text="", font=FONT_BODY,
                                       text_color=C["text2"], fg_color="transparent")
        self.status_lbl.pack(pady=4)

        self.scroll = ctk.CTkScrollableFrame(
            self, fg_color=C["bg"],
            scrollbar_button_color=C["surface2"],
            scrollbar_button_hover_color=C["border"],
            corner_radius=0,
        )
        self.scroll.pack(fill="both", expand=True)

    def _load(self):
        self.status_lbl.configure(text="Cargando stock…", text_color=C["text2"])
        for w in self.scroll.winfo_children():
            w.destroy()
        threading.Thread(target=self._fetch, daemon=True).start()

    def _fetch(self):
        try:
            watches = api.get_stock()
            self.after(0, lambda: self._render(watches))
        except Exception as e:
            self.after(0, lambda msg=str(e):
                self.status_lbl.configure(text=f"Error: {msg}", text_color=C["error"]))

    def _render(self, watches):
        self.status_lbl.configure(text="")
        for w in self.scroll.winfo_children():
            w.destroy()
        if not watches:
            lbl(self.scroll, "No hay relojes en tu stock.",
                color=C["text2"]).pack(pady=48)
            return
        for item in watches:
            self._watch_row(self.scroll, item.get("watch", item))

    def _watch_row(self, parent, w):
        row = ctk.CTkFrame(parent, fg_color=C["bg_alt"],
                           border_color=C["border"], border_width=1,
                           corner_radius=8)
        row.pack(fill="x", padx=16, pady=4, ipadx=14, ipady=10)

        info = ctk.CTkFrame(row, fg_color="transparent")
        info.pack(side="left", fill="x", expand=True)

        token_id = w.get("token_id") or w.get("id", "?")
        brand    = w.get("brand", "")
        model    = w.get("model", "")
        serial   = w.get("serial_number", "")
        listed   = w.get("is_listed", False)

        lbl(info, f"{brand} {model}", font=FONT_SUBHEAD).pack(anchor="w")
        lbl(info, f"Token #{token_id}  ·  S/N: {serial}",
            font=FONT_SMALL, color=C["text2"]).pack(anchor="w")
        lbl(info, "En venta" if listed else "En stock",
            font=FONT_SMALL,
            color=C["warning"] if listed else C["success"]).pack(anchor="w")

        actions = ctk.CTkFrame(row, fg_color="transparent")
        actions.pack(side="right")
        if not listed:
            btn(actions, "Poner a la venta",
                lambda tid=token_id, b=brand, m=model:
                    self._list_for_sale(tid, b, m),
                color=C["success"], hover="#0ea271",
                width=130, height=30).pack(side="right", padx=(4, 0))
        btn(actions, "Asignar",
            lambda tid=token_id, b=brand, m=model:
                self._assign(tid, b, m),
            color=C["surface2"], hover=C["border"],
            fg=C["text"], width=80, height=30).pack(side="right", padx=(4, 0))

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
        self.status_lbl.configure(text=msg, text_color=C["text2"])
        def worker():
            try:
                fn()
            except Exception as e:
                self.after(0, lambda msg=str(e): messagebox.showerror("Error", msg))
            finally:
                self.after(0, lambda: self.status_lbl.configure(text=""))
        threading.Thread(target=worker, daemon=True).start()


# ─────────────────────────────────────────────────────────────────────────────
# TAB: CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
class SettingsTab(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color=C["bg"], corner_radius=0)
        self._entries = {}
        self._build()

    def on_show(self):
        self._refresh_wallet_status()

    def _build(self):
        scroll = ctk.CTkScrollableFrame(
            self, fg_color=C["bg"],
            scrollbar_button_color=C["surface2"],
            scrollbar_button_hover_color=C["border"],
            corner_radius=0,
        )
        scroll.pack(fill="both", expand=True)
        inner = scroll

        lbl(inner, "Configuración", font=FONT_TITLE).pack(
            anchor="w", padx=24, pady=(22, 2))
        lbl(inner, "Necesitas tu private key y las claves de Pinata para mintear.",
            color=C["text2"]).pack(anchor="w", padx=24)
        separator(inner).pack(fill="x", padx=24, pady=12)

        # Wallet
        section_label(inner, "Wallet del fabricante")
        wallet_card = card(inner)
        self.wallet_status_var = ctk.StringVar()
        self._wallet_lbl = ctk.CTkLabel(wallet_card, textvariable=self.wallet_status_var,
                                        font=FONT_MONO, text_color=C["text"],
                                        fg_color="transparent")
        self._wallet_lbl.pack(anchor="w")
        lbl(wallet_card,
            "Se deriva automáticamente de tu PRIVATE_KEY.\n"
            "Debe coincidir con la wallet que vinculaste en la web/app AXIA.",
            font=FONT_SMALL, color=C["muted"],
            wraplength=600).pack(anchor="w", pady=(6, 0))

        groups = [
            ("Credenciales", [
                ("PRIVATE_KEY",        "Clave privada",      True),
            ]),
            ("Pinata IPFS", [
                ("PINATA_API_KEY",     "API Key",            False),
                ("PINATA_SECRET_KEY",  "Secret Key",         True),
            ]),
            ("Red y contratos (opcional)", [
                ("API_URL",             "URL del backend",    False),
                ("RPC_URL",             "RPC URL",            False),
                ("WATCH_NFT_ADDRESS",   "Dirección WatchNFT", False),
                ("MARKETPLACE_ADDRESS", "Marketplace",        False),
                ("USDC_ADDRESS",        "MockUSDC / USDC",    False),
            ]),
        ]

        for group_title, fields in groups:
            section_label(inner, group_title)
            grp_card = card(inner)
            for env_key, label_text, secret in fields:
                row = ctk.CTkFrame(grp_card, fg_color="transparent")
                row.pack(fill="x", pady=4)
                ctk.CTkLabel(row, text=label_text, font=FONT_SMALL,
                             text_color=C["text2"], fg_color="transparent",
                             width=160, anchor="w").pack(side="left")
                current = os.getenv(env_key, "") or DEFAULTS.get(env_key, "")
                var = ctk.StringVar(value=current)
                e   = entry(row, var, width=380, show="•" if secret else "")
                e.pack(side="left", fill="x", expand=True)
                self._entries[env_key] = var

        separator(inner).pack(fill="x", padx=24, pady=14)
        self.save_status = ctk.StringVar(value="")
        btn(inner, "Guardar configuración", self._save,
            width=200, height=38).pack(anchor="w", padx=24, pady=(0, 6))
        ctk.CTkLabel(inner, textvariable=self.save_status,
                     font=FONT_SMALL, text_color=C["success"],
                     fg_color="transparent").pack(anchor="w", padx=24, pady=(0, 28))

        self._refresh_wallet_status()

    def _refresh_wallet_status(self):
        addr = derived_wallet_address()
        if addr:
            self.wallet_status_var.set(f"●  {addr}")
            self._wallet_lbl.configure(text_color=C["success"])
        else:
            self.wallet_status_var.set("⚠  Sin wallet (introduce tu private key abajo)")
            self._wallet_lbl.configure(text_color=C["warning"])

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
class AxiaMfgApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("AXIA · Manufacturer Tool")
        self.geometry("1080x720")
        self.minsize(860, 560)
        self.configure(fg_color=C["bg"])

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
        if not derived_wallet_address():
            self.after(300, self._current_frame._open_connect_dialog)

    def _clear(self):
        for w in self.winfo_children():
            w.destroy()


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = AxiaMfgApp()
    app.mainloop()
