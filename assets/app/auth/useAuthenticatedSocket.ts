
import {useEffect, useState} from 'react';

import {useIdentityState} from '../identity-context';
import {signWithIdentity, PK_FIELD} from '../identity';
import {Socket} from './phoenix-socket';
import {SOCKET_URL} from './socket-url';
import {bytesToBase64, base64ToBytes} from './base64';

export type AuthState =
  | {status: 'idle'}
  | {status: 'connecting'}
  | {status: 'authenticating'}
  | {status: 'authenticated'; did: string}
  | {status: 'error'; reason: string};

type NoncePayload = {nonce: string};

function isNoncePayload(v: unknown): v is NoncePayload {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as {nonce?: unknown}).nonce === 'string'
  );
}

function extractReason(v: unknown): string {
  if (typeof v === 'object' && v !== null) {
    const r = (v as {reason?: unknown}).reason;
    if (typeof r === 'string') {
      return r;
    }
  }
  return 'unknown';
}

function extractDid(v: unknown): string | null {
  if (typeof v === 'object' && v !== null) {
    const d = (v as {did?: unknown}).did;
    if (typeof d === 'string') {
      return d;
    }
  }
  return null;
}

export function useAuthenticatedSocket(): AuthState {
  const identity = useIdentityState();
  const [state, setState] = useState<AuthState>({status: 'idle'});

  useEffect(() => {
    if (identity.status !== 'ready') {
      return;
    }

    const did = identity.identity.did;
    const pk = identity.identity[PK_FIELD];

    let cancelled = false;
    const socket = new Socket(SOCKET_URL, {});
    socket.connect();
    setState({status: 'connecting'});

    const channel = socket.channel('auth:lobby', {});

    channel
      .join()
      .receive('ok', (resp: unknown) => {
        if (cancelled) {
          return;
        }
        if (!isNoncePayload(resp)) {
          setState({status: 'error', reason: 'invalid_join_reply'});
          return;
        }
        setState({status: 'authenticating'});

        let nonceBytes: Uint8Array;
        try {
          nonceBytes = base64ToBytes(resp.nonce);
        } catch (e) {
          setState({status: 'error', reason: 'invalid_nonce_encoding'});
          return;
        }

        signWithIdentity(nonceBytes)
          .then(sig => {
            if (cancelled) {
              return;
            }
            channel
              .push('authenticate', {
                did,
                pk: bytesToBase64(pk),
                signature: bytesToBase64(sig),
              })
              .receive('ok', (okResp: unknown) => {
                if (cancelled) {
                  return;
                }
                const replyDid = extractDid(okResp) ?? did;
                setState({status: 'authenticated', did: replyDid});
              })
              .receive('error', (errResp: unknown) => {
                if (cancelled) {
                  return;
                }
                setState({
                  status: 'error',
                  reason: extractReason(errResp),
                });
              })
              .receive('timeout', () => {
                if (cancelled) {
                  return;
                }
                setState({status: 'error', reason: 'timeout'});
              });
          })
          .catch(e => {
            if (cancelled) {
              return;
            }
            setState({
              status: 'error',
              reason: `sign_failed: ${(e as Error)?.message ?? String(e)}`,
            });
          });
      })
      .receive('error', (resp: unknown) => {
        if (cancelled) {
          return;
        }
        setState({status: 'error', reason: extractReason(resp)});
      })
      .receive('timeout', () => {
        if (cancelled) {
          return;
        }
        setState({status: 'error', reason: 'join_timeout'});
      });

    return () => {
      cancelled = true;
      try {
        channel.leave();
      } catch {
              }
      try {
        socket.disconnect();
      } catch {
              }
    };
  }, [identity]);

  if (identity.status === 'error' && state.status === 'idle') {
    return {status: 'error', reason: `identity_error: ${identity.error}`};
  }

  return state;
}
