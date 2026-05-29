import os
import json
import requests
from web3 import Web3
from web3.exceptions import ContractLogicError
from dotenv import load_dotenv
from web3.exceptions import ContractLogicError

# --- CONFIGURACIÓN INICIAL ---
load_dotenv()

RPC_URL = os.getenv("RPC_URL", "https://polygon-amoy.g.alchemy.com/v2/3tDtSIFSyEZKyEJfl1r7R")

# DIRECCIONES DE LOS SMART CONTRACTS
WATCH_NFT_ADDRESS     = os.getenv("WATCH_NFT_ADDRESS",     "0x98663d8A262A9F8F92aCC349CD9f15f2010814b0")
MARKETPLACE_ADDRESS   = os.getenv("MARKETPLACE_ADDRESS",   "0x0b37B3C1A5e3ae541c0793eAd83975f683dA3aB5")
WATCH_AUCTION_ADDRESS = os.getenv("WATCH_AUCTION_ADDRESS", "0xe995aC6099389EAc72AC51212dA02EFA3117D6Ae")
MOCK_USDC_ADDRESS     = os.getenv("MOCK_USDC_ADDRESS",     "0x8612685dE8228E787378a984b8aee8bfad5CC550")

# CLAVES PRIVADAS
ADMIN_PRIVATE_KEY = os.getenv("PRIVATE_KEY")
LOGISTICS_PRIVATE_KEY = os.getenv("LOGISTICS_PRIVATE_KEY")

# DIRECCIÓN DEL ADMINISTRADOR
ADMIN_ADDRESS = os.getenv("MY_ADDRESS")

# Claves de Pinata para peticiones autenticadas
PINATA_API_KEY = os.getenv("PINATA_API_KEY")
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY")

# Polygonscan/Etherscan API v2 para consultar eventos sin límite de rango
POLYGONSCAN_API_KEY = os.getenv("POLYGONSCAN_API_KEY")
POLYGONSCAN_API_URL = "https://api.etherscan.io/v2/api"
POLYGONSCAN_CHAIN_ID = "80002"  # Polygon Amoy
# topic0 precalculados
_TOPIC_TRANSFER       = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
_TOPIC_SALE_COMPLETED        = "0x1b44502901e931a03e1ed724d3d7746167e9699a6831744cc24066c94ee414f0"
_TOPIC_AUTHENTICITY_APPROVED = "0x213ed9c62fc3f1ceb155014ceb9460317e4f4f9736c49c00c0e80f3dbdcd567f"
_TOPIC_AUTHENTICITY_REJECTED = "0x6220127034fd15fd91b9d561504747d36924c1bce9ca2127fdf6bca19e17069a"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

# RPC público para get_logs — Alchemy rechaza rangos amplios (from_block=0) con 400
PUBLIC_RPC_URL = "https://rpc-amoy.polygon.technology"
w3_public = Web3(Web3.HTTPProvider(PUBLIC_RPC_URL))

# --- CARGA DE ABIs ---
def load_abi(filename: str):
    try:
        with open(f'abi/{filename}', 'r') as f:
            return json.load(f)['abi']
    except FileNotFoundError:
        with open(filename, 'r') as f:
            return json.load(f)['abi']

watch_nft_abi = load_abi('WatchNFT.json')
marketplace_abi = load_abi('WatchMarketplace.json')

try:
    mock_usdc_abi = load_abi('MockUSDC.json')
except Exception:
    mock_usdc_abi = []

try:
    auction_abi = load_abi('WatchAuction.json')
except FileNotFoundError:
    auction_abi = [] 

# --- INSTANCIACIÓN DE CONTRATOS ---
watchNFT_contract = None
marketplace_contract = None
auction_contract = None
mock_usdc_contract = None

# Contratos espejo con RPC público — usados solo para get_logs
watchNFT_contract_public = None
marketplace_contract_public = None

# Bloque desde el que empezar a buscar eventos (despliegue del contrato en Amoy)
DEPLOY_BLOCK = int(os.getenv("DEPLOY_BLOCK", "39000000"))
LOG_CHUNK_SIZE = 2000  # bloques por chunk — límite de Alchemy para eth_getLogs en Amoy

