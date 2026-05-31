# ADR 022 — Attachments and storage backends

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

Rooms need files: images pasted into chat, PDFs, screenshots, voice memos. M7 has to commit to a storage model that works for the friend-group-on-a-VPS default *and* for operators running larger deployments with a real object store, without forcing different wire formats on the client. The model also has to be forward-compatible with M10+ encrypted attachments — the client should not have to learn two upload flows.

This ADR picks the storage backends, the size and policy defaults, the content-addressing scheme, and the path to E2EE attachments.

## Decision

### Two pluggable storage backends in v1

Operators choose one of two **attachment backends** (CONTEXT.md) per server, set in server configuration:

- **`local`** — the host server's own disk. Default. The right answer for a friend-group VPS where attachment volume is small and an external object store would be a needless dependency.
- **`s3`** — any S3-compatible object store. AWS S3, Cloudflare R2, MinIO, Backblaze B2, etc. The right answer for any deployment outgrowing the local disk or wanting cross-region durability.

Clients see an **identical wire format** regardless of backend. The host returns a signed time-limited URL pointing to wherever the bytes actually live; the client does not know or care whether the URL goes to the host or to an S3 bucket. Swapping backends is an operator concern, not a protocol change.

### Wire format

Upload:

1. Client `POST /api/uploads` with the file bytes (and content metadata).
2. Host returns `{upload_id, content_url, content_hash, mime, size}`.
3. Client constructs the message envelope with the `upload_id` and `content_hash` (and `mime`, `size`) embedded in the attachment field, signs it, and submits the message normally.

Download:

1. Client requests the attachment via the host (using `upload_id`).
2. Host returns a **signed time-limited URL** — either to the host's own download endpoint (local backend) or to a presigned S3 GET URL (s3 backend).
3. Client fetches bytes from the URL, verifies `content_hash` matches.

The `upload_id` is the host-side identifier; the `content_hash` is the integrity anchor (see below). Both are needed in the message envelope.

### Content addressing

Every file receives a SHA-256 **content hash**. The hash is **included in the message envelope** alongside the `upload_id`, so the **sender's message signature covers the content of the attachment**, not just the URL.

Consequences:

- The host cannot silently substitute an uploaded file. If the bytes at the URL produce a different hash, the recipient client treats the attachment as tampered and refuses to render it.
- If the same bytes are uploaded twice, they collide on hash. v1 does not exploit this for deduplication, but the option is open.
- The hash is computed client-side at upload (and recomputed at download as the verification step). Operators with a `local` backend can detect bit-rot on the disk by re-hashing.

### Size policy

Defaults:

- **25 MB per file.**
- **10 attachments per message.**
- **No MIME allowlist** in v1.
- **No virus scanning** in v1.

All four are **operator-configurable per server**. Both numbers can be lowered (small VPS) or raised (operator with a real object store and larger disks). MIME allowlists and virus scanning are intentionally not built into the upload pipeline — operators who need them are best served by wiring an external scanner or a reverse-proxy filter, both of which are well-understood operational pieces and don't need protocol-level integration.

Exceeding the size cap returns a clear `413`-style response with the configured limit in the response so the client can render an accurate error.

### M10+: encrypted attachments

The same wire format extends forward to **encrypted attachments** (CONTEXT.md):

- The client encrypts the file with a per-file random symmetric key before uploading.
- The host stores **ciphertext only** — it cannot read the bytes.
- The symmetric key plus the `content_hash` (of the **plaintext**) travels inside the **encrypted message envelope**, which is decrypted by each recipient device.
- Each recipient device downloads the ciphertext, decrypts using the key from the envelope, and verifies the plaintext hash.

What changes between v1 and M10+ is the **bytes** (encrypted vs plaintext) and the message envelope (encrypted vs plaintext). What stays the same is the upload endpoint, the download URL flow, the content-hash discipline, the size caps, and the operator's choice of backend. This forward-compatibility is the explicit motivation for putting `content_hash` in the message envelope from day one even when bodies are plaintext.

A future ADR pins the cryptographic details of encrypted attachments (key derivation, AEAD choice, integrity binding) alongside the rest of the E2EE room design.

## Consequences

### Positive

- A friend-group operator can run with zero external dependencies: a single VPS, the local backend, no S3 account, no IAM keys, no monthly bill for a feature they barely use.
- A larger operator can switch one config line to put attachments on R2 / S3 / B2 / MinIO without changing clients.
- The content-hash discipline is forward-compatible to E2EE attachments and gives v1 plaintext rooms a tamper-evidence property they would not otherwise have.
- Operator-tunable size limits mean we don't have to guess "the right cap" — a 4-person VPS picks a tight cap, a 200-person community picks a looser one.
- No MIME allowlist and no virus scanning in v1 keeps the upload pipeline small. Operators with stricter needs have well-understood off-the-shelf options (proxy filters, scanner services).

### Negative

- The `local` backend on a single VPS is one disk failure away from losing all attachments. Operators should plan for backups; we document this rather than mandate cross-store replication.
- The default 25 MB / 10-attachments limit will be wrong for someone. Operators have to remember to tune it.
- No MIME allowlist means a malicious uploader can stash arbitrary bytes inside a `text/plain` declared file. Mitigated by client-side rendering being content-sniffing-aware and by operators who care running a proxy scanner. Documented.
- Encrypted attachments still leak file **size** and upload **timing** to the host. This is the same metadata-leak shape as encrypted messages in general; flagged here for clarity.

### Rejected alternatives

- **S3-only (no local backend).** A friend-group VPS would need an external bucket from day one — extra ops cost, IAM keys, a monthly bill for what is often a few hundred MB of attachments. Rejected.
- **Local-only (no S3 backend).** Larger or growing deployments need a real object store, and pluggability is cheap to wire in once. Rejected.
- **Built-in virus scanning in v1.** Operationally heavy (separate scanner service or in-process engine, signature updates, slow upload path) for what is available out-of-band to operators who need it. Rejected; revisit if abuse signals demand it.
- **Per-server MIME allowlist in v1.** Little defensive value (operators can already block at the proxy), real UX cost (legitimate file types refused), worth deferring. Rejected.
- **Putting the `content_hash` only in the host's database, not in the signed message envelope.** Would let a malicious host substitute bytes without breaking signatures. Rejected — the whole tamper-evidence property depends on the hash being signed.
- **Building dedup / single-instance-storage across users in v1.** Worth doing later; cross-user dedup interacts awkwardly with future E2EE-where-keys-differ-per-recipient. Deferred.

## References

- [CONTEXT.md](../../CONTEXT.md) — attachment, attachment backend, encrypted attachment
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 016 — Room encryption phases](016-room-encryption-phases.md)
- [ADR 019 — Message lifecycle](019-message-lifecycle.md)
