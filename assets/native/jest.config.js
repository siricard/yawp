module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|@noble/ed25519|@noble/hashes|bs58|base-x|base64-js|react-native-keychain)',
  ],
};
