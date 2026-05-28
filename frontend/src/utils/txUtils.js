import { ethers } from 'ethers';

const AMOY_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology';

// Polling manual con getTransactionReceipt — más fiable que waitForTransaction en móvil:
// - Usa el provider del tx (Alchemy de MetaMask) para ver la tx inmediatamente.
// - Cae al RPC público si ese provider falla.
// - No depende de suscripciones WebSocket (que se rompen al volver de MetaMask en móvil).
export async function waitForTx(txOrHash, timeout = 60000) {
  const hash       = typeof txOrHash === 'string' ? txOrHash : txOrHash.hash;
  const txProvider = typeof txOrHash !== 'string' ? txOrHash.provider : null;
  const fallback   = new ethers.JsonRpcProvider(AMOY_RPC);
  const deadline   = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const p of [txProvider, fallback].filter(Boolean)) {
      try {
        const receipt = await p.getTransactionReceipt(hash);
        if (receipt?.blockNumber != null) {
          if (receipt.status === 0) {
            const err = new Error('La transacción fue rechazada por el contrato');
            err.code = 'TRANSACTION_REVERTED';
            throw err;
          }
          return receipt;
        }
        break; // Provider respondió OK pero tx aún pendiente — esperar siguiente ciclo
      } catch (e) {
        if (e.code === 'TRANSACTION_REVERTED') throw e;
        // Provider del tx falló — siguiente iteración probará el fallback
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error('La transacción no se confirmó a tiempo. Comprueba en Polygonscan.');
}
