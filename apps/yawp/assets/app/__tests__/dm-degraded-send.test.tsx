import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

import {DmListScreen} from '../screens/DmListScreen';

function render(): ReactTestRenderer.ReactTestRenderer {
  let root!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(<DmListScreen onBack={() => {}} />);
  });
  return root;
}

function type(root: ReactTestRenderer.ReactTestRenderer, text: string) {
  ReactTestRenderer.act(() => {
    root.root
      .findByProps({testID: 'dm-composer-input'})
      .props.onChangeText(text);
  });
}

function send(root: ReactTestRenderer.ReactTestRenderer) {
  ReactTestRenderer.act(() => {
    root.root.findByProps({testID: 'dm-send-button'}).props.onPress();
  });
}

function has(root: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return root.root.findAllByProps({testID}).length > 0;
}

describe('DmListScreen degraded-mode send', () => {
  afterEach(() => {
    mockStatus.value = {status: 'connected', degraded: false};
  });

  test('a send while degraded is queued with a queued-locally indicator', () => {
    mockStatus.value = {status: 'degraded', degraded: true};
    const root = render();

    expect(has(root, 'dm-degraded-notice')).toBe(true);

    type(root, 'hi there');
    send(root);

    expect(has(root, 'dm-message-dm-1')).toBe(true);
    expect(has(root, 'dm-queued-indicator-dm-1')).toBe(true);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('a send while connected is delivered, not queued', () => {
    mockStatus.value = {status: 'connected', degraded: false};
    const root = render();

    expect(has(root, 'dm-degraded-notice')).toBe(false);

    type(root, 'hi there');
    send(root);

    expect(has(root, 'dm-message-dm-1')).toBe(true);
    expect(has(root, 'dm-queued-indicator-dm-1')).toBe(false);

    ReactTestRenderer.act(() => root.unmount());
  });
});
