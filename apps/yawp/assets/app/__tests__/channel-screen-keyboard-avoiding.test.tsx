import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {KeyboardAvoidingView} from 'react-native';

jest.mock('../chat/channel-store', () => ({
  useChannel: () => ({
    status: 'joined',
    errorMessage: null,
    messages: [],
    send: jest.fn(),
  }),
}));

jest.mock('../identity-context', () => ({
  useIdentityState: () => ({status: 'loading'}),
  useDisplayName: () => ({effectiveDisplayName: null}),
}));

import {ChannelScreen} from '../screens/ChannelScreen';
import {WORKSPACE_BAR_HEIGHT} from '../screens/WorkspaceBar';

function render() {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <ChannelScreen
        serverUrl="http://localhost:4000"
        serverLabel="localhost:4000"
        channelId="chan-1"
        channelName="general"
        onBack={() => {}}
      />,
    );
  });
  return root!;
}

function cleanup(root: ReactTestRenderer.ReactTestRenderer) {
  ReactTestRenderer.act(() => {
    root.unmount();
  });
}

describe('ChannelScreen keyboard avoidance', () => {
  test('root is a KeyboardAvoidingView carrying the channel-screen testID', () => {
    const root = render();
    const kav = root.root.findByType(KeyboardAvoidingView);
    expect(kav.props.testID).toBe('channel-screen');
    cleanup(root);
  });

  test('uses padding behavior on iOS so the send row clears the keyboard', () => {
    const root = render();
    const kav = root.root.findByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    cleanup(root);
  });

  test('vertical offset accounts for the safe-area inset + workspace bar height', () => {
    const root = render();
    const kav = root.root.findByType(KeyboardAvoidingView);
    expect(kav.props.keyboardVerticalOffset).toBe(WORKSPACE_BAR_HEIGHT);
    cleanup(root);
  });

  test('send input row still renders inside the avoider', () => {
    const root = render();
    expect(root.root.findAllByProps({testID: 'channel-message-input'}).length).toBeGreaterThan(0);
    cleanup(root);
  });
});
