# ADR 025 — DM v1 wire format

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-21

## Context

ADR 009 set the routing for direct messages: sender's client posts to sender's anchor, sender's anchor relays via signed delivery wrapper (ADR 008) to a recipient anchor, recipient anchor writes to the user's inbox (ADR 006) and dispatches to devices. ADR 008 pinned the inbox dedupe primitive (`envelope_id`) and the shape of the delivery wrapper. CONTEXT.md (Messaging & routing → DM envelope) sketched the envelope fields. What has not yet been pinned is the **bytes** — the exact field layout, the exact canonicalization, the exact signing inputs, the exact delivery-state state machine — for the first DM that ships in M7.

This ADR is the bytes. M10+ will revisit to wrap the envelope in E2EE; the routing, dedupe, and delivery semantics described here survive that transition unchanged.

## Decision

### The DM envelope

A direct message is a signed JSON object — the **DM envelope** (CONTEXT.md):

```
{
  envelope_id:       "<128-bit random, lowercase hex>",
  sender_did:        "did:yawp:...",
  recipient_dids:    ["did:yawp:...", ...],
  conversation_id:   "<sha256 hex>",
  timestamp:         "<ISO 8601, UTC, millisecond precision>",
  body:              "<plaintext UTF-8 string>",
  attachments:       [<attachment_ref>],
  reply_to:          "<envelope_id>" | null,
  mentions:          [{ "type": "user" | "role" | "here" | "everyone",
                        "target": "<did or role_id or null>" }],
  sender_signature:  "<base64 ed25519 signature>"
}
```

Field semantics:

- **`envelope_id`** — 128 bits of cryptographically random data from the sender's device, rendered as 32 lowercase hex chars. Used by the recipient anchor as the inbox dedupe key per ADR 008. Two anchors receiving the same envelope (push + pull race) deduplicate by this value.
- **`sender_did`** — the DID of the sending user. Computed by every verifier as `base58(sha256(public_key))` and cross-checked against the public key resolved from the sender's PPE.
- **`recipient_dids`** — one or more DIDs. **A 1:1 DM has exactly one recipient. A group DM has two or more.** The list is unordered semantically but is serialized in canonical-JSON order (RFC 8785 sorts arrays as encountered; for the purpose of `conversation_id` derivation, see below).
- **`conversation_id`** — deterministic identifier for the DM thread. See "Conversation ID derivation" below.
- **`timestamp`** — sender-asserted send time, ISO 8601 UTC with millisecond precision (e.g., `2026-05-21T14:23:11.482Z`). Used for client display and inbox sort order. The recipient anchor records its own receipt timestamp separately for audit; clients display the sender timestamp.
- **`body`** — plaintext UTF-8 in v1. M10 wraps this in ciphertext without changing field name (the field becomes a base64-encoded ciphertext blob, decrypted client-side; the routing layer is unchanged).
- **`attachments`** — array of attachment references per ADR 022: each entry carries `upload_id`, `content_hash`, `mime`, `size`. The hashes are included so the sender's signature covers the content of the attached files (ADR 022 tamper-evidence).
- **`reply_to`** — the `envelope_id` of an earlier DM in the same conversation, or `null`. Surfaces in the UI as an inline reply card per ADR 019's reply model. Threads (ADR 019) are deferred; inline replies are the only structured reference in v1.
- **`mentions`** — array of `{type, target}` tuples per ADR 021's notification dispatch. `type` is one of `user` / `role` / `here` / `everyone`; `target` is the mentioned DID (for `user`) or role identifier (for `role`) or `null` (for `here` / `everyone`). In a DM, `role` is rarely meaningful and may be dropped by clients; `here` and `everyone` map to "all DM participants" and are subject to the recipient's notification level (ADR 021).
- **`sender_signature`** — Ed25519 signature by the sender's **device subkey** (ADR 005, ADR 007) over the canonical-JSON of the envelope with `sender_signature` itself omitted.

