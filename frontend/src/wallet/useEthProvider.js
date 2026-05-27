import { Platform } from 'react-native';
import { ethers } from 'ethers';

// Hook centralizado para proveedor EIP-1193 y helper de firma.
// Patrón GlobalHeader:
//   - Desktop con extensión: window.ethereum + eth_requestAccounts explícito
//   - Móvil / sin extensión:  walletProvider de Web3Modal (WalletConnect)
export function useEthProvider() {
  if (Platform.OS !== 'web') {
    return { ethProvider: null, getConnectedSigner: async () => { throw new Error('Solo disponible en web'); } };
  }

  let walletProvider = null;
  try {
    const { useWeb3ModalProvider } = require('@web3modal/ethers/react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const result = useWeb3ModalProvider();
    walletProvider = result.walletProvider;
  } catch {}

  const win = typeof window !== 'undefined' ? window : null;
  // Para detectar si hay extensión disponible (solo lectura, sin activar)
  const ethProvider = win?.ethereum || walletProvider || null;

  // Helper que sigue el mismo patrón que GlobalHeader.proceedConnect:
  // 1. Si hay extensión → eth_requestAccounts (abre MetaMask si está bloqueado) → signer
  // 2. Si no (móvil/WalletConnect) → usa walletProvider directamente → signer
  const getConnectedSigner = async () => {
    if (win?.ethereum) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(win.ethereum);
      return provider.getSigner();
    }
    if (walletProvider) {
      const provider = new ethers.BrowserProvider(walletProvider);
      return provider.getSigner();
    }
    throw new Error('No hay wallet disponible. Conecta MetaMask u otra wallet compatible.');
  };

  return { ethProvider, getConnectedSigner };
}
