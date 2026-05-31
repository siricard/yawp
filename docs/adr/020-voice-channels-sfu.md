# ADR 020 — Voice channels: SFU, signaling, and TURN

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-19

## Context

ADR 004 settled on STUN-only WebRTC for the M5 1:1 voice MVP. Group voice changes the calculus on three fronts:

1. **Topology.** A peer-mesh that worked for 2 participants does not work for 10 — upstream bandwidth scales linearly with peers, mobile uplinks fall over fast, and the matrix of N²−N PeerConnections becomes ugly to manage.
2. **NAT traversal.** A persistent multi-user voice room has to work for everyone every time. STUN-only is unreliable on symmetric NAT (CGNAT on cellular, corporate firewalls, double-NAT home setups) — and a friend-group voice room is exactly the kind of thing people will use from a phone on a train.
3. **Hosting fit.** Voice belongs at the room's host server (ADR 014), but voice infrastructure (TURN, SFU) has different runtime characteristics than a Phoenix HTTP app — packet-rate I/O, kernel-bypass, and so on.

This ADR pins down the topology, signaling, and infra commitments for voice channels in v1. The cryptographic detail of voice E2EE (DTLS-SRTP keys, MLS for group keying, etc.) is out of scope here — v1 voice rooms inherit the plaintext-on-host posture of v1 text rooms (ADR 016).

## Decision

### SFU from v1, no mesh fallback

Voice channels use a **Selective Forwarding Unit** (CONTEXT.md) from v1 onward. Each participant sends **one upstream RTP stream** to the host server's SFU; the SFU forwards each participant's stream to each other participant individually.

- Built on `ex_webrtc`. The SFU runs **in-process under OTP supervision** inside the same Phoenix app that hosts the room. No separate media daemon.
- One SFU process per voice channel, supervised by a `DynamicSupervisor` rooted at the channel's room.
- **No peer-mesh fallback.** Even for 2-participant calls, the SFU is used. The behavioral consistency (always-SFU) is worth more than the small saving on the smallest call size.

The SFU is positioned at the room's host (ADR 014). A participant on a different anchor connects to the host directly (already auto-guested for the room — ADR 015) and exchanges media with the host's SFU. Voice does not federate hop-by-hop.

### Signaling: Phoenix Channels, client-to-host

Voice signaling (SDP offer/answer, ICE candidate exchange, peer connection setup) runs over Phoenix Channels between the participant's client and the **host server only**.

- Federation is uninvolved. The host is the single signaling endpoint for every participant in the channel, including participants whose anchor is elsewhere.
- This works because participants on remote anchors are already auto-guested on the host (ADR 015) and therefore already have an authenticated session there (ADR 012).
- The signaling topology mirrors the SFU topology: every participant talks to the host, nobody talks to anyone else directly through Yawp.

### Phoenix Presence for voice state

Per-participant voice state lives in **Phoenix Presence**, scoped to the voice channel:

- `joined` — the participant is in the channel.
- `muted` — outgoing audio is suppressed at the client.
- `deafened` — outgoing is muted and incoming is dropped.
- `speaking` — a throttled boolean derived from audio-energy detection at the client (or the SFU; client-side is preferred to save server work). Throttled to roughly the human-perceptible visual update rate to avoid presence storms.

State changes are **not persisted** as timeline events. A voice room's permanent state is its row, settings, roles, and overrides — the moment-to-moment voice activity is presence-derived and ephemeral.

### TURN is required infrastructure

Symmetric NAT (CGNAT on cellular, corporate firewalls, double-NAT home setups) makes STUN-only unreliable for a non-trivial fraction of users. ADR 004 accepted that trade-off for the M5 1:1 MVP; persistent voice rooms cannot.

**`coturn` is bundled** in the default docker-compose as a **sidecar service**. Self-hosting operators may disable it; doing so is an explicit choice to accept that voice will fail for cellular users behind symmetric NAT. The decision is documented in the self-hosting README so operators see it before they make it.

### TURN runs as a sidecar, not as a NIF

`coturn` is a battle-tested C daemon optimized for high packet-rate I/O. Wrapping it as a NIF inside the BEAM would:

- Put blocking packet I/O inside the BEAM scheduler, hurting latency for the rest of the app.
- Propagate `coturn` crashes into the Phoenix supervision tree, breaking the safety isolation a sidecar gives.
- Forfeit OS-level supervision (systemd, docker restart policies).

Running `coturn` as a separate process under docker-compose (or systemd, for non-docker deployments) gives us OS-level supervision, kernel-tested I/O, and a clean process boundary. The trade-off (one more service to operate) is small for the operational win.

### TURN REST credentials

Voice clients need TURN credentials to authenticate against `coturn`. We use the standard **TURN REST API** credential pattern (CONTEXT.md):

