/**
 * Unit tests for the "Add server" claim helper. Verifies that
 * `submitClaim` builds the canonical-JSON payload exactly as the
 * Elixir-side ClaimController expects, signs with the
 * persisted identity, and renders error slugs as inline-display
 * messages.
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

  test('200 OK — returns success with did/role and posts a verifiable signature', async () => {
    const identity = await getOrCreateIdentity();

    const calls: Array<{url: string; init: RequestInit | undefined}> = [];
    const fakeFetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({url, init});
      return fakeResponse(200, {
        did: `did:yawp:${identity.did}`,
        role: 'Owner',
      });
    }) as unknown as typeof fetch;

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
    expect(calls[0].url).toBe('http://localhost:4000/api/claim');

    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.claim_token).toBe('ABCDEFGH');
    expect(body.did).toBe(`did:yawp:${identity.did}`);
    expect(body.pk).toBe(bytesToBase64Url(identity.publicKey));
    expect(typeof body.sender_signature).toBe('string');

    const canonical = canonicalJson({
      claim_token: body.claim_token,
      did: body.did,
      pk: body.pk,
    });
    const sig = Buffer.from(
      body.sender_signature.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (body.sender_signature.length % 4)) % 4),
      'base64',
    );
    const ok = ed.verify(
      new Uint8Array(sig),
      new TextEncoder().encode(canonical),
      identity.publicKey,
    );
    expect(ok).toBe(true);
  });

  test('4xx slug is humanized for inline display', async () => {
    const identity = await getOrCreateIdentity();

    const fakeFetch = jest.fn(async () => {
      return fakeResponse(409, {error: 'claim_token_consumed'});
    }) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000',
      claimToken: 'USED',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe('claim_token_consumed');
      expect(result.message).toMatch(/already been used/i);
    }
  });

  test('unrecognized error slug falls back to a generic status message', async () => {
    const identity = await getOrCreateIdentity();

    const fakeFetch = jest.fn(async () => {
      return fakeResponse(418, {error: 'mystery'});
    }) as unknown as typeof fetch;

    const result = await submitClaim({
      serverUrl: 'http://localhost:4000',
      claimToken: 'X',
      identity,
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('mystery');
      expect(result.message).toMatch(/418/);
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
      expect(result.message).toMatch(/boom/);
    }
  });
});
