# ADR 013 — Key rotation: server keys and key documents

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

Every Yawp server has its own Ed25519 keypair (ADR 009) used to sign federation envelopes (delivery wrappers, sync messages, presence pushes). Server keys must be rotatable: operators upgrade hardware, suspect compromise, or follow routine hygiene. Without an explicit rotation protocol, peers would either (a) refuse to verify after rotation or (b) cache stale keys indefinitely.

The same problem will eventually exist for user-level key rotation, but for v1 we constrain the scope to **server keypair rotation**. User key rotation is mostly handled by adding/revoking device subkeys (which are signed by the master key) and is deferred.

## Decision

### Key document at a well-known URL

Each server publishes a JSON key document at:

```
https://<host>/.well-known/yawp/server-key.json
```

The document is a **list of keys**, each with a validity window. Shape:

```json
{
  "server_id": "a1.example.com",
  "keys": [
    {
      "key_id": "k-2026-01",
      "public_key": "ed25519:<base64>",
      "not_before": "2026-01-01T00:00:00Z",
      "not_after":  "2026-12-31T23:59:59Z"
    },
    {
      "key_id": "k-2026-07",
      "public_key": "ed25519:<base64>",
      "not_before": "2026-06-01T00:00:00Z",
      "not_after":  "2027-05-31T23:59:59Z"
    }
  ],
  "revoked": ["k-2025-08"]
}
```

### Validity windows, not single "current" key

The document publishes **all active keys** with explicit `not_before` / `not_after`. Peers select the right key by matching the `key_id` referenced in the envelope being verified. This permits **overlapping rotation periods**: a new key may be published and used before the old one expires. Operators can preview rotation safely.

### Revoked list

`revoked` lists key IDs that must be treated as compromised regardless of their original validity window. Any envelope signed with a revoked key is rejected immediately. Revocation is one-way — a revoked key never re-validates.

### TLS bootstraps trust

The integrity of the key document rests on **HTTPS to the well-known URL**. The CA chain (Web PKI) is the root of trust for first-time discovery of a server's keys. Specifically:

- A peer fetching `/.well-known/yawp/server-key.json` over HTTPS trusts the response if the TLS handshake succeeds.
- This is the same trust model as WebFinger, ActivityPub key discovery, and Matrix's `.well-known`.
- We do **not** layer DNSSEC, Certificate Transparency monitoring, or out-of-band pinning in v1. Those are options for a future hardening pass.

A compromised CA could MITM a key fetch. We accept this trade-off given the operational cost of alternatives and the fact that the rest of the federation (HTTPS endpoints) already depends on Web PKI.

### TTL: 24h, with proactive refresh hints

Peers cache the key document with a default **TTL of 24 hours**.

- After TTL expires, the document is refetched on next use.
- If a peer receives an envelope signed with an unknown `key_id` from a server it has cached, it **refetches immediately** before rejecting (the unknown key may be a freshly-rotated key).
- The HTTP response carries a `Cache-Control` header from the operator that may shorten or lengthen the TTL. The cap is the operator's responsibility.

### Rotation flow for operators

To rotate:

1. Generate a new keypair.
2. Add it to the key document with `not_before` = now and `not_after` = your chosen window.
3. Wait for peers to pick it up (default TTL: 24h).
4. Configure the server to **sign with the new key** while still accepting verifications using the old key (until `not_after`).
5. After the old key's `not_after`, decommission the old private key material.

To revoke:

1. Add the compromised `key_id` to the `revoked` list in the key document.
2. Sign all new traffic with a different (non-revoked) key.
3. Peers reject any envelope signed by the revoked key on next document refresh — within 24h by TTL, or sooner if traffic from that server causes an unknown-key refetch.

### What this doesn't cover

- **User master-key rotation.** Out of scope for v1. The primary mechanism for user key hygiene is **device subkey rotation** (add new subkey, revoke compromised ones via PPE update). Full master-key rotation is a future ADR.
- **Bundle re-encryption.** If a user's mnemonic seed is compromised, the recovery bundle would need to be re-encrypted under a new key. Also future work.
- **Anchor-list rotation.** Already handled by signed PPE updates with `profile_version`.

## Consequences

### Positive

- Operators can rotate keys without coordinating with peers. Document update is sufficient.
- Overlapping windows mean rotation is non-disruptive — there is no "flag day."
- Revocation is explicit and propagates within a bounded window (24h by default, sooner with unknown-key triggers).
- The protocol surface for trust bootstrap is small: one well-known URL, one document format.

### Negative

- TLS / Web PKI is a single trust root for first contact with a server's keys. A targeted CA compromise can substitute keys until peers refetch. Mitigated by short TTL and by the fact that signature verification rejects key substitution post-cache.
- The 24h TTL means a revocation isn't instant globally. For most threat models this is acceptable; for high-urgency revocation, operators can shorten the TTL and out-of-band-notify peer operators.
- Operators must remember to advance `not_before` / `not_after` before keys expire. UI / tooling should warn before expiration.

### Rejected alternatives

- **DNS-based key publication.** Rejected for v1: adds DNSSEC dependency and is harder to update than an HTTPS endpoint.
- **Single "current key" with hard cutover.** Rejected: requires coordination across all peers; high risk of dropped traffic.
- **Certificate Transparency-style append-only log of keys.** Rejected for v1: significant operational complexity. May revisit if cross-operator trust attacks become a real threat.
- **No rotation; permanent keys.** Rejected: operators must be able to rotate compromised keys.

## References

- [CONTEXT.md](../../CONTEXT.md) — server keypair, delivery wrapper, key document
- [ADR 008 — Anchor sync protocol](008-anchor-sync-protocol.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
