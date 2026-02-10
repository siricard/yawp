
import type {CallApi} from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useCall(
  _peerDid: string | null,
  _onRemoteStream?: (stream: unknown) => void,
): CallApi {
  return {
    status: {status: 'unsupported'},
    isCaller: false,
    hangUp: () => {
          },
  };
}
