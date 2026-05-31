# ADR 010 — Abuse model

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

Open federation invites spam and abuse: any anchor can attempt to deliver to any other anchor, and any DID can attempt to DM any other DID. Email, Matrix, and ActivityPub federations have all hit this wall. Yawp must commit to an abuse posture before federation is implemented, because retrofitting defenses on top of an existing wire format is much harder than baking them in.

The product framing matters: Yawp is positioned as **"federated chat for friend-group self-hosting, with optional guardrails for public communities."** The defaults should make sense for a 20-person friend group on a single VPS, with the guardrails available — but not always-on — for operators running public-signup anchors.

## Decision

### Layered model: four tiers, two default-on

| Tier | Mechanism | Default | Who controls |
|---|---|---|---|
| 1 | Message-request inbox | **On** | Per-user |
| 2 | Per-anchor delivery budget | **On** | Receiving anchor operator |
| 3 | Reputation / trust scoring | Deferred (post-v1) | — |
| 4 | Operator block | Off (manual) | Anchor operator |

### Tier 1: Message requests (per-user)

A first-time DM from a sender who is **not** in the recipient's accepted contacts **and** **not** in any shared room with the recipient is filed into the recipient's **Message Requests** inbox. The recipient sees the request explicitly and chooses to accept or decline. After acceptance, the sender bypasses the request queue for all future DMs.

- The first DM is delivered, but visually quarantined.
- The recipient's anchor still rate-limits Tier 2.
- A declined sender can re-send only after the recipient takes some explicit allow action (e.g., joining a shared room).

This is the friction that stops "drive-by" cold DMs from feeling like a regular DM.

### Tier 2: Per-anchor delivery budget (receiving anchor)

Each receiving anchor maintains a **per-peer-anchor budget**: how many deliveries it accepts from a given peer anchor per unit time.

- Default starting budget: low (e.g., 100/minute).
- Budgets scale up as the peer accumulates a history of **accepted** (non-spam) traffic, measured by the recipients' message-request decisions.
- Budgets scale down when recipients decline or report.
- Exceeding the budget returns a `429`-style response; the sending anchor retries with backoff.

This protects against an open-signup anchor being used as a spam relay.

### Tier 3: Reputation / trust scoring (deferred)

A global or peer-cluster reputation system is out of scope for v1. Tier 2 buckets are local to each receiving anchor and use only that anchor's own data. We will revisit Tier 3 when we have enough cross-operator deployments to learn from.

### Tier 4: Operator block

An anchor operator can unilaterally block a peer anchor. Effects:

- All inbound and outbound federation traffic with the blocked peer is refused.
- A user on the blocked peer attempting to DM/contact users on this anchor receives a clear `blocked by recipient anchor` error.
- The error surface is visible to the sending user, so they can re-anchor elsewhere if needed.

### Banning a user (recap from CONTEXT.md)

"Banning" is the operator action against a single user on their server. It is **atomic**:

- The user is removed from all rooms hosted on that server.
- If the server was anchoring for the user, the anchor relationship is terminated and the user's PPE/blob is deleted (after a grace period for the user to fetch from another anchor).
- There is no "remove anchor without banning" or "remove from rooms without banning" operation.

### Product positioning

The defaults are tuned for **friend-group self-hosting**:

- Message requests are on so randos don't appear inline, but the friction is light.
- Per-anchor budgets are generous for low-volume federation (friend-of-friend traffic is fine).
- Operator block is the heavy hammer for the rare case where a public-signup anchor goes bad.

Public-signup anchors will need to tune Tier 2 budgets aggressively and may layer their own admission controls on top. We provide the primitives, not a turn-key public-chat moderation suite.

## Consequences

### Positive

- Defaults make sense for the primary use case (self-hosted friend groups) without disabling the tools needed by public anchors.
- All abuse controls are local to a single anchor or user — no global registry, no shared blocklist, no central authority.
- Operators have a clear escalation ladder: rate-limit → block. Users have a clear control: accept or decline message requests.

### Negative

- A determined attacker can stand up many anchors and rotate through them. Tier 2 rate-limits the per-anchor cost but not the cross-anchor cost. Mitigated only at Tier 3 (deferred) or operator-block (manual).
- "Operator block" requires manual intervention. There is no auto-block based on signals in v1.
- Message requests are easy to fatigue. Users who get many requests may start accepting them blindly.

### Rejected alternatives

- **Closed federation (allowlist of trusted anchors).** Rejected: contradicts the federation goal. Available as an operator policy if desired.
- **Captcha or proof-of-work on every DM.** Rejected: UX-hostile and doesn't address the federation-level problem.
- **Global reputation registry.** Rejected for v1: massive operational complexity, central trust authority, and unclear governance.
- **No abuse controls in v1.** Rejected: a public-signup anchor without rate limits would be unusable within a week.

## References

- [CONTEXT.md](../../CONTEXT.md) — message request, per-anchor delivery budget, operator block, banning a user
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 011 — Signup and invites](011-signup-invites.md)
