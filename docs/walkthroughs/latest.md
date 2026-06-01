# Yawp walkthrough

The single, always-current end-to-end walkthrough. `just demo` resets the dev
database, boots Phoenix, and points you here. When the demoable flow changes,
this file changes with it.

## What you can see

A full first-boot-to-chat path, end to end, on a freshly reset instance:

- **Operator setup** — claim the instance as its first operator.
- **Chat-owner claim** — bind the first cryptographic identity as the
  chat owner.
- **Mnemonic onboarding + restore** — create a new identity from a BIP-39
  recovery phrase, or restore an existing one.
- **Server invites** — a second identity redeems an invite and joins
  `#general`.
- **Real-time `#general` messaging** — two browser sessions exchange messages
  live.

Every surface above is skinned against the shared design system: a single
token source drives both the web bundle and the native React Native bundles,
so web and mobile render the same palette, typography, and spacing. The shared
component library (`apps/yawp/assets/app/ui/` — Button, Card, Field, Input,
mnemonic grid, …) is RN-first and rendered on web via `react-native-web`. You
can browse every primitive in isolation with Ladle.

## Prerequisites

- Nix dev shell active (`direnv allow` once, or prefix every command with
  `nix develop -c …` / use `just …`).
- Postgres running locally (port 5432, default credentials).
- `just setup` has been run at least once. This installs the Node deps under
  `apps/yawp/assets/native/`, including the Ladle component viewer.

Optional, for native parity verification:

- macOS with Xcode for the iOS / macOS targets.
- Android SDK + emulator for the Android target.

## Run the slice

1. **Boot the demo.** This resets the dev database, then starts Phoenix:

   ```bash
   just demo
   ```

   Watch the boot log for the operator-setup banner:

   ```
   OPERATOR SETUP <url>
   ```

   Open that URL and complete operator setup. From there:

   - Claim the chat-owner identity. You'll be walked through the mnemonic
     ceremony — a 12-word recovery phrase is generated client-side; confirm it
     to continue. (The server never sees the phrase or the derived keys.)
   - Land on home with `#general` available.

2. **Add a second identity via an invite.** In the operator console, mint a
   server invite and use its **Copy link** button to grab a full invite link
   (`<server>/invite#<token>`). Open a second browser session (or an incognito
   window), choose "create new identity" to run the mnemonic ceremony again
   (or "restore" to enter an existing phrase), then open **Add server**. Paste
   the full link into the single input and press **Next** — the screen probes
   the server, recognizes it as already set up, pre-fills the token, and labels
   the field "Invite token". Press **Add server** to join `#general`. (If you
   only have the server address, paste that instead: the screen still probes
   and asks for the right token kind on the next step — no manual claim-vs-invite
   toggle.)

3. **Chat in real time.** With both sessions on `#general`, send a message from
   one — it appears in the other without a refresh.

