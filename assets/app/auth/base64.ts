
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REVERSE: Record<string, number> = (() => {
  const r: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) {
    r[ALPHABET[i]] = i;
  }
  return r;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  while (i + 3 <= len) {
    const b0 = bytes[i++];
    const b1 = bytes[i++];
    const b2 = bytes[i++];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += ALPHABET[b2 & 0x3f];
  }
  const rem = len - i;
  if (rem === 1) {
    const b0 = bytes[i];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[(b0 & 0x03) << 4];
    out += '==';
  } else if (rem === 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += ALPHABET[(b1 & 0x0f) << 2];
    out += '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  let str = s.replace(/=+$/, '');
  const len = str.length;
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let oi = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = str[i];
    const v = REVERSE[c];
    if (v === undefined) {
      throw new Error(`Invalid base64 character at index ${i}: ${c}`);
    }
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}
