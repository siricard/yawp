import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  IdentityProvider,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';

function mk(url: string): WorkspaceServer {
  return {url, did: 'did:yawp:z', role: 'Member', label: url};
}

describe('reorderServers', () => {
  async function settle() {
    for (let i = 0; i < 5; i++) {
      await ReactTestRenderer.act(async () => {
        await Promise.resolve();
      });
    }
  }

  test('reorders the workspace list to the given url order', async () => {
    let handle: ReturnType<typeof useWorkspaceServers> | null = null;
    function Probe() {
      handle = useWorkspaceServers();
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await settle();

    ReactTestRenderer.act(() => {
      handle!.addServer(mk('http://a'));
      handle!.addServer(mk('http://b'));
      handle!.addServer(mk('http://c'));
    });
    expect(handle!.servers.map(s => s.url)).toEqual([
      'http://a',
      'http://b',
      'http://c',
    ]);

    ReactTestRenderer.act(() => {
      handle!.reorderServers(['http://c', 'http://a', 'http://b']);
    });
    expect(handle!.servers.map(s => s.url)).toEqual([
      'http://c',
      'http://a',
      'http://b',
    ]);

    ReactTestRenderer.act(() => root!.unmount());
  });
});
