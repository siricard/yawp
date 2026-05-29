import {fileURLToPath} from 'node:url';

import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';

const tailwindConfig = fileURLToPath(
  new URL('../tailwind.config.js', import.meta.url),
);

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'nativewind',
    }),
  ],
  css: {
    postcss: {
      plugins: [tailwindcss({config: tailwindConfig})],
    },
  },
  resolve: {
    alias: [
      {find: /^react-native$/, replacement: 'react-native-web'},
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
      loader: {'.js': 'jsx'},
    },
  },
});
