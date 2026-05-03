
import {sha256} from '@noble/hashes/sha2.js';

import {ADJECTIVES, ANIMALS} from './word-pair-lists';

/**
 * Return a stable, human-friendly default display name derived from the
 * given master public key. The same key always yields the same name.
 */
export function defaultDisplayName(masterPk: Uint8Array): string {
  const digest = sha256(masterPk);
  const adjIndex = ((digest[0] << 8) | digest[1]) % ADJECTIVES.length;
  const aniIndex = ((digest[2] << 8) | digest[3]) % ANIMALS.length;
  return `${ADJECTIVES[adjIndex]} ${ANIMALS[aniIndex]}`;
}
