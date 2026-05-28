// Polyfills — deben ser los primeros imports del entry point
import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';

// Polyfill para import.meta — necesario porque dependencias de WalletConnect/Valtio
// usan import.meta.env y MetaMask SES rechaza esa sintaxis sin transformar.
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = { env: { MODE: 'production', DEV: false, PROD: true } };
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
