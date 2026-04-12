/**
 * Unit tests for the "Add server" claim helper. Verifies that
 * `submitClaim` builds the canonical-JSON payload exactly as the
 * Elixir-side `claim_chat_owner` RPC action expects,
 * signs with the persisted identity, dispatches through the generated
 * `claimChatOwner` binding (`POST <base>/rpc/run`), and renders error
 * slugs from the RPC envelope as inline-display messages.
 */

import {bytesToBase64Url, submitClaim} from '../claim';
import {canonicalJson} from '../canonical-json';
import {clearIdentity, getOrCreateIdentity} from '../identity';
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

function fakeResponse(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => json,
  } as unknown as Response;
}

describe('bytesToBase64Url', () => {
  test('encodes empty', () => {
    expect(bytesToBase64Url(new Uint8Array())).toBe('');
  });

  test('matches Buffer.toString("base64url") for a 32-byte vector', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    const expected = Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(bytesToBase64Url(bytes)).toBe(expected);
  });
});

describe('submitClaim', () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  test('success — dispatches to /rpc/run with a verifiable signature', async () => {
    const identity = await getOrCreateIdentity();

    const calls: Array<{url: string; init: RequestInit | undefined}> = [];
    const fakeFetch = jest.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({url: String(url), init});
        return fakeResponse(200, {
          success: true,
          data: {id: 'abc123', did: `did:yawp:${identity.did}`},
        });
      },
    ) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000/',
      claimToken: 'ABCDEFGH',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result).toEqual({
      ok: true,
      did: `did:yawp:${identity.did}`,
      role: 'Owner',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:4000/rpc/run');

    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.action).toBe('claim_chat_owner');
    expect(body.input.claimToken).toBe('ABCDEFGH');
    expect(body.input.did).toBe(`did:yawp:${identity.did}`);
    expect(body.input.pk).toBe(bytesToBase64Url(identity.publicKey));
    expect(typeof body.input.senderSignature).toBe('string');
    expect(body.fields).toEqual(['id', 'did']);

    const canonical = canonicalJson({
      claim_token: body.input.claimToken,
      did: body.input.did,
      pk: body.input.pk,
    });
    const sig = Buffer.from(
      body.input.senderSignature.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat(
          (4 - (body.input.senderSignature.length % 4)) % 4,
        ),
      'base64',
    );
    const ok = ed.verify(
      new Uint8Array(sig),
      new TextEncoder().encode(canonical),
      identity.publicKey,
    );
    expect(ok).toBe(true);
  });

  test('RPC error envelope with claim_token_consumed renders inline', async () => {
    const identity = await getOrCreateIdentity();

    const fakeFetch = jest.fn(async () =>
      fakeResponse(200, {
        success: false,
        errors: [{type: 'claim_token_consumed', message: 'claim_token_consumed'}],
      }),
    ) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000',
      claimToken: 'USED',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('claim_token_consumed');
      expect(result.message).toMatch(/already been used/i);
    }
  });

  test('unrecognized error slug falls back to the server-supplied message', async () => {
    const identity = await getOrCreateIdentity();

    const fakeFetch = jest.fn(async () =>
      fakeResponse(200, {
        success: false,
        errors: [{type: 'mystery', message: 'something exploded'}],
      }),
    ) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000',
      claimToken: 'X',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('mystery');
      expect(result.message).toBe('something exploded');
    }
  });

  test('network failure surfaces a network_error result', async () => {
    const identity = await getOrCreateIdentity();

    const fakeFetch = jest.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000',
      claimToken: 'X',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('network_error');
      expect(result.message).toMatch(/Could not reach the server/i);
    }
  });
});
