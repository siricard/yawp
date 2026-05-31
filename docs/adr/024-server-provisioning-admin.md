# ADR 024 — Server provisioning and admin separation

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-21

## Context

A Yawp server has two distinct universes of authority that have, until now, only been described implicitly:

1. **The operator universe.** Whoever runs the VPS — the human with shell access — needs a way to configure the box: pick an attachment backend (ADR 022), wire up coturn (ADR 020), set retention defaults (ADR 019), toggle the body archive, rotate server keys (ADR 013), watch federation health. This person does not necessarily have a chat identity at all. They are running infrastructure, not chatting.
2. **The chat-owner universe.** Whoever holds the `Owner` system role (ADR 017) on the server's chat side — the DID with unconditional authority over rooms, roles, bans, server settings visible in the chat client. This is a federated chat identity (ADR 005); it can change without the operator changing, and vice versa.

These universes overlap in the friend-group case (the operator *is* the chat owner; one person plays both parts), but they must not be welded together at the protocol layer. A managed-hosting provider runs the operator side for someone else; a community might rotate chat ownership while keeping the same operator; an operator might transfer their VPS to a new admin without surrendering the chat to a stranger.

Without an explicit provisioning model, the two universes drift into accidental coupling — typically by accident, when the chat-owner login is treated as the way to administer the box (the Discord pattern), or by inversion when the operator's box-level credentials are used to assert chat authority. This ADR pins down the separation, the bridge between the two, and the first-boot lifecycle that produces a usable server.

## Decision

### Two independent identity universes

A Yawp server has exactly two identity surfaces, and they do not share credentials, recovery, or rotation:

- **Operator identity.** Traditional credentials (password in v1; passkey support is a follow-up). Authenticates against the **admin panel** (CONTEXT.md) at `/admin`. No DID. No keypair. Does not appear in any chat roster. Does not participate in federation. Multiple operator accounts may exist on a single server.
- **Chat identity.** A DID (ADR 005), federated, keypair-backed, mnemonic-recoverable (ADR 007). The DID holding the server's `Owner` system role (ADR 017) is the **chat owner**. Lives in the chat client, not in `/admin`.

The two universes are bridged exactly once, by the **claim token** (CONTEXT.md) flow described below. They never share state otherwise. Resetting one has no effect on the other.

### First-boot lifecycle

When a freshly-deployed Yawp server boots for the first time, the system performs **first-boot seeding** (CONTEXT.md), in order:

1. **Generate the server's federation keypair** (ADR 013). The keypair is persisted; the public key is published at `/.well-known/yawp/server-key.json` with a `not_before` of now and a default `not_after` one year out.
2. **Seed system roles.** Per ADR 017, three roles are created with `system: true`: `Owner`, `Admin`, `Member`. None of them has an assignee yet — the `Owner` slot is unfilled until the chat-claim flow completes.
3. **Seed default channels.** Per ADR 018, two channels are created and placed in no category: a text channel named `#general` and a voice channel named `General`. Their permissions default per ADR 017 (`Member`+ can read, send, and connect to voice).
4. **Print the admin setup URL** to the server's startup logs:
   ```
   Yawp first boot detected.
   Visit https://<host>/admin/setup to create the operator account.
   ```
   The URL is printed once at startup and again whenever the server boots while no operator account exists. Without an operator account, the admin panel is in setup mode and accepts no authenticated requests beyond `/admin/setup`.

The seeded state is sufficient for federation: the server can sign envelopes, accept users, host the default channels. It is **not** sufficient for chat administration — there is no chat owner yet. Federation works; admin doesn't, until the operator sets up their account and a DID claims the server.

### Admin account creation

The operator visits `/admin/setup` and is asked to:

- Set a username (operator handle, distinct from any chat handle).
- Set a password (Argon2id-hashed at rest; v1 minimum strength enforced by zxcvbn-equivalent or similar; passkey enrollment is a follow-up).

On submit, the **admin account** (CONTEXT.md) is created, the setup endpoint is disabled, and the operator is redirected to the admin dashboard. The setup URL is no longer functional. Additional operator accounts can be added from inside the dashboard if the operator wants a sysadmin handoff path; multiple admin accounts are permitted.

Forgotten-password recovery in v1 is **out-of-band** (SSH into the box, run a Mix task to reset). There is no operator-facing password-reset flow. This is acceptable because the operator already has shell access — that *is* their recovery channel.

### Admin panel scope

The admin panel is a Phoenix LiveView mounted at `/admin`, password-gated, and is the **only** surface for operator-level configuration. It exposes:

