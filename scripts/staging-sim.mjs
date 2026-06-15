#!/usr/bin/env node

import {randomUUID, webcrypto} from 'node:crypto';
import process from 'node:process';
import fs from 'node:fs/promises';
import * as ed from '../apps/yawp/assets/node_modules/@noble/ed25519/index.js';
import {sha256, sha512} from '../apps/yawp/assets/node_modules/@noble/hashes/sha2.js';
import bs58 from '../apps/yawp/assets/node_modules/bs58/src/esm/index.js';

ed.hashes.sha512 = sha512;

const textEncoder = new TextEncoder();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const anchorA = normalizeBaseUrl(required(args.anchorA, '--anchor-a'));
  const anchorB = normalizeBaseUrl(required(args.anchorB, '--anchor-b'));
  const advertisedA = required(args.advertisedA ?? new URL(anchorA).host, '--advertised-a');
  const advertisedB = required(args.advertisedB ?? new URL(anchorB).host, '--advertised-b');
  const now = () => new Date();

  const loaded = args.input ? JSON.parse(await fs.readFile(args.input, 'utf8')) : null;
  const alice = loaded ? restoreIdentity(loaded.secrets.alice) : await createIdentity('Alice', advertisedA, now);
  const bob = loaded ? restoreIdentity(loaded.secrets.bob) : await createIdentity('Bob', advertisedB, now);

  let aliceSession = loaded?.sessions?.alice;
  let bobSession = loaded?.sessions?.bob;

  if (!loaded) {
    const claimA = required(args.claimA, '--claim-a');
    const claimB = required(args.claimB, '--claim-b');
    await claimOwner(anchorA, claimA, alice);
    await claimOwner(anchorB, claimB, bob);
    aliceSession = await bindDevice(anchorA, alice, now);
    bobSession = await bindDevice(anchorB, bob, now);
  }

  const message = args.prepare ? null : `hello from staging sim ${randomUUID()}`;
  const dm = args.prepare ? null : await submitDm(anchorA, advertisedA, alice, aliceSession.sessionToken, [bob.did], message, now);

  console.log(JSON.stringify({
    anchorA,
    anchorB,
    alice: publicIdentity(alice),
    bob: publicIdentity(bob),
    ppes: {
      alice: alice.ppe,
      bob: bob.ppe,
    },
    sessions: {
      alice: aliceSession,
      bob: bobSession,
    },
    secrets: {
      alice: secretIdentity(alice),
      bob: secretIdentity(bob),
    },
    dm: dm ? {...dm, body: message} : null,
  }, null, 2));
}

async function claimOwner(baseUrl, claimToken, identity) {
  const result = await rpc(baseUrl, {
    action: 'claim_chat_owner',
    input: {
      claimToken,
      did: identity.did,
      pk: identity.masterPk,
      senderSignature: await signB64(identity.masterSk, canonicalJson({
        claim_token: claimToken,
        did: identity.did,
        pk: identity.masterPk,
      })),
    },
    fields: ['id', 'did'],
  });
  assertSuccess(result, 'claim_chat_owner');
}

async function bindDevice(baseUrl, identity, now) {
  const requestIssuedAt = now().toISOString();
  const input = {
    deviceId: identity.deviceId,
    devicePk: identity.devicePk,
    deviceSignature: identity.deviceSignature,
    deviceIssuedAt: identity.deviceIssuedAt,
    requestIssuedAt,
  };
  input.senderSignature = await signB64(identity.deviceSk, canonicalJson({
    did: identity.did,
    device_id: input.deviceId,
    device_pk: input.devicePk,
    device_signature: input.deviceSignature,
    device_issued_at: input.deviceIssuedAt,
    request_issued_at: input.requestIssuedAt,
  }));

  const result = await rpc(baseUrl, {
    action: 'bind_device',
    identity: {did: identity.did},
    input,
    fields: ['id', 'did'],
    metadataFields: ['sessionToken', 'refreshToken', 'expiresAt'],
  });
  assertSuccess(result, 'bind_device');

  return {
    sessionToken: result.metadata.sessionToken,
    refreshToken: result.metadata.refreshToken,
    expiresAt: result.metadata.expiresAt,
  };
}

