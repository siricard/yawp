import {sha256Hex, uploadAttachment, verifyAttachmentBytes} from '../chat/attachments';

describe('attachment hashing', () => {
  test('computes sha256 before upload and verifies downloaded bytes', async () => {
    const bytes = new TextEncoder().encode('hello attachment');
    const hash = await sha256Hex(bytes);

    expect(hash).toBe('7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c');
    await expect(verifyAttachmentBytes(bytes, hash)).resolves.toBe(true);
    await expect(verifyAttachmentBytes(new TextEncoder().encode('tampered'), hash)).resolves.toBe(false);
  });

  test('posts the actual file bytes to the upload endpoint after client hashing', async () => {
    const file = new Blob([new TextEncoder().encode('hello attachment')], {type: 'image/png'});
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        upload_id: 'up-1',
        content_hash: 'server-hash',
        mime: 'image/png',
        size: 16,
      }),
    });

    const result = await uploadAttachment({
      serverUrl: 'https://anchor.example/',
      file,
      uploadedByDid: 'did:yawp:alice',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://anchor.example/api/uploads',
      expect.objectContaining({method: 'POST', body: expect.any(FormData)}),
    );
    expect(result.client_hash).toBe('7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c');
    expect(result.upload_id).toBe('up-1');
  });
});
