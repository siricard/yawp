#!/usr/bin/env node
/**
 * verify-singletons.mjs — Detect duplicate copies of singleton-required packages
 * in the React Native bundles for iOS, Android, and macOS.
 *
 * Background:
 * The consolidated `assets/app/` codebase means Metro's default
 * hierarchical resolution can pull singleton packages (`react`,
 * `react-native-css-interop`, `nativewind`, …) from BOTH the web tree
 * (`assets/node_modules/`) AND the native tree (`assets/native/node_modules/`).
 * When two copies end up in the same bundle, symptoms range from
 * `Invalid hook call` (React duplication) to silently-dropped
 * `className`.
 *
 * The fix is a `resolveRequest` dedup hook in `assets/native/metro.config.js`.
 * This verifier guards that fix: it bundles each platform offline, walks
 * the sourcemap, and asserts that every package in `SINGLETON_DEDUPE`
 * resolves to exactly ONE node_modules path across all three bundles.
 *
 * The dedup list MUST be kept in lockstep with the one in
 * `assets/native/metro.config.js`. See `library/environment.md` for
 * per-entry rationale.
 *
 * Usage:
 * node assets/native/scripts/verify-singletons.mjs [--keep] [--no-bundle]
 * --keep Keep the temp bundles after the run (debugging).
 * --no-bundle Reuse existing bundles in $YAWP_BUNDLE_DIR (CI: build
 * once, verify many).
 *
 * Exit codes:
 * 0 All singletons unique in every platform bundle.
 * 1 At least one singleton appears more than once.
 * 2 Internal error (bundle failed, sourcemap unreadable, …).
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const NATIVE_ROOT = resolve(__dirname, '..');
const PLATFORMS = ['ios', 'android', 'macos'];

const SINGLETONS = [
  'react',
  'react-native-css-interop',
  'nativewind',
  'phoenix',
];

const args = new Set(process.argv.slice(2));
const KEEP = args.has('--keep');
const NO_BUNDLE = args.has('--no-bundle');

const BUNDLE_DIR = process.env.YAWP_BUNDLE_DIR
  ? process.env.YAWP_BUNDLE_DIR
  : NO_BUNDLE
    ? null
    : mkdtempSync(join(tmpdir(), 'yawp-verify-singletons-'));

if (NO_BUNDLE && !process.env.YAWP_BUNDLE_DIR) {
  console.error('verify-singletons: --no-bundle requires YAWP_BUNDLE_DIR to point at prebuilt bundles');
  process.exit(2);
}

function color(code, s) {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const red = (s) => color(31, s);
const green = (s) => color(32, s);
const yellow = (s) => color(33, s);
const bold = (s) => color(1, s);

async function buildBundle(platform) {
  const bundlePath = join(BUNDLE_DIR, `${platform}.bundle`);
  const mapPath = join(BUNDLE_DIR, `${platform}.map`);
  if (NO_BUNDLE) {
    if (!existsSync(mapPath)) {
      throw new Error(`expected prebuilt sourcemap at ${mapPath}`);
    }
    return mapPath;
  }
  console.log(`  bundling ${platform}…`);
  await exec(
    'npx',
    [
      'react-native',
      'bundle',
      '--platform', platform,
      '--dev', 'false',
      '--entry-file', 'index.js',
      '--bundle-output', bundlePath,
      '--sourcemap-output', mapPath,
    ],
    { cwd: NATIVE_ROOT, env: process.env, maxBuffer: 1024 * 1024 * 32 },
  );
  return mapPath;
}

/**
 * Extract the unique `node_modules/<pkg>` install path each singleton
 * resolved to in the bundle, by walking the sourcemap's `sources` array.
 *
 * Returns Map<pkgName, Set<installPath>> where installPath is the absolute
 * directory of the package (e.g. /…/assets/native/node_modules/react).
 */
function scanSourcemap(mapPath) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const sources = map.sources || [];
  const byPkg = new Map();
  for (const pkg of SINGLETONS) {
    byPkg.set(pkg, new Set());
  }
  for (const src of sources) {
    if (!src) continue;
    for (const pkg of SINGLETONS) {
      const re = new RegExp(`(.*?node_modules/${pkg})(/|$)`);
      const m = src.match(re);
      if (m) {
        byPkg.get(pkg).add(m[1]);
      }
    }
  }
  return byPkg;
}

async function main() {
  console.log(bold(`verify-singletons: checking ${SINGLETONS.length} packages across ${PLATFORMS.length} platforms`));
  console.log(`  bundle dir: ${BUNDLE_DIR}`);
  console.log(`  singletons: ${SINGLETONS.join(', ')}`);

  let hadFailure = false;
  const summary = [];

  for (const platform of PLATFORMS) {
    let mapPath;
    try {
      mapPath = await buildBundle(platform);
    } catch (err) {
      console.error(red(`  ${platform}: bundle failed`));
      console.error(err.stderr || err.message);
      process.exitCode = 2;
      return;
    }
    const byPkg = scanSourcemap(mapPath);
    for (const [pkg, paths] of byPkg) {
      const count = paths.size;
      const status = count === 1 ? green('OK') : count === 0 ? yellow('MISSING') : red('DUP');
      summary.push({ platform, pkg, count, paths: [...paths] });
      console.log(`  [${status}] ${platform} / ${pkg}: ${count} resolved path(s)`);
      if (count > 1) {
        hadFailure = true;
        for (const p of paths) {
          console.log(`        ${red('→')} ${p}`);
        }
      }
    }
  }

  if (!KEEP && !NO_BUNDLE && BUNDLE_DIR) {
    rmSync(BUNDLE_DIR, { recursive: true, force: true });
  }

  if (hadFailure) {
    console.error('');
    console.error(red(bold('verify-singletons: FAIL')));
    console.error('  At least one singleton package has multiple copies in a bundle.');
    console.error('  This usually means a missing entry in the SINGLETON_DEDUPE set in');
    console.error('  assets/native/metro.config.js, or a new package with module-level mutable state.');
    console.error('  Suspect any of: react, react/jsx-runtime, react/jsx-dev-runtime,');
    console.error('  react-native-css-interop (+ subpaths), nativewind, reanimated, redux,');
    console.error('  zustand, react-native-svg.');
    process.exit(1);
  }
  console.log('');
  console.log(green(bold('verify-singletons: OK')));
  console.log('  All singletons resolved to a single path in every platform bundle.');
}

main().catch((err) => {
  console.error(red('verify-singletons: internal error'));
  console.error(err.stack || err.message);
  process.exit(2);
});
