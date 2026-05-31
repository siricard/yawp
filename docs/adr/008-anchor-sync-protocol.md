# ADR 008 — Anchor sync protocol

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

A user may have multiple anchor servers (ADR 006), each holding a copy of their PPE, private settings blob, and inbox. Anchors must stay consistent: a PPE update from one anchor must propagate to the others, the same inbound DM must not be delivered twice, and a client connecting to anchor A should see the same data as on anchor B. Without an explicit protocol, anchors would diverge silently.

## Decision

### Hybrid push/pull

Anchors synchronize via a combination of:

- **Push:** when an anchor accepts a write from one of its users' devices (PPE update, private-blob update, inbox enqueue, device subkey change), it immediately forwards the change to the user's other anchors.
- **Pull on reconnect:** when an anchor comes back online after a partition, it asks its peer anchors for any deltas it missed, using per-stream serial numbers.

Push is the fast path. Pull is the recovery path. Both are required — push alone fails under partitions; pull alone is slow for the steady state.

### Conflict resolution via signed `profile_version`

The PPE carries a monotonically increasing `profile_version`, signed by the user's master key. When two anchors disagree on the PPE:

- Higher `profile_version` wins.
- Ties (same version, different content) are impossible if the client increments correctly. If they occur (bug), the anchor logs and refuses to apply; the user's next legitimate update naturally resolves it.

The private settings blob carries its own `blob_version`, also signed (the signature being over the ciphertext is sufficient — anchors don't need to read inside). Same rule.

### Inbox: append-only, idempotent by envelope ID

The inbox is an **append-only log of encrypted envelopes**, keyed by a sender-chosen envelope ID (random 128-bit). Anchors deduplicate by envelope ID, so the same DM relayed twice (push + pull) is a no-op. Envelopes are deleted only after explicit ACK from the user's device.

### Wire format

Anchor-to-anchor traffic uses signed envelopes over HTTPS (ADR 011-ish — federation transport):

- Each sync message is wrapped in a **delivery wrapper** signed by the sending anchor's server keypair.
- The receiving anchor verifies the server signature against the sending anchor's published key document (`/.well-known/yawp/server-key.json`).
- The wrapper contains: a nonce, a timestamp, the payload, and the signature.

The payload itself is one of:

- `PpeUpdate` — full PPE blob, signed by the user.
- `BlobUpdate` — full ciphertext blob with `blob_version`, signed by the user.
- `InboxAppend` — encrypted envelope with envelope ID.
- `DeviceSubkeyChange` — subkey diff (added/revoked), embedded in the PPE update flow.
- `PullRequest` / `PullResponse` — replay missed deltas since serial N.

### Anchor liveness and routing

Each user's PPE lists their anchors with a stable order (user-controlled). When a sender's anchor needs to deliver to a recipient anchor, it picks the **first reachable** anchor in the recipient's list and retries down the list on failure. Receiving anchor is responsible for fan-out to the user's other anchors via push.

### No BEAM distribution between operators

Anchor sync uses the federation API (HTTPS + signed envelopes). It does **not** use BEAM distribution. BEAM clustering is reserved for nodes within a single operator's deployment (e.g., a multi-node anchor running behind one administrative domain).

### Backpressure and limits

- Each anchor enforces a per-peer **delivery budget** (ADR 010) on inbound writes.
- Pull requests are capped (e.g., 1000 envelopes per response, paginated).
- A peer that exceeds its budget is throttled, not banned (banning is ADR 010).

## Consequences

### Positive

- Anchors converge without a central coordinator. No "leader" anchor.
- Signed versions make conflict resolution mechanical and auditable — no operator judgment calls.
- Idempotency on the inbox means partial failures retry safely.
- The same envelope-signing primitive is reused for all federation traffic.

### Negative

- Anchors must implement the full push + pull protocol, including pagination, retries, and dedupe. Real protocol work.
- A network partition can leave an anchor stale until pull-on-reconnect completes. Window is the partition duration.
- A buggy client that double-increments `profile_version` could orphan an update. Mitigated by client-side discipline (single-writer enforcement on the device with the highest serial number).

### Rejected alternatives

- **Pure push.** Rejected: doesn't recover from partitions cleanly.
- **Pure pull.** Rejected: every anchor would poll on a timer; high latency for live messages.
- **CRDT-merged PPE.** Rejected for v1: PPE is structured and small; signed versioning is simpler and more auditable.
- **BEAM distribution across operators.** Rejected: requires shared cookies / VPN / cluster trust between distrustful operators. Not aligned with federation.

## References

- [CONTEXT.md](../../CONTEXT.md) — anchor server, profile_version, inbox, delivery wrapper
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 010 — Abuse model](010-abuse-model.md)
- [ADR 013 — Key rotation](013-key-rotation.md)
