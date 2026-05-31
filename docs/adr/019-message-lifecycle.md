# ADR 019 — Message lifecycle: edits, deletes, retention, history-on-join, ordering

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

"What is a message?" is more than "a row of text." A v1 message must answer questions about edits (do they overwrite, or accumulate?), deletes (is the body gone, or hidden?), retention (do messages live forever, or do they age out?), history-on-join (can a new member read what came before?), and ordering (who decides "sent at"?). Getting any of these wrong locks in a UX or storage decision that's painful to reverse later — message data is the heaviest data in the system.

This ADR pins down the lifecycle for plaintext rooms (v1). E2EE rooms (M10+) inherit most of it but diverge on history-on-join.

## Decision

### Edits are append-only signed events

A **message edit** (CONTEXT.md) is a signed event that supersedes the body of a prior message. The original message and every subsequent edit are **retained in storage** — edits do not overwrite.

- Each edit is signed by the original sender's device subkey (ADR 005). A message can only be edited by its own author.
- The UI renders the *latest* edit by default, with a "view edit history" affordance that exposes the earlier versions.
- The host validates the signature on each edit and rejects edits not signed by the original sender's device subkey.

The append-only history is the audit trail: a host cannot retroactively change a participant's message without producing an unsigned (and rejectable) edit event.

### Deletes are signed tombstones (default behavior)

A **message tombstone** (CONTEXT.md) is a signed delete event that:

- Wipes the **body** from the database.
- Preserves the **timeline position** so message ordering is not disturbed.
- Records **who deleted** the message (sender or moderator) and **when**.

The UI renders the slot as `[deleted]`. The body is **unrecoverable by default** — deletion is a destructive action.

Tombstones are signed:

- If the original sender deletes, the tombstone is signed by their device subkey.
- If a moderator deletes (via `manage_messages`, ADR 017), the tombstone is signed by *their* device subkey, and the tombstone record carries the moderator's DID and the original sender's DID separately so the audit log is unambiguous.

### Body archive (opt-in server setting)

A **body archive** (CONTEXT.md) is a server-level setting that, when enabled, causes deletes to additionally archive the original body to an **admin-only store** rather than wiping it.

- The tombstone is still produced; the body is still hidden from the channel timeline.
- The archived body is retrievable only by privileged operators via admin tooling.
- **Off by default.** Operators must explicitly enable it on the server.
- Use cases: compliance retention, leak investigation, abuse review.

The body archive is a deliberate trade-off: a host operator with archive enabled can retrieve deleted content. This is documented as part of the server's posture and surfaces in the server-settings UI alongside other operator-visible posture choices (retention, plaintext-vs-E2EE default).

### Retention policy

A **retention policy** (CONTEXT.md) is a per-channel setting (with a per-server default) controlling automatic tombstoning of messages older than a cutoff. Values:

- `forever` — the default. Messages persist until deleted manually.
- A **duration** — `1d`, `7d`, `30d`, `90d`, `1y`, or a custom value.

A daily background job sweeps each retention-bound channel and produces tombstones for any message past the cutoff. Retention-driven tombstones are signed by the host's server keypair (ADR 013) and carry an explicit `reason: "retention"` field so audit consumers can distinguish them from sender- or moderator-driven deletes.

Retention is independent of manual deletes. A retention-bound channel still permits manual delete for explicit removal before the cutoff.

### History-on-join

**History-on-join** (CONTEXT.md) is governed by a permission bit, `read_history_before_join`, in the channel-overrides matrix (ADR 017).

For **plaintext rooms (v1):**

- Default-on for `Member`+ on server-public channels. Joining a `#general` lets you read what came before — this is the Discord-style expectation.
- Configurable per channel via overrides. An admin can deny `read_history_before_join` on a sensitive channel so new joiners only see post-join messages.

For **E2EE rooms (M10+):**

