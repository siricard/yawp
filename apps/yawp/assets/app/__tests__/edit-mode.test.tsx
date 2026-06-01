import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  PERMISSION_BITS,
  canEnterEditMode,
  hasPermission,
  useEditMode,
} from '../chat/edit-mode';

const MEMBER_BITS =
  PERMISSION_BITS.read_messages |
  PERMISSION_BITS.send_messages |
  PERMISSION_BITS.add_reactions;

const ADMIN_BITS = MEMBER_BITS | PERMISSION_BITS.manage_channels;

describe('permission-bit helpers', () => {
  test('every bit is a distinct power of two', () => {
    const values = Object.values(PERMISSION_BITS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(v).toBeGreaterThan(0);
      expect(v & (v - 1)).toBe(0);
    }
  });

  test('hasPermission tests membership of a named bit', () => {
    expect(hasPermission(MEMBER_BITS, 'send_messages')).toBe(true);
    expect(hasPermission(MEMBER_BITS, 'manage_channels')).toBe(false);
    expect(hasPermission(ADMIN_BITS, 'manage_channels')).toBe(true);
  });

  test('canEnterEditMode requires manage_channels', () => {
    expect(canEnterEditMode(MEMBER_BITS)).toBe(false);
    expect(canEnterEditMode(ADMIN_BITS)).toBe(true);
    expect(canEnterEditMode(0)).toBe(false);
  });
});

type HookResult = ReturnType<typeof useEditMode>;

function renderHook(initialBits: number) {
  const result: {current: HookResult | null} = {current: null};

  function Probe({bits}: {bits: number}) {
    result.current = useEditMode(bits);
    return null;
  }

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe bits={initialBits} />);
  });

  return {
    result,
    rerender(bits: number) {
      ReactTestRenderer.act(() => {
        renderer.update(<Probe bits={bits} />);
      });
    },
    unmount() {
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

describe('useEditMode', () => {
  test('a member cannot enter edit mode; toggle is a no-op', () => {
    const {result, unmount} = renderHook(MEMBER_BITS);
    expect(result.current!.available).toBe(false);
    expect(result.current!.enabled).toBe(false);

    ReactTestRenderer.act(() => result.current!.toggle());
    expect(result.current!.enabled).toBe(false);
    unmount();
  });

  test('an admin can toggle edit mode on and off; off by default', () => {
    const {result, unmount} = renderHook(ADMIN_BITS);
    expect(result.current!.available).toBe(true);
    expect(result.current!.enabled).toBe(false);

    ReactTestRenderer.act(() => result.current!.toggle());
    expect(result.current!.enabled).toBe(true);

    ReactTestRenderer.act(() => result.current!.toggle());
    expect(result.current!.enabled).toBe(false);
    unmount();
  });

  test('exit forces edit mode off', () => {
    const {result, unmount} = renderHook(ADMIN_BITS);
    ReactTestRenderer.act(() => result.current!.toggle());
    expect(result.current!.enabled).toBe(true);

    ReactTestRenderer.act(() => result.current!.exit());
    expect(result.current!.enabled).toBe(false);
    unmount();
  });

  test('losing manage_channels forces enabled back to false', () => {
    const {result, rerender, unmount} = renderHook(ADMIN_BITS);
    ReactTestRenderer.act(() => result.current!.toggle());
    expect(result.current!.enabled).toBe(true);

    rerender(MEMBER_BITS);
    expect(result.current!.available).toBe(false);
    expect(result.current!.enabled).toBe(false);
    unmount();
  });
});