### Canonicalization and signing

The signing input is **RFC 8785 canonical-JSON** of the envelope with the `sender_signature` field removed. RFC 8785 ("JSON Canonicalization Scheme") is the explicit normalization standard: deterministic property ordering (lexicographic by UTF-16 code unit), deterministic number formatting, no extra whitespace. We adopt it by reference rather than rolling our own canonicalization for the same reason ADR 001 chose `:crypto.verify/5` over a custom verifier: hand-rolled normalization is a foot-gun and we do not need to invent here.

The signing algorithm matches ADR 001: Ed25519, raw signature, no domain separator. (A `"yawp-dm-v1:" <> canonical_json` prefix is a non-breaking future addition if domain separation is needed; v1 deliberately keeps the wire format small.)

Workers must use the project's canonical-JSON helper. **Do not** invent a per-call normalization step; consistency between sender and verifier is the entire point.

### Conversation ID derivation

Conversation identity is derived deterministically from the participant set:

```
participants = sorted({ sender_did } ∪ recipient_dids)   // lexicographic
conversation_id = sha256_hex(canonical_json_array(participants))
```

`canonical_json_array(participants)` is RFC-8785 canonical-JSON of the participants list. The hex digest is the conversation ID.

Two consequences are intentional:

1. **Every participant computes the same ID.** The conversation ID is not allocated by any server; sender and recipient anchors both derive it locally and use it for indexing.
2. **Adding or removing a participant changes the ID.** This is the immutable-roster property below — there is no protocol path that keeps `conversation_id` stable while the participant set changes.

### Group DMs from v1

DMs support two or more recipients from v1. The envelope shape is identical to a 1:1 DM; the difference is the size of `recipient_dids`.

**The group DM roster is immutable for the conversation's life.** Adding a participant means starting a new conversation (with a new `conversation_id` derived from the new participant set). Removing a participant is the same — a new conversation. There is no protocol "add member to existing DM" operation; the UI affordance, when it exists, creates a fresh conversation and may seed it with prior messages quoted into the body if the user chooses to share context.

Mutable group-DM roster management is deferred to a future ADR. v1 ships group DMs with a flat, deliberate, immutable roster — which is sufficient for the friend-group framing and avoids a non-trivial set of "who is allowed to add whom" decisions that this ADR is not ready to make.

### Delivery wrapper

When a DM crosses federation — sender and recipient are on different anchors — the sender's anchor wraps the envelope in a **delivery wrapper** (ADR 008, CONTEXT.md):

```
{
  inner:              <DM envelope above>,
  sender_anchor_id:   "<hostname>",
  delivery_nonce:     "<128-bit random, lowercase hex>",
  delivery_timestamp: "<ISO 8601, UTC, millisecond precision>",
  server_signature:   "<base64 ed25519 sig by sender anchor's server keypair>"
}
```

The `server_signature` is computed over canonical-JSON of the wrapper with `server_signature` removed, using the sender anchor's federation keypair (ADR 013). The recipient anchor:

1. Fetches and verifies the sender anchor's key document at `https://<sender_anchor_id>/.well-known/yawp/server-key.json` (ADR 013), caching per its TTL.
2. Selects the `key_id` referenced by the wrapper's signature.
3. Verifies the server signature.
4. Verifies the inner envelope's `sender_signature` against the sender's PPE (fetched and verified per ADR 006's discovery rules).
5. Applies abuse Tier 2 budget (ADR 010) and message-request rules (ADR 010 Tier 1).
6. Writes the envelope to the recipient's inbox, keyed by `envelope_id`.

**Same-anchor DMs skip the wrapper.** When sender and all recipients share the anchor — or when an anchor is delivering to itself — the wrapper is not used. The envelope is written to the recipient inbox directly, with the `sender_signature` still verified (the user signature is required regardless of federation hops). The wrapper exists precisely to give peer anchors something signed by *the sending anchor* to verify, which is unnecessary when no peer anchor is involved.

In a group DM with mixed-anchor recipients, the sender's anchor delivers to each distinct recipient anchor exactly once: same-anchor recipients (those sharing the sender's anchor) receive the inner envelope directly; cross-anchor recipients receive the wrapped envelope. This is the natural extension of ADR 008's routing.

