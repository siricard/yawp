
export class Push {
  receive(_status: string, _cb: (response: unknown) => void): Push {
    return this;
  }
}

export class Channel {
  join(_timeout?: number): Push {
    return new Push();
  }
  leave(_timeout?: number): Push {
    return new Push();
  }
  push(_event: string, _payload: object, _timeout?: number): Push {
    return new Push();
  }
  on(_event: string, _cb: (payload: unknown) => void): number {
    return 0;
  }
  off(_event: string, _ref?: number): void {}
}

export class Socket {
  constructor(_endPoint: string, _opts?: unknown) {}
  connect(): void {}
  disconnect(
    _callback?: () => void,
    _code?: number,
    _reason?: string,
  ): void {}
  channel(_topic: string, _params?: object): Channel {
    return new Channel();
  }
  onError(_cb: (err: unknown) => void): void {}
  onClose(_cb: () => void): void {}
  onOpen(_cb: () => void): void {}
}