4. **Browse the component library.** In another terminal, serve the shared
   `app/ui/` library on port `:61000`:

   ```bash
   just ladle
   ```

   Browse to [`http://localhost:61000`](http://localhost:61000) and walk the
   stories — Button (primary / secondary / ghost, all sizes, disabled,
   loading), Card, Field, Input, mnemonic grid, etc. Every story reads the same
   tokens the production bundle uses; what you see here is what you get in the
   app.

5. **Optional: confirm native parity.** Start Metro, then launch a native
   target:

   ```bash
   cd apps/yawp/assets/native && npx react-native start --port 8081
   ```

   Then, in another terminal:

   ```bash
   just rn-ios
   # or: just rn-android
   # or: just rn-macos
   ```

   The native bundle renders the same screens with the same tokens. See
   `docs/design/native-parity-report.md` for the screenshot audit and any
   known per-platform deltas.

## What to look for

- **End-to-end flow works.** Operator setup → chat-owner claim → invite
  redemption by a second identity → live `#general` chat, all on a freshly
  reset instance.
- **Design system is applied everywhere.** Backgrounds use the `bg-bg` /
  `bg-surface` tokens (warm dark `#202831` / `#353E4B`), the accent is the
  chartreuse `#d8ee4d`, headings use the `font-display` family (Geist), body
  uses the default sans. The same tokens drive web and native.
- **Component library completeness.** Every primitive consumed by the app
  screens has a Ladle story covering its default, disabled, and active states.
- **Mnemonic suggestion dropdown is an overlay.** When typing into a
  recovery-phrase field, the suggestions appear above the input as an overlay;
  the surrounding layout does NOT shift.
- **Mobile viewport behaves.** Resize the browser to 375×812 (Chrome DevTools
  device-mode → iPhone 13/14) and walk the same flow. No horizontal overflow,
  the channel composer stays anchored, the mnemonic grid reflows to 3×4.
- **Native parity.** If you booted a native target, the same screens look
  visually equivalent to web at 375×812. Known per-platform deltas (font
  fallback on Android, status-bar overlap on iOS) are catalogued in
  `docs/design/native-parity-report.md`.

## What changed recently

- Tailwind v4 `@theme` token block (`apps/yawp/assets/css/app.css`) carries the
  current palette, all referencing the single token source in `tokens.css`.
- NativeWind v4 reads the same tokens, so RN bundles match web pixel-for-pixel.
- Shared component library at `apps/yawp/assets/app/ui/` — RN-first,
  web-rendered via `react-native-web`, browsable in Ladle.
- Every app screen re-skinned to consume tokens and the shared components —
  onboarding choice / display-name / mnemonic / passphrase / recovery /
  complete, home, channel, DID, admin, add-server, invites.
- Mnemonic-suggestions dropdown converted to an overlay (no layout push).
- Add-server is now paste-first and server-state-driven: paste a full invite
  or claim link to join in one step, or enter a server address and the screen
  probes `/.well-known/yawp/server-info` to decide whether to ask for a claim
  token (unclaimed) or an invite token (claimed). The old claim-vs-invite
  toggle is gone. Operator console now offers Copy-link / Copy-app-link buttons
  next to claim tokens and invites.
- Completed slate→token sweep on the onboarding and vector-test screens
  (`OnboardingChoiceScreen`, `OnboardingDisplayNameScreen`,
  `OnboardingCompleteScreen`, `VectorTestScreen`) — the last legacy
  `bg-slate-*` / `text-slate-*` references are gone.
- Native iOS / Android / macOS bundles boot, render, and were
  screenshot-audited; divergence report at
  `docs/design/native-parity-report.md`.

## What is NOT here yet

- Channels beyond `#general` (create / list / archive).
- Per-chat roles (member / moderator / owner).
- Bans / kicks / message moderation.
- Channel-scoped room invites (distinct from server-level join invites).

These aren't available yet. The walkthrough above is the full demoable path
today.

## Troubleshooting

- **Ladle port `:61000` already in use.** Check what's listening:
  `lsof -i :61000`. If it's a stale Ladle process from a previous run, kill it
  by PID. If it's another tool of yours, start Ladle on a different port:
  `cd apps/yawp/assets/native && npx ladle serve --port 61001`.

- **Geist (the display font) doesn't load.** On web, the font is loaded via the
  `@theme` block in `app.css`; if your browser shows the fallback sans, do a
  hard reload (Cmd-Shift-R) to bust the cache. Confirm the bundle includes the
  font by inspecting the request panel for `priv/static/assets/*.woff2`.

- **React Native font fallback (Android).** Android lacks Geist by default; the
  bundle falls back to the platform sans. This is expected and documented in
  `docs/design/native-parity-report.md`. Installing the display font as a
  system resource on Android isn't wired up yet.

- **No `OPERATOR SETUP` banner in the boot log.** The banner prints only on a
  fresh instance. `just demo` resets the database first, so if you don't see
  it, scroll up — it prints once early in boot. To force a clean slate without
  the rest of the demo wrapper, run `just db-reset` then `just dev`.
