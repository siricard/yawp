# Native parity screenshots

Per-platform PNG bundles of the re-skinned surfaces.

Layout:

- `ios/` — iPhone simulator captures (iOS 17 / iPhone 15 default size).
- `android/` — Android emulator captures (Pixel 7 / API 34 default size).
- `macos/` — macOS desktop captures (default react-native-macos window).

Surfaces to capture (one PNG per platform per surface, file named `<surface>.png`):

1. `home.png` — HomeScreen, post-onboarding, no servers bound.
2. `did.png` — DidScreen content (inside Home), with display-name and PK rendered.
3. `channel.png` — ChannelScreen, joined, with a couple of messages.
4. `add-server.png` — AddServerScreen, default tab.
5. `onboarding-mnemonic.png` — OnboardingMnemonicScreen on the display step (countdown visible).
6. `restore-mnemonic.png` — RestoreMnemonicScreen with the autocomplete overlay open on word 1.
7. `locked.png` — LockedScreen.
8. `passphrase-settings.png` — PassphraseSettingsScreen.

Capture method:

- iOS: `just rn-ios` → `cmd-S` in the simulator (or `xcrun simctl io booted screenshot ...`).
- Android: `just rn-android` → toolbar camera, or `adb exec-out screencap -p > <file>.png`.
- macOS: `just rn-macos` → `cmd-shift-4` over the app window.

These are reference assets only — not loaded by code, not gated by CI. The
companion analysis lives in `docs/design/native-parity-report.md`.
