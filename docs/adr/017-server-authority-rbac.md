# ADR 017 — Server authority and RBAC scoping

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Authority over rooms could live at the room level (a "room owner" per room, with per-room roles), at the server level (server-wide roles that apply across all rooms), or as some hybrid. The choice drives the entire moderation, permission, and admin-tooling surface.

Discord's model — server-wide roles with optional per-channel overrides — is the well-trodden path for the friend-group-to-community framing Yawp targets. Matrix's model — per-room power-levels — is unusual and confusing for newcomers, and produces awkward edge cases when the same person plays a moderator role across many rooms on the same server.

A second question is how much RBAC machinery to expose in v1. A full role editor with custom roles, hierarchy, and per-channel overrides is weeks of UX work that most v1 users (friend groups) will never use. But hardcoding a closed enum of roles would force a painful migration later. This ADR splits the data model from the UI: the **backend implements full RBAC from day one**; the **v1 frontend exposes a constrained three-role surface**.

## Decision

### Server owner

Each server has exactly one **server owner** (CONTEXT.md) — the single user with unconditional authority over the server. Typically the operator. The owner can do anything: bypass all permission checks, transfer ownership, delete the server, manage any role, ban any user.

There is **no "room owner."** Authority over rooms derives from server-level role assignments and per-channel overrides. The server is the unit of authority.

### Server-scoped roles

Roles are defined and assigned **at the server level** (CONTEXT.md). A role's effects apply across all rooms on that server unless overridden per channel. Roles are **not portable across servers** — a user with `Admin` on server X has no inherent authority on server Y.

A user's server membership carries a list of role assignments. The user's effective permissions in a given room are: server-baseline role bits, modified by any channel overrides that apply to them (via role or via direct DID assignment).

### Permissions are bit-sets

Each role carries a **permission bit-set**. Permissions are atomic, named bits. The backend stores roles as rows with editable bit-sets, supports user-defined ("custom") roles in the data model, supports a hierarchy ordering between roles, and supports per-channel overrides — **all from day one**, even though the v1 UI only exposes a subset.

This is deliberate: it costs us only the data-model work today and avoids the painful migration of "we hardcoded an enum and now we have to make it dynamic."

### v1 UI: three system roles only

v1 exposes **three system roles** (CONTEXT.md) per server in the frontend:

- **Owner** — the server owner.
- **Admin** — operator-trusted moderator/manager.
- **Member** — default for joined users.

These are **system roles** (`system: true` in the data model): they are seeded automatically when a server is provisioned and cannot be deleted from the UI. They share the same data shape as custom roles — the distinction is purely the `system` flag.

User-defined custom roles and the role-editor UI are deferred. The data model already supports them; the v1 frontend simply doesn't surface them.

### Default permission bits

The v1 permission bits (the named permissions that exist in the model) are:

- `read_messages`
- `send_messages`
- `manage_messages` — edit/delete others' messages, tombstone (ADR 019)
- `manage_channels` — create/edit/delete/reorder channels and categories (ADR 018)
- `manage_roles`
- `kick_members`
- `ban_members`
- `create_invite` — generate warm/cold room invites (ADR 015)
- `read_history_before_join` — see messages from before join (ADR 019)
- `connect_voice` — join voice channels (ADR 020)
- `speak_voice`
- `mute_others`

The seeded bit-sets for the three system roles:

- **Owner** — all bits, plus implicit unrestricted bypass (`delete_server`, `transfer_ownership`, and any future destructive bit added later are gated to Owner only).
- **Admin** — all bits *except* the destructive owner-only ones. Admins can moderate, manage channels, manage roles below themselves, kick, ban, but cannot delete the server or transfer ownership.
- **Member** — `read_messages`, `send_messages`, `read_history_before_join`, `connect_voice`, `speak_voice`, `create_invite`.

