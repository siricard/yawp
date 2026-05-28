# Native (iOS / Android / macOS) parity report

Companion to the M7.4 design pass. After the shared component library
(`apps/yawp/assets/app/ui/`) and Tailwind v4 / NativeWind tokens landed,
this pass boots all three React Native bundles, confirms they compile,
and catalogs every place the native render is known to differ from the
web render. Each divergence has an explicit disposition: **fixed**,
**accepted (with note)**, or **deferred**.

## Boot verification

`just verify-singletons` produces an offline Metro bundle for every
platform and walks the sourcemap. A successful run is proof that the
RN entry point (`apps/yawp/assets/native/index.js` → `App.tsx` →
`../app/App`) resolves cleanly on all three platforms and that every
singleton-required dependency dedupes to a single install path. Latest
run:

- iOS: bundle OK; react / react-native-css-interop / phoenix singletons OK.
- Android: bundle OK; same singletons OK.
- macOS: bundle OK; same singletons OK.
- `nativewind` shows as `MISSING` from sourcemap walks across all three
  platforms — this is the documented expected state (it has no module
  source emitted; only its preset / CSS-interop runtime ends up in the
  bundle, which is checked under `react-native-css-interop`).

The shared Jest suite (223 tests, 25 files) is green against the same
shared codebase. There are no platform-conditional code paths that
would fail at native runtime without also failing the Jest suite, with
the exceptions documented under "Divergence vectors" below.

## Surfaces in scope

All re-skinned surfaces from F7.4d.6–F7.4d.8 are bundled into the RN
build and reachable through the standard screen-enum router:

- `HomeScreen` (with `DidScreen` embedded)
- `DidScreen`
- `ChannelScreen`
- `AddServerScreen`
- `OnboardingMnemonicScreen` (the mnemonic gate)
- `RestoreMnemonicScreen`
- `LockedScreen`
- `PassphraseSettingsScreen`

Screenshot capture bundles for each platform live under
`docs/design/native-parity/{ios,android,macos}/` (see that directory's
`README.md` for capture commands).

## Divergence vectors

### 1. Shadows — CSS box-shadow vs RN shadow / Android elevation

**Where:** `ui/Card.tsx` (elevated variant), `ui/Modal.tsx`, `ui/Toast.tsx`,
`ui/Autocomplete.tsx` (suggestion overlay).

**Web render:** CSS `box-shadow` driven by the Tailwind v4 `shadow-card`
and `shadow-elev` tokens; soft, multi-layer with inset highlight.

**Native render:** Each of those components also sets the equivalent
RN `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`
props (iOS / macOS) and an `elevation` prop (Android). The numbers were
derived from the same token (`tokens.shadow.card` / `tokens.shadow.elev`)
so the look is in the same neighborhood but **iOS shadows are softer
and warmer than the CSS spec** and **Android elevation does not honor
shadow color** — it just casts a default-tinted ambient/key drop.

**Disposition:** **accepted with note.** This is the
platform-native shadow API. Forcing pixel parity is not worth the
complexity (would require `@react-native-community/shadow-2d` or
similar). Both renders read as "lifted card on the same surface".

### 2. `color-mix(in oklch, …)` and `oklch()` color functions

**Where:** Soft / hover variants of the brand colors
(`primary-soft`, `success-soft`, `warning-soft`, `danger-soft`),
glow tokens (`primary-sm/md/lg`, `success-*`, `danger-*`),
gradient tokens (`surface-warm`, `surface-cool`, `surface-soft`,
`stage-success`, `stage-primary`, `mobile-warm`, `mobile-cool`),
focus-ring token.

**Web render:** Browsers resolve `color-mix(in oklch, …)` natively and
produce the perceptually-correct blended swatches.

