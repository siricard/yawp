import {
  anchorReconnectAfterMs,
  DEGRADED_AFTER_MS,
} from '../chat/anchor-backoff';

describe('anchorReconnectAfterMs', () => {
  test('follows 1s, 2s, 4s, 8s, 16s doubling from the first try', () => {
    expect(anchorReconnectAfterMs(1)).toBe(1000);
    expect(anchorReconnectAfterMs(2)).toBe(2000);
    expect(anchorReconnectAfterMs(3)).toBe(4000);
    expect(anchorReconnectAfterMs(4)).toBe(8000);
    expect(anchorReconnectAfterMs(5)).toBe(16000);
  });

  test('caps at 30s no matter how many tries', () => {
    expect(anchorReconnectAfterMs(6)).toBe(30000);
    expect(anchorReconnectAfterMs(7)).toBe(30000);
    expect(anchorReconnectAfterMs(50)).toBe(30000);
  });

  test('treats a zeroth try as the base delay', () => {
    expect(anchorReconnectAfterMs(0)).toBe(1000);
  });

  test('surfaces a 60s degraded threshold', () => {
    expect(DEGRADED_AFTER_MS).toBe(60000);
  });
});
