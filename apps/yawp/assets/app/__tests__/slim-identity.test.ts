/**
 * slim client identity tests.
 *
 * Covers:
 * 1. master key shape (Noble returns 32-byte sk + 32-byte pk).
 * 2. DID derivation matches the cross-platform fixture.
 * 3. fingerprintFromPubkey matches the documented format.
 * 4. Round-trip save → load preserves the bundle byte-for-byte.
 * 5. Device subkey signatures are 64 bytes and verify against the
 * device pk via @noble/ed25519.verify.
 * 6. Device delegation signature verifies against the master pk for the
 * canonical-JSON payload shape `{device_id, pk, issued_at}`.
 *
 * The native keychain mock is provided by `jest.setup.js`; we additionally
 * clear it between tests so each test starts from a known-empty state.
 */

import * as ed from '@noble/ed25519';
import {sha512, sha256} from '@noble/hashes/sha2.js';

import {canonicalJson} from '../canonical-json';
import {generateMaster, masterPkFromSk} from '../identity/master';
import {
  deviceDelegationMessage,
  generateDeviceSubkey,
  signWithDevice,
} from '../identity/device';
import {didFromPubkey, fingerprintFromPubkey} from '../identity/did';
import {
  bytesToB64Url,
  b64UrlToBytes,
  type IdentityBundleV1,
} from '../identity/bundle';
import {
  loadIdentity,
  saveIdentity,
  clearIdentityBundle,
} from '../identity/storage-bundle';
import vector from '../../../priv/test_vectors/identity.json';

ed.hashes.sha512 = sha512;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('slim identity', () => {
  beforeEach(async () => {
    await clearIdentityBundle();
  });

  test('generateMaster returns a 32-byte sk + 32-byte pk Ed25519 keypair', () => {
    const {pk, sk} = generateMaster();
    expect(sk).toBeInstanceOf(Uint8Array);
    expect(pk).toBeInstanceOf(Uint8Array);
    expect(sk.length).toBe(32);
    expect(pk.length).toBe(32);
    const derived = masterPkFromSk(sk);
    expect(bytesEqual(derived, pk)).toBe(true);
  });

  test('didFromPubkey matches the cross-platform fixture', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = masterPkFromSk(seed);
    expect(didFromPubkey(pk)).toBe(`did:yawp:${vector.did}`);
  });

  test('fingerprintFromPubkey matches the format for a known vector', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = masterPkFromSk(seed);
    const fp = fingerprintFromPubkey(pk);

    const hash = sha256(pk);
    let hex = '';
    for (let i = 0; i < 16; i++) hex += hash[i].toString(16).padStart(2, '0');
    const expected =
      'yp:' +
      hex.slice(0, 4) +
      ' · ' +
      hex.slice(4, 8) +
      ' · ' +
      hex.slice(8, 12) +
      ' · ' +
      hex.slice(12, 16);
    expect(fp).toBe(expected);
    expect(fp).toMatch(/^yp:[0-9a-f]{4} · [0-9a-f]{4} · [0-9a-f]{4} · [0-9a-f]{4}$/);
  });

  test('save → load round-trips the bundle byte-for-byte', async () => {
    const master = generateMaster();
    const device = generateDeviceSubkey(master.sk, {
      deviceId: 'fixed-device-id',
      issuedAt: '2026-01-02T03:04:05.000Z',
    });
    const bundle: IdentityBundleV1 = {
      version: 1,
      master: {sk: bytesToB64Url(master.sk)},
      device: {
        deviceId: device.deviceId,
        sk: bytesToB64Url(device.sk),
        pk: bytesToB64Url(device.pk),
        signature: bytesToB64Url(device.signature),
        issuedAt: device.issuedAt,
      },
    };

    await saveIdentity(bundle);
    const loaded = await loadIdentity();

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(bundle);
    expect(bytesEqual(b64UrlToBytes(loaded!.master.sk), master.sk)).toBe(true);
    expect(bytesEqual(b64UrlToBytes(loaded!.device.pk), device.pk)).toBe(true);
  });

  test('signWithDevice produces a 64-byte signature verifiable by the device pk', () => {
    const master = generateMaster();
    const device = generateDeviceSubkey(master.sk);

    const message = new TextEncoder().encode('yawp-device-signing-test');
    const sig = signWithDevice(device.sk, message);

    expect(sig.length).toBe(64);
    expect(ed.verify(sig, message, device.pk)).toBe(true);
    const masterSig = ed.sign(message, master.sk) as Uint8Array;
    expect(ed.verify(masterSig, message, device.pk)).toBe(false);
  });

  test('device delegation signature verifies against the master pk', () => {
    const master = generateMaster();
    const device = generateDeviceSubkey(master.sk, {
      deviceId: 'verification-test-device',
      issuedAt: '2026-05-25T00:00:00.000Z',
    });

    const message = deviceDelegationMessage({
      deviceId: device.deviceId,
      devicePk: device.pk,
      issuedAt: device.issuedAt,
    });
    expect(new TextDecoder().decode(message)).toBe(
      canonicalJson({
        device_id: device.deviceId,
        pk: bytesToB64Url(device.pk),
        issued_at: device.issuedAt,
      }),
    );

    expect(device.signature.length).toBe(64);
    const masterPk = masterPkFromSk(master.sk);
    expect(ed.verify(device.signature, message, masterPk)).toBe(true);
  });
});
