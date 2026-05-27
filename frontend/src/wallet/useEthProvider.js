import { Platform } from 'react-native';
import { ethers } from 'ethers';

// Floor absoluto por si la red devuelve 0 o un valor muy bajo
const FLOOR_PRIORITY_FEE = ethers.parseUnits('25', 'gwei');
// Margen sobre el valor que devuelva la red (+20%)
const GAS_MARGIN = 120n;

function applyMinGasFee(provider) {
  const _getFeeData = provider.getFeeData.bind(provider);
  provider.getFeeData = async () => {
    const feeData = await _getFeeData();
    const networkTip = feeData.maxPriorityFeePerGas ?? 0n;
    // Aplicar margen del 20% sobre lo que pida la red, con floor de 25 gwei
    const withMargin = (networkTip * GAS_MARGIN) / 100n;
    const adjustedTip = withMargin < FLOOR_PRIORITY_FEE ? FLOOR_PRIORITY_FEE : withMargin;
    return new ethers.FeeData(
      feeData.gasPrice,
      feeData.maxFeePerGas,
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
      const provider = applyMinGasFee(new ethers.BrowserProvider(win.ethereum));
      return provider.getSigner();
    }

    if (walletProvider) {
      const provider = applyMinGasFee(new ethers.BrowserProvider(walletProvider));
      return provider.getSigner();
    }

    if (win?.ethereum) {
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = applyMinGasFee(new ethers.BrowserProvider(win.ethereum));
      return provider.getSigner();
    }

    throw new Error('No hay wallet disponible. Conecta MetaMask u otra wallet compatible.');
  };

  return { ethProvider, getConnectedSigner };
}
