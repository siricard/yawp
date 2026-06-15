---
title: Self-hosting Yawp
description: Deploy and operate your own Yawp server.
sidebar:
  order: 0
  label: Overview
---

Everything you need to run a Yawp server on your own infrastructure. If you're
new, start with the deploy tutorial, then come back for the task-specific
how-to guides.

## Get running

- **[Deploy Yawp in 20 minutes](/self-hosting/deploy/)** — the happy path from a
  fresh VPS to a claimed, running server.
- **Requirements & sizing** — VPS specs, RAM/CPU for voice, bandwidth.
- **First-boot & claiming your server** — the admin panel and the chat-owner
  claim flow.
- **Configuration reference** — environment variables and per-server defaults.

## How-to guides

- Set up federation (server keypair, `.well-known`)
- Configure voice: coturn / TURN credentials
- Choose an attachment backend (local / S3 / R2 / MinIO / B2)
- Set retention & body-archive policy
- Run as an anchor / add a second anchor
- Back up & restore
- Upgrade Yawp safely
- Migrate a room to another server
- Operator moderation: blocks, bans, delivery budgets

## When something breaks

- **Troubleshooting** — voice/NAT, federation handshake, push delivery.

:::caution[Work in progress]
The docs site has just been scaffolded. Pages above without links are tracked
as issues and not yet written.
:::
