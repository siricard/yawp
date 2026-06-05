import {Platform} from 'react-native';

import {
  defaultUnlockAvailability,
  resolveUnlockChoice,
} from '../identity/unlock-methods';

describe('unlock method fallback decisions', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalPlatform});
  });

  test('chooses biometrics first on native and exposes all configured fallbacks', () => {
    Object.defineProperty(Platform, 'OS', {value: 'ios'});
    const choice = resolveUnlockChoice(
      {
        biometric: true,
        devicePasscode: true,
        passkey: true,
        passphrase: true,
      },
      [{type: 'start'}],
    );

    expect(choice.primary).toBe('biometric');
    expect(choice.fallbacks).toEqual([
      'device_passcode',
      'passkey',
      'passphrase',
    ]);
  });

  test('falls back to passcode, passkey, and passphrase after biometric decline', () => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    const choice = resolveUnlockChoice(
      {
        biometric: true,
        devicePasscode: true,
        passkey: true,
        passphrase: true,
      },
      [{type: 'start'}, {type: 'biometric_declined'}],
    );

    expect(choice.primary).toBe('device_passcode');
    expect(choice.fallbacks).toEqual(['passkey', 'passphrase']);
  });

  test('chooses passkey first on web when platform credentials are available', () => {
    Object.defineProperty(Platform, 'OS', {value: 'web'});
    const choice = resolveUnlockChoice(
      {
        biometric: false,
        devicePasscode: false,
        passkey: true,
        passphrase: true,
      },
      [{type: 'start'}],
    );

    expect(choice.primary).toBe('passkey');
    expect(choice.fallbacks).toEqual(['passphrase']);
  });

  test('detects passkey availability from browser credential APIs', () => {
    const originalNavigator = global.navigator;
    const originalCredential = global.PublicKeyCredential;
    Object.defineProperty(Platform, 'OS', {value: 'web'});
    Object.defineProperty(global, 'navigator', {
      value: {credentials: {}},
      configurable: true,
    });
    Object.defineProperty(global, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      configurable: true,
    });

    expect(defaultUnlockAvailability()).toMatchObject({
      biometric: false,
      devicePasscode: false,
      passkey: true,
      passphrase: true,
    });

    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
    Object.defineProperty(global, 'PublicKeyCredential', {
      value: originalCredential,
      configurable: true,
    });
  });
});
