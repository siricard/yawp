---
title: How Yawp works
description: Plain-English explanations of Yawp's identity, federation, and encryption model — layered, with links into the architecture decisions.
sidebar:
  order: 0
  label: Overview
---

This section explains *how* Yawp works and *why* it's built that way. Each page
opens in plain English — enough to decide whether you trust the system — and
ends with a **Go deeper** link into the [Architecture Decision Record](/reference/adr/)
that governs it.

## The model, in four ideas

- **You own your identity.** Your account is a cryptographic key pair, not a row
  in a server's database. Your identifier (a DID) is portable across every
  server. → [Identity](/how-it-works/identity/)
- **Servers hold relationships, not identities.** *Anchors* hold your canonical
  data; *guest* servers just cache enough to render you. → Anchors & guests
- **Servers federate.** Anchors talk to each other over a signed HTTPS protocol
  to route your messages. → Federation
- **What the operator can see is explicit.** Today's rooms are plaintext to
  their host; E2EE rooms (M10+) are not. → [Threat model](/how-it-works/threat-model/)

## Pages

- [Identity — DIDs and why you own your account](/how-it-works/identity/)
- Keys, mnemonics & recovery
- Devices & pairing
- Anchors & guests
- Federation
- DMs & routing
- Rooms, channels & roles
- Delivery, receipts & presence
- Encryption: what's encrypted today vs. M10+
- [Threat model — what your operator can and can't see](/how-it-works/threat-model/)
- Verifying peers (fingerprints, TOFU, key changes)
- Abuse & moderation
- Bots & automation *(post-v1)*
