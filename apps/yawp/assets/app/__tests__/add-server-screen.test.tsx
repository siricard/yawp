/**
 * Render smoke + integration test for the Add-server screen.
 * Exercises the form via react-test-renderer:
 * - inputs accept text and Submit is gated until both are filled,
 * - submit posts and on 200 the new server lands in the workspace bar,
 * - 4xx slug renders inline via the testID="add-server-error" view.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {IdentityProvider, useWorkspaceServers} from '../identity-context';
import {AddServerScreen} from '../screens/AddServerScreen';
import {clearIdentity} from '../identity';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function ServersProbe({onLoaded}: {onLoaded: (servers: unknown[]) => void}) {
  const {servers} = useWorkspaceServers();
  React.useEffect(() => {
    onLoaded(servers);
  }, [servers, onLoaded]);
  return null;
}

describe('AddServerScreen', () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  test('renders inputs, submit button, and cancel button', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <AddServerScreen onCancel={() => {}} onAdded={() => {}} />
        </IdentityProvider>,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const tree = root!.root;
    expect(findByTestId(tree, 'server-url-input')).toBeTruthy();
    expect(findByTestId(tree, 'claim-token-input')).toBeTruthy();
    expect(findByTestId(tree, 'add-server-submit')).toBeTruthy();
    expect(findByTestId(tree, 'add-server-cancel')).toBeTruthy();
  });

  test('successful submit calls onAdded and adds to workspace bar', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({did: 'did:yawp:abc', role: 'Owner'}),
        } as unknown as Response;
      });

    let added: unknown = null;
    let serversSnapshot: unknown[] = [];

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <ServersProbe onLoaded={s => (serversSnapshot = s)} />
          <AddServerScreen
            onCancel={() => {}}
            onAdded={s => {
              added = s;
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
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:4000/api/claim');
    expect(added).toMatchObject({
      url: 'http://localhost:4000',
      did: 'did:yawp:abc',
      role: 'Owner',
    });
    expect(serversSnapshot).toEqual(
      expect.arrayContaining([expect.objectContaining({did: 'did:yawp:abc'})]),
    );

    fetchSpy.mockRestore();
  });

  test('4xx renders inline error message', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => {
        return {
          ok: false,
          status: 409,
          json: async () => ({error: 'claim_token_consumed'}),
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
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'server-url-input').props.onChangeText(
        'http://localhost:4000',
      );
      findByTestId(tree, 'claim-token-input').props.onChangeText('USED');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'add-server-submit').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const err = findByTestId(tree, 'add-server-error');
    expect(err).toBeTruthy();
    const texts: string[] = [];
    err.findAll(n => n.type === 'Text' || (n.type as Function)?.name === 'Text')
      .forEach(n => {
        const c = n.props.children;
        if (typeof c === 'string') texts.push(c);
      });
    expect(texts.join(' ')).toMatch(/already been used/i);

    fetchSpy.mockRestore();
  });
});
