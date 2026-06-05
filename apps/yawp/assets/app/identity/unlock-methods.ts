import {Platform} from 'react-native';

export type UnlockMethod =
  | 'biometric'
  | 'device_passcode'
  | 'passkey'
  | 'passphrase';

export type UnlockAvailability = {
  biometric: boolean;
  devicePasscode: boolean;
  passkey: boolean;
  passphrase: boolean;
};

export type UnlockAttempt =
  | {type: 'start'}
  | {type: 'biometric_unavailable'}
  | {type: 'biometric_declined'}
  | {type: 'biometric_failed'};

export type UnlockChoice = {
  primary: UnlockMethod | null;
  fallbacks: UnlockMethod[];
};

export function resolveUnlockChoice(
  availability: UnlockAvailability,
  attempts: UnlockAttempt[],
): UnlockChoice {
  const hasBiometric = availability.biometric;
  const biometricBlocked = attempts.some(
    attempt =>
      attempt.type === 'biometric_unavailable' ||
      attempt.type === 'biometric_declined' ||
      attempt.type === 'biometric_failed',
  );
  const fallbackSet = new Set<UnlockMethod>();
  if (availability.devicePasscode) fallbackSet.add('device_passcode');
  if (availability.passkey) fallbackSet.add('passkey');
  if (availability.passphrase) fallbackSet.add('passphrase');
  if (hasBiometric && !biometricBlocked) {
    return {primary: 'biometric', fallbacks: [...fallbackSet]};
  }
  if (Platform.OS === 'web' && availability.passkey) {
    fallbackSet.delete('passkey');
    return {primary: 'passkey', fallbacks: [...fallbackSet]};
  }
  const [primary, ...fallbacks] = [...fallbackSet];
  return {primary: primary ?? null, fallbacks};
}

export function defaultUnlockAvailability(): UnlockAvailability {
  const web = Platform.OS === 'web';
  return {
    biometric: !web,
    devicePasscode: !web,
    passkey:
      typeof navigator !== 'undefined' &&
      !!navigator.credentials &&
      typeof PublicKeyCredential !== 'undefined',
    passphrase: true,
  };
}

export async function detectUnlockAvailability(): Promise<UnlockAvailability> {
  const fallback = defaultUnlockAvailability();
  if (Platform.OS === 'web') return fallback;
  try {
    const Keychain = require('react-native-keychain');
    const [biometry, passcode] = await Promise.all([
      typeof Keychain.getSupportedBiometryType === 'function'
        ? Keychain.getSupportedBiometryType()
        : Promise.resolve(null),
      typeof Keychain.isPasscodeAuthAvailable === 'function'
        ? Keychain.isPasscodeAuthAvailable()
        : Promise.resolve(fallback.devicePasscode),
    ]);
    return {
      ...fallback,
      biometric: !!biometry,
      devicePasscode: !!passcode,
    };
  } catch {
    return fallback;
  }
}
