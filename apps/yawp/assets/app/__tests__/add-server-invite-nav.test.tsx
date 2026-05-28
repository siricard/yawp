/**
 * after a successful invite redeem + bind, AddServerScreen
 * must invoke the navigation primitive so the SPA lands on `#general` of
 * the newly-joined server.
 *
 * This test exercises AddServerScreen directly (RPC-mock pattern from
 * add-server-screen.test.tsx) and asserts that the new
 * `onNavigateToServer` prop is called with the server tile that was
 * just added — instead of the legacy `onAdded` callback which lands on
 * home.
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

describe('AddServerScreen — invite redeem post-bind navigation', () => {
  beforeEach(async () => {
    await clearIdentity();
    await getOrCreateIdentity();
  });

  test('invite branch calls onNavigateToServer with the new server and not onAdded', async () => {
    let callIdx = 0;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (_input, init) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        callIdx += 1;
        if (body.action === 'redeem_server_invite') {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              success: true,
              data: {serverId: 'server-uuid-1', role: 'Member'},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
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
            onAdded={s => {
              addedCalls.push(s);
            }}
            onNavigateToServer={s => {
              navigated.push(s);
            }}
          />
        </IdentityProvider>,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'token-kind-invite').props.onPress();
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
      findByTestId(tree, 'claim-token-input').props.onChangeText(
        'INVITETOKEN1234567890ABCDE',
      );
    });

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    expect(navigated).toHaveLength(1);
    expect(navigated[0]).toMatchObject({
      url: 'http://localhost:4000',
      role: 'Member',
    });
    expect(addedCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  test('claim branch still uses onAdded (no navigate on operator path)', async () => {
    let callIdx = 0;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (_input, init) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        callIdx += 1;
        if (body.action === 'claim_chat_owner') {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              success: true,
              data: {id: 'id-abc', did: 'did:yawp:abc'},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
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
            onAdded={s => {
              addedCalls.push(s);
            }}
            onNavigateToServer={s => {
              navigated.push(s);
            }}
          />
        </IdentityProvider>,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
      findByTestId(tree, 'claim-token-input').props.onChangeText('TOKEN123');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addedCalls).toHaveLength(1);
    expect(navigated).toHaveLength(0);

    fetchSpy.mockRestore();
  });
});
