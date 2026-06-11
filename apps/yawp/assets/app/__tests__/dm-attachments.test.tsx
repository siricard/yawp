import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {DmListScreen} from '../screens/DmListScreen';

describe('DmListScreen attachments', () => {
  test('downloads, verifies, and renders matching image attachments inline', async () => {
    const bytes = new TextEncoder().encode('hello attachment');
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    });

    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          attachmentFetchImpl={fetchImpl as unknown as typeof fetch}
          conversation={{
            conversationId: 'conv-1',
            participants: [{did: 'did:yawp:alice', label: 'Alice'}],
            messages: [{
              id: 'env-1',
              body: 'image',
              delivery: 'sent',
              senderDid: 'did:yawp:alice',
              attachments: [{
                upload_id: 'up-1',
                content_hash: '7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c',
                mime: 'image/png',
                size: 16,
                download_url: 'https://anchor.example/api/downloads/up-1?sig=s&exp=1',
              }],
            }],
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://anchor.example/api/downloads/up-1?sig=s&exp=1');
    expect(root.root.findByProps({testID: 'dm-attachment-image-env-1-0'})).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test('shows an integrity failure instead of rendering tampered attachments', async () => {
    const bytes = new TextEncoder().encode('tampered');
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    });

    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          attachmentFetchImpl={fetchImpl as unknown as typeof fetch}
          conversation={{
            conversationId: 'conv-1',
            participants: [{did: 'did:yawp:alice', label: 'Alice'}],
            messages: [{
              id: 'env-1',
              body: 'image',
              delivery: 'sent',
              senderDid: 'did:yawp:alice',
              attachments: [{
                upload_id: 'up-1',
                content_hash: '7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c',
                mime: 'image/png',
                size: 16,
                download_url: 'https://anchor.example/api/downloads/up-1?sig=s&exp=1',
              }],
            }],
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(root.root.findByProps({testID: 'dm-attachment-integrity-failed-env-1-0'})).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });
});