- **Attachment backend** (ADR 022) — switch between `local` and `s3`, configure S3 credentials and bucket, per-server size limits.
- **TURN / coturn** (ADR 020) — coturn hostname, the shared HMAC secret, credential TTL.
- **Per-server defaults** — default retention policy (ADR 019), max attachment size, max attachments per message, voice channel participant cap (ADR 020).
- **Body archive toggle** (ADR 019) — on / off; on requires explicit operator acknowledgement.
- **Federation status** — peer anchors seen recently, delivery budget state (ADR 010), key document refresh times.
- **Key rotation tooling** (ADR 013) — view the current key document, generate new keypairs, publish updated documents, mark keys revoked.
- **Database health** — Postgres connection status, table sizes, retention sweep status.
- **Chat-owner management** — view the current chat owner DID, generate claim tokens, revoke pending claim tokens, transfer ownership by re-issuing a token.
- **Operator audit log** — append-only log of operator actions (settings changes, key rotations, claim-token events) with timestamp and acting operator account.

The admin panel does **not** expose chat-level controls: it does not list rooms, it does not manage roles, it does not ban users, it does not delete messages. Those are chat-client concerns and require chat-side authority (the `Owner` or `Admin` DIDs per ADR 017). Conversely, the chat client does **not** expose operator-level controls — picking the attachment backend is not a chat-client setting.

Cosmetic server-side settings that *are* properly chat-owner concerns (server icon, server display name, channel layout, role assignments beyond the seeded three) belong to the chat client, not `/admin`. The admin panel surface is intentionally small and operator-focused.

### Server claim flow

The **server claim** (CONTEXT.md) is the one and only bridge between the operator universe and the chat universe. The flow:

1. **Operator generates a claim token.** From the admin dashboard, the authenticated operator clicks "Generate claim token." The server mints a one-time short-lived **claim token** (CONTEXT.md) — a random 128-bit value, base32-encoded for paste-friendliness, persisted server-side with a default 15-minute TTL. The token is displayed exactly once in the dashboard with a copy affordance. The operator is told plainly: anyone who has this token can become the chat owner.
2. **Operator distributes the token.** In the self-hosting case the operator simply pastes it into the chat client themselves. In the managed-hosting case the hosting company mails the token to the customer.
3. **Chat client posts a signed claim request.** The user opens the Yawp client, adds the server, and pastes the claim token. The client posts to the server:
   ```
   {
     claim_token: <opaque token>,
     did:         <did:yawp:...>,
     pk:          <base64(public_key)>,
     sender_signature: <ed25519 sig by master key over canonical-JSON of the above three fields>
   }
   ```
   Field name `pk` matches the convention from ADR 001 (avoiding the literal name that trips secret scanners).
4. **Server verifies and consumes.** The server:
   - Verifies the claim token exists and has not been consumed or revoked.
   - Verifies the token has not expired.
   - Verifies the DID matches `base58(sha256(public_key))` (ADR 001).
   - Verifies the signature against the supplied public key over the canonical-JSON of `(claim_token, did, pk)`.
   - On success: records the DID as `Owner` system-role assignee, marks the token consumed, writes an audit log entry, returns a session+refresh token pair (ADR 012) to the chat client so the client is logged in as the chat owner.

On failure the response carries one of `claim_token_invalid`, `claim_token_expired`, `claim_token_consumed`, `did_mismatch`, `invalid_signature` (same vocabulary as ADR 001 where applicable).

### Token lifecycle

- **Generated by the operator only.** Claim tokens never appear in URLs, emails, or filesystem paths automatically. The operator copies one from the dashboard and chooses how to hand it off.
- **Short-lived.** Default TTL 15 minutes. The operator may regenerate without limit.
- **Single-use.** First successful consumption invalidates the token. Concurrent claim attempts race; the loser receives `claim_token_consumed`.
- **Revokable.** The operator can revoke an unconsumed token from the admin panel before it is used.
- **Ownership transfer.** To move chat ownership from one DID to another, the operator revokes any pending tokens, generates a new token, and the new owner claims. The previous `Owner` is demoted to `Admin` (or removed entirely; the operator chooses in the dashboard at transfer time). The previous chat owner's session and refresh tokens are not automatically invalidated — they remain logged in with `Admin`-or-lower permissions until they sign out or are revoked.

The chat owner cannot transfer ownership without the operator's cooperation, by design: chat ownership is a privilege the operator grants. This is the safety lever that allows managed hosting and operator-driven moderation handoff.

### Independence of the two credentials

The operator's password and the chat owner's DID rotate on independent schedules:

- The operator can change the admin password without affecting the chat owner.
- The chat owner can rotate their device subkeys, rotate their master key (future work, see ADR 013), or recover from mnemonic (ADR 007) without affecting the admin panel.
- The chat owner can leave (lose their device, abandon their identity) without the server becoming unusable as long as the operator can issue a new claim token to a new DID.
- The operator can leave (sell the VPS, hand over admin to a new sysadmin) without the chat owner changing — the new operator inherits the existing chat owner along with the box.

A revoked-and-reissued claim token is the deliberate path to chat-ownership transfer. There is no other path; specifically, there is no "the chat owner forgot their mnemonic" recovery path that the operator can perform from the admin panel without revoking-and-reissuing.

