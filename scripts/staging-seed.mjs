#!/usr/bin/env node

import {randomUUID, webcrypto} from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';
import * as ed from '../apps/yawp/assets/node_modules/@noble/ed25519/index.js';
import {sha256, sha512} from '../apps/yawp/assets/node_modules/@noble/hashes/sha2.js';
import bs58 from '../apps/yawp/assets/node_modules/bs58/src/esm/index.js';

ed.hashes.sha512 = sha512;

const textEncoder = new TextEncoder();

export async function seedAnchor(options) {
  const baseUrl = normalizeBaseUrl(required(options.baseUrl, '--base-url'));
  const claimToken = required(options.claimToken, '--claim-token');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const randomBytes = options.randomBytes ?? defaultRandomBytes;

  const alice = await createIdentity('Alice', randomBytes, now);
  const bob = await createIdentity('Bob', randomBytes, now);

  const claim = await rpc(fetchImpl, baseUrl, {
    action: 'claim_chat_owner',
    input: {
      claimToken,
      did: alice.did,
      pk: alice.masterPk,
      senderSignature: await signB64(alice.masterSk, canonicalJson({
        claim_token: claimToken,
        did: alice.did,
        pk: alice.masterPk,
      })),
    },
    fields: ['id', 'did'],
  });
  assertSuccess(claim, 'claim_chat_owner');

  const aliceSession = await bindDevice(fetchImpl, baseUrl, alice, now);
  const channels = await rpc(fetchImpl, baseUrl, {
    action: 'list_text_channels',
    fields: ['id', 'name', 'serverId'],
  }, aliceSession.sessionToken);
  assertSuccess(channels, 'list_text_channels');

  const general = firstChannel(channels.data);
  const invite = await rpc(fetchImpl, baseUrl, {
    action: 'create_room_invite',
    input: {channelId: general.id, kind: 'multi_use', usesRemaining: 5},
    fields: ['id', 'token', 'serverId', 'channelId'],
  }, aliceSession.sessionToken);
  assertSuccess(invite, 'create_room_invite');

  const redeem = await rpc(fetchImpl, baseUrl, {
    action: 'redeem_room_invite',
    input: {
      token: invite.data.token,
      did: bob.did,
      pk: bob.masterPk,
      senderSignature: await signB64(bob.masterSk, canonicalJson({
        token: invite.data.token,
        did: bob.did,
        pk: bob.masterPk,
      })),
    },
    fields: ['serverId', 'channelId', 'kind'],
  });
  assertSuccess(redeem, 'redeem_room_invite');

  const bobSession = await bindDevice(fetchImpl, baseUrl, bob, now);

  const aliceToBob = await submitDm(fetchImpl, baseUrl, alice, aliceSession.sessionToken, [bob.did], 'hello from staging seed', now, randomBytes);
  const bobToAlice = await submitDm(fetchImpl, baseUrl, bob, bobSession.sessionToken, [alice.did], 'reply from staging seed', now, randomBytes);

  const serverInfo = await getJson(fetchImpl, `${baseUrl}/.well-known/yawp/server-info`);

  return {
    baseUrl,
    serverInfo,
    channel: general,
    identities: {
      alice: publicIdentity(alice),
      bob: publicIdentity(bob),
    },
    sessions: {
      alice: aliceSession,
      bob: bobSession,
    },
    invite: {token: invite.data.token, serverId: invite.data.serverId, channelId: invite.data.channelId},
    dm: {
      aliceToBob,
      bobToAlice,
    },
  };
}

async function bindDevice(fetchImpl, baseUrl, identity, now) {
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

  const result = await rpc(fetchImpl, baseUrl, {
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

async function submitDm(fetchImpl, baseUrl, sender, sessionToken, recipientDids, body, now, randomBytes) {
  const unsigned = {
    envelope_id: b64Url(randomBytes(16)),
    sender_did: sender.did,
    signed_by: sender.deviceId,
    sender_anchors: [new URL(baseUrl).host],
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

  const response = await fetchImpl(`${baseUrl}/api/dm/submit`, {
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

async function createIdentity(label, randomBytes, now) {
  const masterSk = randomBytes(32);
  const masterPkBytes = await ed.getPublicKeyAsync(masterSk);
  const deviceSk = randomBytes(32);
  const devicePkBytes = await ed.getPublicKeyAsync(deviceSk);
  const deviceId = randomUUID();
  const deviceIssuedAt = now().toISOString();
  const devicePk = b64Url(devicePkBytes);

  return {
    label,
    did: `did:yawp:${bs58.encode(sha256(masterPkBytes))}`,
    masterSk,
    masterPk: b64Url(masterPkBytes),
    deviceSk,
    deviceId,
    devicePk,
    deviceIssuedAt,
    deviceSignature: await signB64(masterSk, canonicalJson({
      device_id: deviceId,
      pk: devicePk,
      issued_at: deviceIssuedAt,
    })),
  };
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

async function rpc(fetchImpl, baseUrl, payload, sessionToken) {
  const headers = {'content-type': 'application/json'};
  if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;

  const response = await fetchImpl(`${baseUrl}/rpc/run`, {
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

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  const body = await parseJson(response);
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${JSON.stringify(body)}`);
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

function firstChannel(data) {
  const channel = Array.isArray(data) ? data[0] : data;
  if (!channel?.id || !channel?.serverId) {
    throw new Error(`list_text_channels returned no usable channel: ${JSON.stringify(data)}`);
  }
  return channel;
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
    throw new Error('--base-url must use http or https');
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
    if (arg === '--base-url') parsed.baseUrl = argv[++i];
    else if (arg === '--claim-token') parsed.claimToken = argv[++i];
    else if (arg === '--output') parsed.output = argv[++i];
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function usage() {
  return [
    'Usage: node scripts/staging-seed.mjs --base-url https://anchor-a.staging.example --claim-token TOKEN [--output seed.json]',
    '',
    'Seeds a claimed chat owner, a member joined through an owner-minted invite, bound devices, and a two-message DM exchange over public HTTP/RPC only.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await seedAnchor(args);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) {
    await fs.writeFile(args.output, output);
    console.log(`seed artifact written to ${args.output}`);
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
