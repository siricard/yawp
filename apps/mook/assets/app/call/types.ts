
export type CallStatus =
  | {status: 'idle'}
  | {status: 'requesting_media'}
  | {status: 'joining'}
  | {status: 'connecting'}
  | {status: 'connected'}
  | {status: 'closed'}
  | {status: 'error'; reason: string}
  | {status: 'unsupported'};

export type CallApi = {
  /** Current lifecycle state of the call. */
  status: CallStatus;
  /**
   * True when this peer is the CALLER (we started the call). False when
   * we joined `call:<our_did>` as the receiver. Always false on the
   * native stub.
   */
  isCaller: boolean;
  /**
   * Tear down the call: close `RTCPeerConnection`, stop all local
   * `MediaStreamTrack`s, leave the channel. Idempotent.
   */
  hangUp: () => void;
};
