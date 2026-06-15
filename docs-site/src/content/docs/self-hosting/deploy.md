---
title: Deploy Yawp in 20 minutes
description: The happy path from a fresh VPS to a running, claimed Yawp server.
sidebar:
  order: 1
  label: Deploy (tutorial)
---

:::caution[Stub]
This is a seed page created during scaffolding. The full step-by-step tutorial
is tracked as an issue. The outline below is the intended shape.
:::

By the end of this tutorial you'll have a Yawp server running under
docker-compose, reachable over HTTPS, with you as its chat owner.

## What you'll need

- A VPS (see Requirements & sizing)
- A domain name pointed at the VPS
- Docker and docker-compose

## Steps

1. **Get the compose stack** — clone / download the release bundle.
2. **Configure** — set the minimum env vars (hostname, secrets, TLS).
3. **First boot** — bring the stack up; the server seeds its federation
   keypair, system roles, and default channels.
4. **Find the admin URL** — printed in the startup logs.
5. **Set up the admin account** — traditional credentials, not a DID.
6. **Generate a claim token** — from the admin panel.
7. **Claim the server** — open the Yawp client, add the server, paste the
   claim token to bind your DID as `Owner`.
8. **Say hello** — post in `#general`.

## Next steps

- [Configure federation](/self-hosting/) so your users can talk to other servers.
- Set up voice (coturn/TURN).
- Plan your backups.
