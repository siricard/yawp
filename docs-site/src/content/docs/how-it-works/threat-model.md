---
title: Threat model — what your operator can see
description: A plain-English account of what a server operator can and cannot see in Yawp, today and after E2EE rooms ship.
sidebar:
  order: 2
  label: Threat model
---

The honest version of "is it private?" depends on *who* you're worried about.
This page lays out what each party can see. It will stay current as Yawp's
encryption story evolves.

## What no server can do

- **Forge messages as you.** Every message carries a signature from your device
  subkey. A malicious server can drop or delay a message, but it cannot put
  words in your mouth.
- **Read your private blob.** Room memberships, contacts, mute lists, and
  settings are encrypted client-side. Your anchors store the ciphertext and
  cannot decrypt it.
- **Take your identity.** Your DID is yours; a server can ban you, but it can't
  *become* you.

## What the host of a plaintext room can see

Today (pre-M10), rooms are **plaintext**: stored unencrypted on the host
server. The operator of that server can read everything in those rooms. TLS
protects messages in transit and signatures prevent forgery — but **not**
reading. This is a deliberate trade-off for features like server-side search
and history export.

## What changes with E2EE rooms (M10+)

E2EE rooms encrypt messages to each member's device. The host stores ciphertext
only and **cannot read content**. After M10, new rooms are E2EE by default;
creating a plaintext room becomes an explicit "danger zone" action with a
warning that the operator will be able to read everything.

## What your anchor necessarily learns

Even with E2EE, your anchor server fires your mobile push notifications, so it
learns *when* a push happens (not *what* it contains). This is an acknowledged
privacy trade-off of the push fan-in design.

:::tip[Go deeper]
- Encryption phases and the plaintext→E2EE boundary:
  [ADR 016](/reference/adr/016-room-encryption-phases/)
- Push routing and what anchors learn:
  [ADR 021](/reference/adr/021-notifications-fan-in/)
- Abuse defenses (delivery budgets, operator blocks):
  [ADR 010](/reference/adr/010-abuse-model/)
:::
