/**
 * pure-logic tests for the second-anchor nudge gate.
 */

import {
  __resetNudgeStoreForTests,
  loadFirstBoundAt,
  recordFirstBoundAtIfUnset,
  shouldShowSecondAnchorNudge,
} from '../nudge-store';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('shouldShowSecondAnchorNudge', () => {
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

  test('returns false when 2+ servers are bound (the user already added a second anchor)', () => {
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

  test('returns false when dismissed in-session', () => {
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

  test('returns false when firstBoundAt is unset (user has never bound)', () => {
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

describe('recordFirstBoundAtIfUnset', () => {
  beforeEach(() => {
    __resetNudgeStoreForTests();
  });

  test('writes a timestamp the first time it is called', () => {
    expect(loadFirstBoundAt()).toBeNull();
    recordFirstBoundAtIfUnset(new Date('2026-03-01T00:00:00.000Z'));
    expect(loadFirstBoundAt()).toBe('2026-03-01T00:00:00.000Z');
  });

  test('does NOT overwrite an existing timestamp on subsequent binds', () => {
    recordFirstBoundAtIfUnset(new Date('2026-03-01T00:00:00.000Z'));
    recordFirstBoundAtIfUnset(new Date('2026-04-01T00:00:00.000Z'));
    expect(loadFirstBoundAt()).toBe('2026-03-01T00:00:00.000Z');
  });
});
