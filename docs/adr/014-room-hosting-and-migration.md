# ADR 014 — Room hosting model and migration

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Yawp's federation model (ADR 009) routes DMs through anchors but leaves the question of *where a room lives* deliberately open. Matrix's answer — replicate every room across every participating server, resolve conflicts via state-resolution — costs an enormous amount of complexity for a property (server-of-record disappears? room still works) that Yawp does not need to deliver. Yawp's framing is friend-group self-hosting: there is almost always a clear "this is *our* server" for any given room, and the failure mode that actually matters is "our operator wound down the VPS" — which calls for a *migration* primitive, not replication.

Without an explicit decision, ambiguity about room authority would leak into every adjacent ADR (membership, moderation, ordering). This ADR pins it down so ADRs 015–020 can build on a stable base.

## Decision

### Single-host rooms

Each room is hosted on **exactly one server** at any moment. That server is the room's **host server** (CONTEXT.md). It is authoritative for:

- The room's message log (ordering, edits, tombstones — see ADR 019).
- The room roster (membership, joins, leaves, kicks, bans).
- Roles, permissions, and channel overrides (ADR 017).
- Moderation state (banned users, retention policy, channel settings).
- Room metadata (name, topic, type, category, position).

There is no "secondary host," no replication tier, no quorum. If the host is down, the room is down for everyone — including the participants on other servers.

### Writes go directly to the host

ADR 009 already established the general rule that *the server holding the data is the entry point for writes to that data*. This ADR makes the implication explicit for rooms: **room writes go directly from the sender's client to the room's host server, not through the sender's anchor.**

For participants whose anchor is the host, this is local. For participants whose anchor is elsewhere, the host server is a *guest server* with respect to the participant — the participant is auto-guested on first contact (ADR 015) and maintains an on-demand connection (ADR 009) for as long as they are interacting with rooms on that host.

### Room migration

The answer to "what if my operator disappears" is **operator-initiated migration**, not replication.

The flow:

1. The source host (the operator winding down, switching VPS, or moving to managed hosting) prepares a signed export bundle: message log, roster, roles, channel overrides, categories, settings. The bundle is signed with the source host's server keypair (ADR 013).
2. The destination host imports the bundle and counter-signs an acceptance record with its own server keypair.
3. The source host emits a **signed migration event** into the room timeline. The event references both signatures and the destination host's address.
4. Participants' clients receive the migration event on next contact, validate both signatures against the published key documents (ADR 013), and **update their host pointer** to the destination.
5. From that point forward, writes go to the new host. The old host MAY continue to serve read-only access for a grace period to catch stragglers, then decommissions the room.

The migration event is part of the timeline, signed by the source host (since no individual user is migrating the room — the operator is). Future readers can verify the chain: source signed the export, destination counter-signed the import, both signatures resolve to keys that were valid in the relevant key documents at the time.

### Identities are unaffected

DIDs do not change across migration. Migration moves **room state** (the log, the roster, the settings) — it does not touch user identities, PPEs, anchors, or private blobs. A participant whose anchor is unrelated to either host is simply notified and re-points.

A participant whose anchor *was* the source host is unaffected as a user — anchoring and room hosting are separate relationships. They may keep the same anchor on the source server while their rooms move elsewhere, or they may also migrate their anchor (a separate flow, out of scope for this ADR).

### Migration is the answer to operator disappearance

Self-hosting is only a real choice if it isn't a one-way door. Migration is the primitive that makes self-hosting reversible: an operator who wants to stop running a server can hand their rooms to a managed host, a friend's box, or another operator — without forcing every user to re-create rooms from scratch and lose history.

## Consequences

### Positive

- Massive complexity reduction vs. replicated rooms. No state-resolution algorithm, no quorum, no eventual-consistency surface to debug.
- Clear authority for every room operation. "Who is in charge here?" has a one-sentence answer.
- Migration is portable by design: the export/import bundle is a documented format, not implicit in a replication protocol.
- Self-hosting is reversible. Operators are not locked in to running the box forever.
- The host is also the natural point for moderation actions (ADR 017) and rate limiting.

### Negative

- A host outage is a room outage. There is no automatic failover. Mitigated by operator choice (good hosting) and the fact that rooms are recoverable from backups by the same operator.
- Migration requires operator cooperation on both ends. If a source operator vanishes without exporting, participants lose the room history. Bring-your-own-backup is the off-ramp: operators are expected to take regular backups, and Yawp may grow tooling to construct migration bundles from a backup, but that is not a v1 protocol commitment.
- Cross-operator migration requires both operators to trust each other's signatures and to agree on the bundle format. Versioning of the bundle format will need care.

### Rejected alternatives

- **Replicated rooms (Matrix-style).** Rejected: state-resolution is a large and persistently-buggy surface area that we would inherit. The property it buys ("any participating server can keep the room alive") is not worth that cost for friend-group framing.
- **No portability; rooms are tied to the host forever.** Rejected: makes self-hosting a one-way door and undermines the framing that operators can come and go.
- **Client-side reconstruction of rooms from each member's local log.** Rejected: requires every client to hold the full room history; breaks for new joiners; offers no authoritative state for moderation.
- **Federation-level "primary + standby host" replication.** Rejected for v1: a half-step toward Matrix-style replication that inherits most of the complexity without delivering the full property. Revisit if operational data justifies it.

## References

- [CONTEXT.md](../../CONTEXT.md) — room, host server, room migration, room roster
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
