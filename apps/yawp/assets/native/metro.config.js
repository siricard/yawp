const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

function reactNativePlatformResolver(platformImplementations, customResolver) {
  return (context, moduleName, platform) => {
    let modifiedModuleName = moduleName;
    if (platform != null && platformImplementations[platform]) {
      if (moduleName === 'react-native') {
        modifiedModuleName = platformImplementations[platform];
      } else if (moduleName.startsWith('react-native/')) {
        modifiedModuleName = `${platformImplementations[platform]}/${moduleName.slice('react-native/'.length)}`;
      }
    }
    if (customResolver) {
      return customResolver(context, modifiedModuleName, platform);
    }
    return context.resolveRequest(context, modifiedModuleName, platform);
  };
}

const repoRoot = path.resolve(__dirname, '../../../..');
const sharedAppDir = path.resolve(__dirname, '..', 'app');

const nativeNodeModules = path.join(__dirname, 'node_modules');
const SINGLETON_DEDUPE = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-native',
  'react-native-css-interop',
  'react-native-css-interop/jsx-runtime',
  'react-native-css-interop/jsx-dev-runtime',
  'nativewind',
  'phoenix',
]);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [repoRoot, sharedAppDir],
  resolver: {
    nodeModulesPaths: [nativeNodeModules],
    resolveRequest: reactNativePlatformResolver(
      {macos: 'react-native-macos'},
      (context, moduleName, platform) => {
        if (SINGLETON_DEDUPE.has(moduleName)) {
          const resolved = require.resolve(moduleName, {
            paths: [nativeNodeModules],
          });
          return {type: 'sourceFile', filePath: resolved};
        }
        return context.resolveRequest(context, moduleName, platform);
      },
    ),
  },
};

module.exports = withNativeWind(
  mergeConfig(getDefaultConfig(__dirname), config),
  {input: './global.css'},
);
