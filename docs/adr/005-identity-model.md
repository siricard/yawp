# ADR 005 — Identity model: key-as-credential, no password

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

Yawp's identity is a client-held Ed25519 keypair. The DID is `base58(sha256(public_key))`. The server is keyless. M3's challenge-response authentication already verifies signatures against the public key, but the broader identity model — what "the user" is, how it's protected at rest, how it's recovered, what travels with it — was not pinned down. Without an ADR, future workers risked layering password-based assumptions, server-side identity stores, or per-server profile silos on top of an identity model that does not need them.

## Decision

### Core model

- **Identity is the keypair.** The private key on the device is the credential. There is no password, email, or recoverable login on the server side.
- **The DID is portable.** It is not tied to any server. The same DID is the same user across every server they interact with.
- **The server is keyless.** No part of the protocol stores or accepts a private key. Recovery of a lost key is the user's responsibility (see [ADR 007](007-identity-recovery.md)).

### What "the user" consists of

- A master Ed25519 keypair (the identity).
- One or more device subkeys, each signed by the master key. Used so peers can encrypt to each device individually (see [ADR 006](006-anchor-server-architecture.md) for storage).
- A signed Public Profile Envelope (PPE) containing display name, avatar, bio, anchor server list, public key, profile version, and device subkeys.
- A client-encrypted private settings blob containing room memberships, contacts, blocks, notification preferences, and device metadata.

### Local key protection

- **Web client:** the private key is encrypted at rest with a user-chosen passphrase before being written to IndexedDB. The passphrase never leaves the device.
- **Mobile/desktop:** the private key is stored in the platform's secure enclave (iOS Keychain, Android Keystore, macOS Keychain). No additional passphrase required; the OS-level device unlock provides the equivalent.

### Sessions

- Each server the user interacts with maintains an independent session, created via challenge-response per [ADR 001](001-auth-wire-format.md).
- After successful challenge-response, the server issues a refresh token (long-lived, opaque, per-server). Subsequent app launches use the refresh token instead of re-signing.

### Names

- The **DID** is canonical identity.
- The **display name** is free-form text in the PPE. Not unique, can collide.
- The **anchor handle** (`alice@a1.example.com`) is an optional convenience alias issued per anchor. Used for human-typeable references and WebFinger lookup. Different anchors may issue different handles; no cross-anchor uniqueness.

## Consequences

### Positive

- Cannot phish or breach a password — there isn't one.
- DID is portable across servers from day one. No "migrate your identity" feature ever needs to exist.
- Server operators cannot impersonate users; they don't have the private key.
- Aligns with the broader Yawp design (federation, anchor servers, E2EE) — those features only make sense given a portable cryptographic identity.

### Negative

- Losing the private key means losing the identity. Recovery is a separate concern (ADR 007), but the trade-off is unavoidable.
- Multi-device requires deliberate device-pairing UX. There is no "log in on a new device with email + password."
- Users new to the model may find the absence of password confusing. UX must explain it.
- Web passphrase is a UX speed bump on every browser unlock. We accept the cost for confidentiality on a platform where IndexedDB is reachable from any code that runs on the origin.

### Rejected alternatives

- **Server-stored password as primary credential.** Rejected: incompatible with the keyless-server premise.
- **Password as a second factor.** Rejected for v1: adds a UX cost without proportional security gain over the local key protection above. May revisit.
- **No local key protection on web.** Rejected: IndexedDB is not a secure store; any script on the origin can read it.

## References

- [ADR 001 — Auth wire format](001-auth-wire-format.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 007 — Identity recovery](007-identity-recovery.md)
- [CONTEXT.md](../../CONTEXT.md)
- [docs/cryptography-glossary.md](../cryptography-glossary.md)
