import * as Keychain from 'react-native-keychain';

import {saveIdentity} from '../identity/storage-bundle.native';
import type {IdentityBundleV1} from '../identity/bundle';

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

  test('stores the identity behind biometric-current-set access control and passcode-bound accessibility', async () => {
    await saveIdentity(bundle());

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
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
});
