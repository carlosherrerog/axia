import { ethers } from 'ethers';
import { Linking } from 'react-native';

const AMOY_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology';

// Abre MetaMask automáticamente cuando se usa WalletConnect (móvil).
// Con la extensión nativa de escritorio no es necesario porque MetaMask ya está en el navegador.
export function openMetaMask() {
  const win = typeof window !== 'undefined' ? window : null;
  const isNativeExtension = win?.ethereum?.isMetaMask && !win?.ethereum?.isWalletConnect;
  if (!isNativeExtension) {
    Linking.openURL('metamask://').catch(() => {});
  }
}

// Polling HTTP directo contra el RPC público de Amoy.
// No usa el provider de WalletConnect para esperar — ese depende del WebSocket
// que se interrumpe al volver de MetaMask en móvil.
// El RPC público ve la tx en segundos (la red P2P la propaga tras el broadcast de Alchemy).
export async function waitForTx(txOrHash, timeout = 90000) {
  const hash     = typeof txOrHash === 'string' ? txOrHash : txOrHash.hash;
  const provider = new ethers.JsonRpcProvider(AMOY_RPC);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt?.blockNumber != null) {
        if (receipt.status === 0) {
          const err = new Error('La transacción fue rechazada por el contrato');
          err.code = 'TRANSACTION_REVERTED';
          throw err;
        }
        return receipt;
      }
    } catch (e) {
      if (e.code === 'TRANSACTION_REVERTED') throw e;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error('La transacción no se confirmó a tiempo. Comprueba en Polygonscan.');
}