### Managed hosting

The same provisioning model supports a managed-hosting story without protocol changes:

- The hosting company is the operator. They run `/admin/setup` and hold the operator credentials.
- The hosting customer is the chat owner. The hosting company generates a claim token at provisioning time and mails it to the customer.
- The customer pastes the token, claims the server, and from then on owns the chat side. They never see `/admin`.

On managed instances the hosting company may also hide the `/admin/setup` URL from public surfaces (e.g., not print the setup link in customer-visible logs) — but the protocol does not require this. The admin panel exists; whether it is reachable from the public internet is a hosting-deployment decision.

### "Server is unclaimed" detection

Detection of the unclaimed state — a server that has booted, seeded itself, and is waiting for a claim — is left to the chat client at implementation time. The chat client's "add server" flow probes the server, learns that the `Owner` slot is unfilled, and prompts for the claim token in that case rather than the regular signup flow. The exact UI affordance is not pinned by this ADR.

## Consequences

### Positive

- The operator universe and the chat universe never share credentials. A breached admin password does not expose chat keys; a stolen mnemonic does not give shell access to the box.
- The friend-group case still works: one person sets a password, generates a claim token, claims with their own DID, and is done in two minutes.
- Managed hosting is a configuration choice, not a protocol fork. The same admin panel and the same claim token serve "I run my own VPS" and "I bought a hosted Yawp instance."
- Chat-ownership transfer is a deliberate operator action, which is the right safety lever. A compromised chat owner cannot quietly hand the server to an attacker without the operator noticing.
- First-boot seeding makes "boot the binary → working server" a single step. No empty-state surprises in the chat client; `#general` and `General` exist from the moment the first user joins.
- The admin panel surface is small and stable. It does not creep into chat-client territory — operators and chat owners stay in their lanes.

### Negative

- Two credential systems is more surface than one. Documentation has to make the distinction sharply or operators will conflate them.
- "I forgot my admin password" requires SSH access. For a friend-group operator that's fine; for a managed-hosting customer the hosting company must run the reset for them. We document this rather than build a password-reset flow.
- The 15-minute claim-token TTL is a guess. Operators in awkward timezones (mailing a token to a customer across business hours) will need a knob. v1 makes the TTL configurable in the admin panel; the default is unlikely to be right for every workflow.
- Pre-claim, the server is online and federating (the federation keypair is real and signed envelopes flow) but has no chat owner. This is a deliberate state: a server can federate without anyone "owning" the chat side. Documentation must explain why this isn't a bug.

### Rejected alternatives

- **Single login: the chat owner is also the operator.** Couples chat identity to box authority; breaks the managed-hosting model; makes "I sold the VPS" require giving the buyer your mnemonic. Rejected.
- **The first DID to send a signed request to a fresh server automatically becomes the owner.** First-come-first-served chat ownership with no operator gate. Trivially racy in any internet-reachable deployment — someone scanning for new Yawp servers wins the race. Rejected.
- **Operator authenticates with a DID instead of a password.** Looks elegant but forces every operator to have a Yawp chat identity even if they never chat, mints DIDs whose only purpose is `/admin` access, and conflates the universes we are trying to separate. Rejected.
- **The claim token is a long-lived URL embedded in the setup logs.** Removes the operator-mediated step and makes the token a "URL anyone can grab from log scrapers" target. Rejected. The token is generated *from inside* the authenticated dashboard precisely so it inherits the operator's authentication.
- **No separate admin panel; all operator configuration lives in TOML files on disk.** Workable, but UX-hostile for non-technical operators and provides no audit trail. Doesn't preclude file-based config as an alternative (operators who prefer it can still edit configuration files); the admin panel is the supported surface. Rejected as the primary mode.

## Open questions

- **Passkey support for `/admin`.** Cleanly fits the model (passkey is operator-side, not DID-side) but is follow-up work, not a v1 blocker.
- **Multi-operator audit semantics.** When several operator accounts exist, the audit log distinguishes them by username, but we have not pinned how operator role separation (e.g., a "read-only auditor" sub-operator) should be exposed. Out of scope here.
- **Federated identity verification of the chat owner.** A managed-hosting customer who claims a server has no protocol-level way to prove to peer servers that they are the same person who paid for the hosting. Acceptable for v1; out of scope of this ADR.

## References

- [CONTEXT.md](../../CONTEXT.md) — operator, admin panel, admin account, claim token, server claim, first-boot seeding
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 007 — Identity recovery](007-identity-recovery.md)
- [ADR 012 — Session tokens](012-session-tokens.md)
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
- [ADR 018 — Channels, categories, and channel types](018-channels-categories.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
- [ADR 020 — Voice channels: SFU, signaling, and TURN](020-voice-channels-sfu.md)
- [ADR 022 — Attachments and storage backends](022-attachments-storage.md)
