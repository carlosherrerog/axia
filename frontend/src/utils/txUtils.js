import { ethers } from 'ethers';

const AMOY_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology';

// Usa un JsonRpcProvider público para esperar el recibo de una tx.
// Evita que MetaMask móvil se cuelgue: el BrowserProvider inyectado por MetaMask
// pierde la conexión después del app-switch, dejando tx.wait() sin resolver.
export async function waitForTx(txOrHash, confirmations = 1, timeout = 90000) {
  const hash = typeof txOrHash === 'string' ? txOrHash : txOrHash.hash;
  const provider = new ethers.JsonRpcProvider(AMOY_RPC);
  const receipt = await provider.waitForTransaction(hash, confirmations, timeout);
  if (!receipt) throw new Error('La transacción no se confirmó a tiempo. Comprueba el estado en Polygonscan.');
  if (receipt.status === 0) {
    const err = new Error(`La transacción fue rechazada por el contrato (hash: ${hash})`);
    err.code = 'TRANSACTION_REVERTED';
    throw err;
  }
  return receipt;
}
