#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoAssets = resolve(here, '..', '..');
const tokensPath = resolve(repoAssets, 'css', 'tokens.css');
const outPath = resolve(repoAssets, 'app', 'ui', 'tokens.ts');
// Tailwind config (Tailwind v3 / NativeWind v4) consumes this CommonJS file
// to inject the design-system tokens into the RN bundle. Keep the path
// stable — apps/yawp/assets/native/tailwind.config.js requires it directly.
const tailwindOutPath = resolve(repoAssets, 'native', 'tailwind.tokens.js');

const src = readFileSync(tokensPath, 'utf8');

const re = /--([a-z0-9-]+)\s*:\s*([^;]+?)\s*;/gi;
const entries = [];
let m;
while ((m = re.exec(src)) !== null) {
  entries.push([m[1], m[2].replace(/\s+/g, ' ').trim()]);
}

function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const groups = {
  color: {},
  space: {},
  radius: {},
  font: {},
  shadow: {},
  ease: {},
  dur: {},
  glow: {},
  grad: {},
  search: {},
  callCtrl: {},
  misc: {},
};

for (const [name, value] of entries) {
  if (name.startsWith('color-')) groups.color[camel(name.slice('color-'.length))] = value;
  else if (name.startsWith('space-')) groups.space[camel(name.slice('space-'.length))] = value;
  else if (name.startsWith('radius-')) groups.radius[camel(name.slice('radius-'.length))] = value;
  else if (name.startsWith('font-')) groups.font[camel(name.slice('font-'.length))] = value;
  else if (name.startsWith('shadow-')) groups.shadow[camel(name.slice('shadow-'.length))] = value;
  else if (name.startsWith('ease-')) groups.ease[camel(name.slice('ease-'.length))] = value;
  else if (name.startsWith('dur-')) groups.dur[camel(name.slice('dur-'.length))] = value;
  else if (name.startsWith('glow-')) groups.glow[camel(name.slice('glow-'.length))] = value;
  else if (name.startsWith('grad-')) groups.grad[camel(name.slice('grad-'.length))] = value;
  else if (name.startsWith('search-')) groups.search[camel(name.slice('search-'.length))] = value;
  else if (name.startsWith('call-ctrl-')) groups.callCtrl[camel(name.slice('call-ctrl-'.length))] = value;
  else groups.misc[camel(name)] = value;
}

function emit(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  return lines.join('\n');
}

const banner =
  '// AUTO-GENERATED from apps/yawp/assets/css/tokens.css by scripts/gen-tokens.mjs.\n' +
  '// Do not edit by hand. Run `node apps/yawp/assets/native/scripts/gen-tokens.mjs`.\n';

const body = `export const tokens = {
  color: {
${emit(groups.color)}
  },
  space: {
${emit(groups.space)}
  },
  radius: {
${emit(groups.radius)}
  },
  font: {
${emit(groups.font)}
  },
  shadow: {
${emit(groups.shadow)}
  },
  ease: {
${emit(groups.ease)}
  },
  dur: {
${emit(groups.dur)}
  },
  glow: {
${emit(groups.glow)}
  },
  grad: {
${emit(groups.grad)}
  },
  search: {
${emit(groups.search)}
  },
  callCtrl: {
${emit(groups.callCtrl)}
  },
  misc: {
${emit(groups.misc)}
  },
} as const;

export type Tokens = typeof tokens;
`;

writeFileSync(outPath, banner + body);
console.log(`wrote ${outPath} (${entries.length} tokens)`);

// ---------------------------------------------------------------------------
// Tailwind config tokens (CommonJS, consumed by tailwind.config.js)
// ---------------------------------------------------------------------------
//
// We emit a SECOND artifact wired to the kebab-case names Tailwind expects.
// The native bundle uses Tailwind v3 + NativeWind v4 — Tailwind v3 ignores
// `@theme { … }` blocks, so we MUST extend `theme.extend.*` programmatically
// to make classes like `bg-surface-2`, `rounded-pill`, `text-on-primary`,
// `shadow-card`, etc. resolve. All hex / px / cubic-bezier values come from
// the same `:root` source as the web bundle to prevent platform drift.

function rawByPrefix(prefix) {
  const out = {};
  for (const [name, value] of entries) {
    if (!name.startsWith(prefix)) continue;
    out[name.slice(prefix.length)] = value;
  }
  return out;
}

