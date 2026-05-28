import { createAppKit, defaultConfig } from '@reown/appkit-react-native';

const PROJECT_ID = '25fe0c2191056d61096ff4c82f8a07f7';

const amoy = {
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-amoy.polygon.technology'] } },
  blockExplorers: { default: { name: 'Polygonscan', url: 'https://amoy.polygonscan.com' } },
  testnet: true,
};

const metadata = {
  name:        'AXIA',
  description: 'Ecosistema blockchain para relojería de lujo',
  url:         'https://axia-public.vercel.app',
  icons:       ['https://axia-public.vercel.app/favicon.ico'],
};

createAppKit({
  projectId: PROJECT_ID,
  networks:  [amoy],
  config:    defaultConfig({ metadata }),
});
