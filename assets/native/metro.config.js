const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const repoRoot = path.resolve(__dirname, '../..');
const sharedAppDir = path.resolve(__dirname, '..', 'app');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [repoRoot, sharedAppDir],
  resolver: {
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  },
};

module.exports = withNativeWind(
  mergeConfig(getDefaultConfig(__dirname), config),
  {input: './global.css'},
);
