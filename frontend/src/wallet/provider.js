import { ethers } from 'ethers';
import { Platform } from 'react-native';

// Obtiene provider y signer. En web usa window.ethereum si está disponible,
// si no usa el provider inyectado por Web3Modal (WalletConnect).
export async function getProviderAndSigner() {
  if (Platform.OS !== 'web') throw new Error('Solo disponible en web');

  // Desktop con extensión MetaMask u otra wallet
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    return { provider, signer };
  }

  // Móvil / sin extensión: intentar con el provider de Web3Modal
  const { useWeb3ModalProvider } = await import('@web3modal/ethers/react');
  // walletProvider se obtiene desde el hook — este helper es para uso fuera de hooks
  throw new Error('USE_HOOK'); // señal para usar useWeb3ModalProvider en componentes React
}

// Hook para usar en componentes React (reemplaza BrowserProvider(window.ethereum))
export function useEthersProvider() {
  if (Platform.OS !== 'web') return { provider: null, signer: null };
  try {
    const { useWeb3ModalProvider } = require('@web3modal/ethers/react');
    const { walletProvider } = useWeb3ModalProvider();
    if (!walletProvider) return { provider: null, signer: null };
    const provider = new ethers.BrowserProvider(walletProvider);
    return { provider, walletProvider };
  } catch {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      return { provider, walletProvider: window.ethereum };
    }
    return { provider: null, walletProvider: null };
  }
}