The list is the v1 starting point; new bits can be added as features land without a migration of the role enum (because there isn't one).

### Per-channel overrides

A **channel override** (CONTEXT.md) is a per-room adjustment to the permissions a role or specific DID has in that channel. Overrides modify the server-wide baseline; they do not replace it.

In v1, channel overrides serve two concrete jobs:

1. **Gating private channels.** A `private` room (ADR 015) starts with `read_messages` denied for everyone (no role grants it implicitly). A user is granted access by adding a per-DID override that re-grants `read_messages` (and typically `send_messages`).
2. **Private-channel invites.** A **private-channel invite** (CONTEXT.md) is exactly the act of granting that per-DID override. It is not a separate roster concept — there is one roster (the host's, ADR 015) and the channel-override matrix decides who can do what once they are server-present.

Overrides are revokable by anyone with sufficient role permissions (`manage_channels` for the channel in question, or `manage_roles` for role-level changes).

### No category permission cascade in v1

Categories (ADR 018) are pure UI organization in v1. They carry **no permissions** and do not cascade. The data model supports a `parent_id` for future nesting, but the permission engine does not walk it. Category-level permission cascade is a Tier-3 RBAC feature, deferred.

### Cross-server moderation does not federate

Bans, kicks, and role changes apply to **a single server only**. They do not federate. A user banned on server X is unaffected on server Y. Operators are **sovereign** within their own server.

This is a deliberate choice: a federated ban registry would be a centralization point, a censorship lever, and a privacy hole. Operators can choose to share blocklists out-of-band if they want to, but the protocol does not transmit moderation actions across servers.

### Operator override

The server operator can take destructive actions — server-ban a user, delete a room, delete the server itself — but **does not by default involve themselves in per-room moderation**. Day-to-day moderation is the role of `Admin`s and is done in-app. Operator actions are an escape hatch (admin shell, server settings), not the primary moderation tool.

The distinction matters because in many friend-group servers the operator *is* the owner *is* the only admin, and the same person handles all three. The data model still distinguishes them so that larger communities can grow into a model where the operator runs the box and a separate admin team runs the rooms.

## Consequences

### Positive

- Discord-style mental model. Most users already understand "server-wide role with per-channel overrides."
- The v1 UI is small (three roles, a permission matrix per channel for overrides) but the data model is full-featured. We will not have to migrate the role storage when we add the role editor.
- Sovereignty is clear: each operator is in charge of their server, federation does not propagate moderation, and there is no global block registry.
- Per-channel overrides cover the private-channel case without a separate room-roster concept.

### Negative

- "Where does this permission decision get made?" requires walking the role-and-override graph. Plenty of frameworks have shown this is workable, but it is more code than a flat-role model.
- The deferred role editor will be a real chunk of work when it lands — UX for permission matrices is hard. We pay the design cost later; we just defer it.
- Cross-server moderation being non-federated means a hostile user can keep returning under new server-presences. Operator block (ADR 010) is the heavy hammer.

### Rejected alternatives

- **Per-room roles (Matrix-style).** Rejected: contradicts the Discord-style mental model the product is built on, and produces confusing edge cases when a moderator wants the same authority across many rooms.
- **Hardcoded role enum (Owner/Admin/Member as a fixed type).** Rejected: requires a real data migration when we add the role editor. Free to avoid by spending the model-design effort once now.
- **Full Tier-3 RBAC UI in v1.** Rejected: weeks of UX work for a feature most v1 users (friend groups) will not need. The three-system-roles surface covers the common case.
- **Federated bans / shared blocklists in v1.** Rejected: centralization risk and a censorship lever. Operators may share lists out-of-band.

## References

- [CONTEXT.md](../../CONTEXT.md) — server owner, role (server-scoped), system role, channel override, private-channel invite
- [ADR 010 — Abuse model](010-abuse-model.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md)
- [ADR 018 — Channels, categories, and channel types](018-channels-categories.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
- [ADR 020 — Voice channels: SFU, signaling, and TURN](020-voice-channels-sfu.md)
