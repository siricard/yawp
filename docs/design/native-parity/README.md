# Native parity screenshots

Per-platform PNG captures of the re-skinned surfaces, taken on real
simulators/emulators.

Layout:

- `ios/` — iPhone simulator captures (iPhone 17 Pro, iOS 26.4).
- `android/` — Android emulator captures (API 36, arm64).
- `macos/` — macOS desktop. The window was built and launched but could not be
  screenshotted from the automation session; see `macos/CAPTURE-STATUS.md` for
  the build/launch evidence and the OS permission that blocks capture.

Surfaces (file `<surface>.png`):

1. `onboarding-choice.png` — Create / Restore landing.
2. `onboarding-mnemonic.png` — recovery-phrase display with the countdown.
3. `restore-mnemonic.png` — restore grid (12 word inputs).
4. `restore-mnemonic-autocomplete.png` — restore grid with the suggestion
   overlay open on a word.
5. `home.png` — identity home; this surface embeds the DID detail (display
   name, DID + copy pill, fingerprint + copy/share, public key, vector card).
6. `channel.png` — `#general` channel: header (channel name + anchor label +
   connection-status pill), message rows, and the bottom composer.
7. `add-server.png` — add-server form (server URL, token kind, submit/cancel).
8. `locked.png` — locked screen / unlock prompt.
9. `passphrase-settings.png` — passphrase settings.

iOS and Android cover the same surface set (iOS via `idb` / `simctl`, Android
via `adb`); together they exercise every surface and divergence vector. The
companion analysis lives in `docs/design/native-parity-report.md`.

These are reference assets only — not loaded by code, not gated by CI.

## How captures were taken

- iOS: `xcrun simctl io booted screenshot <file>.png` while driving the app
  with `idb ui tap` / `idb ui text`.
- Android: `adb exec-out screencap -p > <file>.png` while driving with
  `adb shell input`.
- macOS: requires the Screen-Recording permission; run `just rn-macos` on a
  workstation that has granted it and use `screencapture -l <windowID>`.
