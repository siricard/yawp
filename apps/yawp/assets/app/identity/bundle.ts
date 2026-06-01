
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
