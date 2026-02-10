
import {useCallback, useEffect, useRef, useState} from 'react';

import {useSocketState, type Channel} from '../auth';
import {useIdentityState} from '../identity-context';
import type {CallApi, CallStatus} from './types';

const STUN_URL = 'stun:stun.l.google.com:19302';

type SignalEnvelope = {
  from?: unknown;
  payload?: unknown;
};

function parseEnvelope(payload: unknown): SignalEnvelope | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  return payload as SignalEnvelope;
}

export function useCall(
  peerDid: string | null,
  onRemoteStream?: (stream: unknown) => void,
): CallApi {
  const {authedSocket, tokenLoaded, token} = useSocketState();
  const identity = useIdentityState();
  const ourDid =
    identity.status === 'ready' ? identity.identity.did : null;

  const [status, setStatus] = useState<CallStatus>({status: 'idle'});

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const onRemoteStreamRef = useRef(onRemoteStream);
  onRemoteStreamRef.current = onRemoteStream;

  const isCaller = peerDid !== null && ourDid !== null && peerDid !== ourDid;

  const tearDown = useCallback((emitBye: boolean) => {
    const channel = channelRef.current;
    if (channel && emitBye) {
      try {
        channel.push('bye', {});
      } catch {
              }
    }
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.close();
      } catch {
              }
      pcRef.current = null;
    }
    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach(t => {
        try {
          t.stop();
        } catch {
                  }
      });
      localStreamRef.current = null;
    }
    if (channel) {
      try {
        channel.leave();
      } catch {
              }
      channelRef.current = null;
    }
    setStatus(prev => (prev.status === 'closed' ? prev : {status: 'closed'}));
  }, []);

  const hangUp = useCallback(() => {
    tearDown(true);
  }, [tearDown]);

  useEffect(() => {
    if (!peerDid) {
      return;
    }
    if (!tokenLoaded) {
      return;
    }
    if (!authedSocket || !token) {
      setStatus({status: 'error', reason: 'unauthorized'});
      return;
    }
    if (!ourDid) {
      setStatus({status: 'error', reason: 'identity_not_ready'});
      return;
    }

    let cancelled = false;
    const isCalleeRole = peerDid === ourDid;

    setStatus({status: 'requesting_media'});

    const pc = new RTCPeerConnection({iceServers: [{urls: STUN_URL}]});
    pcRef.current = pc;

    const channel = authedSocket.channel(`call:${peerDid}`, {});
    channelRef.current = channel;

    pc.onicecandidate = e => {
      if (e.candidate) {
        try {
          channel.push('ice', e.candidate.toJSON());
        } catch {
                  }
      }
    };

    pc.ontrack = e => {
      const [stream] = e.streams;
      if (stream && onRemoteStreamRef.current) {
        onRemoteStreamRef.current(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (cancelled) {
        return;
      }
      const cs = pc.connectionState;
      if (cs === 'connected') {
        setStatus({status: 'connected'});
      } else if (cs === 'failed') {
        setStatus({status: 'error', reason: 'ice_failed'});
      } else if (cs === 'closed') {
        setStatus(prev =>
          prev.status === 'closed' ? prev : {status: 'closed'},
        );
      }
    };

    channel.on('offer', (raw: unknown) => {
      if (cancelled || !isCalleeRole) {
        return;
      }
      const env = parseEnvelope(raw);
      if (!env || env.from === ourDid) {
        return;
      }
      const remoteDesc = env.payload as RTCSessionDescriptionInit | undefined;
      if (!remoteDesc) {
        return;
      }
      (async () => {
        try {
          await pc.setRemoteDescription(remoteDesc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.push('answer', {type: answer.type, sdp: answer.sdp});
        } catch (err) {
          if (!cancelled) {
            setStatus({
              status: 'error',
              reason: `answer_failed:${(err as Error).message}`,
            });
          }
        }
      })();
    });

    channel.on('answer', (raw: unknown) => {
      if (cancelled || isCalleeRole) {
        return;
      }
      const env = parseEnvelope(raw);
      if (!env || env.from === ourDid) {
        return;
      }
      const remoteDesc = env.payload as RTCSessionDescriptionInit | undefined;
      if (!remoteDesc) {
        return;
      }
      pc.setRemoteDescription(remoteDesc).catch(err => {
        if (!cancelled) {
          setStatus({
            status: 'error',
            reason: `apply_answer_failed:${(err as Error).message}`,
          });
        }
      });
    });

    channel.on('ice', (raw: unknown) => {
      if (cancelled) {
        return;
      }
      const env = parseEnvelope(raw);
      if (!env || env.from === ourDid) {
        return;
      }
      const cand = env.payload as RTCIceCandidateInit | undefined;
      if (!cand) {
        return;
      }
      pc.addIceCandidate(cand).catch(() => {
              });
    });

    channel.on('bye', (raw: unknown) => {
      if (cancelled) {
        return;
      }
      const env = parseEnvelope(raw);
      if (env && env.from === ourDid) {
        return;
      }
      tearDown(false);
    });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = stream;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      } catch (err) {
        if (!cancelled) {
          setStatus({
            status: 'error',
            reason: `getusermedia_failed:${(err as Error).message}`,
          });
        }
        return;
      }

      setStatus({status: 'joining'});

      const joined = await new Promise<{ok: true} | {ok: false; reason: string}>(
        resolve => {
          channel
            .join()
            .receive('ok', () => resolve({ok: true}))
            .receive('error', resp => {
              const reason =
                typeof resp === 'object' &&
                resp !== null &&
                typeof (resp as {reason?: unknown}).reason === 'string'
                  ? (resp as {reason: string}).reason
                  : 'join_error';
              resolve({ok: false, reason});
            })
            .receive('timeout', () =>
              resolve({ok: false, reason: 'join_timeout'}),
            );
        },
      );

      if (cancelled) {
        return;
      }
      if (!joined.ok) {
        setStatus({status: 'error', reason: joined.reason});
        return;
      }

      setStatus({status: 'connecting'});

      if (!isCalleeRole) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.push('offer', {type: offer.type, sdp: offer.sdp});
        } catch (err) {
          if (!cancelled) {
            setStatus({
              status: 'error',
              reason: `offer_failed:${(err as Error).message}`,
            });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      const currentPc = pcRef.current;
      if (currentPc) {
        try {
          currentPc.close();
        } catch {
                  }
        pcRef.current = null;
      }
      const currentLocal = localStreamRef.current;
      if (currentLocal) {
        currentLocal.getTracks().forEach(t => {
          try {
            t.stop();
          } catch {
                      }
        });
        localStreamRef.current = null;
      }
      const currentChannel = channelRef.current;
      if (currentChannel) {
        try {
          currentChannel.leave();
        } catch {
                  }
        channelRef.current = null;
      }
    };
  }, [peerDid, authedSocket, tokenLoaded, token, ourDid]);

  return {status, isCaller, hangUp};
}
