
import {useEffect, useState} from 'react';

import {useIdentityState} from '../identity-context';
import {signWithIdentity, PK_FIELD} from '../identity';
import {Socket} from './phoenix-socket';
import {SOCKET_URL} from './socket-url';
import {bytesToBase64, base64ToBytes} from './base64';
import {useSocketState} from './socket-context';

export type AuthState =
  | {status: 'idle'}
  | {status: 'connecting'}
  | {status: 'authenticating'}
  | {status: 'authenticated'; did: string}
  | {status: 'error'; reason: string};

type AuthOkReply = {did: string; token: string};

function isNoncePayload(v: unknown): v is {nonce: string} {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as {nonce?: unknown}).nonce === 'string'
  );
}

function isAuthOkReply(v: unknown): v is AuthOkReply {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const o = v as {did?: unknown; token?: unknown};
  return typeof o.did === 'string' && typeof o.token === 'string';
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

export function useAuthenticatedSocket(): AuthState {
  const identity = useIdentityState();
  const socketState = useSocketState();
  const [state, setState] = useState<AuthState>({status: 'idle'});

  useEffect(() => {
    if (identity.status !== 'ready') {
      return;
    }
    if (!socketState.tokenLoaded) {
      return;
    }

    if (socketState.token && socketState.authedSocket) {
      setState({
        status: 'authenticated',
        did: identity.identity.did,
      });
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
        } catch {
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
                if (!isAuthOkReply(okResp)) {
                  setState({status: 'error', reason: 'invalid_auth_reply'});
                  return;
                }
                const replyDid = okResp.did ?? did;
                socketState.onAuthenticated(okResp.token);
                setState({status: 'authenticated', did: replyDid});
                try {
                  channel.leave();
                } catch {
                                  }
                try {
                  socket.disconnect();
                } catch {
                                  }
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
          .catch((e: unknown) => {
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
  }, [identity, socketState.tokenLoaded, socketState.token, socketState]);

  if (identity.status === 'error' && state.status === 'idle') {
    return {status: 'error', reason: `identity_error: ${identity.error}`};
  }

  return state;
}
