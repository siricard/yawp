import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

import {DegradedModeBanner} from '../screens/DegradedModeBanner';

function hasBanner(root: ReactTestRenderer.ReactTestRenderer): boolean {
  return (
    root.root.findAllByProps({testID: 'degraded-mode-banner'}).length > 0
  );
}

describe('DegradedModeBanner', () => {
  test('renders nothing while the anchor is reachable', () => {
    mockStatus.value = {status: 'connected', degraded: false};
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(<DegradedModeBanner />);
    });
    expect(hasBanner(root)).toBe(false);
    ReactTestRenderer.act(() => root.unmount());
  });

  test('renders the offline banner once degraded', () => {
    mockStatus.value = {status: 'degraded', degraded: true};
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(<DegradedModeBanner />);
    });
    expect(hasBanner(root)).toBe(true);
    ReactTestRenderer.act(() => root.unmount());
  });
});
