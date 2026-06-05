import {clearIdentity} from '../identity';
import {
  IdentityProvider,
  useOnboarding,
  usePassphrase,
  useDisplayName,
} from '../identity-context';
import {loadStoredEntry} from '../identity/storage-bundle';
import {
  enrollPasskeySeal,
  unlockPasskeySeal,
  canUsePasskeyPrf,
} from '../identity/passkey';
import {bytesToB64Url, type IdentityBundleV1} from '../identity/bundle';

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const PASSPHRASE = 'correct horse battery staple';

function bytes(length: number, offset: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < out.length; i++) out[i] = (i + offset) & 0xff;
  return out;
}

function makeBundle(): IdentityBundleV1 {
  return {
    version: 1,
    master: {sk: bytesToB64Url(bytes(32, 1))},
    device: {
      deviceId: 'passkey-test-device',
      sk: bytesToB64Url(bytes(32, 40)),
      pk: bytesToB64Url(bytes(32, 80)),
      signature: bytesToB64Url(bytes(64, 120)),
      issuedAt: '2026-06-05T00:00:00.000Z',
    },
    metadata: {displayNameOverride: 'Passkey Test'},
  };
}

function installPasskeyAuthenticator(prf: Uint8Array) {
  const credentialId = bytes(32, 7);
  const makeCredential = () => ({
    rawId: credentialId.buffer.slice(0),
    getClientExtensionResults: () => ({
      prf: {results: {first: prf.buffer.slice(0)}},
    }),
  });
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable: jest
        .fn()
        .mockResolvedValue(true),
      getClientCapabilities: jest.fn().mockResolvedValue({prf: true}),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      credentials: {
        create: jest.fn().mockResolvedValue(makeCredential()),
        get: jest.fn().mockResolvedValue(makeCredential()),
      },
    },
  });
}

function installRandom() {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: (target: Uint8Array) => {
        for (let i = 0; i < target.length; i++) target[i] = (i * 13 + 9) & 0xff;
        return target;
      },
    },
  });
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

type Handles = {
  complete: ReturnType<typeof useOnboarding>['complete'];
  finish: ReturnType<typeof useOnboarding>['finish'];
  enrollPasskey: ReturnType<typeof usePassphrase>['enrollPasskey'];
  unlockWithPasskey: ReturnType<typeof usePassphrase>['unlockWithPasskey'];
  unlock: ReturnType<typeof usePassphrase>['unlock'];
  changePassphrase: ReturnType<typeof usePassphrase>['changePassphrase'];
  setDisplayNameOverride: ReturnType<typeof useDisplayName>['setDisplayNameOverride'];
  displayName: string | null;
  passkeyEnrolled: boolean;
};

function makeHarness() {
  const handles: {current: Handles | null} = {current: null};
  function Probe() {
    const {complete, finish} = useOnboarding();
    const {
      enrollPasskey,
      unlockWithPasskey,
      unlock,
      changePassphrase,
      passkeyEnrolled,
    } = usePassphrase();
    const {setDisplayNameOverride, displayName} = useDisplayName();
    handles.current = {
      complete,
      finish,
      enrollPasskey,
      unlockWithPasskey,
      unlock,
      changePassphrase,
      setDisplayNameOverride,
      displayName,
      passkeyEnrolled,
    };
    return null;
  }
  return {handles, Probe};
}

describe('web passkey identity seal', () => {
  const originalNavigator = globalThis.navigator;
  const originalCredential = (globalThis as any).PublicKeyCredential;
  const originalCrypto = globalThis.crypto;

  beforeEach(async () => {
    installRandom();
    installPasskeyAuthenticator(bytes(32, 200));
    await clearIdentity();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: originalCredential,
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  test('enrolls a passkey wrap and unlocks the identity bundle from the assertion PRF', async () => {
    const bundle = makeBundle();
    const passkey = await enrollPasskeySeal(bundle);
    expect(passkey.credentialId).toBeTruthy();
    expect(passkey.envelope).toBeDefined();
    const unsealed = await unlockPasskeySeal(passkey);
    expect(unsealed.bundle).toEqual(bundle);
    expect(JSON.stringify(passkey)).not.toContain(bundle.master.sk);
    expect(JSON.stringify(passkey)).not.toContain(bundle.device.sk);
  });

  test('adds passkey unlock alongside an existing passphrase seal', async () => {
    const {handles, Probe} = makeHarness();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await handles.current!.complete({passphrase: PASSPHRASE, displayName: null});
      handles.current!.finish();
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      const result = await handles.current!.enrollPasskey();
      expect(result).toEqual({ok: true});
      await handles.current!.setDisplayNameOverride('Passkey After Rekey');
    });
    expect(handles.current!.passkeyEnrolled).toBe(true);
    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind !== 'sealed') throw new Error('expected sealed');
    expect(entry!.envelope.passkey).toBeDefined();
    expect(entry!.envelope.passkey!.wrappedSealKey).toBeDefined();
    expect(entry!.envelope.passkey!.envelope).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });

    const remount = makeHarness();
    const RemountProbe = remount.Probe;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <RemountProbe />
        </IdentityProvider>,
      );
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      const result = await remount.handles.current!.unlockWithPasskey();
      expect(result).toEqual({ok: true});
    });
    await ReactTestRenderer.act(async () => {
      const result = await remount.handles.current!.changePassphrase({
        current: PASSPHRASE,
        next: 'next correct horse',
      });
      expect(result).toEqual({ok: true});
    });
    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });

    const secondRemount = makeHarness();
    const SecondRemountProbe = secondRemount.Probe;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <SecondRemountProbe />
        </IdentityProvider>,
      );
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      const result = await secondRemount.handles.current!.unlockWithPasskey();
      expect(result).toEqual({ok: true});
    });
    expect(secondRemount.handles.current!.displayName).toBe('Passkey After Rekey');
    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('passkey unlock reads the current passphrase envelope after metadata changes', async () => {
    const {handles, Probe} = makeHarness();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await handles.current!.complete({passphrase: PASSPHRASE, displayName: null});
      handles.current!.finish();
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      expect(await handles.current!.enrollPasskey()).toEqual({ok: true});
      await handles.current!.setDisplayNameOverride('Fresh Passkey Name');
    });

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });

    const remount = makeHarness();
    const RemountProbe = remount.Probe;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <RemountProbe />
        </IdentityProvider>,
      );
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      expect(await remount.handles.current!.unlockWithPasskey()).toEqual({ok: true});
    });
    expect(remount.handles.current!.displayName).toBe('Fresh Passkey Name');
    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('detects missing PRF support before enrollment prompts', async () => {
    (globalThis as any).PublicKeyCredential.getClientCapabilities = jest
      .fn()
      .mockResolvedValue({prf: false});
    await expect(canUsePasskeyPrf()).resolves.toBe(false);
    expect((globalThis.navigator as any).credentials.create).not.toHaveBeenCalled();
  });

  test('reports unavailable when browser credential APIs are missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    await expect(canUsePasskeyPrf()).resolves.toBe(false);
  });
});
