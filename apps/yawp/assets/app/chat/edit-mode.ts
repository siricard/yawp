import {useCallback, useState} from 'react';

/**
 * Client-side mirror of the server permission-bit registry
 * (`Yawp.Servers.Permissions`). Used to decide which destructive
 * channel/category affordances to render. The server independently
 * enforces every gated action — this only keeps the controls out of
 * the navigation surface for users who can't use them.
 */
export const PERMISSION_BITS = {
  read_messages: 1 << 0,
  send_messages: 1 << 1,
  manage_messages: 1 << 2,
  manage_channels: 1 << 3,
  manage_roles: 1 << 4,
  kick_members: 1 << 5,
  ban_members: 1 << 6,
  create_invite: 1 << 7,
  read_history_before_join: 1 << 8,
  mention_everyone: 1 << 9,
  mention_role: 1 << 10,
  add_reactions: 1 << 11,
  delete_server: 1 << 12,
  transfer_ownership: 1 << 13,
  voice_speak: 1 << 14,
  voice_listen: 1 << 15,
} as const;

export type PermissionName = keyof typeof PERMISSION_BITS;

/** Whether `effectiveBits` carries the named permission bit. */
export function hasPermission(
  effectiveBits: number,
  name: PermissionName,
): boolean {
  return (effectiveBits & PERMISSION_BITS[name]) !== 0;
}

/**
 * Edit mode is available only to users who can rearrange the sidebar —
 * i.e. those holding `manage_channels` (admins and above per ADR 017).
 */
export function canEnterEditMode(effectiveBits: number): boolean {
  return hasPermission(effectiveBits, 'manage_channels');
}

export type UseEditModeResult = {
  /** True when the current identity may toggle edit mode at all. */
  available: boolean;
  /** True when edit mode is currently on. Always false when unavailable. */
  enabled: boolean;
  /** Flip edit mode. No-op when unavailable. */
  toggle: () => void;
  /** Force edit mode off (e.g. when navigating away). */
  exit: () => void;
};

/**
 * Drives the client-side edit-mode toggle. Off by default; the toggle is
 * only surfaced to `manage_channels` holders. When the current identity
 * lacks the bit, `available` is false and `enabled` can never become
 * true, so the destructive affordances stay hidden.
 */
export function useEditMode(effectiveBits: number): UseEditModeResult {
  const available = canEnterEditMode(effectiveBits);
  const [on, setOn] = useState(false);

  const toggle = useCallback(() => {
    if (!available) return;
    setOn(prev => !prev);
  }, [available]);

  const exit = useCallback(() => setOn(false), []);

  return {available, enabled: available && on, toggle, exit};
}
