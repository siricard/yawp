# ADR 027 — Peer verification and key fingerprints

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-21

## Context

Yawp's identity is a public key (ADR 005). Two users who have never met must, at some point, exchange public keys to be confident they are talking to _the person they think they are talking to_ — not to someone whose key has been swapped along the way.

In the unencrypted-but-signed v1 (ADR 025), the threat is "the recipient anchor lies about whose key signs Alice's messages." Once E2EE has shipped, the threat is "the recipient anchor lies about whose key Alice's messages are _encrypted to_." Both threats reduce to the same root cause: **any party in the key-fetch path can substitute a key**. That includes a compromised anchor, a malicious self-hoster, a TLS-chain compromise targeting the well-known endpoint, an OS that swaps DNS, and so on. None of these can be eliminated cryptographically — two parties cannot bootstrap mutual authentication over an untrusted channel without an out-of-band comparison. Trust-on-first-use (TOFU) is a UX compromise, not a security guarantee.

The fix is the same one every system with this threat has settled on: surface a short, human-readable fingerprint of the peer's key, and let two users compare it via a channel the attacker doesn't control (in person, on a phone call, on a video). Once compared, the local user pins the verification status on their side. The mechanism is well-trodden — Signal safety numbers, Matrix emoji verification, GPG fingerprints — what is new here is committing to **where** verification surfaces in the UI, **how** the protocol handles key changes, and **what** verification absolutely does not do (gate communication).

This ADR pins all three.

## Decision

### Why verification exists

The threat model is the **MITM-at-key-discovery** attack. When Alice's client first encounters Bob's DID, it fetches Bob's public key — from the PPE replicated through the anchor and federation paths (ADR 006, ADR 009). Any party with control over that fetch path can substitute their own key for Bob's. Specifically:

- **A compromised anchor** can lie about Bob's PPE to Alice's client.
- **A malicious self-hoster** running an anchor for Bob can serve a forged PPE to Bob's peers.
- **A TLS chain compromise** (a rogue CA, a MITM proxy in the network path, a stolen `/.well-known` certificate) can substitute Bob's server-key document and, by extension, the key used to validate the signed PPE.

Cryptographically, **two parties cannot bootstrap mutual authentication over an untrusted channel without an out-of-band comparison**. TLS, signatures, and federation hops are all the same channel — the network — and they all share the same threat model. The only way Alice and Bob can be confident they have each other's actual keys is to compare them via a channel the attacker does not control.

TOFU (the default `unverified` state below) is a **UX compromise**. It says: "We accept the first key we see for this peer and warn you only if it changes later." This is the right default — friction-on-first-contact would tank adoption — but it is honest only if we tell the user, when they ask, that they have not actually verified the peer's key. Verification status is how we tell them.

### Three states

Per-peer **verification status** (CONTEXT.md) takes one of three values:

- **`unverified`** (default). The peer's key is trusted-on-first-use; the local user has not compared the fingerprint out-of-band. The UI does not nag — communication proceeds normally — but the peer profile sheet shows the fingerprint with an "Verify identity" affordance and a "Pending verify" chip near their name.
- **`verified`**. The user has performed an out-of-band comparison and marked the peer verified. The UI renders a shield-check tick beside the peer's name in the peer profile sheet and in peer-list entries. The state carries a `verified_at` timestamp and the fingerprint that was matched at verification time.
- **`key_changed`**. The peer's published key has changed since the local user last marked them `verified`. Surfaced loudly because, by definition, this is the state we exist to detect. See "Key-change detection" below.

A peer who is `unverified` and whose key changes simply gets a new TOFU acceptance — there is no banner, no warning, no `key_changed` transition. The user already accepted "this is whatever key I see," and they get to accept the new key on the same terms.

### Fingerprint format

A key fingerprint is the **first 128 bits** of `sha256(master_public_key)`. The master public key — not a device subkey — is the input. (Device subkeys rotate; the master key is the long-lived anchor of identity, and verifying a peer means verifying _the identity_, not "a particular device session.")

The 128 bits are rendered as `yp:` followed by four groups of four lowercase hex characters separated by `·` (space, middle-dot, space):

```
yp:8f3a · d21c · 47ee · 0b91
```

128 bits is a deliberate cost-vs-readability trade-off. 64 bits is brute-forceable in modern dedicated hardware; 256 bits is hostile to read aloud. 128 is the same width that Signal safety numbers and most equivalent systems converge on, with a similar grouping.

