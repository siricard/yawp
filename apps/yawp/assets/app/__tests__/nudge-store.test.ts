/**
 * nudge-store tests.
 *
 * Covers the pure `shouldShowSecondAnchorNudge` gate plus the
 * identity-bundle persistence behavior (not implemented yet):
 * - <7 days → no banner,
 * - ≥7 days + servers.length === 1 + !dismissed → banner,
 * - servers.length > 1 → no banner regardless,
 * - dismiss persists to the bundle and survives a "reload" (re-read).
 */

import {
  __resetNudgeStoreForTests,
  recordFirstBoundAtIfUnset,
  shouldShowSecondAnchorNudge,
} from '../nudge-store';
import {bytesToB64Url, type IdentityBundleV1} from '../identity/bundle';
import {
  loadIdentity,
  loadStoredEntry,
  saveIdentity,
} from '../identity/storage-bundle';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeBundle(): IdentityBundleV1 {
  const sk = new Uint8Array(32);
  const pk = new Uint8Array(32);
  const sig = new Uint8Array(64);
  for (let i = 0; i < sk.length; i++) sk[i] = i + 1;
  for (let i = 0; i < pk.length; i++) pk[i] = (i * 3) & 0xff;
  for (let i = 0; i < sig.length; i++) sig[i] = (i * 7) & 0xff;
  return {
    version: 1,
    master: {sk: bytesToB64Url(sk)},
    device: {
      deviceId: 'nudge-test-device',
      sk: bytesToB64Url(sk),
      pk: bytesToB64Url(pk),
      signature: bytesToB64Url(sig),
      issuedAt: '2026-05-27T00:00:00.000Z',
    },
  };
}

describe('shouldShowSecondAnchorNudge (pure gate)', () => {
  test('returns false before 7 days have elapsed', () => {
    const now = new Date('2026-01-08T00:00:00.000Z');
    const firstBoundAt = new Date(
      now.getTime() - 6 * DAY_MS - 1,
    ).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns true after 7 days, with one server, undismissed', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(true);
  });

  test('returns false when 2+ servers are bound', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 2,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when dismissed', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: true,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when firstBoundAt is unset', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt: null,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when serversCount is 0', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 0,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });
});

describe('recordFirstBoundAtIfUnset (identity-bundle persistence)', () => {
  beforeEach(async () => {
    await __resetNudgeStoreForTests();
    await saveIdentity(makeBundle());
  });

  test('writes a timestamp into bundle metadata the first time it is called', async () => {
    const before = await loadIdentity();
    expect(before!.metadata?.firstBoundAt).toBeUndefined();

    await recordFirstBoundAtIfUnset(new Date('2026-03-01T00:00:00.000Z'));

    const after = await loadIdentity();
    expect(after!.metadata?.firstBoundAt).toBe('2026-03-01T00:00:00.000Z');
  });

  test('does NOT overwrite an existing timestamp on subsequent binds', async () => {
    await recordFirstBoundAtIfUnset(new Date('2026-03-01T00:00:00.000Z'));
    await recordFirstBoundAtIfUnset(new Date('2026-04-01T00:00:00.000Z'));

    const after = await loadIdentity();
    expect(after!.metadata?.firstBoundAt).toBe('2026-03-01T00:00:00.000Z');
  });

  test('no-op when there is no stored identity bundle', async () => {
    await __resetNudgeStoreForTests();
    await recordFirstBoundAtIfUnset(new Date('2026-03-01T00:00:00.000Z'));
    expect(await loadStoredEntry()).toBeNull();
  });
});
