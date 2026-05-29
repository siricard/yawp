# Native (iOS / Android / macOS) parity report

After the shared component library (`apps/yawp/assets/app/ui/`) and the
Tailwind v4 / NativeWind design tokens landed, this pass boots all three
React Native targets on real simulators/emulators, captures each re-skinned
surface, and catalogs every place the native render differs from the web
render. Each divergence has an explicit disposition: **fixed**,
**accepted (with note)**, or **deferred**.

## How the bundles were booted

The shared screens in `apps/yawp/assets/app/screens/` are consumed by three
React Native shells:

- **iOS** — iPhone 17 Pro simulator (iOS 26.4). Built with `xcodebuild`,
  installed/launched with `xcrun simctl`, driven with `idb`.
- **Android** — Pixel-class emulator (API 36, arm64). Built with Gradle
  (`:app:assembleDebug`), installed/driven with `adb`.
- **macOS** — desktop window built with `xcodebuild`
  (`YawpNative-macOS` scheme) and launched as a native app.

Real screenshots are stored under
`docs/design/native-parity/{ios,android}/*.png`. The macOS window could not
be screenshotted from the automation session (the OS gates window capture
behind the Screen-Recording permission, which a non-interactive shell does
not hold). The macOS build/launch was verified instead, and the details are
in `docs/design/native-parity/macos/CAPTURE-STATUS.md`.

## Surfaces captured

| Surface | iOS | Android |
| --- | --- | --- |
| Onboarding choice (Create / Restore) | ✅ | ✅ |
| Recovery-phrase display (mnemonic gate, countdown) | ✅ | ✅ |
| Restore-from-recovery-phrase grid | ✅ | ✅ |
| Restore grid with autocomplete overlay open | ✅ | ✅ |
| Identity home (display name, DID, fingerprint, public key) | ✅ | ✅ |
| Add-server | (covered on Android) | ✅ |
| Locked screen (unlock with passphrase) | (covered on Android) | ✅ |
| Passphrase settings | ✅ | ✅ |

The identity home embeds the DID detail as its body (`HomeScreen` renders
`DidScreen`), so a single `home.png` per platform is the DID surface — display
name, DID + copy pill, fingerprint + copy/share, public key, and the
cross-platform vector card all fit on one screen.

`ChannelScreen` is not captured: it only renders meaningfully after binding a
device against a running anchor (server) and joining a channel, which needs a
live backend and a network round-trip beyond an offline UI boot. It shares
the same `ui/` primitives (Card, Input, Button, message rows) exercised by
the other surfaces, so it carries no divergence vector not already covered
below.

## Dependency work required to boot the native bundles

The native apps could not build at the start of this pass. Two pre-existing
blockers had to be resolved (they affected all three platforms, so without
this work no native screenshot was possible):

1. **Animation library vs. React Native version mismatch.**
   `react-native-reanimated@4.4.0` was pulled in transitively (by NativeWind's
   CSS-interop runtime) but requires a newer React Native than the app ships.
   CocoaPods aborted (`assert_minimal_react_native_version`) and Gradle aborted
   (`assertMinimalReactNativeVersionTask`). Reanimated is not imported anywhere
   in the shared app code. Pinned it to the `3.19.x` line, which satisfies the
   CSS-interop peer range and is flexible about the React Native version.

2. **Worklets native module duplicated on Android, and a single React Native
   copy needed in the bundle.**
   - The `3.x` animation line vendors its own worklets native classes, so the
     standalone worklets package (still needed for its Babel plugin on the JS
     side) must not also be auto-linked as a native module, or the Android dex
     merger fails on duplicate classes. Disabled its native autolinking in
     `react-native.config.js`.
   - The Metro bundler resolved two different copies of `react-native` (the
     web workspace copy and the native copy), which split the view-config
     registry and threw `View config getter callback for component RCTText
     must be a function (received undefined)` at runtime. Added `react-native`
     to the Metro singleton-dedup set so the native copy always wins.

After these changes the Jest suite, the singleton verifier, and both
TypeScript projects stay green, and all three native targets build and boot.

