# ADR 012 — Session tokens: opaque, server-stored, no JWTs

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-18

## Context

After a client completes challenge-response (ADR 001) against a server, the client needs a session credential to authenticate subsequent requests without re-signing on every call. The two dominant patterns are:

- **Self-contained tokens (JWT / signed claims):** the server stamps a token containing claims and a signature; the server holds no per-token state.
- **Opaque tokens (random IDs):** the server issues a random string and stores per-token state (subject, expiry, refresh metadata).

The choice shapes revocation, observability, and the cost of compromise.

## Decision

### Opaque random tokens, stored server-side

Each session is identified by a **128-bit cryptographically random opaque token**. The server stores per-token state: user DID, device subkey ID, issued-at, expires-at, refresh-token ID, optional client metadata (user-agent, IP for audit). No JWTs anywhere.

### Two token types

- **Session token** — short-lived (default **1 hour**). Used on every authenticated request.
- **Refresh token** — longer-lived (default **30 days**). Used only against the refresh endpoint to mint a new session token. Cannot be used as a session token directly.

Refresh tokens rotate on use (each refresh issues a new refresh token; old one is revoked). This bounds the value of a stolen refresh token.

### Transport and storage

| Client | Session token | Refresh token |
|---|---|---|
| Web | HttpOnly Secure SameSite=Strict cookie | HttpOnly Secure cookie, scoped to `/auth/refresh` path |
| Mobile (RN) | OS secure store (Keychain / Keystore) | OS secure store |
| Desktop (RN) | OS secure store (Keychain / Credential Manager) | OS secure store |

Tokens never live in `localStorage` or other origin-readable storage on web. Tokens never travel in URL query strings.

### Revocation

Because tokens are server-side, revocation is **immediate**:

- User-initiated: "sign out of this device" deletes that session + refresh row.
- "Sign out everywhere" deletes all session + refresh rows for the user on that server.
- Operator-initiated: ban / suspend can flush all sessions for a user.
- Per-device-subkey revocation (PPE update) also flushes any session whose `device_subkey_id` matches the revoked subkey.

Compare with JWTs, where revocation requires either short expiry (no immediate revocation) or a blocklist (re-introduces server-side state and defeats the JWT premise).

### Per-server independence

A user with 50 servers has 50 independent session+refresh pairs, one per server. There is no SSO or shared session across servers — each server-relationship is authenticated and revoked on its own.

### Audit and observability

Server-side rows for sessions and refresh tokens enable:

- A "your sessions" UI listing each active device with last-seen timestamp.
- Rate-limit and anomaly logging keyed on session row.
- Forensics after a suspected compromise.

JWTs would make all of this require additional infrastructure.

## Consequences

### Positive

- Revocation is immediate and complete. No "wait for the JWT to expire."
- "Active sessions" UI is trivial to build — the database already has the data.
- Compromised tokens can be invalidated without re-keying the user.
- Refresh-token rotation limits the blast radius of theft.

### Negative

- Every authenticated request requires a DB lookup. Mitigated by an in-process LRU cache keyed on token hash (TTL of a few minutes). Latency budget remains small.
- Two-token complexity (session + refresh) is more API surface than a single long-lived token. We accept it for the revocation property.
- HttpOnly cookies + SameSite=Strict require thinking about cross-origin flows (none planned for v1).

### Rejected alternatives

- **JWTs (signed self-contained tokens).** Rejected: revocation story is poor; introduces signing-key rotation complexity; the only win is "stateless servers," which Yawp does not need (anchors are stateful by design).
- **Long-lived session token, no refresh.** Rejected: increases the blast radius of theft. Refresh-token rotation is cheap.
- **`localStorage` on web.** Rejected: any script on the origin can read it (XSS exfiltration).
- **In-memory only sessions.** Rejected: would require challenge-response on every reload. Defeats the purpose of having a session.

## References

- [CONTEXT.md](../../CONTEXT.md) — session, refresh token
- [ADR 001 — Auth wire format](001-auth-wire-format.md)
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 009 — Federation routing](009-federation-routing.md)
