export type AttachmentDescriptor = {
  upload_id: string;
  content_hash: string;
  mime?: string;
  size?: number;
  download_url?: string;
  integrity_failed?: boolean;
};

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const input = new ArrayBuffer(data.byteLength);
  new Uint8Array(input).set(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAttachmentBytes(
  bytes: ArrayBuffer | Uint8Array,
  expectedHash: string,
): Promise<boolean> {
  return (await sha256Hex(bytes)) === expectedHash.toLowerCase();
}

export async function uploadAttachment(args: {
  serverUrl: string;
  file: File | Blob;
  uploadedByDid?: string;
  fetchImpl?: typeof fetch;
}): Promise<AttachmentDescriptor & {ok: true; client_hash: string}> {
  const base = args.serverUrl.trim().replace(/\/+$/, '');
  const clientHash = await sha256Hex(await args.file.arrayBuffer());
  const form = new FormData();
  form.append('file', args.file);
  if (args.uploadedByDid) form.append('uploaded_by_did', args.uploadedByDid);

  const response = await (args.fetchImpl ?? fetch)(`${base}/api/uploads`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error('attachment upload failed');
  }

  const payload = await response.json() as AttachmentDescriptor;
  return {...payload, ok: true, client_hash: clientHash};
}
