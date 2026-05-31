# ADR 021 — Notifications, push fan-in, and read markers

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

ADR 009 established that the user's anchor servers are the **single push fan-in point** for the user: guest servers do not hold APNs/FCM credentials and do not push directly to mobile devices. That decision left several pieces unspecified: the wire shape of a notification, the per-conversation policy model, how read markers propagate to a user's other devices, and where push tokens actually live.

A second, subtler issue: ADR 006's table of "what the private blob contains" lists *device names, platforms, push tokens* as encrypted private-blob fields. That is workable for device names and platforms (the anchor never needs to read them) but **not** for push tokens — if the anchor is the entity calling APNs/FCM on the user's behalf, it must be able to read the token. This ADR formalizes the refinement: push tokens move out of the encrypted private blob and into a separate, anchor-side, plaintext-to-the-anchor **device push registry**.

A third issue surfaced while pinning notification semantics: v1's permission bit set (ADR 017) is missing the mention-broadcast gates. Both `mention_everyone` and `mention_role` are needed so that `@everyone`, `@here`, and `@role` are not free-for-alls in larger rooms. This ADR amends the v1 permission set.

## Decision

### Notification levels

A **notification level** (CONTEXT.md) is a per-conversation setting with three values: `all`, `mentions_only`, `muted`. It applies to channels and DMs alike. Per-server defaults exist; channels in a server inherit the server default unless overridden per channel.

### Default notification level

The v1 baseline, applied when a user joins a new conversation without setting an explicit preference:

- **Channels:** `mentions_only`.
- **DMs:** `all`.

This reflects the asymmetry between high-intent (DM) and broadcast (channel) communication. A user opening their phone after a workday should not be greeted by 400 channel notifications, but should see every DM that arrived.

### Notification policy storage

The user's full **notification policy** (CONTEXT.md) — per-server defaults, per-channel overrides, per-DM overrides — has two copies:

- **Canonical copy** lives in the user's **private settings blob**, synced across the user's anchors via the anchor sync protocol (ADR 008). This is the source of truth; only the user's own clients can read it.
- **Mirror copy** is pushed to each host server that holds channels for the user, scoped to that host's channels only. The host needs this so it can decide whether to fire a notification envelope at all, **without contacting the user's anchor on every message**. The mirror is updated when the user changes their preferences — clients write to the private blob and ping the affected hosts.

The mirror is a derived, replaceable view. If a host loses it, the host can re-fetch on demand from the user's anchor; if it disagrees with the canonical copy, the canonical copy wins on next sync.

### Read markers

A **read marker** (CONTEXT.md) is `(user, channel, last_read_message_id)` recording how far a user has read in a given channel.

- **Channels (plaintext rooms, v1):** read markers are stored at the **host server**. Updates from any one of the user's devices are a single host round-trip. The host pushes the update to the user's other connected devices on that host's Phoenix Channel.
- **DMs:** read markers live at the **recipient's anchor** and propagate to the user's other devices via the always-on anchor websocket (ADR 009). DMs do not have a single host, so the anchor is the only sensible authority.
- **E2EE rooms (M10+):** the host cannot read message IDs the user wants to mark as read without learning some metadata; this will likely move to client-derived markers. **Out of scope for this ADR.**

Host-stored markers were preferred over private-blob-stored markers because read-marker updates are constant traffic — pushing every "mark as read" through a full anchor-sync round-trip would be wasteful, and the marker is not sensitive in the plaintext-room model (the host already sees the messages).

### Notification envelope

A **notification envelope** (CONTEXT.md) is a signed federation message constructed by the source of the event:

- For a room message or room mention: the **host server** that owns the channel where the message was posted.
- For a DM: the **recipient's anchor** itself, when the sender is a same-anchor user. Cross-anchor DMs already arrive at the recipient anchor as part of normal DM delivery (ADR 009); the recipient anchor fans them out to the user's devices without producing a separate envelope.

Contents of the envelope:

```
{
  user_did,            // recipient
  source_kind,         // "room_message" | "room_mention" | "dm"
  source_server,       // host that produced the envelope
  room_id_or_thread_id,
  message_id,
  timestamp
}
```

**No message body.** The device fetches the actual content from the source server after the push wakes it up (using the existing session it already has with that host or anchor). This keeps push payloads small, sidesteps APNs/FCM size limits, and limits how much content leaks via push transit.

Envelopes are signed by the source server's keypair (ADR 013). The recipient anchor verifies the signature before forwarding. Envelope delivery from a guest server to the recipient anchor is subject to the **per-anchor delivery budget** (ADR 010, Tier 2) — notification envelopes are first-class federation traffic.

### Push fan-in pattern

All push notifications for a user flow through the user's anchor servers — never directly from a guest server to APNs/FCM. The full flow:

1. A message lands at a host server (a room write per ADR 009, or a DM at the recipient's anchor).
2. The host consults the user's mirrored notification policy. If the policy says `muted`, the host stops. If `mentions_only` and the message contains no relevant mention, the host stops.
3. Otherwise the host constructs a notification envelope, signs it, and posts it to the user's anchor over the federation API. (If the host *is* the user's anchor — same-server case — this becomes a local call.)
4. The recipient anchor verifies the envelope signature, applies its delivery budget, and per-device decides:
   - If the device is on an **always-on websocket** to this anchor, push the envelope down the socket directly.
   - Otherwise, look up the device in the **device push registry**, call APNs or FCM with the envelope payload.
