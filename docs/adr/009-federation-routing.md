# ADR 009 — Federation routing model

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

Yawp is multi-server by design. Users (ADR 005) have identities portable across servers; anchors (ADR 006) hold their canonical data; rooms live on individual host servers. Without a routing model, every implementation choice — DM delivery, presence, room writes, notification fan-in — risks being made ad hoc and inconsistently.

## Decision

### Cold contact: discovery URLs

When two users have *never* interacted before and share no server, first contact bootstraps through a **discovery URL**: `yawp://a1.example.com/u/<did>`. The URL points to one anchor where the recipient's PPE can be fetched. Once fetched, the PPE contains the recipient's full anchor list, public key, and device subkeys — the URL is no longer needed.

Discovery URLs are surfaced via QR codes, share links, and the anchor-handle form (`alice@a1.example.com`) resolved via WebFinger. The 90% case is **warm contact** — two users meeting on a shared room — where no discovery URL is needed: the room's host server already has the PPE.

### DM routing: through your anchor

Bob sends a DM to Alice. Bob's client posts the encrypted envelope to **Bob's anchor**, not directly to Alice's anchor. Bob's anchor relays to one of Alice's anchors (chosen by liveness), which holds the envelope in Alice's inbox until Alice's devices pick it up.

Rationale:
- Bob's client only authenticates against his own anchor for outgoing DMs. The auth surface stays minimal.
- Bob's anchor can rate-limit, queue, and retry — it is in the best position to do so.
- The "federation protocol" is reduced to **anchor-to-anchor delivery**, with a uniform interface.

### Room writes: direct to the room's host server

Room messages are submitted **directly** by the sender's client to the room's host server. They are not relayed through the sender's anchor. Rationale:
- The room's state lives at the host. Anything that mutates the room state must hit the authoritative source.
- The sender already has a session with the host (it's where the room is).
- Eliminates a hop in the common case and prevents the sender's anchor from gatekeeping room participation.

**General rule:** *the server that holds the data is the entry point for writes to that data.* Anchors are the entry point for the user's own data (PPE, private blob, inbox); room host servers are the entry point for room data.

### Auth: per-server, refresh tokens, lazy

- Each server-relationship is authenticated independently via challenge-response (ADR 001).
- After successful challenge-response, the server issues a refresh token (long-lived, opaque). Subsequent app launches use the refresh token rather than re-signing a challenge.
- **Anchors are always-on:** clients open a persistent websocket to one anchor at app launch.
- **Guest servers are on-demand:** clients open a websocket only when the user is actively interacting with that server.

### Presence: brokered through anchors

For 50-server users, opening 50 websockets at launch is impractical (especially mobile). Instead:

- The user's client maintains a single always-on connection to one of their anchors.
- That anchor knows the user's online state.
- Guest servers subscribe to the user's anchor for presence updates. The anchor pushes coarse presence (online / idle / offline) to subscribed guests.
- Fine presence (typing indicators, read receipts) is per-room and only meaningful when the user is actively viewing that room — at which point the direct connection to that room's host server exists.

### Notifications: fan-in via anchors

When a guest server has activity for a user (room mention, room message in a notified room), it notifies the user's anchor. The anchor forwards to the user's connected devices (or holds for offline pickup).

Guest servers do *not* need direct push connections to the user's mobile devices. The anchor is the single fan-in point for mobile push.

### Failure mode: degraded operation

If none of the user's anchor servers are reachable, the client enters **degraded mode**:

- The client falls back to opening direct websockets to guest servers it has refresh tokens for.
- The user can still chat in rooms whose host servers are reachable.
- Presence appears **offline globally** because the anchor presence broker is down. The user looks offline to everyone, even users in rooms they're actively chatting in.
- DM delivery to/from the user is paused; the inbox cannot be read or written.
- The UI shows a **prominent warning**: "No anchor server reachable. Direct messages and notifications are paused."

Degraded mode is correctness-preserving (no data is lost; inbox waits at the anchor) but feature-degraded.

## Consequences

### Positive

- Single, uniform federation primitive: anchor-to-anchor delivery. All other federation cases (presence, notifications, DMs) ride on top.
- Mobile-friendly from day one: only the anchor needs to be reachable in the background.
- The "shared server" UX case (the 90%) avoids federation entirely — peers and their PPEs are local.
- Anchors earn their keep: they are the single most important component in the user's life and have well-defined responsibilities.

### Negative

- Anchor reachability is critical. A user with all anchors down is degraded. Mitigated by multiple anchors (typically 2–3).
- Anchor-to-anchor protocol is real federation work and must be implemented carefully (auth, replay protection, rate limits).
- The bootstrap "where is this DID's anchor?" problem requires a discovery URL or warm-contact path. A pure-DID-with-no-server-hint is not resolvable.

### Rejected alternatives

- **All clients open connections to every server they're on.** Rejected: doesn't scale on mobile, doesn't justify the anchor concept.
- **DMs go directly client → recipient's anchor.** Rejected: every client would need auth against every potential recipient anchor; spam/abuse becomes a per-anchor problem with no global rate-limiting.
- **Room writes go via sender's anchor.** Rejected: adds an unnecessary hop and makes the sender's anchor a gatekeeper for room participation.
- **DHT-based DID resolution.** Rejected for v1: massive operational complexity. May revisit.

## References

- [CONTEXT.md](../../CONTEXT.md) — session, refresh token, always-on connection, presence broker, degraded mode
- [ADR 001 — Auth wire format](001-auth-wire-format.md)
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md) (TBD)