Some design mocks show shorter forms (`yp:8f3a · d21c`) for compactness in tight UI surfaces. Those shortened forms are **visual shorthand only**; they exist because the full fingerprint does not fit in a 40-pixel chip. **Production verification UI uses the full 128-bit form** wherever the user is actually comparing or recording the fingerprint (peer profile sheet, modal during verification, Settings list). Shortened forms may appear as a visual aid in peer-list rows; they must not be the comparison surface.

### State storage

Verification state is stored in the local user's **private blob** (ADR 006), as a per-peer record:

```
{
  peer_did:                    "did:yawp:...",
  status:                      "unverified" | "verified" | "key_changed",
  fingerprint_at_verification: "yp:... " | null,   // present iff status ever reached "verified"
  verified_at:                 "<ISO 8601>" | null
}
```

The record is **synced across the user's devices** via the anchor sync protocol (ADR 008). All of the user's devices share the same verification state — verifying on the laptop also marks verified on the phone. This is intentional: verification is an assertion of _the user_, not of _the device_. The same person re-verifying from a new device would be redundant friction.

The record is **not federated to the peer**, **not visible to peers**, and **not visible to any server**. A server holding the user's private blob holds it as opaque ciphertext (ADR 006). The verification assertion is local-to-the-user, on purpose: a peer learning that the local user has verified them would create a coercion surface ("show me whether you trust me yet") with no upside for the local user.

### Verification paths

v1 supports two paths to move a peer from `unverified` to `verified`:

**QR scan (in person).** Each user's profile sheet shows a QR code encoding their **full master public key**. Alice taps "Verify identity" on Bob's profile, opens her camera, and scans Bob's QR code from his device. Her client:

1. Decodes the public key from the QR payload.
2. Compares the decoded key to the key Alice's client _already has_ for Bob (fetched via PPE; the comparison key).
3. On match, marks Bob `verified` in Alice's private blob with `verified_at = now` and `fingerprint_at_verification = fp(decoded_key)`.

The QR is a one-way assertion from Alice's side; Bob's client does not learn that Alice verified him. To make the relationship mutual, Bob scans Alice's QR code in the same session — the typical UX flow is "show each other your QRs." Each side independently records the assertion in their own private blob.

The QR carries the master public key in a deterministic encoding (base58 of the raw 32-byte Ed25519 public key, prefixed with a short version tag to disambiguate from future encodings). It does **not** carry the user's DID redundantly — the DID is `base58(sha256(public_key))` and the client recomputes it on scan.

**Out-of-band fingerprint compare.** The peer profile sheet shows the full fingerprint (`yp:8f3a · d21c · 47ee · 0b91`) alongside a "Verify identity → Compare fingerprint" affordance. Alice opens this affordance and is shown her fingerprint of Bob with a "Match" / "Doesn't match" choice. Alice reads the fingerprint to Bob over a trusted channel — phone call, video call, in person, encrypted side channel they both trust — and Bob reads his fingerprint of himself back. On match, Alice taps "Match" and her client marks Bob `verified` with `verified_at = now` and `fingerprint_at_verification = <the matched fingerprint>`.

The compare flow is **always one-directional**: Alice marks Bob verified on Alice's side. For Bob to mark Alice verified, Bob runs the same flow on his end. The UI nudges this ("Ask <Bob> to verify you too") but does not enforce it.

There is no third path in v1 — no "trust because of a shared room admin," no "trust because they're in my contacts," no signed cross-attestation between users. Those are all interesting future ideas with non-trivial threat-model surface that this ADR does not commit to. The two paths above cover the common case.

### Key-change detection

A peer marked `verified` transitions to `key_changed` when the local user's client detects that the peer's key — specifically the master public key, derived from the latest PPE or implied by the device subkey signing the latest received envelope — differs from `fingerprint_at_verification` recorded in the local blob.

Detection runs on:

