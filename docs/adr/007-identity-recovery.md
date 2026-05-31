# ADR 007 — Identity recovery via BIP-39 mnemonic

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

Yawp's identity is the private key (ADR 005). Losing the device that holds it would, by default, mean losing the identity — and with it, all rooms, contacts, and DM history. The server is keyless, so there is no "forgot password" path. We need a recovery mechanism that is compatible with the keyless-server premise, usable by non-technical users, and strong enough to be the only fallback when every paired device is gone.

## Decision

### Mnemonic as the recovery root

On first launch, the client generates a 12-word **BIP-39 mnemonic phrase** and shows it to the user. The phrase encodes a master seed. From that seed, the client derives two things via HKDF:

1. The user's **identity Ed25519 keypair** (the DID).
2. A **bundle-encryption key** used to encrypt the user's recovery bundle at rest.

Both are deterministic functions of the seed. Anyone who has the mnemonic can reconstruct both.

### Recovery bundle, stored at anchors

The user's anchor servers hold a **key bundle**: a ciphertext blob containing everything a freshly-recovered client needs to come back online:

- Device subkey list
- Anchor server list
- Room memberships
- Contacts and block list
- A small amount of forward-looking metadata (profile_version, last-seen serial numbers)

The bundle is encrypted client-side with the bundle-encryption key derived from the mnemonic. Anchors hold ciphertext only. The bundle is part of the existing private settings blob (ADR 006) — recovery is just "fetch the private blob and decrypt with the mnemonic-derived key."

### Multi-device: pairing, not mnemonic re-entry

The mnemonic is intended as **cold recovery**, not multi-device onboarding. The expected path for adding a second device is the **device-pairing flow**:

- The new device generates a fresh device subkey.
- The existing (already-trusted) device scans a QR code (or types a short code) from the new device.
- The existing device signs a delegation that adds the new subkey to the PPE and pushes it to anchors.
- The new device fetches the bundle from the anchor and decrypts it using a one-time pairing key transferred via the QR/short-code channel.

Users are encouraged to keep their mnemonic offline (paper, password manager) and only re-enter it when no paired device remains.

### No server-side passphrase backup

We do **not** provide a "remember my passphrase on the server" feature in v1. Any such feature would weaken the keyless-server premise (the server becomes a custody party for the recovery secret) and is not a primitive we want to be on the hook for. Users who want assisted recovery can use a password manager.

### Local key protection (recap from ADR 005)

- **Web:** the private key is encrypted with a user-chosen passphrase before being written to IndexedDB.
- **Mobile/desktop:** the private key lives in the OS secure enclave (Keychain, Keystore).

The mnemonic is *not* used as the at-rest encryption key for the on-device private key — that role belongs to the passphrase or the OS keystore. The mnemonic is the recovery seed only.

## Consequences

### Positive

- Recovery is purely cryptographic. No server-side custody, no support workflow to compromise.
- Users with a paired device almost never touch the mnemonic. The high-risk operation (mnemonic entry) stays rare.
- The same primitive (mnemonic → seed → keys) provides both identity portability and bundle recovery. One thing to remember, one thing to lose.
- BIP-39 is well-understood, with broad library support and existing user familiarity from cryptocurrency wallets.

### Negative

- Users who lose their mnemonic *and* all paired devices have no path back. The DID is unrecoverable. This is a deliberate trade-off.
- Anchors holding the bundle can withhold it. Multi-anchor mitigates (any anchor holds a copy). A malicious anchor cannot read the bundle.
- The pairing flow is non-trivial UX and must work in awkward situations (new phone, lost old phone, etc.). Implementation must invest in the edge cases.
- BIP-39 word lists are English-by-default. Localized word lists exist but multiply the spec surface.

### Rejected alternatives

- **Server-stored encrypted passphrase backup.** Rejected: re-introduces a server custody surface and a password-reset attack vector.
- **Custodial recovery (the operator can rotate identities).** Rejected: incompatible with the keyless-server premise. Anchor operators would become identity providers.
- **Social recovery (trusted contacts hold shards).** Rejected for v1: meaningful UX cost, hard to explain, and the user must onboard recovery contacts *before* they need them. May revisit.
- **No recovery at all (just multi-device pairing).** Rejected: a user with a single device who loses it cannot come back. The mnemonic is the safety net for exactly that case.

## References

- [CONTEXT.md](../../CONTEXT.md) — mnemonic, key bundle, device pairing
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [docs/cryptography-glossary.md](../cryptography-glossary.md) — BIP-39, HKDF, Ed25519
