
import {useEffect, useRef} from 'react';

type Props = {
  stream: unknown;
};

export function RemoteAudio({stream}: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const ms = stream instanceof MediaStream ? stream : null;
    if (el.srcObject !== ms) {
      el.srcObject = ms;
    }
    if (ms) {
      el.play().catch(() => {
              });
    }
  }, [stream]);

  return (
    <audio
      ref={ref}
      id="remote-audio"
      data-testid="remote-audio"
      autoPlay
      playsInline
    />
  );
}
