import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';

const PROJECT_ID = '25fe0c2191056d61096ff4c82f8a07f7';

const amoy = {
  chainId:    80002,
  name:       'Polygon Amoy',
  currency:   'POL',
  explorerUrl:'https://amoy.polygonscan.com',
  rpcUrl:     'https://rpc-amoy.polygon.technology',
};

const metadata = {
  name:        'AXIA',
  description: 'Ecosistema blockchain para relojería de lujo',
  url:         'https://axia-public.vercel.app',
  icons:       ['https://axia-public.vercel.app/favicon.ico'],
};

createWeb3Modal({
  ethersConfig: defaultConfig({ metadata }),
  chains:       [amoy],
  projectId:    PROJECT_ID,
  themeMode:    'dark',
  themeVariables: {
    '--w3m-accent':           '#8b5cf6',
    '--w3m-border-radius-master': '4px',
  },
});

export { PROJECT_ID };
