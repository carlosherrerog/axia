# AXIA | Luxury Watch Blockchain Ecosystem

AXIA es una plataforma integral para la autenticación, trazabilidad y comercio seguro de relojes de lujo mediante tecnología blockchain. Cada reloj físico queda vinculado a un gemelo digital único (NFT ERC-721) desplegado en la red de Polygon, garantizando un historial de propiedad inmutable e infalsificable desde el momento de su fabricación.

## El problema que resuelve

El mercado secundario de la alta relojería mueve miles de millones de euros anuales y carece de mecanismos de verificación universales. Las falsificaciones sofisticadas, la falta de trazabilidad y la opacidad en las transacciones P2P generan desconfianza entre compradores y vendedores. AXIA resuelve esto trasladando la fuente de verdad a la blockchain: un registro público, permanente e inalterable al que cualquiera puede acceder.

## Arquitectura del sistema

El proyecto es un monorepo con tres servicios independientes desplegables:

```
/frontend     React Native + Expo — app web y móvil (Android/iOS)
/backend      FastAPI (Python) — API REST + WebSockets + lógica de negocio
/blockchain   Solidity + Hardhat — contratos inteligentes en Polygon
```

**Despliegue en producción:**
- Frontend: Vercel
- Backend: Render (PostgreSQL via Supabase)
- Blockchain: Polygon Amoy (testnet — ver nota abajo)

## Contratos inteligentes

> **Nota sobre la red:** Los contratos están desplegados originalmente en **Polygon mainnet**, lo que demuestra la viabilidad del sistema en producción real. Para las pruebas y la demostración del TFG se utiliza **Polygon Amoy** (testnet), que permite operar sin coste económico real manteniendo un entorno técnicamente idéntico. Ambos despliegues coexisten; la aplicación activa apunta a Amoy.

### Polygon Amoy — testnet (activo)

| Contrato | Dirección | Función |
|---|---|---|
| WatchNFT | `0xbBfCa1b8404Dc43238C4A359E8454632f00c292F` | ERC-721 — gemelos digitales, integración NFC |
| WatchMarketplace | `0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6` | Listados, escrow, compraventas P2P y Dealer |
| WatchAuction | `0x701EAa91aeB8588694B116C004D1EaAC7f55F2F2` | Subastas con precio mínimo y puja inglesa |
| WatchSignature | `0x57057749e6aF1b21070FA2A4e5D4359AA2711735` | Verificación de firmas EIP-712 |
| MockUSDC | `0x967187957d31d0912aE57cad1B51F764339AaEe6` | Stablecoin de prueba (6 decimales, ERC-20) |

