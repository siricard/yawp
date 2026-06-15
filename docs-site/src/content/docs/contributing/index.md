---
title: Contributing
description: Architecture overview, local development setup, and how Yawp records decisions.
sidebar:
  order: 0
  label: Overview
---

Yawp is **Phoenix + Ash + React + React Native**, structured as an Elixir
umbrella app. This section helps you find your way around and get a dev
environment running.

## Pages

- **Architecture overview** — the umbrella layout and how the pieces fit.
- **Local dev setup** — dependencies, environment, and running the app.
- **Testing conventions** — we focus tests on business logic; run them with
  `MIX_ENV=test mix test`.
- **How we use ADRs** — every significant decision is recorded under
  [`docs/adr/`](/reference/adr/) before it's built.
- **Codebase tour** — the `apps/yawp` structure and the federation / identity
  modules.

:::caution[Work in progress]
Seed page from scaffolding. The pages above are tracked as issues.
:::
