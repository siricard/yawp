# ADR 015 — Room membership, visibility, and invites

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

ADR 014 commits Yawp to single-host rooms with operator-initiated migration. That decision leaves three concrete questions about how users *enter* and *appear in* rooms:

1. **Where does membership live?** The host owns the roster — but each user also has a private-blob room list (CONTEXT.md). What happens when those disagree?
2. **Who can see a room exists?** Public servers like Discord show every channel to every server member; private rooms must be hidden from non-members.
3. **How does a user end up in a room on a server they have no prior relationship with?** ADR 011 mandates invite-required signup for *anchor* admission; cross-server room joins need a different story.

This ADR ties off all three so the M7 implementation has one coherent membership model.

## Decision

### Membership: host-authoritative, client-cached

The room roster (CONTEXT.md) lives on the host server and is the **source of truth** for "who is in this room." On the client side, the user's private blob (ADR 006) holds a **cached room list** for fast app launch — without it, a user with rooms on 50 servers would need to query all 50 hosts before rendering anything.

The cache is best-effort. The host wins on disagreement:

- If the host's roster says the user is *not* a member but the cache says they are, the room is gone (kicked, banned, deleted) and the cache is reconciled on next contact.
- If the cache says the user is *not* a member but the host's roster says they are, the cache is missing an entry (e.g., added by an admin while the user was offline) and is reconciled on next contact.

The cache is *never* used to override the host. It is a UI optimization, not an authority claim.

### Visibility: two values

A room has one of two **visibility** settings (CONTEXT.md):

- `private` — the room exists only to members and to people who hold a private-channel invite (ADR 017). Non-members do not see the room in any channel list.
- `server-public` — the room is visible to **every guest of the host server**. Any user who has any kind of presence on the server (anchored there, or guest-present via any other room) sees server-public rooms in the channel list and may join according to the join policy below.

This matches the Discord model: visibility is a property of the room, not of the user. Federation-wide discovery (Mastodon-style directory of all rooms on all servers) is deliberately deferred — there is no v1 mechanism for finding rooms across servers without an explicit invite or share link.

### Join policy: two values

Independent of visibility, a room has a **join policy** (CONTEXT.md):

- `invite-only` — the user must redeem a valid invite (warm or cold, below) to join, even if they can see the room.
- `open` — anyone who can see the room may join without an invite. Common case: the `#general` channel on a server-public room.

The four combinations all have sensible interpretations. `server-public + open` is a Discord-style public channel. `private + invite-only` is a hidden room you can only join via an invite. The two cross combinations are less common but valid (e.g., a server-public read-only-by-default room that requires an invite to write).

### Warm invites: DM-delivered

A **warm invite** is a structured DM payload from an existing room member to a recipient the inviter can already DM (shared room, accepted contact). It contains a signed room-invite object referencing the host, room ID, and inviter's DID.

- Delivery rides the existing DM federation path (ADR 009). No new protocol is required.
- The recipient's client renders a "Join room" affordance inline with the DM.
- Tapping it redeems the invite against the host. The host validates the inviter's signature and the inviter's standing as a member with `create_invite` permission, then adds the recipient to the roster.

This is the 90% case for friend-group servers: someone you already chat with says "come join our #cooking channel."

### Cold invites: shareable URL

A **cold invite** is a shareable URL of the form `yawp://<host>/r/<id>?token=<...>` (CONTEXT.md). Used when the inviter and invitee cannot DM each other (no shared server, no prior contact) — pasted into Discord, Signal, email, a forum, anywhere outside Yawp.

The user pastes the link into the app's "Join via link" entry point. The client:

1. Resolves the host and fetches the invite metadata (room name, server name) for the user to confirm.
2. On confirmation, the client submits the invite token to the host.
3. The host validates the token, auto-guests the user if needed (below), and adds them to the roster.

Cold invites carry policy attributes set by their creator:

- **Single-use vs shareable.** Single-use is consumed by first redemption; shareable can be redeemed many times.
- **Expiry.** Time-limited or open-ended.
- **Revocability.** Any user with sufficient role permissions can revoke any invite they have authority over.

