#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoAssets = resolve(here, '..', '..');
const tokensPath = resolve(repoAssets, 'css', 'tokens.css');
const outPath = resolve(repoAssets, 'app', 'ui', 'tokens.ts');

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
