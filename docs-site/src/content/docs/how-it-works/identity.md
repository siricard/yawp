---
title: Identity — you own your account
description: How Yawp identity works — DIDs derived from key pairs, portable across servers, owned by no one but you.
sidebar:
  order: 1
  label: Identity
---

In most chat apps your account belongs to a company: it's a row in their
database, and they can lock you out of it. In Yawp, **your account is a
cryptographic key pair that you hold**. No server can create it, take it, or
issue it to someone else.

## Your identity is a DID

When you first launch Yawp, your device generates an **Ed25519 key pair**. Your
public identifier — your **DID** — is derived from the public half:

```
did:yawp:<base58(sha256(public_key))>
```

Because it's derived from *your* key, the DID is **portable**: you are the same
user on every server you touch. Servers don't own it; they just recognize it.

## What servers see

A server only ever holds two public-facing things about you:

- Your **DID** and public key.
- Your **PPE** (Public Profile Envelope) — a *signed* bundle with your display
  name, avatar, and the list of servers that anchor you. Because it's signed by
  your master key, any server that tampers with it gets caught.

Your private data (room memberships, contacts, settings) lives in an
**encrypted private blob** that only your own devices can read — even the
servers storing it cannot.

## Display names aren't identity

Your display name is cosmetic and not unique. If you skip naming yourself, the
client picks a friendly default like `silver-fox-42`. The DID is the only thing
that identifies you — two people can share a display name, never a DID.

:::tip[Go deeper]
The full identity model, including key derivation and the rationale for a
self-sovereign DID, is specified in
[ADR 005: Identity model](/reference/adr/005-identity-model/). Recovery and key
rotation are covered in
[ADR 007](/reference/adr/007-identity-recovery/) and
[ADR 013](/reference/adr/013-key-rotation/). Cryptographic primitives
(Ed25519, BIP-39, HKDF) are defined in the [glossary](/reference/glossary/).
:::