- **PPE refresh** (ADR 006: when a guest server's piggybacked `profile_version` outpaces the cached version, the PPE is refetched; the client recomputes the fingerprint of the new master key and compares).
- **Incoming envelope verification** (each DM envelope's `sender_signature` is verified against the sender's PPE — if PPE refetch produces a new master-key fingerprint, the verification state is reconsidered before the envelope is shown to the user).

On detection, the client:

1. Records the new fingerprint alongside the old one (the old fingerprint is preserved for "compared what to what" in the UI).
2. Transitions `status` to `key_changed`.
3. Surfaces the `key_changed` banner in **only** the DM threads with that peer.

The user has three responses to a `key_changed` state:

- **Re-verify.** Run the QR or fingerprint-compare flow with the new key. On match, `status` returns to `verified`, `fingerprint_at_verification` is updated, `verified_at` is updated.
- **Dismiss.** The user taps "Dismiss" on the banner. The state silently downgrades to `unverified` — we treat dismissal as "I no longer claim to have verified this person." The next key change after dismissal will not produce another banner unless they re-verify in the interim.
- **Ignore.** Communication is not blocked. The user can keep messaging without taking any action; the banner remains visible at the top of every DM thread with that peer until they re-verify or dismiss.

`unverified` peers do not transition through `key_changed`. A peer who was never verified has no captured fingerprint to compare against; a key change for them is just a new TOFU acceptance, which is no banner.

### UX boundaries — what verification UI must NOT do

These are non-negotiable invariants. Workers implementing the UI must enforce them. Verification UI **must not**:

- **Appear in the DM composer.** No "this peer is unverified" prompt next to the send button. No tooltip on hover. No badge on the message-send button.
- **Appear in the message-rendering path of any individual message.** No shield icon on each message. No "verified message" / "unverified message" decoration. Verification is per-peer, not per-message; rendering it on every bubble is noise that trains the user to ignore the actual `key_changed` banner.
- **Block sending.** A DM to an `unverified`, `verified`, or `key_changed` peer sends with the same code path and the same UX. The state does not change what the user can do.
- **Prompt during normal navigation.** No modal popping over the chat to ask "want to verify this person?" No banner across the workspace. The "Verify identity" affordance lives in the peer profile sheet, full stop.

Verification UI **must only** appear in these three places (CONTEXT.md → Peers & verification → Verification UX boundaries):

1. **Peer profile sheet.** The fingerprint is shown in muted text, alongside the "Verify identity" affordance. This is the primary surface; verification is something the user does deliberately, by opening the sheet.
2. **Peer list.** A small status badge ("Pending verify" chip / shield-check tick / `key_changed` warning marker) next to each peer in the dedicated DM page's Pinned / Recent / All groupings.
3. **Security settings.** A global list of `verified` peers with the per-peer `verified_at` timestamp, allowing the user to manually revoke verification (drop to `unverified`) or trigger a re-verify.

The **`key_changed` banner** is the _only_ in-thread verification UI. It appears **only** at the top of DM threads with peers in `key_changed` state, is dismissable, and never blocks the thread. It is the loud surface that exists to interrupt — exactly so that all the other verification surfaces can stay quiet.

The reason for these boundaries is that verification UI in the seamless communication path is a known anti-pattern: it trains users to dismiss verification prompts as noise, which means when something _actually_ matters (a `key_changed` event on a peer the user trusted), the loud surface is already exhausted. Yawp's posture is **zero friction in the seamless path, loud friction at the inflection point**.

### Non-gating

**Communication is never blocked by verification status.** Sending a DM to an `unverified` peer is identical to sending one to a `verified` peer. Sending to a `key_changed` peer is identical, modulo the banner. There is no "you must verify before you can DM" mode and no "blocked until you verify" state.

This is the same posture as Signal: verification adds a property to the relationship; it does not adjudicate whether messages flow. Blocking communication on unverified status would either:

- Be the default (in which case nobody can message anyone until they're physically in the same room — adoption suicide), or
- Be off-by-default (in which case it adds a UX state nobody ever reaches), or
- Be on for "important" messages (impossible for the client to know).

None of those is right. Verification is a tool the user uses when they care; it is not an enforcement mechanism the protocol weaponizes.

### Relationship to ADR 013 (key rotation)

ADR 013 pins **server-key rotation**. User-master-key rotation is deferred but will exist eventually. Either way, a key rotation produces, at the protocol layer, **exactly the same observable signal as a key-substitution attack**: the peer's key is different from the one we had before.

This is structural — there is no in-protocol way to distinguish "Bob legitimately rotated his key" from "an attacker swapped Bob's key." The protocol can attest "Bob's previous key signed a delegation authorizing this new key" (and a future ADR may pin a master-key-rotation primitive that does exactly this), but the local user cannot trust a self-signed delegation chain because the very thing under attack is the chain's root. The only way the local user can be confident is the same out-of-band comparison they used to verify in the first place.

**Verification is the user's tool for distinguishing legitimate rotation from attack.** We document this honestly. A `key_changed` banner says, in effect: "Either Bob got a new device and rotated his keys, or somebody is impersonating Bob. The protocol cannot tell you which. Re-verify with Bob over a channel the attacker doesn't control."

For device-subkey rotation specifically (which is in scope of v1 — ADR 006's PPE carries device subkeys, and adding/revoking them happens routinely), the **master key does not change**. The fingerprint compared at verification is the _master-key_ fingerprint, so subkey rotation does **not** trigger `key_changed`. This is by design: routine device additions should not produce a verification storm.

## Consequences

### Positive

- Verification is the right tool for the threat (out-of-band comparison) and avoids both no-verification (silently MITMed) and gating-on-verification (adoption suicide).
- The three states are minimal and exhaustive; the state machine is testable and explainable.
- The `key_changed` banner is the _only_ loud verification surface, so when it appears, it has the user's attention.
- Verification state is per-user, synced via the private blob, so the user's devices agree without per-device re-work.
- Master-key fingerprinting means routine device-subkey rotation does not produce false positives.
- Honest framing of legitimate-rotation-vs-attack documents the limit of what the protocol can do for the user.

### Negative

- TOFU is real: a user who never verifies is silently MITM-able and never learns of it (since `unverified` peers don't get `key_changed` transitions). We accept this; it is the same posture as Signal's default.
- A user who dismisses a `key_changed` banner has effectively re-TOFU'd; we silently downgrade to `unverified` rather than burning the channel down. This is the right call for usability, but it does mean a user who clicks "Dismiss" without thinking has lost the protective effect of having ever verified that peer.
- The QR-scan path requires both users to be physically together (or sharing a video call clear enough to read a QR). Realistic but not always available; the fingerprint-compare path covers the remote case at the cost of more friction.
- Master-key-rotation, when it ships, will be cryptographically indistinguishable from key substitution at the local-user level. Same `key_changed` flow; the user must re-verify either way. Documented up front so the future ADR for master-key rotation doesn't have to re-litigate.
- The 128-bit fingerprint is comfortable to compare in person but tedious over a phone call. Users will get bored partway through. We accept this; the cost of full-string verification is the price of meaningful comparison.

### Rejected alternatives

- **Block DMs to unverified peers by default.** Adoption suicide; trains users to verify-and-forget rather than verify-when-it-matters. Rejected.
- **Per-message verification badges (shield on every signed message).** Trains the user to dismiss verification UI as noise. When `key_changed` actually fires, the badge is already invisible. Rejected.
- **Federated cross-verification (signed assertions: "I, Alice, verified that Bob's key is X").** Has real value but a non-trivial threat model (collusion among colluding "verifiers"), opens an abuse surface (mass-revocation campaigns), and requires a separate signed-assertion protocol layer. Deferred; not in scope.
- **Auto-mark verified if the peer is in the same workspace as a peer who is already verified.** Trust-by-association produces an attractive but wrong threat model: the attacker gains "verified" status by infiltrating one shared workspace. Rejected.
- **Don't transition to `key_changed`; treat all key changes as silent re-TOFU.** Loses the entire point of verification. Rejected.
- **Use device-subkey fingerprints instead of master-key fingerprints.** Routine device-subkey rotation would produce constant `key_changed` events. Rejected.
- **Show full fingerprint inline beside every message.** Same anti-pattern as per-message badges, plus reads like noise. Rejected.

## Open questions

- **Master-key rotation flow.** When user-master-key rotation ships, the design will need to handle the legitimate-rotation case alongside the attack case. The flow described here (re-verify after `key_changed`) is correct regardless; the _frequency_ of legitimate `key_changed` events will increase, and the UI may need to soften the banner copy. Out of scope for this ADR.
- **Federated revocation hints.** A user whose anchor knows their device was stolen could in principle publish a "treat any new key as suspicious" signal. Mixed value, non-trivial trust model; not pinned here.
- **Stronger fingerprint encodings.** Word-list encoding (NATO-phonetic, BIP-39-style) is friendlier to read aloud than hex. Worth exploring; we ship hex in v1 because hex is least ambiguous in writing and the dictionary problem (localization) is real.
- **Group DM verification.** In a group DM (ADR 025), each pairwise peer has independent verification state. The UI surfaces per-peer state in the participant roster; there is no "group is verified" aggregate. Implementation-level UX detail, not a protocol question.

## References

- [CONTEXT.md](../../CONTEXT.md) — peer, key fingerprint, verification status, verification UX boundaries, pinned peer
- [docs/cryptography-glossary.md](../cryptography-glossary.md) — Ed25519, SHA-256, fingerprint
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 013 — Key rotation: server keys and key documents](013-key-rotation.md) — server-key rotation; user-master-key rotation deferred
- [ADR 025 — DM v1 wire format](025-dm-wire-format.md) — envelope-signature verification path
