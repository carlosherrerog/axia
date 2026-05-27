const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Forzar que Metro transforme archivos .mjs (por defecto solo transforma .js/.jsx/.ts/.tsx)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Asegura que los archivos .mjs de node_modules pasen por el transform de Babel
// (necesario para que unstable_transformImportMeta elimine import.meta de Valtio/WalletConnect)
const originalTransformIgnorePatterns = config.transformer?.transformIgnorePatterns ?? [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
];
config.transformer = {
  ...config.transformer,
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|react-navigation|@react-navigation|@web3modal|@walletconnect|valtio|@wagmi|@tanstack)/)',
  ],
};

module.exports = config;
