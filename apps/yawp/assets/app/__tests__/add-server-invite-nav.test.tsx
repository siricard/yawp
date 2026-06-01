/**
 * After a successful invite redeem + bind, AddServerScreen must invoke
 * the navigation primitive so the SPA lands on `#general` of the
 * newly-joined server. The claim (operator) branch keeps using onAdded.
 *
 * Path selection is server-state driven via the `/.well-known` probe:
 * a claimed server → invite redeem; an unclaimed server → operator claim.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {IdentityProvider} from '../identity-context';
import {AddServerScreen} from '../screens/AddServerScreen';
import {clearIdentity, getOrCreateIdentity} from '../identity';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function isProbe(input: RequestInfo | URL): boolean {
  return (
    typeof input === 'string' && input.includes('/.well-known/yawp/server-info')
  );
}

function probeResponse(claimed: boolean): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({claimed, serverName: 'Yawp', fingerprint: null}),
  } as unknown as Response;
}

async function flush() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function driveTwoStep(
  tree: ReactTestRenderer.ReactTestInstance,
  url: string,
  token: string,
) {
  await ReactTestRenderer.act(async () => {
    findByTestId(tree, 'server-url-input').props.onChangeText(url);
  });
  await ReactTestRenderer.act(async () => {
    findByTestId(tree, 'add-server-next').props.onPress();
  });
  await flush();
  await ReactTestRenderer.act(async () => {
    findByTestId(tree, 'claim-token-input').props.onChangeText(token);
  });
  await ReactTestRenderer.act(async () => {
    findByTestId(tree, 'add-server-submit').props.onPress();
  });
  await flush();
}

describe('AddServerScreen — post-bind navigation', () => {
  beforeEach(async () => {
    await clearIdentity();
    await getOrCreateIdentity();
  });

  test('claimed server: invite redeem calls onNavigateToServer, not onAdded', async () => {
    let callIdx = 0;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        if (isProbe(input)) {
          return probeResponse(true);
        }
        const body = JSON.parse((init?.body as string) ?? '{}');
        callIdx += 1;
        if (body.action === 'redeem_server_invite') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {serverId: 'server-uuid-1', role: 'Member'},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {id: 'id-xyz', did: 'did:yawp:xyz', profileVersion: 1},
            metadata: {
              sessionToken: 'sess-' + callIdx,
              refreshToken: 'refresh-' + callIdx,
              expiresAt: '2099-01-01T00:00:00.000000Z',
            },
          }),
        } as unknown as Response;
      });

    const navigated: unknown[] = [];
    const addedCalls: unknown[] = [];

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen
            onCancel={() => {}}
            onAdded={s => addedCalls.push(s)}
            onNavigateToServer={s => navigated.push(s)}
          />
        </IdentityProvider>,
      );
    });
    await flush();

    await driveTwoStep(
      root!.root,
      'http://localhost:4000',
      'INVITETOKEN1234567890ABCDE',
    );

    expect(navigated).toHaveLength(1);
    expect(navigated[0]).toMatchObject({
      url: 'http://localhost:4000',
      role: 'Member',
    });
    expect(addedCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  test('unclaimed server: operator claim still uses onAdded (no navigate)', async () => {
    let callIdx = 0;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        if (isProbe(input)) {
          return probeResponse(false);
        }
        const body = JSON.parse((init?.body as string) ?? '{}');
        callIdx += 1;
        if (body.action === 'claim_chat_owner') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {id: 'id-abc', did: 'did:yawp:abc'},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {id: 'id-abc', did: 'did:yawp:abc', profileVersion: 1},
            metadata: {
              sessionToken: 'sess-' + callIdx,
              refreshToken: 'refresh-' + callIdx,
              expiresAt: '2099-01-01T00:00:00.000000Z',
            },
          }),
        } as unknown as Response;
      });

    const navigated: unknown[] = [];
    const addedCalls: unknown[] = [];

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen
            onCancel={() => {}}
            onAdded={s => addedCalls.push(s)}
            onNavigateToServer={s => navigated.push(s)}
          />
        </IdentityProvider>,
      );
    });
    await flush();

    await driveTwoStep(root!.root, 'http://localhost:4000', 'TOKEN123');

    expect(addedCalls).toHaveLength(1);
    expect(navigated).toHaveLength(0);

    fetchSpy.mockRestore();
  });
});
