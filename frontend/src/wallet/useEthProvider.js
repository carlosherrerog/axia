import { Platform } from 'react-native';
import { ethers } from 'ethers';

export function isMobileWithoutWallet() {
  if (Platform.OS !== 'web') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

const GAS_TIP = ethers.parseUnits('300', 'gwei');
const GAS_MAX = ethers.parseUnits('600', 'gwei');

const AMOY_CHAIN_ID = '0x13882'; // 80002

async function ensureAmoyNetwork(rawProvider) {
  const chainId = await rawProvider.request({ method: 'eth_chainId' });
  if (chainId === AMOY_CHAIN_ID) return;
  try {
    await rawProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: AMOY_CHAIN_ID }],
    });
  } catch (e) {
    if (e.code === 4902 || e.code === -32603) {
      await rawProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: AMOY_CHAIN_ID,
          chainName: 'Polygon Amoy Testnet',
          nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
          rpcUrls: ['https://rpc-amoy.polygon.technology'],
          blockExplorerUrls: ['https://amoy.polygonscan.com'],
        }],
      });
    } else {
      throw e;
    }
  }
}
// Intercepta sendTransaction en el signer para inyectar gas mínimo garantizado.
// Parchear getFeeData no es suficiente porque MetaMask puede sobrescribir los valores.
function wrapSignerWithGas(signer) {
  const _sendTransaction = signer.sendTransaction.bind(signer);
  signer.sendTransaction = async (tx) => {
    const tip = (tx.maxPriorityFeePerGas != null && BigInt(tx.maxPriorityFeePerGas) > GAS_TIP)
      ? BigInt(tx.maxPriorityFeePerGas) : GAS_TIP;
    const max = (tx.maxFeePerGas != null && BigInt(tx.maxFeePerGas) > GAS_MAX)
      ? BigInt(tx.maxFeePerGas) : GAS_MAX;
    return _sendTransaction({ ...tx, maxPriorityFeePerGas: tip, maxFeePerGas: max });
  };
  return signer;
}

export function useEthProvider() {
  // Web: Web3Modal provider
  let walletProvider = null;
  try {
    const { useWeb3ModalProvider } = require('@web3modal/ethers/react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const result = useWeb3ModalProvider();
    walletProvider = result?.walletProvider;
  } catch {}

  // Native: Reown AppKit provider
  let nativeWalletProvider = null;
  try {
    const { useAppKitProvider } = require('@reown/appkit-react-native');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { walletProvider: wp } = useAppKitProvider('eip155');
    nativeWalletProvider = wp;
  } catch {}

  const win = typeof window !== 'undefined' ? window : null;
  const ethProvider = Platform.OS === 'web'
    ? (win?.ethereum || walletProvider || null)
    : nativeWalletProvider;

  const getConnectedSigner = async () => {
    // ── Path nativo (APK) ──────────────────────────────────────────────
    if (Platform.OS !== 'web') {
      if (!nativeWalletProvider) {
        throw new Error('Conecta tu wallet MetaMask primero.');
      }
      await ensureAmoyNetwork(nativeWalletProvider);
      const signer = await new ethers.BrowserProvider(nativeWalletProvider).getSigner();
      return wrapSignerWithGas(signer);
    }

    // ── Path web ───────────────────────────────────────────────────────
    const isNativeExtension = win?.ethereum?.isMetaMask && !win?.ethereum?.isWalletConnect;

    if (isNativeExtension) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureAmoyNetwork(win.ethereum);
      const signer = await new ethers.BrowserProvider(win.ethereum).getSigner();
      return wrapSignerWithGas(signer);
    }

    if (walletProvider) {
      await ensureAmoyNetwork(walletProvider);
      const signer = await new ethers.BrowserProvider(walletProvider).getSigner();
      return wrapSignerWithGas(signer);
    }

    if (win?.ethereum) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureAmoyNetwork(win.ethereum);
      const signer = await new ethers.BrowserProvider(win.ethereum).getSigner();
      return wrapSignerWithGas(signer);
    }

    throw new Error('No hay wallet disponible. Conecta MetaMask u otra wallet compatible.');
  };

  return { ethProvider, getConnectedSigner };
}
