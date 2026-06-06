import * as Keychain from 'react-native-keychain';

import {
  loadSealedEnvelopeFallback,
  loadStoredEntryWithBiometrics,
  loadStoredEntryWithDevicePasscode,
  saveSealedEnvelope,
  saveIdentity,
} from '../identity/storage-bundle.native';
import {STORAGE_KEY_V1, type IdentityBundleV1} from '../identity/bundle';

function bundle(): IdentityBundleV1 {
  return {
    version: 1,
    master: {sk: 'master-secret'},
    device: {
      deviceId: 'device-1',
      sk: 'device-secret',
      pk: 'device-public',
      signature: 'signature',
      issuedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('native identity keychain policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stores the identity behind biometric-or-passcode access control and passcode-bound accessibility', async () => {
    await saveIdentity(bundle());

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        accessControl:
          Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
        accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
        authenticationType:
          Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
        authenticationPrompt: expect.objectContaining({
          title: 'Unlock Yawp',
          cancel: 'Use another method',
        }),
      }),
    );
  });

  test('uses biometric-only options when explicitly retrying biometric unlock', async () => {
    await saveIdentity(bundle());
    await loadStoredEntryWithBiometrics();

    expect(Keychain.getGenericPassword).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
      }),
    );
  });

  test('uses passcode-capable options when explicitly retrying passcode unlock', async () => {
    await saveIdentity(bundle());
    await loadStoredEntryWithDevicePasscode();

    expect(Keychain.getGenericPassword).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessControl:
          Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
        authenticationType:
          Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
      }),
    );
  });

  test('keeps a sealed envelope readable for passphrase fallback after keychain cancellation', async () => {
    await saveSealedEnvelope(
      {
        version: 2,
        sealed: true,
        salt: 'AAAAAAAAAAAAAAAAAAAAAA',
        nonce: 'AAAAAAAAAAAAAAAA',
        ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      'did:yawp:z6MkNative',
    );

    const entry = await loadSealedEnvelopeFallback();

    expect(entry).toMatchObject({
      kind: 'sealed',
      didPrefix: 'did:yawp:z6MkNative',
    });
    expect(Keychain.setGenericPassword).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        service: expect.stringContaining('.sealed'),
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  test('backfills the passphrase fallback service after reading an existing sealed keychain item', async () => {
    await Keychain.setGenericPassword(
      STORAGE_KEY_V1,
      JSON.stringify({
        version: 2,
        sealed: true,
        salt: 'AAAAAAAAAAAAAAAAAAAAAA',
        nonce: 'AAAAAAAAAAAAAAAA',
        ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        didPrefix: 'did:yawp:z6MkUpgraded',
      }),
      {
        service: STORAGE_KEY_V1,
        accessControl:
          Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      },
    );

    await loadStoredEntryWithBiometrics();
    const fallback = await loadSealedEnvelopeFallback();

    expect(fallback).toMatchObject({
      kind: 'sealed',
      didPrefix: 'did:yawp:z6MkUpgraded',
    });
    expect(Keychain.setGenericPassword).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        service: expect.stringContaining('.sealed'),
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });
});
