
export const STORAGE_KEY_V1 = '****************';

export type IdentityBundleV1 = {
  version: 1;
  master: {
    sk: string; 
  };
  device: {
    deviceId: string;
    sk: string; 
    pk: string; 
    signature: string; 
    issuedAt: string; 
  };
  /**
   * identity-scoped client metadata persisted inside the
   * same bundle as the rest of the on-device state. Forward-compatible:
   * the field is optional, and v1 bundles written before this fix (no
   * `metadata` key) still pass the type guard. New keys MUST stay
   * optional so older readers tolerate them.
   */
  metadata?: {
    /**
     * User-chosen display-name override. Absent ⇒ the deterministic
     * word-pair default (derived from masterPk) is shown.
     */
    displayNameOverride?: string;
    servers?: Array<{url: string; did: string; role: string; label: string}>;
    /**
     * ISO 8601 timestamp captured the first time the device
     * successfully bound to a server. Drives the 7-day second-anchor
     * nudge. Lives inside the identity bundle so the state resets cleanly
     * across identity recovery/replacement and IndexedDB clears.
     */
    firstBoundAt?: string;
    /**
     * set to `true` once the user dismisses the
     * second-anchor nudge. Persisted so the dismissal survives reloads
     * (and so a fresh identity sees a fresh nudge).
     */
    secondAnchorNudgeDismissed?: boolean;
    profileVersion?: number;
    publishedProfile?: {
      display_name?: string;
      avatar_ref?: string;
      bio?: string;
      anchors?: string[];
    };
    acceptedPeers?: string[];
    pinnedPeers?: string[];
    readReceiptsEnabled?: boolean;
    notificationPreferences?: {
      servers?: Record<string, 'all' | 'mentions_only' | 'muted'>;
      channels?: Record<string, 'all' | 'mentions_only' | 'muted'>;
      conversations?: Record<string, 'all' | 'mentions_only' | 'muted'>;
    };
    peerVerification?: Array<{
      peer_did: string;
      status: 'verified' | 'key_changed';
      fingerprint_at_verification: string;
      verified_at: string;
    }>;
  };
};

/** base64url (no padding) encode. */
export function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (no padding) decode. */
export function b64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function isIdentityBundleV1(value: unknown): value is IdentityBundleV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  const m = v.master as Record<string, unknown> | undefined;
  const d = v.device as Record<string, unknown> | undefined;
  if (!m || typeof m.sk !== 'string') return false;
  if (!d) return false;
  if (
    typeof d.deviceId !== 'string' ||
    typeof d.sk !== 'string' ||
    typeof d.pk !== 'string' ||
    typeof d.signature !== 'string' ||
    typeof d.issuedAt !== 'string'
  ) {
    return false;
  }
  if ('metadata' in v && v.metadata !== undefined) {
    if (typeof v.metadata !== 'object' || v.metadata === null) return false;
    const meta = v.metadata as Record<string, unknown>;
    if (
      'displayNameOverride' in meta &&
      meta.displayNameOverride !== undefined &&
      typeof meta.displayNameOverride !== 'string'
    ) {
      return false;
    }
    if (
      'firstBoundAt' in meta &&
      meta.firstBoundAt !== undefined &&
      typeof meta.firstBoundAt !== 'string'
    ) {
      return false;
    }
    if (
      'secondAnchorNudgeDismissed' in meta &&
      meta.secondAnchorNudgeDismissed !== undefined &&
      typeof meta.secondAnchorNudgeDismissed !== 'boolean'
    ) {
      return false;
    }
    if (
      'readReceiptsEnabled' in meta &&
      meta.readReceiptsEnabled !== undefined &&
      typeof meta.readReceiptsEnabled !== 'boolean'
    ) {
      return false;
    }
    if (
      'notificationPreferences' in meta &&
      meta.notificationPreferences !== undefined
    ) {
      if (
        typeof meta.notificationPreferences !== 'object' ||
        meta.notificationPreferences === null
      ) {
        return false;
      }
      const prefs = meta.notificationPreferences as Record<string, unknown>;
      const levelsOk = (value: unknown) =>
        value === 'all' || value === 'mentions_only' || value === 'muted';
      const scopeOk = (key: string) => {
        if (!(key in prefs) || prefs[key] === undefined) return true;
        if (
          typeof prefs[key] !== 'object' ||
          prefs[key] === null ||
          Array.isArray(prefs[key])
        ) {
          return false;
        }
        return Object.values(prefs[key] as Record<string, unknown>).every(levelsOk);
      };
      if (!scopeOk('servers')) return false;
      if (!scopeOk('channels')) return false;
      if (!scopeOk('conversations')) return false;
    }
    if (
      'profileVersion' in meta &&
      meta.profileVersion !== undefined &&
      (typeof meta.profileVersion !== 'number' ||
        !Number.isFinite(meta.profileVersion))
    ) {
      return false;
    }
    if ('publishedProfile' in meta && meta.publishedProfile !== undefined) {
      if (
        typeof meta.publishedProfile !== 'object' ||
        meta.publishedProfile === null
      ) {
        return false;
      }
      const prof = meta.publishedProfile as Record<string, unknown>;
      const stringFieldOk = (key: string) =>
        !(key in prof) ||
        prof[key] === undefined ||
        typeof prof[key] === 'string';
      if (!stringFieldOk('display_name')) return false;
      if (!stringFieldOk('avatar_ref')) return false;
      if (!stringFieldOk('bio')) return false;
      if ('anchors' in prof && prof.anchors !== undefined) {
        if (!Array.isArray(prof.anchors)) return false;
        if (!prof.anchors.every(a => typeof a === 'string')) return false;
      }
    }
    if ('acceptedPeers' in meta && meta.acceptedPeers !== undefined) {
      if (!Array.isArray(meta.acceptedPeers)) return false;
      if (!meta.acceptedPeers.every(peer => typeof peer === 'string')) return false;
    }
    if ('pinnedPeers' in meta && meta.pinnedPeers !== undefined) {
      if (!Array.isArray(meta.pinnedPeers)) return false;
      if (!meta.pinnedPeers.every(peer => typeof peer === 'string')) return false;
    }
    if ('peerVerification' in meta && meta.peerVerification !== undefined) {
      if (!Array.isArray(meta.peerVerification)) return false;
      const ok = meta.peerVerification.every(record => {
        if (!record || typeof record !== 'object') return false;
        const r = record as Record<string, unknown>;
        return (
          typeof r.peer_did === 'string' &&
          (r.status === 'verified' || r.status === 'key_changed') &&
          typeof r.fingerprint_at_verification === 'string' &&
          typeof r.verified_at === 'string'
        );
      });
      if (!ok) return false;
    }
    if ('servers' in meta && meta.servers !== undefined) {
      if (!Array.isArray(meta.servers)) return false;
      const ok = meta.servers.every(
        s =>
          s &&
          typeof s === 'object' &&
          typeof (s as Record<string, unknown>).url === 'string' &&
          typeof (s as Record<string, unknown>).did === 'string' &&
          typeof (s as Record<string, unknown>).role === 'string' &&
          typeof (s as Record<string, unknown>).label === 'string',
      );
      if (!ok) return false;
    }
  }
  return true;
}
