const path = require('path');

module.exports = {
  preset: 'react-native',
  roots: ['<rootDir>', '<rootDir>/../app'],
  moduleDirectories: [
    'node_modules',
    path.join(__dirname, 'node_modules'),
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|@noble/ed25519|@noble/hashes|bs58|base-x|base64-js|react-native-keychain|nativewind|react-native-css-interop|react-native-reanimated)',
  ],
};