def get_logs_paginated(event, from_block: int, to_block, argument_filters: dict = None) -> list:
    """Divide get_logs en chunks para no superar el límite de rango de cualquier RPC."""
    if to_block == 'latest':
        try:
            to_block = w3.eth.block_number
        except Exception:
            to_block = from_block + LOG_CHUNK_SIZE
    results = []
    start = from_block
    total_chunks = max(1, (to_block - from_block) // LOG_CHUNK_SIZE + 1)
    print(f"[blockchain] get_logs {event.event_name} bloques {from_block}-{to_block} ({total_chunks} chunks, filtros={argument_filters})")
    while start <= to_block:
        end = min(start + LOG_CHUNK_SIZE - 1, to_block)
        try:
            kwargs = {"from_block": start, "to_block": end}
            if argument_filters:
                kwargs["argument_filters"] = argument_filters
            chunk = event.get_logs(**kwargs)
            if chunk:
                print(f"[blockchain]   chunk {start}-{end}: {len(chunk)} eventos")
            results.extend(chunk)
        except Exception as e:
            print(f"[blockchain]   chunk {start}-{end} ERROR: {e}")
        start = end + 1
    print(f"[blockchain] get_logs {event.event_name} total: {len(results)} eventos")
    return results

if WATCH_NFT_ADDRESS:
    watchNFT_contract = w3.eth.contract(address=w3.to_checksum_address(WATCH_NFT_ADDRESS), abi=watch_nft_abi)
    watchNFT_contract_public = w3_public.eth.contract(address=w3_public.to_checksum_address(WATCH_NFT_ADDRESS), abi=watch_nft_abi)
if MARKETPLACE_ADDRESS:
    marketplace_contract = w3.eth.contract(address=w3.to_checksum_address(MARKETPLACE_ADDRESS), abi=marketplace_abi)
    marketplace_contract_public = w3_public.eth.contract(address=w3_public.to_checksum_address(MARKETPLACE_ADDRESS), abi=marketplace_abi)
if MOCK_USDC_ADDRESS and mock_usdc_abi:
    try:
        mock_usdc_contract = w3.eth.contract(address=w3.to_checksum_address(MOCK_USDC_ADDRESS), abi=mock_usdc_abi)
    except Exception as e:
        print(f"[blockchain] Error instanciando MockUSDC contract: {e}")
if WATCH_AUCTION_ADDRESS and auction_abi:
    auction_contract = w3.eth.contract(address=w3.to_checksum_address(WATCH_AUCTION_ADDRESS), abi=auction_abi)


def get_full_watch_profile(token_id: int) -> dict:
    """
    Lee TODOS los datos de un reloj desde la blockchain y IPFS, mapeándolos 
    exactamente a la estructura de las tablas de SQLAlchemy para indexación.
    """
    try:
        # 1. OBTENER DATOS BASE DEL NFT
        owner = watchNFT_contract.functions.ownerOf(token_id).call()
        watch_data = watchNFT_contract.functions.getWatchData(token_id).call()
        
        # Mapeo de la tupla Watch: [brand, model, serialNumber, year, hashUID, state, manufacturer]
        brand = watch_data[0]
        model = watch_data[1]
        serial_number = watch_data[2]
        manufacturing_year = watch_data[3]
        
        # Convertir bytes32 a string hexadecimal para la BD
        hash_uid_bytes = watch_data[4]
        hash_uid = hash_uid_bytes.hex() if isinstance(hash_uid_bytes, bytes) else str(hash_uid_bytes)
        
        watch_state = watch_data[5]
        manufacturer_wallet = watch_data[6]

        # 2. OBTENER METADATOS (IMAGEN) DESDE IPFS
        token_uri = watchNFT_contract.functions.tokenURI(token_id).call()
        image_url = _fetch_ipfs_image(token_uri)

        # 3. OBTENER REVISIONES
        revisions_db = []
        try:
            revisions_chain = watchNFT_contract.functions.getRevisionHistory(token_id).call()
            # Estructura devuelta: [(date, watchmaker, description), ...]
            for rev in revisions_chain:
                revisions_db.append({
                    "date": rev[0],
                    "watchmaker": rev[1],
                    "description": rev[2]
                })
        except Exception:
            pass 

        # 4. OBTENER VERIFICACIONES 
        verifications_db = []
        try:
            verifs_chain = watchNFT_contract.functions.getVerificationHistory(token_id).call()
            for verif in verifs_chain:
                verifications_db.append({
                    "watchmaker": verif[0],
                    "date": verif[1],
                    "comment": verif[2]
                })
        except Exception:
            pass

        # 4b. Peritajes P2P via Polygonscan (AuthenticityApproved / AuthenticityRejected)
        if POLYGONSCAN_API_KEY:
            token_id_topic = "0x" + hex(token_id)[2:].zfill(64)
            try:
                approved_logs = _polygonscan_get_logs(MARKETPLACE_ADDRESS, _TOPIC_AUTHENTICITY_APPROVED, topic1=token_id_topic)
                for log in approved_logs:
                    wm = Web3.to_checksum_address("0x" + log["topics"][2][-40:])
                    ts = int(log["timeStamp"], 16) if log.get("timeStamp") else 0
                    verifications_db.append({
                        "watchmaker": wm,
                        "date": ts,
                        "comment": "Peritaje superado en venta P2P — reloj verificado como auténtico."
                    })
            except Exception as e:
                print(f"[blockchain] AuthenticityApproved Polygonscan error: {e}")
            try:
                rejected_logs = _polygonscan_get_logs(MARKETPLACE_ADDRESS, _TOPIC_AUTHENTICITY_REJECTED, topic1=token_id_topic)
                for log in rejected_logs:
                    wm = Web3.to_checksum_address("0x" + log["topics"][2][-40:])
                    ts = int(log["timeStamp"], 16) if log.get("timeStamp") else 0
                    verifications_db.append({
                        "watchmaker": wm,
                        "date": ts,
                        "comment": "Peritaje rechazado — se detectó que el reloj no es auténtico."
                    })
            except Exception as e:
                print(f"[blockchain] AuthenticityRejected Polygonscan error: {e}")

        # 5. OBTENER ESTADO DEL MARKETPLACE
        listing_db = None
        if marketplace_contract:
            try:
                listing = marketplace_contract.functions.listings(token_id).call()
                # Tupla: [seller, buyer, price, sellerDeposit, deadline, isP2P, watchmakerAppr, isShipped, assignedWM, verifyingWM, state]
                state_code = listing[10]
                if state_code != 0: # 0 = NotListed
                    listing_db = {
                        "seller": listing[0],
                        "buyer": listing[1] if listing[1] != "0x0000000000000000000000000000000000000000" else None,
                        "price": int(listing[2]),
                        "seller_deposit": int(listing[3]),
                        "shipping_deadline": listing[4],
                        "is_p2p": listing[5],
                        "watchmaker_approved": listing[6],
                        "is_shipped": listing[7],
                        "assigned_watchmaker": listing[8] if listing[8] != "0x0000000000000000000000000000000000000000" else None,
                        "verifying_watchmaker": listing[9] if listing[9] != "0x0000000000000000000000000000000000000000" else None,
                        "listing_state": state_code
                    }
            except Exception as e:
                print(f"Listing no encontrado para token {token_id}: {e}")

        # 6. OBTENER ESTADO DE SUBASTAS
        auction_db = None
        if auction_contract:
            try:
                auction = auction_contract.functions.auctions(token_id).call()
                # Tupla: [seller, highestBidder, highestBid, endTime, minPrice, active]
                is_active = auction[5]
                if is_active:
                    auction_db = {
                        "seller": auction[0],
                        "highest_bidder": auction[1] if auction[1] != "0x0000000000000000000000000000000000000000" else None,
                        "highest_bid": int(auction[2]),
                        "end_time": auction[3],
                        "min_price": int(auction[4]),
                        "is_active": is_active
                    }
            except Exception as e:
                print(f"Subasta no encontrada para token {token_id}: {e}")

        # 7. CONSTRUIR DICCIONARIO FINAL MAESTRO
        return {
            "watch": {
                "token_id": token_id,
                "owner_wallet": owner,
                "brand": brand,
                "model": model,
                "serial_number": serial_number,
                "manufacturing_year": manufacturing_year,
                "image_url": image_url,
                "hash_uid": hash_uid,
                "watch_state": watch_state,
                "manufacturer_wallet": manufacturer_wallet,
                "is_imported": True
            },
            "revisions": revisions_db,
            "verifications": verifications_db,
            "listing": listing_db,
            "auction": auction_db
        }

    except ContractLogicError:
        raise ValueError(f"El Token ID {token_id} no existe en la Blockchain.")
    except Exception as e:
        raise ValueError(f"Error sincronizando datos desde blockchain: {str(e)}")


def _polygonscan_get_logs(address: str, topic0: str, topic1: str = None) -> list:
    """Consulta eventos via Etherscan API v2 (Polygon Amoy). Sin límite de rango de bloques."""
    params = {
        "chainid": POLYGONSCAN_CHAIN_ID,
        "module": "logs",
        "action": "getLogs",
        "address": address,
        "topic0": topic0,
        "fromBlock": "0",
        "toBlock": "latest",
        "apikey": POLYGONSCAN_API_KEY,
    }
    if topic1:
        params["topic1"] = topic1
        params["topic0_1_opr"] = "and"
    try:
        resp = requests.get(POLYGONSCAN_API_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "1":
            return data.get("result", [])
        print(f"[blockchain] Polygonscan getLogs: {data.get('message')} — {data.get('result')}")
    except Exception as e:
        print(f"[blockchain] Polygonscan getLogs error: {e}")
    return []


def get_ownership_history_from_chain(token_id: int, from_block: int = None) -> list:
    """
    Reconstruye el historial de propietarios de un NFT via Etherscan/Polygonscan API v2.
    Sin límites de rango de bloques. Incluye precios de SaleCompleted.
    """
    from datetime import datetime, timezone

    if not POLYGONSCAN_API_KEY:
        print("[blockchain] POLYGONSCAN_API_KEY no configurada — historial no disponible")
        return []

    # tokenId como topic (32 bytes, hex)
    token_id_topic = "0x" + hex(token_id)[2:].zfill(64)

    # 1. Eventos Transfer del NFT filtrados por tokenId (topic3)
    raw_transfers = _polygonscan_get_logs(WATCH_NFT_ADDRESS, _TOPIC_TRANSFER, topic1=None)
    # Polygonscan no filtra por topic3 directamente en todos los casos — filtramos en Python
    raw_transfers = [
        log for log in raw_transfers
        if len(log.get("topics", [])) >= 4 and log["topics"][3] == token_id_topic
    ]
    print(f"[blockchain] Polygonscan Transfer token {token_id}: {len(raw_transfers)} eventos")

    if not raw_transfers:
        return []

    # 2. Eventos SaleCompleted del marketplace (tokenId en topic1)
    sale_logs = _polygonscan_get_logs(MARKETPLACE_ADDRESS, _TOPIC_SALE_COMPLETED, topic1=token_id_topic)
    sale_price_by_block = {}
    for s in sale_logs:
        try:
            block_num = int(s["blockNumber"], 16)
            price_usdc = int(s["data"], 16) / 10**6
            sale_price_by_block[block_num] = price_usdc
        except Exception:
            pass
    print(f"[blockchain] Polygonscan SaleCompleted token {token_id}: {len(sale_logs)} eventos")

    # 3. Construir raw
    raw = []
    for log in raw_transfers:
        try:
            block_num = int(log["blockNumber"], 16)
            from_addr = "0x" + log["topics"][1][-40:]
            to_addr   = "0x" + log["topics"][2][-40:]
            # Normalizar a checksum address
            from_addr = Web3.to_checksum_address(from_addr)
            to_addr   = Web3.to_checksum_address(to_addr)
            ts = None
            if log.get("timeStamp"):
                ts = datetime.fromtimestamp(int(log["timeStamp"], 16), tz=timezone.utc)
            raw.append({
                "previous_owner_wallet": from_addr,
                "new_owner_wallet":      to_addr,
                "via_contract_wallet":   None,
                "price_usdc":            sale_price_by_block.get(block_num),
                "transferred_at":        ts,
                "block_number":          block_num,
            })
        except Exception as e:
            print(f"[blockchain] Error procesando Transfer log: {e}")
            continue

    # 4. Fusionar transferencias de contratos usando máquina de estados.
    #    Esto detecta correctamente subastas incluso cuando hay múltiples pruebas
    #    entrelazadas (los patrones consecutivos fallaban en esos casos).
    auction_lower     = WATCH_AUCTION_ADDRESS.lower() if WATCH_AUCTION_ADDRESS else None
    marketplace_lower = MARKETPLACE_ADDRESS.lower() if MARKETPLACE_ADDRESS else None

    history = []
    pending_auction_seller   = None  # wallet del vendedor cuando el NFT entra al contrato de subasta
    pending_auction_in_market = False  # True cuando auction→marketplace ya ocurrió, esperando market→buyer
    pending_market_seller    = None  # wallet del vendedor en escrow de marketplace normal

    for entry in raw:
        from_l = entry["previous_owner_wallet"].lower()
        to_l   = entry["new_owner_wallet"].lower()

        # ── Rutas de subasta ──────────────────────────────────────────
        if auction_lower and to_l == auction_lower:
            # NFT entra al contrato de subasta (dealer → auction)
            pending_auction_seller    = entry["previous_owner_wallet"]
            pending_auction_in_market = False
            continue  # no mostrar esta transferencia

        if auction_lower and from_l == auction_lower:
            if marketplace_lower and to_l == marketplace_lower:
                # Subasta ganada: auction → marketplace; esperar market → buyer
                pending_auction_in_market = True
            else:
                # Subasta desierta: NFT devuelto al dealer (from_wallet == to_wallet)
                history.append({
                    "previous_owner_wallet": pending_auction_seller or entry["new_owner_wallet"],
                    "new_owner_wallet":      entry["new_owner_wallet"],
                    "via_contract_wallet":   WATCH_AUCTION_ADDRESS,
                    "price_usdc":            None,
                    "transferred_at":        entry["transferred_at"],
                    "block_number":          entry["block_number"],
                })
                pending_auction_seller    = None
                pending_auction_in_market = False
            continue  # no mostrar la transferencia intermedia

        # ── Rutas de marketplace ──────────────────────────────────────
        if marketplace_lower and to_l == marketplace_lower:
            # NFT entra al escrow del marketplace (seller → marketplace)
            pending_market_seller = entry["previous_owner_wallet"]
            continue  # no mostrar, esperar market → buyer

        if marketplace_lower and from_l == marketplace_lower:
            if pending_auction_in_market:
                # Paso final de una subasta ganada: marketplace → buyer
                history.append({
                    "previous_owner_wallet": pending_auction_seller or entry["previous_owner_wallet"],
                    "new_owner_wallet":      entry["new_owner_wallet"],
                    "via_contract_wallet":   WATCH_AUCTION_ADDRESS,
                    "price_usdc":            entry.get("price_usdc"),
                    "transferred_at":        entry["transferred_at"],
                    "block_number":          entry["block_number"],
                })
                pending_auction_seller    = None
                pending_auction_in_market = False
            else:
                # Venta normal de marketplace: marketplace → buyer
                history.append({
                    "previous_owner_wallet": pending_market_seller or entry["previous_owner_wallet"],
                    "new_owner_wallet":      entry["new_owner_wallet"],
                    "via_contract_wallet":   MARKETPLACE_ADDRESS,
                    "price_usdc":            entry.get("price_usdc"),
                    "transferred_at":        entry["transferred_at"],
                    "block_number":          entry["block_number"],
                })
                pending_market_seller = None
            continue

        # ── Minteo o transferencia directa ───────────────────────────
        history.append(entry)

    return history


def _fetch_ipfs_image(token_uri: str) -> str:
    """Función privada para manejar la descarga segura de metadatos de IPFS"""
    fetch_url = token_uri
    if token_uri.startswith("ipfs://"):
        fetch_url = token_uri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")
        
    headers = {'pinata_api_key': PINATA_API_KEY, 'pinata_secret_api_key': PINATA_SECRET_KEY}
    
    try:
        response = requests.get(fetch_url, headers=headers, timeout=8)
        metadata = response.json() if response.status_code == 200 else requests.get(fetch_url, timeout=8).json()
        image_url = metadata.get("image", "")
        return image_url.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/") if image_url.startswith("ipfs://") else image_url
    except Exception:
        return ""


def set_blockchain_role(target_address: str, role: str, status: bool):
    """
    Registra o elimina a un usuario de las listas blancas del Smart Contract.
    """
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY no configurada en el servidor.")
    
    if not target_address:
        raise ValueError("El usuario no tiene una wallet vinculada.")

    target_address_checksum = w3.to_checksum_address(target_address)

    # 1. Seleccionar la función del contrato según el rol
    if role == "RELOJERO":
        txn_func = watchNFT_contract.functions.manageWatchmaker(target_address_checksum, status)
    elif role == "FABRICANTE":
        txn_func = watchNFT_contract.functions.manageManufacturer(target_address_checksum, status)
    elif role == "DEALER":
        txn_func = watchNFT_contract.functions.manageDealer(target_address_checksum, status)
    else:
        return None # Los roles como PARTICULAR o ADMIN no afectan a la blockchain

    # 2. Construir la transacción
    nonce = w3.eth.get_transaction_count(ADMIN_ADDRESS)
    txn = txn_func.build_transaction({
        'from': ADMIN_ADDRESS,
        'nonce': nonce,
        'gas': 300000, # Límite de gas estimado para esta operación
        'gasPrice': w3.eth.gas_price
    })

    # 3. Firmar y enviar a la blockchain
    signed_txn = w3.eth.account.sign_transaction(txn, private_key=ADMIN_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    
    # 4. Esperar a que se mine el bloque
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    if receipt.status != 1:
        raise ValueError("La transacción fue revertida por el Smart Contract.")
        
    return tx_hash.hex()

# ============================================================================
# SETER DEL LOGISTIC SYSTEM
# ============================================================================
def initialize_logistics_system_onchain():
    """
    Configura la dirección del sistema logístico en el Smart Contract de Marketplace.
    Calcula automáticamente la dirección pública a partir de la private key
    y envía la transacción firmando como el Administrador.
    """
    if not ADMIN_PRIVATE_KEY or not ADMIN_ADDRESS:
        raise ValueError("Credenciales de administrador no configuradas.")
    if not LOGISTICS_PRIVATE_KEY:
        raise ValueError("LOGISTICS_PRIVATE_KEY no configurada.")
    if not marketplace_contract:
        raise ValueError("Contrato Marketplace no inicializado.")

    try:
        # 1. Derivamos la dirección pública de la cuenta logística
        logistics_account = w3.eth.account.from_key(LOGISTICS_PRIVATE_KEY)
        checksum_logistics = w3.to_checksum_address(logistics_account.address)

        # 2. Obtenemos el nonce del Administrador
        nonce = w3.eth.get_transaction_count(ADMIN_ADDRESS)

        # 3. Construimos la transacción para setLogisticsSystem
        tx = marketplace_contract.functions.setLogisticsSystem(
            checksum_logistics
        ).build_transaction({
            'from': ADMIN_ADDRESS,
            'nonce': nonce,
            'gas': 100000,
            'gasPrice': w3.eth.gas_price
        })

        # 4. Firmamos con la clave del Administrador
        signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # 5. Esperamos confirmación
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status == 1:
            print(f"Sistema Logístico ({checksum_logistics}) registrado en el contrato.")
            return {"success": True, "tx_hash": tx_hash.hex(), "address": checksum_logistics}
        else:
            return {"success": False, "error": "Revertida en cadena al configurar el sistema logístico."}

    except ContractLogicError as e:
        raise ValueError(f"Error de lógica del contrato: {str(e)}")
    except Exception as e:
        raise ValueError(f"Error configurando sistema logístico: {str(e)}")
    

def get_logistics_status() -> dict:
    """
    Devuelve la dirección y el saldo ETH/POL de la wallet logística.
    """
    if not LOGISTICS_PRIVATE_KEY:
        return {"configured": False, "address": None, "balance_eth": None}
    try:
        account = w3.eth.account.from_key(LOGISTICS_PRIVATE_KEY)
        address = account.address
        balance_wei = w3.eth.get_balance(address)
        balance_eth = float(w3.from_wei(balance_wei, "ether"))
        auction_address = None
        try:
            auction_address = marketplace_contract.functions.auctionContract().call()
        except Exception:
            pass
        return {"configured": True, "address": address, "balance_eth": balance_eth, "auction_address": auction_address}
    except Exception as e:
        return {"configured": False, "address": None, "balance_eth": None, "error": str(e)}


def list_watch_onchain(seller_address: str, private_key: str, token_id: int, price_usdc: float):
    """
    Llama a la función listWatch del smart contract.
    """
    try:
        # Convertir el precio a formato USDC (6 decimales)
        # Equivale a ethers.parseUnits(price, 6) en el frontend
        price_wei = int(price_usdc * (10 ** 6))
        
        # 1. Construir la transacción
        tx = marketplace_contract.functions.listWatch(token_id, price_wei).build_transaction({
            'from': seller_address,
            'nonce': w3.eth.get_transaction_count(seller_address),
            # 'gas': 300000, # (Opcional) Web3 lo estima automáticamente si no se pone
        })
        
        # 2. Firmar la transacción con la clave privada
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        
        # 3. Enviar la transacción a la blockchain
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # 4. Esperar confirmación
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        if receipt.status == 1:
            return {"success": True, "tx_hash": tx_hash.hex()}
        else:
            return {"success": False, "error": "La transacción falló (revertida en cadena)"}

    except ContractLogicError as e:
        return {"success": False, "error": f"Error de lógica del contrato: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def update_listing_price_onchain(seller_address: str, private_key: str, token_id: int, new_price_usdc: float):
    """
    Llama a la función updateListingPrice del smart contract.
    """
    try:
        new_price_wei = int(new_price_usdc * (10 ** 6))
        
        tx = marketplace_contract.functions.updateListingPrice(token_id, new_price_wei).build_transaction({
            'from': seller_address,
            'nonce': w3.eth.get_transaction_count(seller_address),
        })
        
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        if receipt.status == 1:
            return {"success": True, "tx_hash": tx_hash.hex()}
        else:
            return {"success": False, "error": "La transacción falló (revertida en cadena)"}

    except ContractLogicError as e:
        return {"success": False, "error": f"Error de lógica del contrato: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ================================================================
# SISTEMA LOGÍSTICO
# =================================================================
def confirm_shipment(token_id: int):
    """
    Actúa como el sistema logístico: marca un reloj como enviado.
    Esta función se ejecuta para cualquier vendedor (Dealer o Particular).
    """
    if not LOGISTICS_PRIVATE_KEY:
        raise ValueError("LOGISTICS_PRIVATE_KEY no configurada en el servidor.")
    if not marketplace_contract:
        raise ValueError("Contrato Marketplace no inicializado.")

    account = w3.eth.account.from_key(LOGISTICS_PRIVATE_KEY)
    logistics_address = account.address

    try:
        nonce = w3.eth.get_transaction_count(logistics_address)

        tx_ship = marketplace_contract.functions.markAsShipped(token_id).build_transaction({
            'from': logistics_address,
            'nonce': nonce,
            'gas': 250000,
            'gasPrice': w3.eth.gas_price
        })
        
        signed_tx_ship = w3.eth.account.sign_transaction(tx_ship, private_key=LOGISTICS_PRIVATE_KEY)
        tx_hash_ship = w3.eth.send_raw_transaction(signed_tx_ship.raw_transaction)
        receipt_ship = w3.eth.wait_for_transaction_receipt(tx_hash_ship)

        if receipt_ship.status == 1:
            return {"success": True, "tx_hash": tx_hash_ship.hex()}
        else:
            return {"success": False, "error": "La transacción de envío fue revertida en la cadena."}

    except ContractLogicError as e:
        raise ValueError(f"Error de lógica del contrato al enviar: {str(e)}")
    except Exception as e:
        raise ValueError(f"Error procesando transacción logística de envío: {str(e)}")


def assign_watchmaker(token_id: int, watchmaker_address: str):
    """
    Actúa como el sistema logístico: asigna oficialmente a un relojero en el Smart Contract.
    Obligatoriamente comprueba en la blockchain que el anuncio sea P2P.
    """
    if not LOGISTICS_PRIVATE_KEY:
        raise ValueError("LOGISTICS_PRIVATE_KEY no configurada en el servidor.")
    if not marketplace_contract:
        raise ValueError("Contrato Marketplace no inicializado.")

    # 1. Comprobación de seguridad: Leer el listing directamente de la blockchain
    try:
        listing = marketplace_contract.functions.listings(token_id).call()
        # En la estructura de Solidity, isP2P es el 5º elemento (índice 4)
        is_p2p = listing[4] 
        if not is_p2p:
            raise ValueError("El vendedor no es un particular (P2P). No se puede asignar relojero a una venta de Dealer.")
    except Exception as e:
        raise ValueError(f"Error al verificar el estado del anuncio en la blockchain: {str(e)}")

    account = w3.eth.account.from_key(LOGISTICS_PRIVATE_KEY)
    logistics_address = account.address

    try:
        nonce = w3.eth.get_transaction_count(logistics_address)
        checksum_watchmaker = w3.to_checksum_address(watchmaker_address)
        
        tx_assign = marketplace_contract.functions.assignWatchmaker(
            token_id, 
            checksum_watchmaker
        ).build_transaction({
            'from': logistics_address,
            'nonce': nonce,
            'gas': 250000,
            'gasPrice': w3.eth.gas_price
        })
        
        signed_tx_assign = w3.eth.account.sign_transaction(tx_assign, private_key=LOGISTICS_PRIVATE_KEY)
        tx_hash_assign = w3.eth.send_raw_transaction(signed_tx_assign.raw_transaction)
        receipt_assign = w3.eth.wait_for_transaction_receipt(tx_hash_assign)

        if receipt_assign.status == 1:
            return {"success": True, "tx_hash": tx_hash_assign.hex()}
        else:
            return {"success": False, "error": "La transacción de asignación fue revertida en la cadena."}

    except ContractLogicError as e:
        raise ValueError(f"Error de lógica del contrato al asignar relojero: {str(e)}")
    except Exception as e:
        raise ValueError(f"Error procesando transacción logística de asignación: {str(e)}")


def send_test_funds(to_address: str, pol_amount: float = 1.0, usdc_amount: float = 1000.0):
    """Envía POL nativo + MockUSDC desde la wallet del admin al usuario solicitante."""
    if not ADMIN_PRIVATE_KEY or not ADMIN_ADDRESS:
        raise ValueError("ADMIN_PRIVATE_KEY / ADMIN_ADDRESS no configurados.")
    if not mock_usdc_contract:
        raise ValueError("MOCK_USDC_ADDRESS no configurado.")

    to = w3.to_checksum_address(to_address)
    admin = w3.to_checksum_address(ADMIN_ADDRESS)
    chain_id = w3.eth.chain_id

    # 1. Enviar POL (gas nativo)
    nonce = w3.eth.get_transaction_count(admin)
    tx_pol = {
        'to': to,
        'value': w3.to_wei(pol_amount, 'ether'),
        'gas': 21000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'chainId': chain_id,
    }
    signed_pol = w3.eth.account.sign_transaction(tx_pol, private_key=ADMIN_PRIVATE_KEY)
    hash_pol = w3.eth.send_raw_transaction(signed_pol.raw_transaction)
    w3.eth.wait_for_transaction_receipt(hash_pol, timeout=120)

    # 2. Enviar MockUSDC (ERC-20, 6 decimales)
    nonce2 = nonce + 1  # nonce + 1 para evitar que el nodo devuelva un valor desactualizado
    usdc_wei = int(usdc_amount * 10 ** 6)
    tx_usdc = mock_usdc_contract.functions.transfer(to, usdc_wei).build_transaction({
        'from': admin,
        'nonce': nonce2,
        'gas': 100000,
        'gasPrice': w3.eth.gas_price,
        'chainId': chain_id,
    })
    signed_usdc = w3.eth.account.sign_transaction(tx_usdc, private_key=ADMIN_PRIVATE_KEY)
    hash_usdc = w3.eth.send_raw_transaction(signed_usdc.raw_transaction)
    w3.eth.wait_for_transaction_receipt(hash_usdc, timeout=120)

    return hash_pol.hex(), hash_usdc.hex()
    