## Divergence vectors

### 1. Shadows — CSS box-shadow vs RN shadow / Android elevation

**Where:** `ui/Card.tsx` (elevated variant), `ui/Modal.tsx`, `ui/Toast.tsx`,
`ui/Autocomplete.tsx` (suggestion overlay).

**Web render:** CSS `box-shadow` driven by the `shadow-card` / `shadow-elev`
tokens; soft, multi-layer.

**Native render:** Each of those components also sets the equivalent RN
`shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` props
(iOS / macOS) and an `elevation` value (Android), derived from the same
tokens. iOS shadows render softer/warmer than the CSS spec, and Android
elevation ignores shadow color (it casts a default-tinted ambient/key drop).

**Disposition:** **accepted with note.** This is the platform-native shadow
API; pixel parity would need a third-party shadow library. Both renders read
as "lifted card on the same surface". Confirmed visually on the iOS and
Android captures.

### 2. `color-mix(in oklch, …)` and `oklch()` color functions

**Where:** Soft/hover brand variants, glow tokens, gradient tokens, focus-ring
token in `tokens.ts`.

**Web render:** Browsers resolve `color-mix(in oklch, …)` natively.

**Native render:** RN's StyleSheet / NativeWind class compiler does not
understand `color-mix()` or `oklch()`. None of the captured screens use these
tokens at runtime — they use the resolved hex tokens (`bg-bg`, `bg-surface`,
`bg-surface-2`, `bg-primary`, `text-text`, etc.). Alpha-channel banner
variants (`bg-warning/20`, `bg-success/20`, `bg-danger/20`, `bg-primary/20`)
use Tailwind's alpha syntax, which NativeWind supports — verified by the
singleton bundle build and visible on the captured screens.

**Disposition:** **accepted (no action needed).** A future surface that wants
gradient backgrounds on native will need a static fallback table; that is
**deferred** and out of scope here.

### 3. Backdrop blur

**Where:** Would apply to translucent overlays (Modal backdrop, Toast).

**Web render:** No `backdrop-blur` is currently in use. The Modal backdrop is
a solid scrim; Toast / Autocomplete overlays use opaque `surface` backgrounds.

**Native render:** No blurred translucent layer is rendered on any surface.

**Disposition:** **deferred / out of scope.** No surface in scope renders a
glass-style overlay, and a blur library is not on the dependency list. Revisit
only if a future surface explicitly calls for glass overlays.

### 4. Display font (Cal Sans)

**Where:** Headings using the `font-display` token (recovery-phrase display,
restore, locked, passphrase settings, add-server, DID).

**Web render:** Cal Sans is loaded as a webfont; headings render in the
display weight.

**Native render:** Cal Sans is **not** packaged as a native font asset. RN
falls back to the next family in the stack — Geist (loaded via
`@expo-google-fonts/geist`) — then the platform default. Display headings on
native render in Geist bold rather than Cal Sans. This is visible when
comparing the iOS/Android headings to the web build.

**Disposition:** **accepted with note (deferred packaging).** The fallback
still reads as a distinct heading weight. Packaging Cal Sans as a native asset
needs an `.otf` import plus per-platform font-registration wiring, which is
bigger than this pass.

### 5. Safe-area handling (notch / status bar / home indicator)

**Where:** App root and every full-screen surface.

**Observed on device:** On the iPhone simulator the Dynamic Island overlaps
the top status-bar row; the workspace bar's add-server "+" tile sits partly
under it, which made that control hard to hit from automation. `App.tsx` sets
`StatusBar barStyle="light-content"` and uses `flex-1 bg-bg` for the root,
with no `SafeAreaProvider` / `SafeAreaView` wrapper. Each screen's generous
`paddingTop` keeps body content clear of the notch, but the very top control
row and the bottom input row are the exposed edges.

**Disposition:** **accepted with note (deferred).** `react-native-safe-area-context`
is already a dependency, so the fix is to wrap the shell in `<SafeAreaProvider>`
and switch the outer view to `<SafeAreaView edges={['top','bottom']}>`. That
touches the same root layout the existing test suite asserts against (via the
`app-root` node), so it warrants its own change with the tests updated in
lockstep.

