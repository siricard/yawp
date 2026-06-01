import {useCallback, useState} from 'react';

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

export function hasPermission(
  effectiveBits: number,
  name: PermissionName,
): boolean {
  return (effectiveBits & PERMISSION_BITS[name]) !== 0;
}

export function canEnterEditMode(effectiveBits: number): boolean {
  return hasPermission(effectiveBits, 'manage_channels');
}

export type UseEditModeResult = {
  available: boolean;
  enabled: boolean;
  toggle: () => void;
  exit: () => void;
};

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
