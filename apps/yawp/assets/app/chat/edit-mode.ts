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

const ALL_BITS = Object.values(PERMISSION_BITS).reduce((a, b) => a | b, 0);

const MEMBER_BITS =
  PERMISSION_BITS.read_messages |
  PERMISSION_BITS.send_messages |
  PERMISSION_BITS.add_reactions;

const ADMIN_BITS =
  MEMBER_BITS |
  PERMISSION_BITS.manage_messages |
  PERMISSION_BITS.manage_channels |
  PERMISSION_BITS.manage_roles |
  PERMISSION_BITS.kick_members |
  PERMISSION_BITS.ban_members |
  PERMISSION_BITS.create_invite;

/**
 * Coarse client-side estimate of an identity's effective bits from its
 * stored server role label. The server's `effective_bits/3` resolver is
 * authoritative; this only decides which controls to surface so users who
 * can't act don't see dead affordances.
 */
export function bitsForRole(role: string): number {
  switch (role.toLowerCase()) {
    case 'owner':
      return ALL_BITS;
    case 'admin':
      return ADMIN_BITS;
    case 'guest':
      return PERMISSION_BITS.read_messages;
    default:
      return MEMBER_BITS;
  }
}

/** Whether `effectiveBits` carries the named permission bit. */
export function hasPermission(
  effectiveBits: number,
  name: PermissionName,
): boolean {
  return (effectiveBits & PERMISSION_BITS[name]) !== 0;
}

/**
 * Edit mode is available only to users who can rearrange the sidebar —
 * i.e. those holding `manage_channels` (admins and above).
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
