# Mook

A decentralized, end-to-end encrypted communication platform — Phoenix + Ash + React + React Native, identity via cryptographic key pairs, self-hostable on a VPS.

## Issue tracking

Issues live in PaiR (`.pair/pair.db`). See `.pair/AGENTS.md` for the workflow protocol — update issue status before/after work, write journal entries at decisions and progress points.

 (current) is structured as 6 slice epics, each with implementation tasks. `pair list -t epic` to see them; `pair children <epic-id>` to drill in.

## Domain knowledge

Reference documents live in `docs/`:

- [`docs/tech-stack.md`](docs/tech-stack.md) — Authoritative tech stack: Elixir/Phoenix/Ash backend, React + React Native clients, ex_webrtc for voice, VPS self-hosting model, and open decisions (E2EE, federation, identity recovery).
- [`docs/cryptography-glossary.md`](docs/cryptography-glossary.md) — Plain-English glossary of every cryptographic and identity-related term used in Mook (DID, Ed25519, BIP-39, challenge-response, etc.). Read this before designing or changing anything in the identity, auth, or E2EE layers.

When the user discusses crypto/identity concepts, the glossary is the source of truth for terminology.
