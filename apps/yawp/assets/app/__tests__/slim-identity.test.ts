/**
 * slim client identity tests.
 *
 * Covers:
 * 1. master key shape (Noble returns 32-byte private + 32-byte public).
 * 2. DID derivation matches the cross-platform fixture.
 * 3. fingerprintFromPubkey matches the documented format for a known vector.
 * 4. Round-trip save → load preserves the bundle byte-for-byte.
 * 5. Device subkey signatures are 64 bytes and verify against the
 * device public key via @noble/ed25519.verify.
 *
 * The native keychain mock is provided by `jest.setup.js`; we additionally
 * clear it between tests so each test starts from a known-empty state.
 */

import * as ed from '@noble/ed25519';
import {sha512, sha256} from '@noble/hashes/sha2.js';

import {canonicalJson} from '../canonical-json';
import {generateMaster, masterPublicKeyFromPrivate} from '../identity/master';
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

  test('generateMaster returns a 32-byte private + 32-byte public Ed25519 keypair', () => {
    const {publicKey, privateKey} = generateMaster();
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(32);
    const derived = masterPublicKeyFromPrivate(privateKey);
    expect(bytesEqual(derived, publicKey)).toBe(true);
  });

  test('didFromPubkey matches the cross-platform fixture', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = masterPublicKeyFromPrivate(seed);
    expect(didFromPubkey(pk)).toBe(`did:yawp:${vector.did}`);
  });

  test('fingerprintFromPubkey matches the format for a known vector', () => {
    const seed = hexToBytes(vector.sk_seed_hex);
    const pk = masterPublicKeyFromPrivate(seed);
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
    const device = generateDeviceSubkey(master.privateKey, {
      deviceId: 'fixed-device-id',
      issuedAt: '2026-01-02T03:04:05.000Z',
    });
    const bundle: IdentityBundleV1 = {
      version: 1,
      master: {sk: bytesToB64Url(master.privateKey)},
      device: {
        deviceId: device.deviceId,
        sk: bytesToB64Url(device.privateKey),
        pk: bytesToB64Url(device.publicKey),
        signature: bytesToB64Url(device.signature),
        issuedAt: device.issuedAt,
      },
    };

    await saveIdentity(bundle);
    const loaded = await loadIdentity();

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(bundle);
    expect(bytesEqual(b64UrlToBytes(loaded!.master.sk), master.privateKey)).toBe(true);
    expect(bytesEqual(b64UrlToBytes(loaded!.device.pk), device.publicKey)).toBe(true);
  });

  test('signWithDevice produces a 64-byte signature verifiable by the device public key', () => {
    const master = generateMaster();
    const device = generateDeviceSubkey(master.privateKey);

    const message = new TextEncoder().encode('yawp-device-signing-test');
    const sig = signWithDevice(device.privateKey, message);

    expect(sig.length).toBe(64);
    expect(ed.verify(sig, message, device.publicKey)).toBe(true);
    const masterSig = ed.sign(message, master.privateKey) as Uint8Array;
    expect(ed.verify(masterSig, message, device.publicKey)).toBe(false);
  });

  test('device delegation signature verifies against the master key', () => {
    const master = generateMaster();
    const device = generateDeviceSubkey(master.privateKey, {
      deviceId: 'verification-test-device',
      issuedAt: '2026-05-25T00:00:00.000Z',
    });

    const message = deviceDelegationMessage({
      deviceId: device.deviceId,
      devicePublicKey: device.publicKey,
      issuedAt: device.issuedAt,
    });
    expect(new TextDecoder().decode(message)).toBe(
      canonicalJson({
        device_id: device.deviceId,
        pk: bytesToB64Url(device.publicKey),
        issued_at: device.issuedAt,
      }),
    );

    expect(device.signature.length).toBe(64);
    const masterPublicKey = masterPublicKeyFromPrivate(master.privateKey);
    expect(ed.verify(device.signature, message, masterPublicKey)).toBe(true);
  });
});
