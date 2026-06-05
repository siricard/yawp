import {sha256} from '@noble/hashes/sha2.js';
import {canonicalJson} from '../canonical-json';
import {bytesToB64Url, b64UrlToBytes} from '../identity/bundle';

export type DmEnvelope = {
  envelope_id: string;
  sender_did: string;
  recipient_dids: string[];
  conversation_id: string;
  timestamp: string;
  body: string;
  attachments: Record<string, unknown>[];
  reply_to: string | null;
  mentions: Array<Record<string, unknown>>;
  sender_signature?: string | null;
};

export type SenderPpe = {
  public_key: string;
  device_subkeys?: Array<{
    device_id: string;
    pk: string;
    issued_at: string;
    signature: string;
  }> | {
    subkeys?: Array<{
      device_id: string;
      pk: string;
      issued_at: string;
      signature: string;
    }>;
  };
};

export function conversationId(senderDid: string, recipientDids: string[]): string {
  const participants = Array.from(new Set([senderDid, ...recipientDids])).sort();
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(participants))));
}

export function generateEnvelopeId(randomBytes: (length: number) => Uint8Array = defaultRandomBytes): string {
  const bytes = randomBytes(16);
  if (bytes.length !== 16) {
    throw new Error('generateEnvelopeId: expected 16 random bytes');
  }
  return bytesToB64Url(bytes);
}

export function signingInput(envelope: DmEnvelope): Uint8Array {
  const {sender_signature: _signature, ...unsignedEnvelope} = envelope;
  return new TextEncoder().encode(canonicalJson(unsignedEnvelope));
}

export function sign(
  envelope: DmEnvelope,
  signer: (bytes: Uint8Array) => Uint8Array,
): DmEnvelope {
  return {...envelope, sender_signature: bytesToB64Url(signer(signingInput(envelope)))};
}

export async function verify(
  envelope: DmEnvelope,
  ppe: SenderPpe,
  verifySignature: (
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ) => boolean | Promise<boolean>,
): Promise<boolean> {
  if (!envelope.sender_signature) return false;
  if (envelope.conversation_id !== conversationId(envelope.sender_did, envelope.recipient_dids)) {
    return false;
  }
  const signature = b64UrlToBytes(envelope.sender_signature);
  const message = signingInput(envelope);
  const keys = delegatedDevicePublicKeys(ppe, verifySignature);

  for await (const key of keys) {
    if (await verifySignature(signature, message, key)) return true;
  }

  return false;
}

async function* delegatedDevicePublicKeys(
  ppe: SenderPpe,
  verifySignature: (
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ) => boolean | Promise<boolean>,
): AsyncGenerator<Uint8Array> {
  const masterPk = b64UrlToBytes(ppe.public_key);
  const subkeys = Array.isArray(ppe.device_subkeys)
    ? ppe.device_subkeys
    : ppe.device_subkeys?.subkeys ?? [];

  for (const subkey of subkeys) {
    const devicePk = b64UrlToBytes(subkey.pk);
    const delegationSignature = b64UrlToBytes(subkey.signature);
    const delegationMessage = new TextEncoder().encode(
      canonicalJson({
        device_id: subkey.device_id,
        pk: subkey.pk,
        issued_at: subkey.issued_at,
      }),
    );

    if (await verifySignature(delegationSignature, delegationMessage, masterPk)) {
      yield devicePk;
    }
  }
}

function defaultRandomBytes(length: number): Uint8Array {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject?.getRandomValues) {
    throw new Error('generateEnvelopeId: crypto.getRandomValues unavailable');
  }
  return cryptoObject.getRandomValues(new Uint8Array(length));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