const rawColors = rawByPrefix('color-');
const rawRadii = rawByPrefix('radius-');
const rawFontSizes = {};
const rawFontFamilies = {};
for (const [name, value] of entries) {
  if (!name.startsWith('font-')) continue;
  const key = name.slice('font-'.length);
  // Heuristic: anything that starts with a digit OR is a known size key is a
  // font-size; the rest (family/mono/display) are font-family stacks.
  if (/^(xs|sm|base|lg|xl|\d)/.test(key)) {
    rawFontSizes[key] = value;
  } else {
    rawFontFamilies[key] = value;
  }
}
const rawShadows = rawByPrefix('shadow-');
const rawEasings = rawByPrefix('ease-');
const rawDurations = rawByPrefix('dur-');

function buildColors() {
  // Tailwind v3 requires a "DEFAULT" key on nested color objects to make the
  // bare class name (e.g. `text-text`, `bg-primary`) resolve. Anything else
  // becomes `text-text-secondary`, `bg-primary-hover`, etc.
  //
  // We pick the *nested* style for any prefix that has at least one variant
  // (text + text-secondary → { DEFAULT, secondary }) and emit flat hex strings
  // for the rest. This keeps the JSON tight and avoids stringly-typed bugs.
  const groups = new Map();
  for (const [name, value] of Object.entries(rawColors)) {
    const dashIndex = name.indexOf('-');
    const root = dashIndex === -1 ? name : name.slice(0, dashIndex);
    const variant = dashIndex === -1 ? null : name.slice(dashIndex + 1);
    if (!groups.has(root)) groups.set(root, new Map());
    groups.get(root).set(variant, value);
  }

  const out = {};
  for (const [root, variants] of groups) {
    if (variants.size === 1 && variants.has(null)) {
      out[root] = variants.get(null);
      continue;
    }
    const obj = {};
    for (const [variant, value] of variants) {
      obj[variant === null ? 'DEFAULT' : variant] = value;
    }
    out[root] = obj;
  }
  return out;
}

const FONT_FAMILY_STACK_OVERRIDES = {
  // tokens.css stores the primary stack under `--font-family`, but Tailwind
  // expects `sans` to map to the default sans-serif stack so `font-sans`
  // resolves alongside the explicit `font-display` / `font-mono`.
  family: 'sans',
};

function parseFontStack(value) {
  // tokens.css emits a single comma-separated string per family. Tailwind
  // wants an array so the cascade can fall back through each entry.
  return value
    .split(',')
    .map((part) => part.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

function buildFontFamily() {
  const out = {};
  for (const [key, value] of Object.entries(rawFontFamilies)) {
    const mapped = FONT_FAMILY_STACK_OVERRIDES[key] || key;
    out[mapped] = parseFontStack(value);
  }
  return out;
}

const tailwindTokens = {
  colors: buildColors(),
  borderRadius: { ...rawRadii },
  fontSize: { ...rawFontSizes },
  fontFamily: buildFontFamily(),
  // Tailwind ships only a couple of `boxShadow` defaults; we add ours so
  // `shadow-card` / `shadow-elev` render the same drop shadow tokens used
  // by the web bundle. Note RN doesn't render multi-layer `box-shadow`
  // fully, but NativeWind passes the string through to css-interop which
  // synthesises platform shadows from it.
  boxShadow: { ...rawShadows },
  transitionTimingFunction: { ...rawEasings },
  transitionDuration: Object.fromEntries(
    Object.entries(rawDurations).map(([k, v]) => [k, v.replace('ms', '')]),
  ),
};

const tailwindBanner =
  '// AUTO-GENERATED from apps/yawp/assets/css/tokens.css by scripts/gen-tokens.mjs.\n' +
  '// Do not edit by hand. Run `node apps/yawp/assets/native/scripts/gen-tokens.mjs`.\n' +
  '// Consumed by apps/yawp/assets/native/tailwind.config.js.\n';

writeFileSync(
  tailwindOutPath,
  tailwindBanner +
    'module.exports = ' +
    JSON.stringify(tailwindTokens, null, 2) +
    ';\n',
);
console.log(`wrote ${tailwindOutPath}`);
