
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

import {canonicalJson} from '../canonical-json';
import {bytesToB64Url} from './bundle';
import {randomUuid} from './uuid';

ed.hashes.sha512 = sha512;

export type DeviceSubkey = {
  deviceId: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array; 
  signature: Uint8Array; 
  issuedAt: string; 
};

export function deviceDelegationMessage(args: {
  deviceId: string;
  devicePublicKey: Uint8Array;
  issuedAt: string;
}): Uint8Array {
  const payload = canonicalJson({
    device_id: args.deviceId,
    pk: bytesToB64Url(args.devicePublicKey),
    issued_at: args.issuedAt,
  });
  return new TextEncoder().encode(payload);
}

export function generateDeviceSubkey(
  masterPrivateKey: Uint8Array,
  opts: {deviceId?: string; issuedAt?: string} = {},
): DeviceSubkey {
  const deviceId = opts.deviceId ?? randomUuid();
  const issuedAt = opts.issuedAt ?? new Date().toISOString();
  const privateKey = ed.utils.randomSecretKey() as Uint8Array;
  const publicKey = ed.getPublicKey(privateKey) as Uint8Array;
  const message = deviceDelegationMessage({
    deviceId,
    devicePublicKey: publicKey,
    issuedAt,
  });
  const signature = ed.sign(message, masterPrivateKey) as Uint8Array;
  return {deviceId, publicKey, privateKey, signature, issuedAt};
}

/** Sign arbitrary bytes with a device subkey's private key. */
export function signWithDevice(
  devicePrivateKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return ed.sign(message, devicePrivateKey) as Uint8Array;
}