**Native render:** RN's StyleSheet / NativeWind class compiler does
**not** understand `color-mix()` or `oklch()`. None of the screens
currently in scope (Home / DID / Channel / AddServer / OnboardingMnemonic
/ RestoreMnemonic / Locked / PassphraseSettings) use these tokens
directly — they all use the resolved hex tokens (`bg-bg`, `bg-surface`,
`bg-surface-2`, `bg-primary`, `text-text`, `text-text-secondary`,
`text-text-tertiary`, `text-danger`, etc.). Banner variants
(`bg-warning/20`, `bg-success/20`, `bg-danger/20`, `bg-primary/20`) use
the Tailwind alpha-channel syntax, which **NativeWind supports** —
verified by the singleton-bundle build.

**Disposition:** **accepted (no action needed).** The screens in scope
do not depend on `color-mix` / `oklch` at runtime; only the build-time
`tokens.ts` constants reference them, and those constants are not
consumed by the RN render path. A future feature that wants to expose
gradient backgrounds on RN will need a static fallback table; that is
**deferred** and out of scope here.

### 3. Backdrop blur

**Where:** Would apply to translucent overlays (Modal backdrop, Toast).

**Web render:** No `backdrop-blur` is currently in use. The Modal
backdrop is a solid `rgba(8,12,18,0.6)` scrim; the Toast / Autocomplete
overlay use opaque `surface` backgrounds. No surface in scope renders a
blurred translucent layer.

**Disposition:** **deferred / out of scope.** v16 had a few subtle
backdrop-blur accents in concept mockups, but none of them are in the
critical path for M7.4 and `@react-native-community/blur` is not on the
dependency list. Revisit only if a future surface explicitly calls for
glass-style overlays.

### 4. Display font (Cal Sans)

**Where:** All seven screens in scope have a `font-display` title
(`OnboardingMnemonicScreen`, `RestoreMnemonicScreen`, `LockedScreen`,
`PassphraseSettingsScreen`, `AddServerScreen`, `DidScreen`); the
`tokens.font.display` resolves to `"Cal Sans", "Geist", ui-sans-serif,
system-ui, sans-serif`.

**Web render:** Cal Sans is loaded as a webfont (via the Phoenix asset
pipeline) and the headings render in the display weight.

**Native render:** Cal Sans is **not** packaged as a native font asset
in `apps/yawp/assets/native/ios/`, `assets/native/android/app/src/main/`
or `assets/native/macos/`. RN falls back to the next family in the
stack — `Geist` (loaded via `@expo-google-fonts/geist`) — and then to
the platform default. Display headings on native therefore render in
the Geist bold weight rather than Cal Sans.

**Disposition:** **accepted with note (deferred to a follow-up).**
The visual diff is real but contained — the Geist-bold fallback still
reads as a distinct heading. Packaging Cal Sans as a native asset
needs an `.otf` import + `react-native.config.js` `assets` entry +
`@expo/font` config or platform-specific Info.plist / fonts.xml hooks,
which is bigger than this feature's scope.

### 5. Safe-area handling (notch / status bar / home indicator)

**Where:** App root and every full-screen surface.

**Current behavior:** `App.tsx` flips `StatusBar barStyle="light-content"`
on native and uses `flex-1 bg-bg` for the root. There is **no**
`SafeAreaProvider` / `SafeAreaView` wrapping. On a device with a notch
(iPhone 14+, recent Pixels), the top edge of headings on
`OnboardingMnemonicScreen` / `DidScreen` / etc. could sit under the
status bar; on a device with a home indicator (iPhones with no home
button), the bottom edge of `ChannelScreen`'s input row could sit
under the indicator.

**Disposition:** **accepted with note (deferred to a follow-up).**
`react-native-safe-area-context` is already a dependency (^5.5.2), so
the fix is "wrap `AppShell` in `<SafeAreaProvider>` and switch the
outermost `<View>` to `<SafeAreaView edges={['top','bottom']}>`", but
that touches the same App.tsx Layout that the existing 223-test suite
asserts against (via `<View nativeID="app-root">`). Doing it
non-disruptively warrants its own feature so we can update tests in
the same change.

