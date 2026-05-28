/** NativeWind v4 Tailwind config for the React Native bundle.
 *
 * Web is handled separately by Phoenix's own Tailwind v4 setup
 * (assets/css/app.css, `@source "../app"`). This file only governs the
 * CSS that NativeWind compiles for iOS / Android / macOS.
 *
 * The design-system tokens come from `tailwind.tokens.js`, which is
 * regenerated from `apps/yawp/assets/css/tokens.css` by
 * `scripts/gen-tokens.mjs`. Web and native therefore resolve to the same
 * hex / px / cubic-bezier values — keep it that way.
 *
 * Spacing is intentionally NOT extended: NativeWind / Tailwind v3 default
 * to the numeric 4px scale (`p-3` = 12px, `gap-4` = 16px, …). Adding
 * `xs/sm/md/lg/xl` spacing keys would collide with `text-xs`/`rounded-sm`/
 * etc. — the same collision we just removed from the web bundle. Screens
 * use numeric spacing utilities (`p-3`, `mb-1`, `gap-3`) and reference the
 * `--space-*` tokens directly via `tokens.ts` when a non-default value is
 * needed.
 */
const tokens = require('./tailwind.tokens.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './src/**/*.{ts,tsx,js,jsx}',
    '../app/**/*.{ts,tsx,js,jsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: tokens.borderRadius,
      fontSize: tokens.fontSize,
      fontFamily: tokens.fontFamily,
      boxShadow: tokens.boxShadow,
      transitionTimingFunction: tokens.transitionTimingFunction,
      transitionDuration: tokens.transitionDuration,
    },
  },
  plugins: [],
};
