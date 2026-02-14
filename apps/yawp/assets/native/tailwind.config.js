/** NativeWind v4 Tailwind config for the React Native bundle.
 *
 * Web is handled separately by Phoenix's own Tailwind v4 setup
 * (assets/css/app.css, `@source "../app"`). This file only governs the
 * CSS that NativeWind compiles for iOS / Android / macOS.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './src/**/*.{ts,tsx,js,jsx}',
    '../app/**/*.{ts,tsx,js,jsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
