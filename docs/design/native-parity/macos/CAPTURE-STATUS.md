# macOS capture status

The macOS desktop build was compiled and launched successfully during this
parity pass:

- `xcodebuild -scheme YawpNative-macOS -configuration Debug` → **BUILD SUCCEEDED**.
- The app process started and stayed alive (no render crash in the unified log —
  only benign `AppIntents` / XPC `linkd.autoShortcut` warnings).
- A real application window was confirmed on screen at **1152×678** via
  `CGWindowListCopyWindowInfo` (window number 21543, owner `YawpNative`).

PNG screenshots of the macOS window could **not** be saved from this automation
session. Every capture path the OS exposes is gated behind the Screen-Recording
TCC permission, which a non-interactive shell here does not hold:

- `screencapture -x` (full display) → `could not create image from display`.
- `screencapture -l <windowID>` (single window) → `could not create image from window`.
- `CGWindowListCreateImage` → obsoleted in macOS 15; the replacement
  `ScreenCaptureKit` also requires the same Screen-Recording entitlement.

The iOS simulator and Android emulator have no such restriction (simulator
framebuffer / `adb screencap` write PNGs directly), so the `ios/` and `android/`
directories hold real captures. Because the shared React tree renders
identically across the three React-Native targets at runtime, the iOS and
Android captures are representative of the macOS render; the only known macOS
delta is window chrome and the display-font fallback noted in
`../../native-parity-report.md`.

To capture macOS manually on a workstation with Screen-Recording granted:

```
just rn-macos          # boots Metro + the desktop app
screencapture -l $(/usr/bin/swift - <<'EOF'
import CoreGraphics
let wl = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String:Any]]
print(wl.first{ ($0[kCGWindowOwnerName as String] as? String) == "YawpNative" }![kCGWindowNumber as String]!)
EOF
) macos/<surface>.png
```
