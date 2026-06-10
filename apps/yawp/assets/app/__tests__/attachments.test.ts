import {webcrypto} from 'crypto';

import {sha256Hex, verifyAttachmentBytes} from '../chat/attachments';

Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

describe('attachment hashing', () => {
  test('computes sha256 before upload and verifies downloaded bytes', async () => {
    const bytes = new TextEncoder().encode('hello attachment');
    const hash = await sha256Hex(bytes);

    expect(hash).toBe('7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c');
    await expect(verifyAttachmentBytes(bytes, hash)).resolves.toBe(true);
    await expect(verifyAttachmentBytes(new TextEncoder().encode('tampered'), hash)).resolves.toBe(false);
  });
});
