import React from 'react';
import {Text, View} from 'react-native';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  did?: string;
  displayName?: string;
  size?: AvatarSize;
  testID?: string;
};

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 96,
};

const SIZE_TEXT: Record<AvatarSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-xl',
};

const TINT_PALETTE = [
  '#74cf86',
  '#d8ee4d',
  '#e8a06b',
  '#e8615a',
  '#6bbef0',
  '#b48ee8',
  '#f0c674',
  '#5fb3a1',
];

export function avatarTintFromDid(did: string | undefined): string {
  if (!did) return TINT_PALETTE[0];
  let h = 0;
  for (let i = 0; i < did.length; i++) {
    h = (h * 31 + did.charCodeAt(i)) >>> 0;
  }
  return TINT_PALETTE[h % TINT_PALETTE.length];
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map(p => p.charAt(0).toUpperCase())
    .join('') || '?';
}

export function Avatar({did, displayName, size = 'md', testID}: AvatarProps) {
  const px = SIZE_PX[size];
  const tint = avatarTintFromDid(did);
  const initials = initialsFromName(displayName ?? did ?? '?');
  return (
    <View
      testID={testID}
      accessibilityLabel={displayName ? `avatar ${displayName}` : 'avatar'}
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        backgroundColor: tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        className={`font-bold text-on-primary ${SIZE_TEXT[size]}`}
        style={{color: '#202831'}}>
        {initials}
      </Text>
    </View>
  );
}
