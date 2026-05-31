# ADR 023 — Search and local message store

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Once rooms exist, users want to search them. v1 ships plaintext rooms (ADR 016), so server-side full-text search is feasible and the obvious right answer. M10+ ships E2EE rooms and (eventually) E2EE DMs, where the server cannot read message content and therefore cannot index it; search has to happen on the client. That, in turn, forces a persistent on-device store of decrypted content to be a first-class concept, not an implementation detail any individual client gets to make up.

This ADR commits to the v1 server-side search implementation, the M10+ client-side search story, and the local message store that backs it.

## Decision

### Server-side search (v1)

**Server-side search** (CONTEXT.md) for plaintext rooms uses Postgres `tsvector` columns with GIN indexes. This is the obvious default for an Elixir/Phoenix/Postgres stack at friend-group-to-community scale; it requires no additional infrastructure and is well-understood operationally.

Indexed in v1:

- Message body.
- Author DID.
- Channel ID.
- Timestamp.
- Mentions (`@user`, `@role`, `@here`, `@everyone` — the structured array per CONTEXT.md "Mention", not just the rendered text).

Not indexed in v1:

- **Attachment file contents.** No OCR on images, no PDF text extraction. The metadata (filename, MIME, size) can be filtered, but the *contents* of attached files are out of scope.
- **Reactions.** A reaction is not a message; we do not surface "find messages people reacted to with 🎉" in v1.
- **Edit history.** Search hits return the **latest version** of a message only. Earlier versions of edited messages are retained per ADR 019 but are not search targets.

### Search is permission-filtered

Every query is scoped to channels where the searching user has `read_messages` permission, accounting for **history-on-join** (ADR 019). A user cannot search a private channel they're not a member of, and cannot search messages from before their join time in channels where `read_history_before_join` is denied for them.

The permission check runs at query time, not at index time. The same row may be visible to one user and not another; the index doesn't try to encode visibility.

### Search scope: per-server

