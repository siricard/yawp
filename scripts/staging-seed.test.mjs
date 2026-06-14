import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {seedAnchor} from './staging-seed.mjs';

test('staging seed drives the public HTTP and RPC surfaces only', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({url: String(url), init});
    const body = init.body ? JSON.parse(init.body) : null;

    if (String(url).endsWith('/.well-known/yawp/server-info')) {
      return jsonResponse({claimed: true, serverName: 'Staging Seed'});
    }

    if (String(url).endsWith('/api/dm/submit')) {
      assert.match(init.headers.authorization, /^Bearer /);
      assert.equal(body.envelope.sender_signature.length > 0, true);
      return jsonResponse({status: 'accepted', deliveries: [{anchor: 'anchor-a.staging.example', recipients: body.envelope.recipient_dids}]});
    }

    assert.equal(String(url), 'https://anchor-a.staging.example/rpc/run');

    switch (body.action) {
      case 'claim_chat_owner':
        assert.equal(body.input.claimToken, 'CLAIM-TOKEN');
        return jsonResponse({success: true, data: {id: 'owner-id', did: body.input.did}});
      case 'bind_device':
        assert.equal(body.input.senderSignature.length > 0, true);
        return jsonResponse({
          success: true,
          data: {id: 'identity-id', did: body.identity.did},
          metadata: {sessionToken: `session-${calls.length}`, refreshToken: `refresh-${calls.length}`, expiresAt: '2030-01-01T00:00:00Z'},
        });
      case 'list_text_channels':
        assert.match(init.headers.authorization, /^Bearer /);
        return jsonResponse({success: true, data: [{id: 'general-id', name: 'general', serverId: 'server-id'}]});
      case 'create_room_invite':
        assert.match(init.headers.authorization, /^Bearer /);
        assert.equal(body.input.channelId, 'general-id');
        return jsonResponse({success: true, data: {id: 'invite-id', token: 'INVITE-TOKEN', serverId: 'server-id', channelId: 'general-id'}});
      case 'redeem_room_invite':
        assert.equal(body.input.token, 'INVITE-TOKEN');
        return jsonResponse({success: true, data: {serverId: 'server-id', channelId: 'general-id', kind: 'guest'}});
      default:
        throw new Error(`unexpected action ${body.action}`);
    }
  };

  const result = await seedAnchor({
    baseUrl: 'https://anchor-a.staging.example/',
    claimToken: 'CLAIM-TOKEN',
    fetchImpl,
    randomBytes: deterministicBytes,
    now: () => new Date('2030-01-01T00:00:00.000Z'),
  });

  assert.equal(result.baseUrl, 'https://anchor-a.staging.example');
  assert.equal(result.serverInfo.claimed, true);
  assert.equal(result.identities.alice.did.startsWith('did:yawp:'), true);
  assert.equal(result.identities.bob.did.startsWith('did:yawp:'), true);
  assert.equal(result.channel.id, 'general-id');
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/rpc/run',
    '/rpc/run',
    '/rpc/run',
    '/rpc/run',
    '/rpc/run',
    '/rpc/run',
    '/api/dm/submit',
    '/api/dm/submit',
    '/.well-known/yawp/server-info',
  ]);
});

test('staging seed implementation does not import local app or database APIs', async () => {
  const source = await readFile(new URL('./staging-seed.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('Mix.Task'), false);
  assert.equal(source.includes('Yawp.Repo'), false);
  assert.equal(source.includes('Ash.'), false);
  assert.equal(source.includes('postgres'), false);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function deterministicBytes(length) {
  return Uint8Array.from({length}, (_, index) => (index * 17 + length) % 256);
}