### Delivery state machine

Each DM has a per-recipient **delivery state** (CONTEXT.md). Three values:

- **`sent`** — the sender's anchor accepted the envelope from the sending client. The sender's anchor surfaces this state to the sending client immediately on accept.
- **`delivered`** — the recipient's anchor wrote the envelope to that recipient's inbox. The recipient anchor produces a signed `delivery_ack` and returns it to the sender anchor:
  ```
  {
    envelope_id:        "<echoed>",
    recipient_did:      "<which recipient this ack is for>",
    recipient_anchor:   "<hostname>",
    delivered_at:       "<ISO 8601>",
    server_signature:   "<base64 ed25519 sig by recipient anchor's server keypair>"
  }
  ```
  The sender anchor verifies the server signature against the recipient anchor's key document and updates its delivery-state table.
- **`read`** — the recipient's device(s) advanced their **read marker** (ADR 021) for this conversation past this envelope. The recipient anchor surfaces the read-marker advance via a signed `read_marker` update propagated to the sender anchor:
  ```
  {
    conversation_id:    "<echoed>",
    recipient_did:      "<which recipient this update is for>",
    last_read_envelope_id: "<envelope_id>",
    last_read_at:       "<ISO 8601>",
    server_signature:   "<base64 ed25519 sig by recipient anchor's server keypair>"
  }
  ```
  The sender anchor updates per-recipient read state for every envelope at or before `last_read_envelope_id`.

**Group DM presentation.** Clients aggregate per-recipient state for display: "delivered to 2/3, read by 1/3." This is computed client-side from the per-recipient state the sender's anchor maintains; no aggregated state is stored in the protocol.

State transitions are monotonic: a DM that reaches `delivered` cannot return to `sent`; `read` cannot return to `delivered`. A recipient whose anchor goes down before acking remains in `sent` until the anchor comes back and the inbox push (or pull-on-reconnect, ADR 008) succeeds; the ack then arrives. Per-recipient state is durable.

### Read receipts: globally opt-out

Per CONTEXT.md (Messaging & routing → Read receipt), a user may set a private-blob preference that disables outbound read-marker propagation for **all** their DMs. The preference is enforced at the user's anchors:

- The user's clients still maintain local read state (so unread badges work).
- The user's anchors **decline to forward outbound `read_marker` updates** to sender anchors when the preference is set.
- The user's anchors continue to accept inbound `delivery_ack` and `read_marker` from peers — the opt-out is one-directional.

Per-conversation opt-out is deferred. The v1 lever is the global switch.

### Plaintext in v1; E2EE in M10

The body is **plaintext** between the sender's device and the recipient anchor. TLS protects transit; the sender signature protects against forgery and against silent anchor edits (any modification breaks the signature). But the recipient anchor *can* read message bodies in v1.

This is the same posture as plaintext rooms (ADR 016) and is documented as the explicit v1 trade-off. **DM E2EE is deferred to M10**, where the body field will become an encrypted blob decrypted per device subkey. The envelope shape, the signing discipline, the conversation ID, the delivery state machine, the wrapper, the inbox semantics — none of those change. The substitution is local to the `body` field's contents and to a key-distribution layer that future ADRs will pin.

The implication for v1 anchor operators: **DMs are not secret from the user's anchor.** A user who wants metadata-and-content privacy from their anchor either picks an anchor they trust or self-hosts. This is the same lever as ADR 021's push-fan-in trade-off; both fall out of "the anchor knows everything about its user."

## Consequences

### Positive