- Yawp and `coturn` share an HMAC secret pre-configured into both services at deploy time.
- When a client begins a voice session, Yawp computes a short-lived ephemeral `(username, password)` pair from `(expiry_timestamp, shared_secret)` using HMAC-SHA1 (the format `coturn` expects).
- `coturn` validates the credential locally with the shared secret — **no per-session callback to Yawp**.
- The TTL on the credential is short (a few hours) so a leaked credential is bounded.

The **data plane never crosses Yawp**. Clients send media directly to `coturn`, which relays directly to other clients (or to the SFU). Yawp signs the credentials and stays out of the audio path.

### Participant cap

A voice channel has a default participant cap of **25** in v1 (CONTEXT.md). The cap is **configurable per server** by the self-hosting operator — operators with beefy hardware can raise it; operators on shared hosting may lower it.

A join attempt that would exceed the cap is refused with a `channel full` response. The client surfaces the error and may retry later.

The 25 default balances "enough for friend groups and small communities" against the SFU's per-room CPU/bandwidth budget on a modest VPS.

### PTT vs open mic is per-user

Whether a participant is push-to-talk or open-mic is a **per-user client setting**, not a channel-level setting. The wire format is unaffected — outgoing audio frames look the same either way; the client is just gating *when* it sends them.

A future feature ("this channel requires PTT") would be a channel setting overlay enforced at the client and (optionally) audited at the SFU. Out of scope for v1.

### Voice channel persistence

Voice channels are **persistent rooms** in every sense ADRs 014–019 describe:

- The channel row, its settings, its category placement, its role overrides — all persist.
- The voice-state-change events (joins, mutes, speaks) are presence-derived and **not persisted**.
- Disconnecting from a voice channel does not destroy it. The room continues to exist; the participant simply leaves the presence set.

Recording and transcription are explicitly **out of scope for v1**. Recording in particular needs an all-participant consent UX (and likely jurisdiction-aware behavior) that we do not want to design at the same time as the v1 voice MVP. Deferred to a future ADR.

## Consequences

### Positive

- One topology (SFU) for all voice rooms regardless of participant count. No special-case mesh path to maintain.
- TURN works for cellular and locked-down networks out of the box on the default docker-compose deployment.
- `ex_webrtc` keeps the SFU implementation in Elixir, supervised by OTP, in the same process as the rest of the host. Operationally simple.
- Phoenix Presence is the right primitive for ephemeral voice state and is already part of the stack.
- TURN REST credentials decouple `coturn` from Yawp at runtime — `coturn` can scale and crash independently.

### Negative

- The SFU's per-room CPU cost scales with `O(participants²)` in forwarding work, not `O(participants)`. The 25-cap is a hedge against a single beefy server being asked to host too-big rooms. Operators of large communities may hit the wall faster than they expect.
- `coturn` is an additional service to operate. Self-hosters who skip the sidecar in their docker-compose will get a voice experience that breaks for cellular users — and the breakage will look like "voice doesn't work" rather than "TURN is missing." Self-hosting documentation must call this out.
- Voice in v1 is plaintext-on-host (per ADR 016's phasing). Media frames hit the host's SFU in the clear. A future ADR will specify E2EE voice; until then, the same "trust the operator or self-host" framing applies.

### Rejected alternatives

- **Peer-mesh in v1.** Rejected: scales poorly past ~6 participants. Each client uploads N−1 copies of its audio, killing mobile uplinks.
- **MCU (server-side mixing — one downmixed stream per participant).** Rejected: massive CPU cost on the host, and forfeits the SFU property that each participant can independently mute or render any other participant.
- **STUN-only, no TURN.** Rejected: leaves a real fraction of users (especially cellular) with broken voice. Acceptable for ADR 004's 1:1 MVP, not acceptable for persistent voice rooms.
- **TURN as a NIF inside the BEAM.** Rejected: scheduler hazard, crash propagation, and forfeit of OS-level supervision.
- **In-tree TURN (write our own).** Rejected: `coturn` is a commodity, well-tested implementation with no Yawp-specific interop benefit. Writing a new one would be months of work for no product win.
- **Recording in v1.** Rejected: the consent UX is non-trivial and jurisdiction-aware. Deferred to a dedicated ADR when the product is ready.

## References

- [CONTEXT.md](../../CONTEXT.md) — channel type, SFU, TURN relay, TURN REST credentials, voice channel participant cap
- [ADR 004 — STUN-only TURN deferred](004-stun-only-turn-deferred.md)
- [ADR 012 — Session tokens](012-session-tokens.md)
- [ADR 014 — Room hosting model and migration](014-room-hosting-and-migration.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md)
- [ADR 016 — Room encryption phases](016-room-encryption-phases.md)
- [ADR 017 — Server authority and RBAC scoping](017-server-authority-rbac.md)
- [ADR 018 — Channels, categories, and channel types](018-channels-categories.md)
