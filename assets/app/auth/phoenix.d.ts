
declare module 'phoenix' {
  export interface SocketConnectOption {
    params?: object | (() => object);
    transport?: unknown;
    longPollFallbackMs?: number;
    timeout?: number;
    debug?: boolean;
  }

  export class Socket {
    constructor(endPoint: string, opts?: SocketConnectOption);
    connect(): void;
    disconnect(callback?: () => void, code?: number, reason?: string): void;
    channel(topic: string, chanParams?: object): Channel;
    onError(callback: (err: unknown) => void): void;
    onClose(callback: () => void): void;
    onOpen(callback: () => void): void;
  }

  export class Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    push(event: string, payload: object, timeout?: number): Push;
    on(event: string, callback: (payload: unknown) => void): number;
    off(event: string, ref?: number): void;
  }

  export class Push {
    receive(status: string, callback: (response: unknown) => void): Push;
  }
}