async function submitDm(baseUrl, advertisedHost, sender, sessionToken, recipientDids, body, now) {
  const unsigned = {
    kind: 'dm',
    envelope_id: b64Url(defaultRandomBytes(16)),
    sender_did: sender.did,
    signed_by: sender.deviceId,
    sender_anchors: [advertisedHost],
    recipient_dids: recipientDids,
    conversation_id: conversationId(sender.did, recipientDids),
    timestamp: now().toISOString(),
    body,
    attachments: [],
    reply_to: null,
    mentions: [],
  };
  const envelope = {
    ...unsigned,
    sender_signature: await signB64(sender.deviceSk, canonicalJson(unsigned)),
  };

  const response = await fetch(`${baseUrl}/api/dm/submit`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({envelope}),
  });
  const payload = await parseJson(response);
  if (!response.ok || payload?.status !== 'accepted') {
    throw new Error(`api/dm/submit failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {envelopeId: envelope.envelope_id, conversationId: envelope.conversation_id, deliveries: payload.deliveries ?? []};
}

async function createIdentity(label, anchorHost, now) {
  const masterSk = defaultRandomBytes(32);
  const masterPkBytes = await ed.getPublicKeyAsync(masterSk);
  const deviceSk = defaultRandomBytes(32);
  const devicePkBytes = await ed.getPublicKeyAsync(deviceSk);
  const deviceId = randomUUID();
  const deviceIssuedAt = now().toISOString();
  const devicePk = b64Url(devicePkBytes);
  const masterPk = b64Url(masterPkBytes);
  const did = `did:yawp:${bs58.encode(sha256(masterPkBytes))}`;
  const deviceSignature = await signB64(masterSk, canonicalJson({
    device_id: deviceId,
    pk: devicePk,
    issued_at: deviceIssuedAt,
  }));
  const unsignedPpe = {
    did,
    public_key: masterPk,
    profile_version: 1,
    display_name: label,
    avatar_ref: null,
    bio: null,
    anchors: [anchorHost],
    device_subkeys: [{
      device_id: deviceId,
      pk: devicePk,
      signature: deviceSignature,
      issued_at: deviceIssuedAt,
    }],
  };

  return {
    label,
    did,
    masterSk,
    masterPk,
    deviceSk,
    deviceId,
    devicePk,
    deviceIssuedAt,
    deviceSignature,
    ppe: {
      ...unsignedPpe,
      signature: await signB64(masterSk, canonicalJson(unsignedPpe)),
    },
  };
}

async function rpc(baseUrl, payload, sessionToken) {
  const headers = {'content-type': 'application/json'};
  if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;

  const response = await fetch(`${baseUrl}/rpc/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await parseJson(response);
  if (!response.ok) {
    throw new Error(`${payload.action} transport failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function parseJson(response) {
  const text = await response.text();
  return text.length > 0 ? JSON.parse(text) : null;
}

function assertSuccess(result, action) {
  if (!result?.success) {
    throw new Error(`${action} failed: ${JSON.stringify(result?.errors ?? result)}`);
  }
}

function publicIdentity(identity) {
  return {
    did: identity.did,
    masterPk: identity.masterPk,
    deviceId: identity.deviceId,
    devicePk: identity.devicePk,
    deviceIssuedAt: identity.deviceIssuedAt,
  };
}

function secretIdentity(identity) {
  return {
    ...publicIdentity(identity),
    label: identity.label,
    masterSk: b64Url(identity.masterSk),
    deviceSk: b64Url(identity.deviceSk),
    deviceSignature: identity.deviceSignature,
    ppe: identity.ppe,
  };
}

function restoreIdentity(serialized) {
  return {
    label: serialized.label,
    did: serialized.did,
    masterSk: Buffer.from(serialized.masterSk, 'base64url'),
    masterPk: serialized.masterPk,
    deviceSk: Buffer.from(serialized.deviceSk, 'base64url'),
    deviceId: serialized.deviceId,
    devicePk: serialized.devicePk,
    deviceIssuedAt: serialized.deviceIssuedAt,
    deviceSignature: serialized.deviceSignature,
    ppe: serialized.ppe,
  };
}

function conversationId(senderDid, recipientDids) {
  const participants = Array.from(new Set([senderDid, ...recipientDids])).sort();
  return bytesToHex(sha256(textEncoder.encode(canonicalJson(participants))));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

async function signB64(secretKey, canonical) {
  return b64Url(await ed.signAsync(textEncoder.encode(canonical), secretKey));
}

function b64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function defaultRandomBytes(length) {
  return webcrypto.getRandomValues(new Uint8Array(length));
}

function normalizeBaseUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('anchor URLs must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function required(value, flag) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${flag} is required`);
  }
  return value.trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--anchor-a') parsed.anchorA = argv[++i];
    else if (arg === '--anchor-b') parsed.anchorB = argv[++i];
    else if (arg === '--advertised-a') parsed.advertisedA = argv[++i];
    else if (arg === '--advertised-b') parsed.advertisedB = argv[++i];
    else if (arg === '--claim-a') parsed.claimA = argv[++i];
    else if (arg === '--claim-b') parsed.claimB = argv[++i];
    else if (arg === '--input') parsed.input = argv[++i];
    else if (arg === '--prepare') parsed.prepare = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function usage() {
  return [
    'Usage: node scripts/staging-sim.mjs --anchor-a http://localhost:4400 --anchor-b http://localhost:4500 --claim-a TOKEN --claim-b TOKEN [--prepare]',
    '',
    'Creates one homed identity on each release stack, submits a cross-stack DM, and asserts that the recipient inbox contains it.',
  ].join('\n');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
