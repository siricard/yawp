# ADR 018 — Channels, categories, and channel types

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Within a server, rooms must be organized so users can navigate "where do I want to talk?" The two ends of the design spectrum are a flat list (one big sidebar of every room) and a deeply nested tree (folders inside folders). The friend-group framing and the Discord-style mental model (ADR 017) point at a middle path: one level of grouping, with channels typed by interaction mode.

We also have to decide how disruptive UI actions — drag-to-reorder, delete shortcuts — are surfaced. Inline-everywhere is fast for power users but invites fat-finger accidents during normal navigation.

## Decision

### Channels are rooms

A **channel** is a room (ADR 014, ADR 015). The two words are used at different layers:

- **Channel** — user-facing. What appears in the sidebar; what an admin creates from "New channel."
- **Room** — protocol-level. What ADRs 014–019 specify; the unit of host authority and the addressable target of room-level operations.

The data model is the same. The two terms are not separate concepts — they are two registers of the same concept, used where each fits the audience.

### Channel types

A channel has a **channel type** (CONTEXT.md). v1 ships two:

- `text` — persistent chat. The default.
- `voice` — persistent WebRTC voice room (ADR 020). Successor to M5's ephemeral 1:1 calls.

Both types share the same membership, permission, role, and override model. From the perspective of ADRs 015 and 017, a voice channel is just a channel with `type = voice`; the same roster mechanics, the same visibility/join policy, the same channel overrides apply. The difference is what *happens* inside: text channels carry a message log (ADR 019); voice channels carry presence-tracked audio (ADR 020).

Additional channel types (announcement, forum, stage) may be added later as new `type` values without affecting the rest of the model.

### Categories: one level of hierarchy

A **category** (CONTEXT.md) is a named grouping of channels within a server. In v1:

- Each channel belongs to **at most one** category.
- A category has **no parent** — depth is capped at one level.
- The data model uses a self-referential `parent_id` on the category row, so deeper nesting can be enabled later without migration. The depth-≤-1 invariant is enforced at the API layer, not at the schema layer.

Categories cover the friend-group case ("text channels," "voice channels," "off-topic," "secret stuff") without committing to a full nested-folder UX. If the product later needs deeper grouping (community-sized servers with many topical subgroupings), enabling depth >1 is an API-layer change and a UI change — the data is already shaped for it.

### No category permission cascade in v1

Categories carry **no permissions** in v1 (CONTEXT.md, ADR 017). They are pure UI organization. Moving a channel between categories does not change who can see or write to it.

Permission cascade from categories (a category being `private` and all its child channels inheriting that) is a Tier-3 RBAC feature and is deliberately deferred. Coupling category UX to the permission engine in v1 would inflate the v1 surface for a feature most v1 users do not need.

### Ordering

Both channels and categories carry a `position` field that controls their order in the sidebar. Sorting is by `position` within a category (for channels) and across categories (for categories themselves).

Reordering — within a category, moving between categories, reordering categories themselves — requires the `manage_channels` permission (ADR 017). Without it, the user can navigate but not rearrange.

### Edit mode

Destructive and disruptive UI actions on the channel/category list are gated behind a client-side **Edit mode** (CONTEXT.md) toggle:

- **Off by default.** In normal navigation, the sidebar is read-only. No drag handles, no delete affordances, no inline "+/×" buttons. This prevents fat-finger reordering when the user is just clicking around.
- **On when toggled.** The user (if they hold `manage_channels`) flips the toggle and sees drag handles, drag-to-recategorize, delete shortcuts, and inline rename/edit affordances.

Edit mode is purely client-side UX state. The server is unaware of it; every action gated by Edit mode is *also* gated server-side by the appropriate permission. Edit mode just keeps those actions out of the navigation surface during normal use.

The toggle is visible only to users with sufficient permissions to do *any* of the gated actions — typically `Admin` and above.

## Consequences

### Positive

- Two channel types cover v1's interaction needs without committing to a complicated channel-type taxonomy.
- Channels and rooms being the same concept at different naming registers keeps the implementation simple — no separate "channel" entity layered on top of "room."
- Categories are simple enough to fit a friend-group server and structured enough that nested categories or category permissions can be added later without re-shaping the data.
- Edit mode keeps the day-to-day navigation surface clean and forgiving while still giving admins direct manipulation when they want it.

### Negative

- The depth-≤-1 invariant lives in the API layer rather than the schema. We have to maintain that invariant in code; the database will not enforce it. Acceptable since the model is small and well-tested.
- "Channel" vs. "room" terminology will trip up newcomers reading the docs. We accept this and document the equivalence explicitly.
- Without category permission cascade, an admin who wants every channel in a category to be private must set the override on each channel individually. v1 may grow a "create channel with same overrides as siblings" affordance to help; not in the protocol.

### Rejected alternatives

- **Flat channel list, no categories.** Rejected: doesn't scale past a handful of channels and contradicts the Discord-style framing.
- **Full nested folder tree from v1.** Rejected: depth-1 covers the friend-group case; deeper nesting introduces both UI and permission-cascade design questions that are not worth answering before there is demand.
- **Category-bearing permissions in v1.** Rejected: couples category UX to the RBAC engine prematurely. Tier-3 RBAC will revisit.
- **Always-on inline disruptive controls (no Edit mode).** Rejected: fat-finger reordering during navigation is a known papercut in Discord-style UIs; making Edit mode explicit is cheap insurance.
- **Channel type per-user (a "text+voice" channel that switches mode based on intent).** Rejected: confuses the membership/permission model. Two separate channels is cleaner.

## References

- [CONTEXT.md](../../CONTEXT.md) — channel type, category, edit mode
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
- [ADR 020 — Voice channels: SFU, signaling, and TURN](020-voice-channels-sfu.md)