- The envelope shape is small, signed, and deterministic. Verifiers do not negotiate format — they verify canonical-JSON against the supplied signature.
- Conversation identity is content-derived; no server allocates DM IDs. Every participant computes the same value.
- The delivery state machine is per-recipient and propagated via signed acks, so group DMs surface accurate fan-out state without complex aggregation.
- The wrapper-vs-no-wrapper distinction is precise and avoids redundant work in the same-anchor case.
- Forward-compatible to M10: only the `body` contents change, not the envelope shape or the routing.
- Read-receipt opt-out is a single, honest global lever; per-conversation control can be added later without protocol changes.

### Negative

- Immutable group rosters are a real product limitation. "I want to add Eve to our group chat" creates a new conversation, which is a UX wrinkle the design will need to handle gracefully.
- The per-recipient delivery state table grows with conversation length. For long group DMs this is non-trivial; pruning policy is out of scope here.
- v1 plaintext to anchors is a known compromise that the marketing surface must not over-promise around. "End-to-end encrypted" is M10's claim, not M7's.
- RFC 8785 is the chosen canonicalization but it has corner cases (deeply nested objects, unusual numeric literals). Workers must use a vetted implementation rather than rolling their own.

### Rejected alternatives

- **Server-allocated conversation IDs.** Would require a coordinator and break the "any participant can verify" property. Rejected; content-derived IDs are simpler and correct by construction.
- **Mutable group rosters in v1.** Brings in a non-trivial "who can add whom, how is the new member catching up, how do removed members handle in-flight messages" design space. Deferred to a future ADR.
- **Two-state delivery (sent / read, no separate delivered).** Loses the signal that the recipient's anchor has the envelope (so the user is reachable) versus the recipient has actually seen it. Useful information for the sender; cheap to maintain. Rejected.
- **Custom canonicalization scheme.** No upside over RFC 8785; meaningful downside in maintenance and cross-implementation drift. Rejected.
- **`@everyone` in DMs producing per-DM-default notifications regardless of recipient settings.** Would override the recipient's notification level. Rejected — `@here` / `@everyone` in DMs respect each recipient's level per ADR 021.
- **Per-conversation read-receipt opt-out in v1.** Real product value, but the global switch covers the dominant case and the per-conversation UX requires a settings affordance we deferred. Future.

## Open questions

- **Encryption at rest on anchors.** The envelope is plaintext on disk if the operator does not configure disk encryption. The protocol does not mandate it; operator posture varies. Documented as deployment guidance, not pinned here.
- **Pruning of per-recipient delivery state.** Long-lived group DMs accumulate state per envelope per recipient. Pruning policy (drop everything older than N days? compress to a single "last delivered/read" pointer per recipient?) is a future implementation concern.
- **Cross-anchor read-marker propagation latency.** A read marker for a recipient on a slow anchor may take noticeable time to surface to the sender. Acceptable; documented.

## References

- [CONTEXT.md](../../CONTEXT.md) — direct message, DM envelope, conversation ID, group DM, delivery state, read receipt, delivery wrapper
- [ADR 001 — Auth wire format](001-auth-wire-format.md) — canonical-JSON / Ed25519 conventions
- [ADR 002 — Message ordering](002-message-ordering.md) — DM ordering reference
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md) — envelope_id dedupe, delivery wrapper
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 010 — Abuse model](010-abuse-model.md) — message requests (Tier 1), per-anchor budget (Tier 2)
- [ADR 013 — Key rotation](013-key-rotation.md) — server-key verification path
- [ADR 016 — Room encryption phases](016-room-encryption-phases.md) — plaintext-vs-E2EE phasing
- [ADR 019 — Message lifecycle](019-message-lifecycle.md) — reply_to / inline-reply
- [ADR 021 — Notifications, push fan-in, and read markers](021-notifications-fan-in.md)
- [ADR 022 — Attachments and storage backends](022-attachments-storage.md)
- RFC 8785 — JSON Canonicalization Scheme
