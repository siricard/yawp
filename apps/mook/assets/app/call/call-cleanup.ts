
type CleanupTrack = {
  stop(): void;
};

type CleanupStream = {
  getTracks(): CleanupTrack[];
};

type CleanupPc = {
  close(): void;
};

type CleanupChannel = {
  leave(): void;
};

export type CleanupCallResourcesArgs = {
  pc: CleanupPc | null;
  localStream: CleanupStream | null;
  channel: CleanupChannel | null;
};

export function cleanupCallResources({
  pc,
  localStream,
  channel,
}: CleanupCallResourcesArgs): void {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      try {
        track.stop();
      } catch {
              }
    }
  }
  if (pc) {
    try {
      pc.close();
    } catch {
          }
  }
  if (channel) {
    try {
      channel.leave();
    } catch {
          }
  }
}
