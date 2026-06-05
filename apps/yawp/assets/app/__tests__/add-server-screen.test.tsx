import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {IdentityProvider, useWorkspaceServers} from '../identity-context';
import {AddServerScreen} from '../screens/AddServerScreen';
import {clearIdentity, getOrCreateIdentity} from '../identity';
import {loadIdentity} from '../identity/storage-bundle';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function queryByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  const matches = tree.findAllByProps({testID});
  return matches.length > 0 ? matches[0] : null;
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
    json: async () => ({claimed, serverName: 'Yawp', fingerprint: 'ab12:cd34'}),
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

function gatherText(node: ReactTestRenderer.ReactTestInstance): string {
  const texts: string[] = [];
  node
    .findAll(
      n =>
        (n.type as unknown) === 'Text' ||
        (n.type as Function)?.name === 'Text',
    )
    .forEach(n => {
      const c = n.props.children;
      if (typeof c === 'string') texts.push(c);
    });
  return texts.join(' ');
}

describe('AddServerScreen (paste-first)', () => {
  beforeEach(async () => {
    await clearIdentity();
    await getOrCreateIdentity();
  });

  test('has no claim-vs-invite segmented toggle', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen onCancel={() => {}} onAdded={() => {}} />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;
    expect(queryByTestId(tree, 'token-kind-toggle')).toBeNull();
    expect(queryByTestId(tree, 'token-kind-claim')).toBeNull();
    expect(queryByTestId(tree, 'token-kind-invite')).toBeNull();
    expect(findByTestId(tree, 'server-url-input')).toBeTruthy();
    expect(findByTestId(tree, 'add-server-next')).toBeTruthy();
  });

  test('plain URL path: Next probes then shows a two-step claim flow on an unclaimed server', async () => {
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
            data: {
              id: 'id-abc',
              did: 'did:yawp:abc',
              anchorList: ['http://localhost:4000'],
              profileVersion: 1,
            },
            metadata: {
              sessionToken: 'sess-' + callIdx,
              refreshToken: 'refresh-' + callIdx,
              expiresAt: '2099-01-01T00:00:00.000000Z',
            },
          }),
        } as unknown as Response;
      });

    let added: unknown = null;

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen
            onCancel={() => {}}
            onAdded={s => {
              added = s;
            }}
          />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
    });

    expect(queryByTestId(tree, 'claim-token-input')).toBeNull();

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-next').props.onPress();
    });
    await flush();

    const codeField = findByTestId(tree, 'claim-token-input');
    expect(codeField).toBeTruthy();
    expect(gatherText(tree).toLowerCase()).toContain('claim token');

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'claim-token-input').props.onChangeText('TOKEN123');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await flush();

    expect(added).toMatchObject({
      url: 'http://localhost:4000',
      did: 'did:yawp:abc',
      role: 'Owner',
    });

    const probeCalls = fetchSpy.mock.calls.filter(c => isProbe(c[0]));
    expect(probeCalls.length).toBe(1);

    fetchSpy.mockRestore();
  });

  test('persists bind profile metadata so add-anchor signs the next profile version', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        if (isProbe(input)) {
          return probeResponse(false);
        }
        const body = JSON.parse((init?.body as string) ?? '{}');
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
            data: {
              id: 'id-abc',
              did: 'did:yawp:abc',
              anchorList: ['http://localhost:4000'],
              profileVersion: 1,
            },
            metadata: {
              sessionToken: 'sess',
              refreshToken: 'refresh',
              expiresAt: '2099-01-01T00:00:00.000000Z',
            },
          }),
        } as unknown as Response;
      });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen onCancel={() => {}} onAdded={() => {}} />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-next').props.onPress();
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'claim-token-input').props.onChangeText('TOKEN123');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await flush();

    const bundle = await loadIdentity();
    expect(bundle?.metadata?.profileVersion).toBe(1);
    expect(bundle?.metadata?.publishedProfile?.anchors).toEqual([
      'localhost:4000',
    ]);

    fetchSpy.mockRestore();
  });

  test('pasting a full invite link binds in one step without a code screen', async () => {
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

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen
            onCancel={() => {}}
            onAdded={() => {}}
            onNavigateToServer={s => navigated.push(s)}
          />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000/invite#INVITETOKEN1234567890ABCDE',
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-next').props.onPress();
    });
    await flush();

    expect(queryByTestId(tree, 'claim-token-input')).toBeNull();
    expect(queryByTestId(tree, 'add-server-submit')).toBeNull();

    const redeemCall = fetchSpy.mock.calls.find(c => {
      if (isProbe(c[0])) return false;
      const body = JSON.parse((c[1]?.body as string) ?? '{}');
      return body.action === 'redeem_server_invite';
    });
    expect(redeemCall).toBeTruthy();
    const redeemBody = JSON.parse((redeemCall![1]?.body as string) ?? '{}');
    expect(redeemBody.input.token).toBe('INVITETOKEN1234567890ABCDE');

    expect(navigated).toHaveLength(1);
    expect(navigated[0]).toMatchObject({
      url: 'http://localhost:4000',
      role: 'Member',
    });

    fetchSpy.mockRestore();
  });

  test('submitting an invite token to an unclaimed server surfaces the inline error', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async input => {
        if (isProbe(input)) {
          return probeResponse(false);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: false,
            errors: [
              {type: 'claim_token_invalid', message: 'claim_token_invalid'},
            ],
          }),
        } as unknown as Response;
      });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen onCancel={() => {}} onAdded={() => {}} />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-next').props.onPress();
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'claim-token-input').props.onChangeText('WRONGKIND');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await flush();

    const err = findByTestId(tree, 'add-server-error');
    expect(err).toBeTruthy();
    expect(gatherText(err).toLowerCase()).toContain('not recognized');

    fetchSpy.mockRestore();
  });

  test('probe failure shows a warning banner but still allows manual entry', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async input => {
        if (isProbe(input)) {
          throw new Error('network down');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({success: true, data: {}}),
        } as unknown as Response;
      });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen onCancel={() => {}} onAdded={() => {}} />
        </IdentityProvider>,
      );
    });
    await flush();

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-next').props.onPress();
    });
    await flush();

    expect(findByTestId(tree, 'add-server-probe-error')).toBeTruthy();
    expect(findByTestId(tree, 'claim-token-input')).toBeTruthy();

    fetchSpy.mockRestore();
  });
});
