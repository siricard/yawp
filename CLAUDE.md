# Yawp

A decentralized, end-to-end encrypted communication platform — Phoenix + Ash + React + React Native, identity via cryptographic key pairs, self-hostable on a VPS.

## Dev environment

This project uses a Nix flake. Run shell commands inside the dev shell via `nix develop -c <cmd>` (or bare `nix develop`) from the repository root.

**Never create giant Nix store snapshots.** Only invoke the dev shell as `nix develop -c <cmd>` (or bare `nix develop`) from the repository root — a real git checkout where `.git` is a directory. NEVER use `nix develop path:.`, `nix build path:.`, `nix print-dev-env path:.`, and never run Nix inside a copied, rsync'd, or tarball-extracted tree that lacks `.git`. A git-aware `nix develop` copies only tracked files (tens of MB) and strips `.git`; a non-git-aware eval copies the *entire* working tree — including the gitignored `node_modules` (~4.5 GB) and `_build` — into `/nix/store` as an `-source` path that is never cleaned up. Each one is ~11 GB. Tell-tale of a bad copy: the store `-source` path contains a `.git` directory.

## Issue tracking

Issues live in Linear. Use the MCP server for that. Droid (factory.ai) missions contribute to this project too (https://factory.ai/news/missions), and keep Linear up to date with its own internal tracking tool.

## Domain knowledge

Reference documents live in `docs/`:

- [`docs/adr`](docs/adr) — Architectural decisions (E2EE, federation, identity recovery, etc).
- [`CONTEXT.md`](CONTEXT.md) — Plain-English glossary of every cryptographic and identity-related term used in Yawp (DID, Ed25519, BIP-39, challenge-response, etc.). Read this before designing or changing anything in the identity, auth, or E2EE layers.

When the user discusses crypto/identity concepts, the CONTEXT.md is the source of truth for terminology.
