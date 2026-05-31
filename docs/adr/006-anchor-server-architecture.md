# ADR 006 — Anchor server architecture

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

A Yawp user can be present on many servers (one user, many rooms, many communities). Most federated chat designs (Matrix, Mastodon) tie identity to one home server, which becomes a single point of failure and a bottleneck for portability. Yawp's identity is server-agnostic (ADR 005), but that raises a new question: **which servers actually hold the user's data?** Without an explicit answer, every server the user touches either holds redundant copies of their data or doesn't know anything about them.

## Decision

### Two server relationships per user

A server is either an **anchor server** or a **guest server** with respect to each user:

- **Anchor server** — chosen by the user. Stores the user's canonical data:
  - The signed Public Profile Envelope (PPE) — plaintext
  - The client-encrypted private settings blob — opaque ciphertext
- **Guest server** — the user is present but has not chosen this server as an anchor. The server caches the user's PPE (so it can render the display name + avatar of anyone in its rooms) but holds no private data.

The same physical server is an anchor for some users, a guest for others. The role is the **relationship**, not the server.

A user has *at least one* anchor at any time and may have several (typically 2–3 for redundancy). Anchors are listed in the PPE, so any party that can read the PPE knows where to route to.

### What anchors store

Per user, an anchor stores:

| Field | Encryption | Visibility |
|---|---|---|
| Display name, avatar, bio | Plaintext, signed | Public (replicated to guest servers) |
| Anchor server list | Plaintext, signed | Public (in PPE) |
| Public key, profile_version | Plaintext, signed | Public (in PPE) |
| Device subkeys + opaque device IDs | Plaintext, signed | Public (in PPE) |
| Room memberships | Encrypted (private blob) | User-only |
| Contact list, DM pointers | Encrypted (private blob) | User-only |
| Blocked users, mute list | Encrypted (private blob) | User-only |
| Notification preferences | Encrypted (private blob) | User-only |
| Device names, platforms, push tokens | Encrypted (private blob) | User-only |
| Optional encrypted key backup | Encrypted (private blob) | User-only |

### What guest servers cache

Per user, a guest server caches:

- The PPE, refreshed via piggybacked `profile_version` in any message envelope. When a guest server sees a higher version than its cache, it fetches the new PPE from one of the user's anchors and verifies the signature.

Guest servers store no private blob. They are not part of the user's data-replication tier.

### Inbox (pending DM queue)

Anchors hold the user's **inbox** — the queue of encrypted message envelopes addressed to the user that have not yet been picked up by a connected device. Inbox lives at the anchor because the anchor is reachable when the user's devices aren't. The inbox is replicated across anchors (see [ADR 008](008-anchor-sync-protocol.md) for protocol).

### Trust model

- The anchor sees who anchors with them. There is no way around this — they are literally hosting the data.
- The anchor cannot read the private blob.
- The anchor cannot forge the PPE (it's signed).
- The anchor can deny service (drop the data, refuse to relay). Multiple anchors mitigate.
- **Pick anchor servers the same way you pick an email provider.** Trust, uptime, privacy posture.

## Consequences

### Positive

- Identity portability is real: changing anchors is data migration, not identity change. The DID is unaffected.
- Failure-tolerant: with N anchors, you lose service only if all N go down (see [ADR 009](009-federation-routing.md) for degraded mode).
- The privacy boundary is sharp and unambiguous: PPE is public-by-design, private blob is opaque-by-design.
- Self-hosting is meaningful — you can run your own anchor for full data sovereignty.

### Negative

- Multi-anchor synchronization is a real protocol that must be specified ([ADR 008](008-anchor-sync-protocol.md)).
- Onboarding requires the user to pick at least one anchor. UX must make this approachable.
- Server operators have additional storage cost for users who pick them as anchors. Mitigated by the user choosing — they're opting in.
- A user with no anchor cannot use the system. Anchor selection is part of signup.

### Rejected alternatives

- **One home server (Matrix-style).** Rejected: makes the home server a single point of failure and ties identity to one operator.
- **All-on-every-server (Nostr-style).** Rejected: every server holding every user's data does not scale and breaks the "your data is at servers you trust" model.
- **No data on servers; all client-held.** Rejected: makes offline message delivery impossible — the recipient must be online when the sender hits send.

## References

- [CONTEXT.md](../../CONTEXT.md) — anchor server, guest server, PPE, private settings blob
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md) (TBD)
- [ADR 009 — Federation routing](009-federation-routing.md) (TBD)