These mirror ADR 011's invite-link flavors but apply to room joins rather than anchor signups.

### Auto-guest on join

When a user redeems any invite (warm or cold) for a room on a server they have no prior relationship with, the host **auto-provisions a guest session** for that user (CONTEXT.md). The server caches the user's PPE, accepts their writes, and treats them as present.

Joining one room on the server grants **visibility into all `server-public` rooms on that server** (CONTEXT.md) — the Discord model. Private rooms remain gated by invite or per-channel permission override (ADR 017). The unit of admission is the *server*, not the individual room.

If the user later leaves *every* room on that server, the guest relationship ends — the server no longer has a basis for the PPE cache or for accepting writes from the user. (Implementation note: the host may keep the PPE cache for a short grace period; the user's *presence* on the server ends with their last room.)

### Relationship to ADR 011

ADR 011's invite-required signup is for **anchor admission only**: it controls who is allowed to make a given server one of their canonical anchors. Guest admission is a separate concern, governed by this ADR, and is auto-provisioned by room-invite redemption — no operator invite is required to *be a guest* on a server.

The two layers are deliberately distinct:

- **Anchor admission** is a high-trust relationship: the operator stores your canonical data and serves it on your behalf. ADR 011 keeps that door narrow.
- **Guest admission** is a low-trust relationship: the operator caches your PPE and lets you participate in rooms hosted on their box. Room invites do all the admission control needed.

If an operator wants their server to be private at the room level (no public rooms, every room invite-only), they get that behavior automatically — there is no server-public room to be visible from, so guests can only see the specific rooms they were invited to.

## Consequences

### Positive

- One membership model across all room/visibility/policy combinations. Membership is host-authoritative; visibility and join policy are room settings.
- Two distinct invite paths (warm/cold) cover both within-Yawp and external-channel onboarding without a new federation primitive — the warm path rides DM federation, the cold path rides regular HTTPS.
- Auto-guest keeps the "unit of admission is the server" model clean while letting individual room invites drive onboarding.
- Anchor admission (ADR 011) and guest admission (this ADR) are clearly separated. Operators can be selective about anchoring while being open to room joiners, or vice versa.

### Negative

- The cached room list can drift from the host roster. Reconciliation logic is straightforward but must be implemented and tested for every transition (join, leave, kick, ban).
- Cold-invite URLs leak the host hostname. This is by design (you have to fetch from somewhere) but operators with privacy concerns must be aware.
- A spammy cold-invite link, once shared, can drive a flood of auto-guest provisioning until revoked. Per-anchor delivery budgets (ADR 010) do not apply here — this is direct HTTPS to the host. Operators may want a separate per-invite redemption rate limit; explicitly noted as a follow-up.
- Visibility of all server-public rooms to any guest is a deliberate but strong choice. An operator who wants finer control must make rooms `private` and rely on per-channel invites (ADR 017).

### Rejected alternatives

- **Client-claimed membership with lazy host approval.** Rejected: bans become meaningless if a client can re-add themselves to the roster from local state. Host must be authoritative.
- **A separate cross-server invite delivery protocol.** Rejected: DM federation (ADR 009) already delivers signed payloads between any two anchors. Adding a parallel "invite delivery" channel would duplicate the protocol surface.
- **Per-room admission to the server (you join one room and only that room is visible).** Rejected: contradicts the Discord-style server-as-collection-of-channels model the product is built around. The server is the unit of admission; rooms are the unit of *content*.
- **Federation-wide room discovery directory in v1.** Rejected: pushes scope into "indexing servers we don't trust." Cold-invite links and warm DMs cover the v1 onboarding paths.

## References

- [CONTEXT.md](../../CONTEXT.md) — room, room roster, room visibility, room join policy, room invite (warm), room invite link (cold), auto-guest on join, room list (cached)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 010 — Abuse model](010-abuse-model.md)
- [ADR 011 — Signup via invite link](011-signup-invites.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
