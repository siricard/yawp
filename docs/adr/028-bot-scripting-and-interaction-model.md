# ADR 028 — Bot scripting and interaction model

**Status:** Proposed (post-v1 / premium feature design)

**Date:** 2026-05-31

## Context

Communities want automation: slash-commands, interactive widgets, scheduled posts, integrations. The well-trodden model (Discord) is an *ambient listener*: a bot joins a room and receives every message, then reacts. That model is a poor fit for Yawp for two reasons.

1. **Encryption.** Yawp rooms move toward E2EE (ADR 016). A server-side ambient listener cannot read ciphertext, and a bot that *could* read every message would be the single most privacy-corrosive actor in the system — the exact thing Yawp's positioning exists to avoid.
2. **Authority and safety.** A bot is untrusted, user-authored code. It must run under the same authorization as a human (ADR 017) and must not be able to escalate privileges, exhaust the host, or escape its sandbox.

This ADR pins down what a bot *is*, what it can see, how it runs, and the safety boundary — so the runtime, the RBAC surface, and the encryption model stay consistent.

## Decision

### Bots are identity-scoped

A bot is a first-class **identity** — its own DID and keypair (ADR 005), like any other participant. It is not a privileged side-channel of the server. A bot's authority in a room derives entirely from its server role assignment and per-channel overrides (ADR 017); a bot gets a constrained role with an explicit permission bit-set, no more.

### Default: interaction-scoped, never a room reader

By default a bot **cannot read room content** — neither past messages nor the live message stream. A bot's entire input surface is the set of interactions explicitly directed at it:

- **Commands** — a user explicitly invokes a command the bot has declared (e.g. `/weather Toronto`). The arguments are consensual input handed to the bot, not eavesdropping on the room.
- **Widget interactions** — the bot renders interactive components (buttons, forms, embeds); a user interacting returns a structured payload to the bot.

The bot **posts** responses into the room through its normal send permission. It receives nothing else.

This composes cleanly with E2EE: an interaction payload is encrypted **to the bot's identity** and routed to the bot, separate from the room's E2EE envelope. Because the bot only ever receives what is deliberately addressed to it, **interaction bots work in every room, encrypted or not**, and the property "bots cannot read your conversations" holds by construction.

### Opt-in: content-reading bots as keyed participants

A bot **may** be granted the ability to read room content, but only by **explicit, non-default setup**: the bot is added as a keyed participant and issued the room's encryption key like any other member. This makes the bot a true reader of that room's content.

- This is **never the default** and must be surfaced explicitly to the room's members/owner, because it materially changes the room's privacy properties.
- It is the only path to ambient/listener behaviour (auto-moderation that scans messages, live conversation translation, full logging). Such bots exist only where someone has deliberately keyed them in.
- A room owner may forbid keyed bots entirely as a room policy.

The rule, stated once: **interaction bots anywhere; content-reading bots only as explicitly-keyed participants, never by default.**

### Runtime: governed Lua on the BEAM

Bot logic runs as **Lua scripts**, embedded via the `lua` library (a pure-Elixir Lua 5.3 VM on the BEAM, no C/Erlang deps) with `ash_lua` bridging scripts to Ash actions.

- **Authorization is free and transparent.** `ash_lua` threads actor, tenant, and context through every call, and these are host-supplied and **immutable from Lua** — a script cannot inspect or change who it runs as, cannot escalate, cannot switch tenant. A bot's Ash policies (ADR 017) are the authorization boundary; the script calls `domain.resource.action(...)` and the policy engine governs it exactly as it governs a human.
- **Stdlib sandbox.** The VM sandboxes dangerous functions by default (`os.execute`, `os.exit`, `io.*`, `require`, `dofile`, `load*`, `package`). Scripts reach the outside world only through host functions we expose deliberately (`deflua` / `Lua.set!`).
- **Resource governor (host-built).** The Lua library provides no instruction/time/memory limits, so the host enforces them via BEAM process isolation: each invocation runs in its own process under a `DynamicSupervisor`, with a wall-clock timeout (kill runaway loops), heap-size monitoring (kill memory hogs), and per-bot invocation rate limits. This mirrors the supervision pattern already used for voice (one SFU process per channel under a `DynamicSupervisor`, ADR 020).

Because work happens only on explicit triggers (commands, widget interactions) rather than on a continuous message feed, the per-bot resource surface is small and well-defined, and metering invocations is straightforward.

### Hosting boundary

The scripting engine (the Lua VM, `ash_lua`, the command/widget contract) ships as part of the open server — a self-hoster runs bots on their own box. Operating bots **safely and always-on at scale** — the governed runtime, resource limits, isolation, and metering described above — is an operational service that runs on infrastructure the operator provides; this is the basis for offering managed bot hosting as a paid service. (Monetization specifics are out of scope for this ADR.)

## Consequences

- Bots are E2EE-compatible by default and privacy-marketable ("bots can't read your conversations").
- Ambient automation (auto-mod, translation, logging) is possible only via the explicit keyed-participant path, and a room can forbid it.
- The bot security model reuses existing primitives: identity (ADR 005), RBAC (ADR 017), and the supervised-process pattern (ADR 020). No new authorization model is introduced.
- A future "client-side bot" model would be required for automation that must read E2EE content without a server-side key grant; this ADR does not design that.
