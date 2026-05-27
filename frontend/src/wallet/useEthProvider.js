import { Platform } from 'react-native';

// Hook centralizado que devuelve el proveedor EIP-1193 activo.
// En desktop con extensión: window.ethereum (MetaMask, Brave, etc.)
// En móvil / sin extensión: walletProvider de WalletConnect (Web3Modal)
export function useEthProvider() {
  if (Platform.OS !== 'web') return { ethProvider: null };

  try {
    const { useWeb3ModalProvider } = require('@web3modal/ethers/react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { walletProvider } = useWeb3ModalProvider();
    return { ethProvider: window.ethereum || walletProvider || null };
  } catch {
    return { ethProvider: (typeof window !== 'undefined' ? window.ethereum : null) || null };
  }
}