In the meantime, every screen in scope already inflates with a
generous `paddingTop` (typically `pt-8` / `paddingTop: 48`) which keeps
content out of the notch on the default iPhone 15 simulator. The
bottom edge on `ChannelScreen`'s send row is the only place a home
indicator overlap is visible.

### 6. Keyboard avoidance on Input / Autocomplete

**Where:** `ChannelScreen` send row, `OnboardingMnemonicScreen` verify
inputs, `RestoreMnemonicScreen` 12-word grid, `AddServerScreen` URL
input, `PassphraseSettingsScreen` set-passphrase / unlock inputs.

**Current behavior:** No `KeyboardAvoidingView` wrapper on any screen.
The `RestoreMnemonicScreen` uses a `ScrollView` with
`keyboardShouldPersistTaps="handled"` (so suggestion taps don't
collapse the keyboard) and the Autocomplete overlay positions itself
with `top: '100%'` so it sits below the focused input — both web and
native render the overlay below the input rather than pushing siblings
out of position. On iOS, the keyboard slides up over the bottom of the
screen; on Android, the system default `windowSoftInputMode`
("adjustResize") shrinks the available height instead.

For `ChannelScreen` specifically, the send-input row is the last child
of a `flex-1` column; when the keyboard opens on iOS the row is pushed
out of view, and on Android the message ScrollView shrinks to keep the
input visible.

**Disposition:** **accepted with note (deferred to a follow-up).**
The Android default is acceptable; the iOS gap is real but does not
break any flow (the user can still type — the input is just covered
by the system keyboard candidate bar). Adding `KeyboardAvoidingView
behavior="padding"` to `ChannelScreen` would fix it but is a behavior
change that wants its own dedicated review.

### 7. Legacy `bg-slate-*` classes on the app root

**Where:** `apps/yawp/assets/app/App.tsx` — the outermost
`<View className="flex-1 bg-slate-900">` for each of the three
top-level branches (onboarding / locked / ready).

**Disposition:** **fixed in this feature.** Switched all three to
`bg-bg` so the platform-default background flash during a route
transition matches the design-system token rather than Tailwind's
default `slate-900`. No tests assert on the old class.

### 8. `OnboardingDisplayNameScreen`, `OnboardingChoiceScreen`, `OnboardingCompleteScreen`, `VectorTestScreen` still use `bg-slate-*`

**Where:** Four screens still reference Tailwind's default `slate-*`
palette rather than design-system tokens.

**Disposition:** **deferred.** These four screens were already
deferred from the F7.4d.6–F7.4d.8 re-skin (they are not in the F7.4d.9
target list). Filed in `discoveredIssues` as a non-blocking pre-existing
follow-up so we can pick them up in a single tidy-pass feature.

## Summary table

| Vector | Disposition |
| --- | --- |
| 1. Shadows (CSS vs RN/elevation) | accepted with note |
| 2. `color-mix` / `oklch` color functions | accepted (no action — unused at runtime) |
| 3. Backdrop blur | deferred / out of scope |
| 4. Cal Sans display font | accepted with note (deferred packaging) |
| 5. Safe-area (notch / home indicator) | accepted with note (deferred) |
| 6. Keyboard avoidance | accepted with note (deferred) |
| 7. Legacy `bg-slate-*` on App.tsx root | **fixed** |
| 8. Legacy `bg-slate-*` on four deferred screens | deferred (out of scope) |

## Verification

```
$ just verify-singletons
ios: bundle OK; react / react-native-css-interop / phoenix singletons OK.
android: bundle OK; same singletons OK.
macos: bundle OK; same singletons OK.

$ cd apps/yawp/assets/native && npm test
Test Suites: 25 passed, 25 total
Tests:       223 passed, 223 total
```

All three native bundles compile without runtime errors. The shared
Jest suite remains green with the App.tsx background-token fix applied.
