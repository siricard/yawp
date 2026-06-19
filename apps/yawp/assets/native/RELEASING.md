# Native app distribution

This guide describes how to prepare Yawp native builds for Apple TestFlight and the Google Play internal testing track. It is documentation-only: the repository does not currently include Fastlane lanes, release signing assets, App Store Connect setup, Play Console setup, or an automated upload command.

## App identifiers

Use the existing native identifiers unless the store records are deliberately renamed:

| Platform | Identifier |
| --- | --- |
| iOS | `ca.simonricard.YawpNative` |
| macOS | `ca.simonricard.YawpNative` |
| Android | `com.yawpnative` |

The iOS and macOS Xcode projects currently use Apple development team `5V3LQJXXTW`. The Android Gradle namespace and application ID are both `com.yawpnative`.

## Signing prerequisites

### Apple

Before uploading to TestFlight:

1. Enroll the account or organization in the Apple Developer Program.
2. Create matching bundle identifiers in Certificates, Identifiers & Profiles for the iOS app and, if distributed separately, the macOS app.
3. Enable required app capabilities for the bundle identifiers, including Keychain sharing for the iOS target.
4. Create or refresh App Store distribution certificates and provisioning profiles, or enable automatic signing in Xcode for the release archive.
5. Create the App Store Connect app record with the same bundle identifier, SKU, privacy metadata, export compliance answers, and internal testers.

### Google Play

Before uploading to the Play internal testing track:

1. Create the app in Play Console with package name `com.yawpnative`.
2. Enable Play App Signing.
3. Create an upload key and configure Gradle release signing for that key. The current `release` build type still signs with the debug keystore and must be changed before a Play upload.
4. Complete the required store listing, app access, data safety, content rating, and target audience declarations.
5. Add internal testers or tester groups.

## Staging server expectations

Distribution candidates should point at staging anchors through user-entered `https://` server URLs in the Add Server flow. Do not ship a build with a hardcoded staging URL, localhost default, or cleartext fallback for non-loopback hosts.

Expected staging URLs use HTTPS and WSS:

```text
https://anchor-a.staging.example
https://anchor-b.staging.example
```

The server-info probe, RPC calls, attachments, and WebSocket connections must derive from the entered server URL. Release builds should connect to staging over public TLS without ATS or Android cleartext exceptions for arbitrary hosts.

## Build commands

Run these from the repository root after installing dependencies with `just setup` and keeping native CocoaPods current.

`just setup` also writes the local Xcode environment files that point React Native's bundle phase at the current Nix-provided Node binary. If you only need to refresh that hookup, run:

```bash
just setup-xcode-env
```

Run it again after `nix flake update` or any nixpkgs bump, because the generated files contain a machine-local Nix store path. The files are intentionally not committed.

For iOS and macOS, open the `.xcworkspace` files, not the `.xcodeproj` files. Opening the project directly skips CocoaPods integration and can show errors such as `DoubleConversion` not found.

### iOS archive for TestFlight

```bash
cd apps/yawp/assets/native
bundle exec pod install --project-directory=ios
xcodebuild \
  -workspace ios/YawpNative.xcworkspace \
  -scheme YawpNative \
  -configuration Release \
  -sdk iphoneos \
  -archivePath build/YawpNative-iOS.xcarchive \
  archive
```

Export the archive with an App Store export options plist:

```bash
xcodebuild \
  -exportArchive \
  -archivePath build/YawpNative-iOS.xcarchive \
  -exportPath build/ios-app-store \
  -exportOptionsPlist ios/ExportOptions-app-store.plist
```

`ios/ExportOptions-app-store.plist` is not committed yet. Create it locally with `method` set to `app-store-connect`, the correct signing style, team ID, and provisioning profile mapping.

### macOS archive

```bash
cd apps/yawp/assets/native
bundle exec pod install --project-directory=macos
xcodebuild \
  -workspace macos/YawpNative.xcworkspace \
  -scheme YawpNative-macOS \
  -configuration Release \
  -archivePath build/YawpNative-macOS.xcarchive \
  archive
```

The macOS app is not covered by TestFlight for iOS. Use the Mac App Store or notarized direct distribution once the desired lane is chosen.

### Android app bundle for Play

```bash
cd apps/yawp/assets/native/android
./gradlew clean bundleRelease
```

The distributable file is written under `app/build/outputs/bundle/release/`. Configure release signing before using this artifact in Play Console.

## Recommended upload lane

Fastlane is the recommended lane tool because it can keep Apple and Google uploads reproducible once the store accounts are ready. Fastlane is not installed or configured in this repository yet.

To adopt Fastlane later:

1. Install it locally with Bundler in `apps/yawp/assets/native/Gemfile`.
2. Run `bundle exec fastlane init` for iOS and Android.
3. Configure App Store Connect API key authentication for `pilot`.
4. Configure a Google Play service-account JSON file outside the repository for `supply`.
5. Add lanes that build from a clean working tree, archive/export the app, upload to TestFlight or the Play internal track, and never commit credentials or signing keys.

## TestFlight upload path

Recommended path after the archive exports successfully:

```bash
cd apps/yawp/assets/native
bundle exec fastlane pilot upload --ipa build/ios-app-store/YawpNative.ipa
```

Until Fastlane is added, use Xcode Organizer:

1. Open `apps/yawp/assets/native/ios/YawpNative.xcworkspace`.
2. Select the `YawpNative` scheme and a generic iOS device destination.
3. Choose Product > Archive.
4. In Organizer, validate the archive.
5. Distribute the app to App Store Connect.
6. In App Store Connect, add the build to an internal TestFlight group.

## Play internal-track upload path

Recommended path after `bundleRelease` succeeds and release signing is configured:

```bash
cd apps/yawp/assets/native
bundle exec fastlane supply \
  --aab android/app/build/outputs/bundle/release/app-release.aab \
  --track internal \
  --package_name com.yawpnative
```

Until Fastlane is added, use Play Console:

1. Open the app in Play Console.
2. Go to Testing > Internal testing.
3. Create or edit a release.
4. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
5. Review the release notes, tester access, and warnings.
6. Roll out to the internal testing track.

## What remains manual

- Store records and legal/compliance metadata.
- Apple certificates, provisioning profiles, and App Store Connect API keys.
- Android upload keystore and Play Console service-account credentials.
- Fastlane installation, `Fastfile` lanes, and CI wiring.
- Actual TestFlight or Play upload.