Verificables en [Amoy Polygonscan](https://amoy.polygonscan.com).

### Polygon mainnet (desplegado, no activo en esta demo)

| Contrato | Dirección |
|---|---|
| WatchNFT | `0x8725a60F432EDCaA3dF1d7987e99B9C18c465988` |
| WatchMarketplace | `0x57057749e6aF1b21070FA2A4e5D4359AA2711735` |
| WatchAuction | `0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6` |
| WatchSignature | `0x967187957d31d0912aE57cad1B51F764339AaEe6` |
| MockUSDC | `0xbBfCa1b8404Dc43238C4A359E8454632f00c292F` |

Verificables en [Polygonscan](https://polygonscan.com).

## Roles y flujos de negocio

### Roles del sistema

- **Fabricante** — Mintea los NFTs vinculados a relojes físicos mediante chip NFC (NTAG424). Sus ventas no requieren fianza ni peritaje. Recibe regalías perpetuas (royalties) cada vez que un reloj de su autoría cambia de manos en el mercado secundario.
- **Dealer** — Empresa o profesional verificado en el contrato como `authorizedDealer`. Vende sin fianza, con confirmación de envío automática, y tiene acceso exclusivo a crear subastas.
- **Relojero** — Perito técnico asignado aleatoriamente en ventas P2P. Inspecciona físicamente el reloj antes de liberar el pago al vendedor. Cobra una comisión por su trabajo.
- **Particular** — Usuario estándar. Sus ventas son clasificadas como P2P (`isP2P = true`), requieren fianza del 2% y peritaje obligatorio.
- **Admin** — Control total del marketplace: pausar operaciones, ajustar comisiones (plataforma, fabricante, relojero, fianza), intervenir en disputas de escrow, configurar el sistema logístico.
- **Sistema Logístico** — Wallet backend autorizada para confirmar envíos (`markAsShipped`), asignar relojeros (`assignWatchmaker`) y liberar pagos en caso de entrega no confirmada por el usuario.

### Flujo de compraventa P2P (Particular vendiendo)

1. El vendedor publica el reloj — el contrato retiene una fianza del 2% del precio
2. El comprador ejecuta `buyWatchEscrow` — fondos bloqueados en el contrato
3. El vendedor confirma el envío físico
4. El sistema logístico asigna un relojero aleatorio
5. El relojero inspecciona el reloj físicamente:
   - **Auténtico** — estado pasa a Verificado. El comprador confirma entrega → contrato libera fondos al vendedor y comisión al relojero
   - **Falso** — venta cancelada, comprador recupera el 100% del dinero, vendedor pierde la fianza, NFT marcado como `AlteredNFC`

### Flujo de compraventa Dealer (Dealer vendiendo)

1. El Dealer publica el reloj (sin fianza, `watchmakerApproved = true` por defecto)
2. El comprador paga — fondos en escrow
3. El backend confirma automáticamente el envío en blockchain (`markAsShipped`)
4. El comprador confirma entrega → fondos liberados al Dealer

### Sistema de subastas (exclusivo Dealers)

1. El Dealer crea la subasta con precio mínimo y duración en segundos
2. Cualquier usuario con wallet puede pujar — cada puja devuelve automáticamente el dinero al pujador anterior
3. Cuando expira el tiempo, el Dealer cierra la subasta:
   - **Sin ganador** — reloj permanece en la colección del Dealer
   - **Con ganador** — el contrato ejecuta `endAuction()`, transfiere el NFT y los fondos al escrow de WatchMarketplace, y crea automáticamente un estado Escrow con envío inmediato (flujo Dealer)

### Historial de propiedad (indexación de eventos blockchain)

El historial completo de cada reloj se reconstruye leyendo los eventos inmutables emitidos por los contratos:

- `Transfer(from, to, tokenId)` — evento ERC-721 estándar, emitido en cada transferencia de propiedad
- `SaleCompleted(tokenId, buyer, seller, price)` — emitido por WatchMarketplace al liquidar cada escrow

El backend indexa estos eventos con `get_ownership_history_from_chain(token_id)` y los persiste en la tabla `watch_ownership_history`. Las transferencias dobles generadas por el escrow (vendedor→contrato y contrato→comprador) se colapsan en una sola entrada con el campo `via_contract_wallet`. La blockchain actúa como registro canónico; la base de datos es un índice prescindible que se puede reconstruir íntegramente en cualquier momento.

### Integración NFC (NTAG424 DNA)

Cada reloj físico lleva un chip NFC NTAG424 DNA que almacena una URL de deep link hacia AXIA. El NTAG424 soporta SUN (Secure Unique NFC): genera un hash criptográfico único en cada lectura que el backend verifica contra la clave secreta de la tarjeta. Esto garantiza que la tarjeta física es genuina y no una copia. Al acercar el móvil al reloj, la app se abre directamente en la pantalla del gemelo digital correspondiente.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React Native 0.81, Expo 54, React Navigation, ethers.js 6 |
| Backend | FastAPI, SQLAlchemy, Alembic, web3.py, JWT, bcrypt |
| Base de datos | PostgreSQL (producción) / SQLite (desarrollo local) |
| Blockchain | Solidity 0.8.28, Hardhat, OpenZeppelin, Polygon (mainnet + Amoy testnet) |
| Pagos | ERC-20 MockUSDC (6 decimales) |
| Almacenamiento | IPFS via Pinata (metadatos e imágenes de los NFTs) |
| Notificaciones | WebSockets (FastAPI) — tiempo real para marketplace y subastas |
| Nodo RPC | Alchemy (Polygon mainnet + Amoy) |

## Estructura del repositorio

```
/frontend
  App.js                      Raíz de la app, navegación, configuración de tema
  src/screens/                Pantallas principales (Auth, Home, Marketplace, Auction, Admin...)
  src/components/             Componentes reutilizables (WatchCard, GlobalHeader, AlertModal...)
  src/api/api.js              Cliente Axios con gestión automática de tokens JWT
  src/themes/styles.js        Estilos centralizados (tema oscuro inspirado en Polygon)

/backend
  main.py                     Aplicación FastAPI completa (~2100 líneas)
  blockchain.py               Integración web3.py, llamadas a contratos, lógica de transacciones
  database/models.py          Modelos ORM SQLAlchemy (User, Watch, Auction, Notification...)
  database/database.py        Conexión a base de datos (SQLite local / PostgreSQL producción)
  schemas/                    Modelos Pydantic para validación de request/response
  abi/                        ABIs de los contratos compilados

/blockchain
  contracts/                  Contratos Solidity (WatchNFT, WatchMarketplace, WatchAuction...)
  scripts/deploy.js           Script de despliegue de los 5 contratos en orden
  hardhat.config.js           Configuración de redes (localhost, Polygon mainnet)
```

## Ejecución en local

```bash
# 1. Blockchain (nodo local)
conda activate tfg_informatica
cd blockchain
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost

# 2. Backend
conda activate tfg_informatica
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 3. Frontend
conda activate tfg_informatica
cd frontend
npx expo start -w        # web
npx expo start -a        # Android
```

Variables de entorno: copiar `.env.example` a `.env` en cada carpeta y completar los valores requeridos (claves JWT, credenciales de Gmail, URL RPC de Alchemy, direcciones de contratos).

## Requisitos previos

- Node.js 18+ y npm
- Python 3.10+ con entorno Conda (`conda activate tfg_informatica`)
- MetaMask u otra wallet compatible con Polygon

## Licencia

Copyright © Carlos Herrero. Todos los derechos reservados. Queda prohibida la reproducción, distribución o modificación no autorizada del código fuente.
