/**
 * Unit tests for the shared identity module. The native bundler picks the
 * `react-native-keychain` storage backend; we mock that package with a tiny
 * in-memory store so we can exercise generate / load / signing without
 * touching the OS keychain.
 *
 * These tests live under assets/app/ so they run from the shared codebase
 * (same code as production), and Jest is configured in assets/native/ to
 * pick them up via `roots`.
 */

jest.mock('react-native-keychain', () => {
  const store: Record<string, {username: string; password: string}> = {};
  let nextGetError: Error | null = null;
  return {
    __store: store,
    __failNextGet: (e: Error) => {
      nextGetError = e;
    },
    setGenericPassword: jest.fn(
      async (
        username: string,
        password: string,
        options?: {service?: string},
      ) => {
        const service = (options && options.service) || '__default__';
        store[service] = {username, password};
        return {service, storage: 'memory'};
      },
    ),
    getGenericPassword: jest.fn(async (options?: {service?: string}) => {
      if (nextGetError) {
        const err = nextGetError;
        nextGetError = null;
        throw err;
      }
      const service = (options && options.service) || '__default__';
      return store[service] || false;
    }),
    resetGenericPassword: jest.fn(async (options?: {service?: string}) => {
      const service = (options && options.service) || '__default__';
      delete store[service];
      return true;
    }),
  };
});

import {
  STORAGE_KEY,
  PK_FIELD,
  deriveDid,
  publicKeyFromSecret,
  getOrCreateIdentity,
  clearIdentity,
  signWithIdentity,
} from '../identity';
import vector from '../../../priv/test_vectors/identity.json';

declare const Buffer: {
  from: (bytes: Uint8Array) => {toString: (enc: string) => string};
};
declare const TextEncoder: {new (): {encode: (s: string) => Uint8Array}};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

describe('identity', () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  test('deriveDid matches the cross-platform fixture', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = publicKeyFromSecret(seed);
    expect(deriveDid(pk)).toBe(vector.did);
  });

  test('publicKeyFromSecret matches pk_hex byte-for-byte', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = publicKeyFromSecret(seed);
    expect(Buffer.from(pk).toString('hex')).toBe(vector.pk_hex);
  });

  test('getOrCreateIdentity persists across calls (cold-restart proxy)', async () => {
    const first = await getOrCreateIdentity();
    const second = await getOrCreateIdentity();
    expect(second.did).toBe(first.did);
    expect(Buffer.from(second[PK_FIELD]).toString('hex')).toBe(
      Buffer.from(first[PK_FIELD]).toString('hex'),
    );
  });

  test('signWithIdentity produces a 64-byte Ed25519 signature', async () => {
    await getOrCreateIdentity();
    const sig = await signWithIdentity(new TextEncoder().encode('hello'));
    expect(sig.length).toBe(64);
  });

  test('STORAGE_KEY is the documented contract', () => {
    expect(STORAGE_KEY).toBe('mook.identity.sk');
  });

  test('getOrCreateIdentity surfaces a keychain read failure instead of silently regenerating', async () => {
    const initial = await getOrCreateIdentity();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kc = require('react-native-keychain');
    const fakeErr = new Error(
      "internal error when a required entitlement isn't present",
    );
    kc.__failNextGet(fakeErr);

    await expect(getOrCreateIdentity()).rejects.toThrow(
      /Failed to read identity from keychain/,
    );

    const after = await getOrCreateIdentity();
    expect(after.did).toBe(initial.did);
  });
});
