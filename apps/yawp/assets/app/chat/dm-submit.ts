import type {Identity} from '../identity-context';
import {getValidSessionToken} from '../session';
import {
  conversationId,
  generateEnvelopeId,
  sign,
  type DmEnvelope,
} from './dm-envelope';

export type SubmitDmResult =
  | {ok: true; envelope: DmEnvelope; delivery: 'sent'}
  | {ok: false; error: 'no_session' | 'network_error' | 'server_rejected'; message: string};

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function submitDm(args: {
  serverUrl: string;
  identity: Identity;
  recipientDids: string[];
  body: string;
  attachments?: Record<string, unknown>[];
  replyTo?: string | null;
  mentions?: Array<Record<string, unknown>>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
}): Promise<SubmitDmResult> {
  const recipientDids = Array.from(
    new Set(args.recipientDids.map(did => did.trim()).filter(did => did.length > 0)),
  );
  const body = args.body.trim();
  if (recipientDids.length < 1 || body.length < 1) {
    return {ok: false, error: 'server_rejected', message: 'Missing direct-message fields.'};
  }

  const base = normalizeServerUrl(args.serverUrl);
  const session = await getValidSessionToken({serverUrl: base, fetchImpl: args.fetchImpl});
  if (!session.ok) {
    return {ok: false, error: 'no_session', message: 'Sign in to your anchor before sending.'};
  }

  const unsigned: DmEnvelope = {
    envelope_id: generateEnvelopeId(args.randomBytes),
    sender_did: args.identity.didFull,
    recipient_dids: recipientDids,
    conversation_id: conversationId(args.identity.didFull, recipientDids),
    timestamp: (args.now ?? (() => new Date()))().toISOString(),
    body,
    attachments: args.attachments ?? [],
    reply_to: args.replyTo ?? null,
    mentions: args.mentions ?? [],
  };
  const envelope = sign(unsigned, args.identity.signDevice);

  let response: Response;
  try {
    response = await (args.fetchImpl ?? fetch)(`${base}/api/dm/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({envelope}),
    });
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      message: `Could not reach your anchor. (${(e as Error)?.message ?? e})`,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload && typeof payload === 'object' && (payload as {status?: unknown}).status === 'accepted') {
    return {ok: true, envelope, delivery: 'sent'};
  }

  return {ok: false, error: 'server_rejected', message: 'The anchor rejected this direct message.'};
}