A search query targets **one server at a time** (or the user's anchor for DMs — see below). There is **no cross-server query federation in v1**. The user picks "search this server" or "search my DMs" in the UI.

Cross-server federated search would require per-anchor query proxying, normalized scoring across servers, deduplication of overlapping conversations, and a non-trivial threat model around what each server learns about the searcher's query terms. Deferred.

### DM search (v1)

DMs live at the recipient's anchor (ADR 006). DM search in v1 uses the **same Postgres `tsvector` approach** but is performed by the **anchor**, not by a host. Same indexed fields, same permission story (the searching user is the owner of their inbox; the anchor enforces that the query only sees DMs addressed to this user).

### E2EE rooms and DMs (M10+): client-side search

For E2EE rooms (ADR 016) and the eventual E2EE DMs, the server stores ciphertext only. **Server-side search is impossible.** All search of E2EE content must happen on the client, over decrypted message content held in the local store (below).

**Client-side search** (CONTEXT.md) is mandatory from M10 for any conversation the user has encrypted access to. Results are limited to messages the device has actually received and stored. The UX must surface this limitation clearly — for example:

> "Searching encrypted conversations only finds messages received on this device."

The client-side index implementation is not specified by this ADR (it's a per-platform choice — IndexedDB FTS shims, SQLite FTS5, Realm full-text — and can evolve without protocol impact). What is specified is that the **input** to the index is the local message store described next.

### Local message store

A **local message store** (CONTEXT.md) is a persistent on-device store holding decrypted messages and decrypted attachment metadata for every conversation the user is a member of — DMs and channels alike. Required from M10 to enable client-side search and offline reading of E2EE content.

- **Web clients:** **IndexedDB**.
- **Native clients (React Native iOS/Android, future desktop):** platform-native storage — **SQLite** or **Realm**.
- **Eviction policy:** **client decision**, no protocol commitment. Different platforms have different storage budgets; we don't pretend to know the right answer for every device. The store must, however, hold **at minimum the conversation tail** (recent messages for every conversation the user is in) and any **historical ranges the user has explicitly fetched** (e.g., scrolled back to load older messages). Beyond that minimum, clients may LRU-evict, time-bound, or size-bound as they see fit.
- **First-launch / recovery implication:** a fresh device recovering from mnemonic (ADR 007) starts with an empty local store. It fetches the conversation tail from each host and the user's DM tail from each anchor, populating the store before client-side search becomes useful. The UX **must signal this hydration phase** — a search box that quietly returns 0 hits because the store is empty would be a usability disaster.

Although the local store is **required** from M10, the concept is committed to here so v1 clients can begin building toward it. Pre-M10, v1 clients may already use a local store for offline reading and DM search — and the eviction-policy / platform-storage decisions are easier to commit to up front than retrofit.

### No third-party search engine in v1

No Meilisearch, no Typesense, no Elasticsearch, no OpenSearch. Postgres `tsvector` is **good enough for chat search at friend-group-to-community scale**, and adding any of those services adds a `docker-compose` row, a memory footprint, an indexing pipeline, and an operational burden for a feature the median operator does not need at the median scale.

The path to swap in a dedicated engine behind the same API contract is clean — the server-side search interface clients see (`/api/search?q=...&channel_id=...`) is independent of what powers it. This is a **later scaling decision**, not a v1 design constraint.

## Consequences

### Positive

- Server-side search ships with no new infrastructure: Postgres is already in the stack.
- Permission-filtered search has one and only one answer ("the same channels you can read"), unambiguous to specify and easy to test.
- DM search reuses the same `tsvector` machinery on a different host (the anchor) — no separate code path.
- The local-message-store decision is forward-compatible with E2EE: when M10 ships, the storage substrate already exists; only the writer (the decryption pipeline) is new.
- Operators of larger deployments have a documented path to swap in a dedicated search engine behind the same API.

### Negative

- Postgres `tsvector` performance degrades on very large tables; a community server with millions of messages will start to feel it. Mitigated by operator action (move to a real engine) when the time comes.
- Cross-server search being deferred means a user with rooms on five servers searches five times. UX has to make that bearable until federated search is built.
- E2EE search being device-local creates the permanent "this device hasn't seen those messages" failure mode. Acceptable for the E2EE threat model, but a real UX wrinkle.
- The local store grows with conversation volume; mobile clients will sometimes have to evict. Eviction policy being client-defined means inconsistent behavior across devices for the same user. Documented; the alternative (a protocol-prescribed eviction policy) is worse.

### Rejected alternatives

- **Meilisearch / Typesense / Elasticsearch in v1.** Adds a `docker-compose` service, a memory footprint, an indexing pipeline, and an operational burden for a feature Postgres handles fine at the target scale. Rejected.
- **ILIKE substring search.** Full table scan on every query, no relevance ranking, gets slow fast. Rejected.
- **Searchable encryption (homomorphic / encrypted indexes) for E2EE rooms.** Active research area, partial information leakage in every known scheme, far too complex for v1 and arguably ever. Rejected.
- **Cross-server federated search in v1.** Would require per-anchor query proxying, normalized cross-server scoring, deduplication of overlapping conversations, and a non-trivial threat model around query-term leakage. Deferred.
- **Indexing attachment file contents (OCR / PDF text extraction).** Real value, real cost — separate worker process, parser dependencies, MIME-handling matrix, occasional security surface. Deferred. Hooks may be added so operators can run their own pipeline.
- **Skipping the local-message-store concept in v1, deferring it to M10.** Even pre-M10 we want the door open for offline reading and client-side DM search, and the eviction-policy / platform-storage decisions are easier to commit to up front than retrofit when E2EE forces the issue. Rejected.

## References

- [CONTEXT.md](../../CONTEXT.md) — server-side search, client-side search, local message store
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 007 — Identity recovery](007-identity-recovery.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md)
- [ADR 016 — Room encryption phases](016-room-encryption-phases.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
- [ADR 022 — Attachments and storage backends](022-attachments-storage.md)