5. The device wakes, opens its session to the source server, and fetches the actual message.

Guest servers never hold APNs/FCM credentials for users they don't anchor. This is the entire point of the fan-in design.

### Device push registry

Per-user, per-anchor, **plaintext-to-the-anchor** registry mapping each device subkey ID to the device's current OS push token (APNs or FCM token).

- Lives at the user's anchor servers, alongside the user's PPE and private blob.
- **Never** part of the encrypted private blob — the anchor must be able to read the token to call APNs/FCM.
- **Never** part of the PPE — the registry is not replicated to guest servers. Only the user's anchors hold it.
- Replicated across the user's multiple anchors via the same anchor-sync replication path as other anchor-only state (ADR 008). Anchors may differ briefly during sync; tokens are idempotent (re-registering refreshes).
- The user's client updates the registry when push tokens rotate (APNs/FCM rotation, app reinstall, device change).

This is a **superseding refinement of ADR 006**: ADR 006's table listed *device names, platforms, push tokens* under the encrypted private blob. Names and platforms remain in the private blob; **push tokens move out** to this registry. ADR 006 is not modified — this ADR records the change.

### Permission bit amendments (mention broadcasts)

The v1 permission bit set in ADR 017 is **amended to add two bits**:

- `mention_everyone` — gates the use of `@everyone` and `@here` mentions in a channel.
- `mention_role` — gates the use of `@role` mentions targeting an entire server role.

Both bits **default to Owner + Admin only**. `Member`+ can use `@user` mentions freely (those are point-to-point and ride the recipient's notification level).

This is a **superseding amendment to ADR 017**: ADR 017 enumerated the v1 permission bits but did not include these two. ADR 017 is not modified — this ADR records the amendment.

The `@user` / `@role` / `@here` / `@everyone` taxonomy is the **mention** vocabulary already in CONTEXT.md; this ADR pins the permission gating.

### Privacy trade-off (acknowledged)

The push fan-in pattern means **the user's anchors necessarily learn *when* a push is fired**, and from which source server, and which room or DM thread it pertains to — even when the message body is opaque to the anchor. For E2EE conversations in M10+, the anchor will see envelope metadata it cannot use to read content, but the metadata itself is observable.

This is the explicit cost of having a single anchor-mediated fan-in point. The alternative — every guest server pushing directly to mobile — leaks the same metadata to *many* operators rather than one trusted anchor, and is operationally untenable. The user's choice of anchor (ADR 006: "pick anchor servers the same way you pick an email provider") is the lever for this trade-off.

The user-facing surface should be honest about this: documentation calls out that anchors see push metadata. Users who want stronger metadata privacy run their own anchor.

## Consequences

### Positive

- The federation surface for notifications is small: one envelope shape, one fan-in path, one signing key per source.
- Hosts make notification decisions locally using the mirrored policy — no anchor round-trip per message.
- Read markers in the plaintext-room model are one row update at the host with a Phoenix-Channel push, not a private-blob round-trip.
- The device push registry is colocated with the entity that uses it (the anchor that calls APNs/FCM), eliminating an awkward "encrypted blob the anchor pretends not to read" pattern.
- The mention permission bits give operators a real handle on `@everyone` abuse from day one.

### Negative

- The mirror notification-policy copy is a second source of truth; clients must keep it in sync with the canonical copy and handle drift on reconnect.
- Anchors see when a push is fired and to which channel/DM — acknowledged above; mitigated by anchor choice / self-hosting.
- M10+ will need a re-think of read markers for E2EE rooms (client-derived markers), and we have not pinned the design here.
- The device push registry is plaintext-to-the-anchor; a compromised anchor leaks push tokens. Push tokens are short-lived and OS-rotatable, but the leak is real.

### Rejected alternatives

- **Direct guest-server-to-mobile push.** Every guest server would need APNs/FCM credentials per user, no global rate limiting, no consistent privacy posture. Rejected — defeats the anchor-as-fan-in design.
- **Push tokens stay encrypted in the private blob (anchor cannot read them).** Then the anchor cannot call APNs/FCM and there is no fan-in. Rejected as logically inconsistent with the anchor-as-pusher design.
- **Read markers stored in the private blob, synced via anchors.** Constant anchor traffic on a low-sensitivity datum. Rejected.
- **Notification envelopes carrying the message body.** Larger payloads, APNs/FCM size limits, more leakage in push transit. Rejected — the envelope wakes the device and the device fetches the body over its existing authenticated channel.
- **Per-message anchor consultation by the host before deciding to fire.** Synchronous anchor round-trip on every message; defeats the mirrored-policy design. Rejected.

## References

- [CONTEXT.md](../../CONTEXT.md) — notification level, notification policy, notification envelope, push fan-in, read marker, device push registry, mention
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md) — push tokens listed under the encrypted private blob; **superseded** in this ADR by the device push registry decision
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 010 — Abuse model](010-abuse-model.md) — Tier 2 per-anchor delivery budgets gate notification envelope traffic
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md) — v1 permission bit set; **amended** in this ADR with `mention_everyone` and `mention_role`
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
