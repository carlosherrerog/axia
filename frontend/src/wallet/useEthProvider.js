import { Platform } from 'react-native';
import { ethers } from 'ethers';

export function isMobileWithoutWallet() {
  if (Platform.OS !== 'web') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

const FLOOR_PRIORITY_FEE = ethers.parseUnits('50',  'gwei');
const FLOOR_MAX_FEE      = ethers.parseUnits('150', 'gwei');
const BASE_FEE_BUFFER    = ethers.parseUnits('50',  'gwei'); // margen sobre baseFee

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
// Margen sobre el valor que devuelva la red (+50%)
const GAS_MARGIN = 150n;

function applyMinGasFee(provider) {
  const _getFeeData = provider.getFeeData.bind(provider);
  provider.getFeeData = async () => {
    const feeData = await _getFeeData();

    const networkTip = feeData.maxPriorityFeePerGas ?? 0n;
    const withMargin = (networkTip * GAS_MARGIN) / 100n;
    const adjustedTip = withMargin < FLOOR_PRIORITY_FEE ? FLOOR_PRIORITY_FEE : withMargin;

    // maxFeePerGas debe cubrir el tip + buffer para la baseFee, con floor absoluto
    const networkMaxFee  = feeData.maxFeePerGas ?? 0n;
    const minMaxFee      = adjustedTip + BASE_FEE_BUFFER;
    const adjustedMaxFee = networkMaxFee < minMaxFee ? minMaxFee : networkMaxFee;
    const finalMaxFee    = adjustedMaxFee < FLOOR_MAX_FEE ? FLOOR_MAX_FEE : adjustedMaxFee;

    return new ethers.FeeData(
      feeData.gasPrice,
      finalMaxFee,
      adjustedTip,
    );
  };
  return provider;
}

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
  const ethProvider = win?.ethereum || walletProvider || null;

  const getConnectedSigner = async () => {
    const isNativeExtension = win?.ethereum?.isMetaMask && !win?.ethereum?.isWalletConnect;

    if (isNativeExtension) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureAmoyNetwork(win.ethereum);
      const provider = applyMinGasFee(new ethers.BrowserProvider(win.ethereum));
      return provider.getSigner();
    }

    if (walletProvider) {
      await ensureAmoyNetwork(walletProvider);
      const provider = applyMinGasFee(new ethers.BrowserProvider(walletProvider));
      return provider.getSigner();
    }

    if (win?.ethereum) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureAmoyNetwork(win.ethereum);
      const provider = applyMinGasFee(new ethers.BrowserProvider(win.ethereum));
      return provider.getSigner();
    }

    throw new Error('No hay wallet disponible. Conecta MetaMask u otra wallet compatible.');
  };

  return { ethProvider, getConnectedSigner };
}