### 6. Keyboard avoidance on Input / Autocomplete

**Where:** Channel send row, recovery-phrase verify inputs, restore grid,
add-server URL input, passphrase set/unlock inputs.

**Observed on device:** No `KeyboardAvoidingView` wrapper on any screen. The
autocomplete overlay positions itself with `top: '100%'` so it renders below
the focused input on both web and native; the restore grid uses a `ScrollView`
with `keyboardShouldPersistTaps="handled"` so suggestion taps don't dismiss
the keyboard. On the verify/restore screens the open overlay sits over the
field below it (visible in the autocomplete capture), so committing a word
before moving on is required — expected for an overlay anchored to its input.
On iOS the keyboard slides over the bottom of the screen; on Android the
default `adjustResize` shrinks the available height instead.

**Disposition:** **accepted with note (deferred).** The Android default is
acceptable; the iOS gap does not break any flow (the field stays usable). A
`KeyboardAvoidingView` on the channel send row would close the iOS gap and
wants its own focused review.

### 7. Legacy `bg-slate-*` classes on the app root

**Where:** `apps/yawp/assets/app/App.tsx` — the outermost view for each
top-level branch (onboarding / locked / ready).

**Disposition:** **fixed.** All three roots use the `bg-bg` design token, so
the background flash during a route transition matches the design system
rather than Tailwind's default `slate-900`. No tests assert the old class.

### 8. Render-blocking `RCTText` error from a duplicated `react-native`

**Where:** Whole app, at native runtime (not caught by Jest or the offline
bundle walk).

**Symptom:** `View config getter callback for component RCTText must be a
function (received undefined)` — the app rendered a red error instead of any
screen on both Android architectures.

**Cause:** Metro resolved two `react-native` installs (web workspace copy +
native copy), splitting the native view-config registry.

**Disposition:** **fixed.** `react-native` is now pinned to a single copy via
the Metro singleton-dedup set. After the fix every captured screen renders
correctly.

### 9. Leftover `bg-slate-*` on screens outside this pass

**Where:** A few onboarding/utility screens (display-name, choice, complete,
vector-test) still reference Tailwind's default `slate-*` palette rather than
design-system tokens.

**Disposition:** **deferred.** These were already outside the re-skin target
list. Filed as a non-blocking follow-up so they can be swapped to tokens in a
single tidy pass.

## Summary table

| Vector | Disposition |
| --- | --- |
| 1. Shadows (CSS vs RN/elevation) | accepted with note |
| 2. `color-mix` / `oklch` color functions | accepted (no action — unused at runtime) |
| 3. Backdrop blur | deferred / out of scope |
| 4. Cal Sans display font | accepted with note (deferred packaging) |
| 5. Safe-area (notch / home indicator) | accepted with note (deferred) |
| 6. Keyboard avoidance | accepted with note (deferred) |
| 7. Legacy `bg-slate-*` on app root | **fixed** |
| 8. Duplicated `react-native` → `RCTText` render crash | **fixed** |
| 9. Legacy `bg-slate-*` on out-of-scope screens | deferred |

## Verification

All three native targets build and boot:

- iOS: `xcodebuild -scheme YawpNative … build` → BUILD SUCCEEDED; app installed
  and driven through onboarding/restore to the identity home on the simulator.
- Android: `./gradlew :app:assembleDebug` → BUILD SUCCESSFUL; app installed and
  driven through onboarding to home, add-server, locked, and passphrase
  settings on the emulator.
- macOS: `xcodebuild -scheme YawpNative-macOS … build` → BUILD SUCCEEDED; app
  launched with a confirmed on-screen window (see
  `docs/design/native-parity/macos/CAPTURE-STATUS.md`).

JavaScript checks stay green after the dependency and config changes:

```
$ cd apps/yawp/assets/native && npm test
Test Suites: 26 passed, 26 total
Tests:       236 passed, 236 total

$ just verify-singletons
verify-singletons: OK — all singletons resolved to a single path in every platform bundle.
```
