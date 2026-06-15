---
title: Reference
description: Glossary, wire formats, federation API, configuration, and the full set of ADRs.
sidebar:
  order: 0
  label: Overview
---

Lookup material. Unlike the explanatory pages, these are terse and exhaustive.

- **[Glossary](/reference/glossary/)** — canonical product & federation
  vocabulary (generated from `CONTEXT.md`).
- **Cryptography glossary** *(planned)* — DID, Ed25519, BIP-39, HKDF, and
  friends. Will be generated from `docs/cryptography-glossary.md` once that
  file exists; until then the crypto terms live in the main glossary.
- **Federation API** — anchor-to-anchor HTTPS endpoints and signed payloads.
- **Wire formats** — PPE, DM envelope, delivery wrapper.
- **Configuration** — full environment-variable and per-server-default table.
- **Permission bits & roles** — the RBAC matrix.
- **[ADR index](/reference/adr/)** — all architecture decision records,
  generated from `docs/adr/`.

:::note[Generated pages]
The glossary and ADR pages are rendered from the code repo at build time — edit
the source files under `docs/`, not the generated pages here.
:::
