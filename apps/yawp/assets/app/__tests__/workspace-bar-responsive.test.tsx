import React from 'react';
import {Platform} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {WorkspaceServer} from '../identity-context';

(Platform as {OS: string}).OS = 'web';

let mockServers: WorkspaceServer[] = [];
let mockWidth = 375;

jest.mock('../identity-context', () => ({
  useWorkspaceServers: () => ({
    servers: mockServers,
    addServer: jest.fn(),
    reorderServers: jest.fn(),
  }),
  useDisplayName: () => ({effectiveDisplayName: 'Brave Otter'}),
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({width: mockWidth, height: 812, scale: 2, fontScale: 1}),
}));

import {WorkspaceBar} from '../screens/WorkspaceBar';

function mk(url: string, extra: Partial<WorkspaceServer> = {}): WorkspaceServer {
  return {url, did: 'did:yawp:z', role: 'Member', label: url, ...extra};
}

function has(
  root: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return root.root.findAllByProps({testID}).length > 0;
}

function render(props: Partial<React.ComponentProps<typeof WorkspaceBar>> = {}) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <WorkspaceBar onAddServer={() => {}} {...props} />,
    );
  });
  return root!;
}

describe('WorkspaceBar responsive collapse', () => {
  beforeEach(() => {
    mockServers = [mk('http://a'), mk('http://b')];
    mockWidth = 375;
  });

  test('narrow width shows the collapsed toggle, not the full strip', () => {
    const root = render();
    expect(has(root, 'workspace-toggle')).toBe(true);
    // Full-strip-only affordances are hidden behind the toggle.
    expect(has(root, 'workspace-add-button')).toBe(false);
    expect(has(root, 'workspace-tile-http://a')).toBe(false);
  });

  test('wide width keeps the full workspaces strip (no collapsed toggle)', () => {
    mockWidth = 1024;
    const root = render();
    expect(has(root, 'workspace-toggle')).toBe(false);
    expect(has(root, 'workspace-add-button')).toBe(true);
    expect(has(root, 'workspace-tile-http://a')).toBe(true);
  });

  test('tapping the toggle opens the drawer with all servers + add', () => {
    const root = render();
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'workspace-toggle'}).props.onPress();
    });
    expect(has(root, 'workspaces-drawer')).toBe(true);
    expect(has(root, 'workspaces-drawer-tile-http://a')).toBe(true);
    expect(has(root, 'workspaces-drawer-tile-http://b')).toBe(true);
    expect(has(root, 'workspaces-drawer-add')).toBe(true);
    expect(has(root, 'workspaces-drawer-dm')).toBe(true);
  });

  test('long-pressing the toggle also opens the drawer', () => {
    const root = render();
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'workspace-toggle'}).props.onLongPress();
    });
    expect(has(root, 'workspaces-drawer')).toBe(true);
  });

  test('selecting a server in the drawer invokes onSelectServer and closes', () => {
    const onSelectServer = jest.fn();
    const root = render({onSelectServer});
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'workspace-toggle'}).props.onPress();
    });
    ReactTestRenderer.act(() => {
      root.root
        .findByProps({testID: 'workspaces-drawer-tile-http://b'})
        .props.onPress();
    });
    expect(onSelectServer).toHaveBeenCalledWith(mockServers[1]);
    expect(has(root, 'workspaces-drawer')).toBe(false);
  });

  test('the toggle shows the active server initial', () => {
    mockServers = [mk('http://alpha'), mk('http://bravo')];
    const root = render({activeServerUrl: 'http://bravo'});
    const toggle = root.root.findByProps({testID: 'workspace-toggle'});
    const labels = toggle
      .findAll(n => typeof n.props.children === 'string')
      .map(n => n.props.children);
    expect(labels).toContain('B');
  });
});
