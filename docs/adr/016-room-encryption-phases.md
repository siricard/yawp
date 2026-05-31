# ADR 016 — Room encryption phases

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Yawp's long-term positioning is end-to-end encrypted communication. DM E2EE is deferred to M10; room E2EE is deferred at least as far. M7 (rooms) must therefore answer a question that cannot be avoided: **what is in v1 rooms — plaintext on the host, or blocking E2EE design work?**

Blocking on E2EE would push every other M7–M9 deliverable (membership, channels, voice, moderation tooling) back by months and risks making the encrypted-room design carry the weight of "this has to be perfect on first ship." Shipping plaintext rooms without an explicit phasing plan would risk locking the product into a server-reads-everything posture indefinitely, contradicting the product framing.

This ADR commits to a phased trajectory and pins what each phase guarantees.

## Decision

### Phase 1 (M7–M9): plaintext rooms only

In v1, rooms are **plaintext** (CONTEXT.md). The host operator can read all message content stored on their server.

- TLS protects messages in transit between client and host (and host and any federation peers).
- Every message body is **signed** by the sender's device subkey (see "What is signed" below). The host cannot forge messages from a participant, but it can read them.
- Encryption-at-rest on the host disk is the operator's responsibility (disk encryption, Postgres TDE) and is not part of the protocol.

The trust framing is honest about this: **"trust your operator, or self-host."** E2EE is a layered defense on top of that base, added in M10. The plaintext-host phase is not a hidden compromise — it is the explicit, documented v1 model.

### M10: opt-in E2EE rooms

In M10, **encrypted rooms** ship as an explicit creation option. The room-creation flow gains an "Encrypted" toggle:

- A user creating a new room can choose plaintext or E2EE.
- Default in M10 (just-after-ship): unchanged from v1 — new rooms are plaintext unless the creator opts in. The opt-in period exists so operators and clients can validate the E2EE implementation in real use before it becomes the default.
- The cryptographic design for E2EE rooms (key agreement, group ratchet, history-on-join semantics) is out of scope for this ADR and will be specified in a future ADR.

### Post-M10: default flips

Once E2EE rooms have been validated in production, the default flips. New rooms are **E2EE by default**. Creating a plaintext room becomes a **Danger zone** action (CONTEXT.md): the UI requires an explicit acknowledgement that the server operator will be able to read all messages in the room.

Plaintext rooms remain available indefinitely as a deliberate operator-managed mode. Use cases include:

- Server-side full-text search.
- Server-side history export for compliance.
- Operator-managed retention or audit policies that need to read content.

These are real needs for some self-hosting operators; the protocol refuses to remove the capability outright, but the UX refuses to hide it behind a normal creation flow.

### No mid-life conversion

A room is **plaintext or E2EE for its whole life** (CONTEXT.md). There is no in-place conversion in either direction.

- Plaintext-to-E2EE conversion would require re-encrypting all historical messages, which produces a re-encryption event that's user-hostile to reason about and trivially attackable (a malicious host can choose what "history" to include).
- E2EE-to-plaintext conversion would silently downgrade a room behind users' backs.

The migration path for a room that wants to change mode is the same as for any other room migration: create a new room with the desired mode and (optionally) export the old room's history. Clean and explicit.

### What is signed, even in plaintext rooms

Even though v1 rooms are plaintext, several events are **signed**:

- **Message bodies.** Signed by the sender's device subkey (ADR 005) at submission. The host stores the signature alongside the plaintext.
- **Membership changes.** Joins, leaves, kicks, bans. Signed by the actor — the user themselves for self-driven joins/leaves, the host's server keypair (ADR 013) for operator-driven kicks/bans, the inviter's device subkey for invite-driven joins.
- **Role and permission changes.** Signed by the actor (the admin making the change).
- **Migration events.** Signed by the source host's server keypair and counter-signed by the destination host's (ADR 014).

The signatures travel with the events through the host's API. Clients verify them on read. This gives every room a tamper-evident audit log even in the plaintext phase: the host can read the room, but it cannot retroactively forge messages from a participant, cannot fabricate kicks/bans, and cannot rewrite history without the signatures failing verification.

### What is encrypted in v1 rooms

**Nothing.** Plaintext-on-host is the explicit v1 model. The signing-but-not-encrypting choice gives forgery resistance without the design weight of group key agreement.

## Consequences

### Positive

- M7 ships on time. Every adjacent ADR (membership, channels, voice, moderation) builds on a simple plaintext storage model.
- M10's E2EE design can be done carefully, in isolation, with the full benefit of having a working v1 deployment to learn from.
- Tamper-evident audit log from day one. Every consequential event in a room is signed.
- The product's long-term positioning ("decentralized, end-to-end encrypted") is preserved with a clearly-staged trajectory.
- Operators who need server-side search, export, or compliance always have a path (Danger-zone plaintext rooms) without forcing the rest of the product to accommodate it.

### Negative

- v1 users must trust their operator. This is a material claim that the marketing and onboarding copy must be honest about.
- Two encryption modes (plaintext and E2EE) is a permanent permanent forking of the room concept. Mode-aware code paths will exist forever in the host (history-on-join in particular — see ADR 019).
- Plaintext rooms migrated to a less-trustworthy host expose their entire history. Operators should warn users when migrating plaintext rooms.

### Rejected alternatives

- **E2EE rooms from v1.** Rejected: lifts M10's work into the foundation and pushes everything else (channels, voice, moderation tooling) back. The cost of getting E2EE design wrong on first ship is high.
- **Plaintext forever.** Rejected: doesn't deliver the long-term positioning. The plan must include a route to encrypted rooms, even if it's deferred.
- **Convertible rooms (plaintext ↔ E2EE mid-life).** Rejected: re-encryption semantics are user-hostile, attackable, and confuse the threat model. Migration via "new room, optional history export" is cleaner.
- **Signing message bodies is also deferred until M10.** Rejected: signatures are cheap and the tamper-evidence value is real. Doing them in v1 also forces us to maintain device-subkey hygiene from the start.

## References

- [CONTEXT.md](../../CONTEXT.md) — plaintext room, E2EE room, Danger zone, device subkey
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