- The bit is **ignored**. New joiners can only see messages from their join time forward, regardless of role.
- This is a cryptographic limit, not a policy choice: pre-join messages were encrypted to a group of recipients that did not include the new joiner, and there is no in-protocol way to retroactively grant access without re-encrypting (which we deliberately avoid; see ADR 016).

The same bit lives in the data model for both modes; in E2EE rooms it is permission-engine inert.

### Server-authoritative ordering

Message ordering, edit ordering, and tombstone ordering are determined entirely by the host server's **monotonic insertion serial** (CONTEXT.md). Each room has its own serial space; messages, edits, and tombstones in a room each receive the next serial on insert.

The canonical **"sent at"** timestamp displayed in the UI is the **server's insert timestamp**. Client-supplied timestamps are accepted only for optimistic-render correlation (the client renders the message immediately at its local time, then reconciles to the server's timestamp on confirmation).

This applies per-room. DMs retain the multi-anchor ordering protocol described in ADR 002 — DMs do not have a single authoritative host, so they need a different ordering model.

The choice trades off perfect "wall-clock fairness" (your message was *sent* before mine, but the server received mine first) for monotonicity and consistency. Every participant sees the same ordering; nobody is debating clocks across federation boundaries.

### Who can delete

- **Sender** can always delete their own messages. No role required.
- **Roles with `manage_messages`** can delete anyone's messages in channels where the role applies. Used for moderation.
- **Server operator** can delete any message via admin tooling. This is the escape-hatch path (ADR 017's "operator override") and is not the day-to-day moderation flow.

A user *cannot* delete or edit *another* user's message — even an admin's "delete other user's message" is processed as a moderator tombstone signed by the admin, not as an impersonated edit.

## Consequences

### Positive

- Append-only edits give a tamper-evident audit trail without requiring full message-log encryption.
- Tombstones preserve ordering so a deleted message doesn't shift timestamps or break threading.
- The retention story is simple, server-driven, and reuses the tombstone primitive — no separate "expired" state.
- Server-authoritative ordering means there is one and only one answer to "what order did things happen in this room?"
- The body-archive opt-in lets compliance-driven operators do what they need without forcing the default mode to retain bodies.

### Negative

- Storage grows monotonically until retention is configured. Operators of long-running rooms with high traffic need to consider retention sooner than later. v1 documentation should call this out.
- `manage_messages` is a strong permission. Anyone who holds it can hide content; the audit log records the action, but the act of deletion is irreversible without body archive.
- History-on-join differing between plaintext and E2EE rooms creates a permanent "two modes" UX wrinkle. Documentation and tooltips will need to explain why a permission bit is ignored in E2EE rooms.
- Server-authoritative ordering means a slow client whose message hits the server out of "real" wall-clock order will appear out of order. Acceptable; the network is the network.

### Rejected alternatives

- **Edit-as-overwrite (the body is replaced in place, no history retained).** Rejected: loses the signed audit trail. A host could quietly edit a participant's message and the room would have no way to know.
- **Hard delete (the row is removed entirely).** Rejected: shifts ordering, hides that a deletion happened, and conflicts with retention semantics.
- **Soft delete as default (body retained, hidden only from non-admins).** Rejected: makes "delete" silently weaker than users expect. The body-archive opt-in covers operators who actually want this.
- **Client-authoritative timestamps.** Rejected: clients lie about clocks (deliberately or accidentally). Server-authoritative is the only consistent answer.
- **Per-edit re-signing of the whole prior history.** Rejected: O(n) cost on every edit. Append-only signed-individually is sufficient.
- **Auto-delete after retention without a tombstone.** Rejected: same problem as hard delete — the timeline silently shrinks.

## References

- [CONTEXT.md](../../CONTEXT.md) — message edit, message tombstone, body archive, retention policy, history-on-join, server-authoritative ordering
- [ADR 002 — Message ordering](002-message-ordering.md)
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 016 — Room encryption phases](016-room-encryption-phases.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
