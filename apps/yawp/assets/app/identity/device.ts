
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

import {canonicalJson} from '../canonical-json';
import {bytesToB64Url} from './bundle';
import {randomUuid} from './uuid';

ed.hashes.sha512 = sha512;

export type DeviceSubkey = {
  deviceId: string;
  pk: Uint8Array;
  sk: Uint8Array;
  signature: Uint8Array;
  issuedAt: string;
};

export function deviceDelegationMessage(args: {
  deviceId: string;
  devicePk: Uint8Array;
  issuedAt: string;
}): Uint8Array {
  const payload = canonicalJson({
    device_id: args.deviceId,
    pk: bytesToB64Url(args.devicePk),
    issued_at: args.issuedAt,
  });
  return new TextEncoder().encode(payload);
}

export function generateDeviceSubkey(
  masterSk: Uint8Array,
  opts: {deviceId?: string; issuedAt?: string} = {},
): DeviceSubkey {
  const deviceId = opts.deviceId ?? randomUuid();
  const issuedAt = opts.issuedAt ?? new Date().toISOString();
  const sk = ed.utils.randomSecretKey() as Uint8Array;
  const pk = ed.getPublicKey(sk) as Uint8Array;
  const message = deviceDelegationMessage({
    deviceId,
    devicePk: pk,
    issuedAt,
  });
  const signature = ed.sign(message, masterSk) as Uint8Array;
  return {deviceId, pk, sk, signature, issuedAt};
}

export function signWithDevice(deviceSk: Uint8Array, message: Uint8Array): Uint8Array {
  return ed.sign(message, deviceSk) as Uint8Array;
}
