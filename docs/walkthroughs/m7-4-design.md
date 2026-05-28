# M7.4-design walkthrough

## What you can see after M7.4-design

Every M7.0–M7.3 surface re-skinned against `.designkit` v16, the new shared
component library viewable via Ladle, native RN bundles in visual parity
with web.

This milestone is **visual-only** — no new behavior, no new routes, no new
backend. The M7.0–M7.3 validation contract still passes byte-for-byte. What
changed:

- Tailwind v4 `@theme` token block at `apps/yawp/assets/css/app.css` carries
  the v16 palette (`--color-bg`, `--color-surface`, `--color-primary`,
  `--color-text-secondary`, …).
- NativeWind v4 reads the same token file, so RN bundles match web pixel-for-pixel.
- Shared component library at `apps/yawp/assets/app/ui/` (Button, Card,
  Field, Input, …) — RN-first, web-rendered via `react-native-web`. Viewable
  in isolation via Ladle.
- Every M7.0–M7.3 screen re-skinned to consume tokens and the shared
  components — onboarding choice / display-name / mnemonic / passphrase /
  recovery / complete, home, channel, DID, admin, add-server, invites.
- Mnemonic-suggestions dropdown converted to an overlay (no layout push).
- Completed slate→token sweep on 4 onboarding/vector-test screens
  (`OnboardingChoiceScreen`, `OnboardingDisplayNameScreen`,
  `OnboardingCompleteScreen`, `VectorTestScreen`) — last legacy
  `bg-slate-*` / `text-slate-*` references removed.
- Native iOS / Android / macOS bundles boot, render, and were screenshot-
  audited; divergence report at `docs/design/native-parity-report.md`.

## Prerequisites

Same as M7.3:

- Nix dev shell active (`direnv allow` once, or use `nix develop -c …` /
  `just …` for every command).
- Postgres running locally (PG 17, port 5432, default credentials).
- `just setup` has been run at least once.

Additionally for the Ladle viewer:

- Node deps installed under `apps/yawp/assets/native/` (covered by `just
  setup`; `@ladle/react` is already in `package.json`).

Optional, for native parity verification:

- macOS with Xcode installed for iOS / macOS targets.
- Android SDK + emulator for Android target.

## Run the slice

1. **Open the component library viewer.** Ladle serves the shared `app/ui/`
   library on port `:61000`:

   ```bash
   just ladle
   ```

   Browse to [`http://localhost:61000`](http://localhost:61000) and walk the
   component stories — Button (primary / secondary / ghost, all sizes,
   disabled, loading), Card, Field, Input, mnemonic-grid, etc. Every story
   reads the same tokens the production bundle uses; what you see here is
   what you get in the app.

2. **Boot the M7.3 demo, now visually polished.** In another terminal:

   ```bash
   just demo-m7-3
   ```

   Phoenix comes up on `:4000`. The flow is identical to the M7.3
   walkthrough — operator setup → chat-owner claim → second-identity invite
   redemption → real-time `#general` chat — but every surface is re-skinned
   against the v16 design system. Compare side-by-side against
   `.designkit/sessions/12294-1779908337/content/yawp-screens-v16/` to spot
   any divergence.

3. **Optional: confirm native parity.** From a third terminal:

   ```bash
   cd apps/yawp/assets/native && npx react-native start --port 8081
   ```

   Then, in another terminal:

   ```bash
   just rn-ios
   # or: just rn-android
   # or: just rn-macos
   ```

   The native bundle renders the same screens with the same tokens. Refer
   to `docs/design/native-parity-report.md` for the screenshot audit and any
   known per-platform deltas.

## What to look for

- **Component library completeness.** Every primitive consumed by the
  M7.0–M7.3 screens has a story in Ladle. Stories cover the default,
  disabled, and active states.
- **Mnemonic suggestion dropdown is now an overlay.** When typing into a
  recovery-phrase field, the suggestions appear above the input as an
  overlay; the surrounding layout does NOT shift (compare with the old
  M7.3 build).
- **Color and typography match v16.** Backgrounds use `bg-bg` / `bg-surface`
  tokens (warm dark `#202831` / `#353E4B`), accent is the v16 chartreuse
  `#d8ee4d`, headings use the `font-display` family (Geist), body uses the
  default sans.
- **Mobile viewport behaves.** Resize the browser to 375×812 (Chrome
  DevTools device-mode → iPhone 13/14) and walk the same flow. No
  horizontal overflow, the channel composer stays anchored, the mnemonic
  grid reflows to 3×4.
- **Native parity.** If you booted a native target, the same screens look
  visually equivalent to the web at 375×812. Known per-platform deltas
  (font fallback on Android, status-bar overlap on iOS) are catalogued in
  `docs/design/native-parity-report.md`.

## What is NOT here yet

The next milestone (M7.5) layers the missing **functional** features back
on top of the polished UI:

- Channels beyond `#general` (create / list / archive).
- RBAC (member / moderator / owner roles per chat).
- Bans / kicks / message moderation.
- Room invites (channel-scoped, distinct from server-level join invites).

If you need any of these now, they remain on the M7.5 plan — not in this
walkthrough.

## Troubleshooting

- **Ladle port `:61000` already in use.** Check what's listening:
  `lsof -i :61000`. If it's a stale Ladle process from a previous run,
  kill it by PID. If it's another tool of yours, start Ladle on a
  different port: `cd apps/yawp/assets/native && npx ladle serve --port
  61001`.

- **Geist (the display font) doesn't load.** On web, the font is loaded
  via the `@theme` block in `app.css`; if your browser shows the fallback
  sans, do a hard reload (Cmd-Shift-R) to bust the cache. Confirm the
  bundle includes the font by inspecting the request panel for
  `priv/static/assets/*.woff2`.

- **React Native font fallback (Android).** Android lacks Geist by
  default; the bundle falls back to the platform sans. This is expected
  and documented in `docs/design/native-parity-report.md`. To get the
  display font on Android, the font asset must be installed as a system
  resource — out of scope for M7.4-design.
