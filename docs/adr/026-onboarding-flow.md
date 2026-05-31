# ADR 026 — New-user onboarding flow

**Status:** Accepted (Phase 1 design)

**Date:** 2026-05-21

## Context

ADR 011 pinned the invite-link model: every signup goes through an anchor-issued invite. ADR 007 pinned mnemonic-based recovery: the user holds a 12-word phrase from which their keypair and bundle-encryption key are derived. ADR 005 pinned identity as a client-side keypair. What remains unspecified is the **order**, the **screens**, and the **interrupts** a new user actually experiences between clicking an invite link and landing in their first chat — and which of those interrupts are mandatory versus skippable.

This is where the protocol meets the human. A user who clicks the link wants to be in the chat in a minute or two. A user who loses their mnemonic on day 30 because we let them skip past it on day 0 has lost their identity. Onboarding has to balance "get to the chat" with "this is your only safety net" without resorting to either yet-another-modal-stack or a glib it'll-be-fine quickness that buries a critical-path decision.

This ADR pins the eight-step linear flow described in CONTEXT.md (Onboarding & recovery → Invite redemption flow), specifies which steps are gated and which are skippable, fixes the mnemonic-gate wording requirement, and commits to a single delayed prompt (the second-anchor nudge) instead of a string of trailing modals.

## Decision

### The eight-step linear flow

The **invite redemption flow** (CONTEXT.md) is a strict, linear, eight-step sequence. Steps run in order; each step blocks the next until its exit condition is satisfied. There are no branches except the one explicit fork at step 3 (create vs recover).

1. **Deep-link handler receives the invite.** The client (web or native) opens via `yawp://<anchor-host>/invite?token=<...>` or its `https://` equivalent (web fallback that re-launches the installed client or the web app). The invite token is parsed and held; nothing else is shown to the user yet.

2. **Check for existing DID on the device.** The client looks for an identity in local secure storage (Keychain / Keystore / IndexedDB per ADR 005). If one exists, the flow jumps to step 5 and uses the existing DID. If none exists, the flow proceeds to step 3.

3. **Offer "Create new identity" or "Recover existing identity."** The user picks one. The two paths diverge briefly, then re-converge at step 5:
   - **Create:** the client generates a fresh Ed25519 keypair and a BIP-39 12-word mnemonic (ADR 007). The keypair is persisted to secure storage; the mnemonic is held in memory until step 4 displays it.
   - **Recover:** the user enters their 12 words. The client derives the keypair and the bundle-encryption key per ADR 007, fetches the user's bundle from one of the anchors listed in their recovered state, and rebuilds the local state. ADR 007 owns the deep mechanics; this step's UX is "enter words → wait → done." The flow then skips step 4 (no mnemonic to show; the user already has it) and jumps to step 5.

4. **Mnemonic gate (create path only).** This screen is mandatory and non-skippable. See "The mnemonic gate" below.

5. **Redeem the invite.** The client posts the signed claim per ADR 011:
   ```
   {
     invite_token:     <opaque token>,
     did:              "did:yawp:...",
     pk:               <base64(public_key)>,
     sender_signature: <ed25519 sig by master key over canonical-JSON of the above>
   }
   ```
   The anchor (for anchor invites) or host server (for room invites per ADR 015) verifies, creates the user record if it doesn't exist, and responds with the user's first session token + refresh token (ADR 012). For an **anchor invite** the response also seeds an empty PPE (the user has no display name, no avatar, no anchor list beyond this one) and an empty private blob. For a **room invite** the response carries the room membership the invite admits the user to.

6. **Establish first session.** The client persists the session/refresh tokens per ADR 012's transport rules, opens its always-on websocket to the new anchor (ADR 009), and the user is now authenticated.

7. **Prompt for display name and avatar (skippable).** A single screen with two inputs. See "Display name and avatar" below for defaults and the skip mechanics.

8. **Land the user in the room.** For room invites: the client navigates directly to the room the invite admits them to and renders the host server's channel list. For anchor invites: the client lands on the default landing surface (the workspace/server view for the new anchor, with the seeded `#general` and `General` from ADR 018 visible — and the user's anchor is added to the user's workspace bar per CONTEXT.md → Workspace bar).

The flow has exactly one mandatory interrupt — step 4. Every other interrupt is either functionally required (steps 1–3, 5–6, 8) or explicitly skippable (step 7). The second-anchor nudge described below is *not* part of this flow; it fires asynchronously a week later.

### The mnemonic gate

The **mnemonic gate** (CONTEXT.md) is the screen at step 4 of the create path. It displays the full 12-word recovery phrase, in order, in clear contrast, with a one-tap copy affordance.

**Mandatory checkbox.** The screen carries one checkbox labeled "I have written these down" (or a localized equivalent). The "Continue" button is disabled until the checkbox is checked. There is no skip button, no "remind me later," no "I'll do it after I'm in the chat."

**Wording requirement.** The screen must convey, in plain language above the words themselves:

> These 12 words are the only way to recover your account if you lose your device. Yawp cannot reset them.

The exact copy is a UX surface; the *substance* — that Yawp cannot recover this for the user — is non-negotiable. A copy variant that softens this ("save these in case you need them") is non-compliant. The user must leave this screen knowing that losing the phrase without a paired device is permanent.

**v1 verification: checkbox only.** A more rigorous verification ("retype words 3, 7, and 11") is a future hardening step explicitly out of scope for v1. The argument for shipping checkbox-only: any verification that fails open (we let the user proceed if they pick "I forgot, just continue") is no stronger than the checkbox; any verification that fails closed (we block the user until they re-enter words from memory) is a meaningful onboarding-completion drop, and we are not ready to make that trade-off without data. The checkbox is the honest current state of affairs.

The mnemonic is held in memory between display and consumption. After the user proceeds, the mnemonic is dropped — it is not persisted by the client. The user's only copies of it are the ones they wrote down. This is intentional and consistent with ADR 007.

### Display name and avatar (skippable)

Step 7 prompts for two fields:

- **Display name.** Free-form UTF-8. Lives in the PPE per ADR 006. **Defaults to a generated friendly identifier** if skipped — a hyphenated word-pair-and-number (e.g., `silver-fox-42`, `quiet-river-07`) rather than the literal `User`. The friendly default exists for one reason: an unset display name leaves the user invisible in rosters, and "User" duplicates across every fresh signup. A generated friendly name is unique-ish, low-stakes, and immediately replaceable from Settings. The user can change it any time.
- **Avatar.** Optional image upload. Defaults to no avatar; the client renders the standard initial-bubble placeholder. Settable later from Settings.

Both fields are saved to the PPE only on submit. A user who skips this step ends up with the friendly-default display name and no avatar, and the PPE update happens automatically as the user is landed at step 8. There is no "you must set these later" reminder.

This step is intentionally short. A new user on a brand-new identity is one screen away from the chat. We do not stack a profile-completeness tour, a privacy walkthrough, or a notifications preferences screen here; those settings are discoverable from Settings if and when the user needs them.

### Second-anchor nudge

ADR 006 recommends two or more anchors for redundancy; ADR 011 admits the user to exactly one. A user with a single anchor is operating below the recommended redundancy and is one anchor failure away from degraded mode (ADR 009).

The **second-anchor nudge** (CONTEXT.md) is a one-time prompt that fires at **~7 days after signup**, encouraging the user to add a second anchor. It is:

- **Asynchronous.** It is not part of the onboarding flow. It surfaces in-app at the start of a session more than 7 days after the first signup, as a single dismissable banner or modal.
- **One-time.** Once shown, it is not re-prompted in v1. A user who dismisses it has expressed a preference (even if it's just "not now") and we respect it.
- **Dismissable.** Single-action dismissal. The dismissal is recorded in the private blob so it does not re-surface on a different device.
- **Cosmetic.** It does not gate any feature. The user remains fully functional with a single anchor; the nudge is a suggestion, not an enforcement point.

The 7-day delay is a deliberate choice: it fires after the user has had time to decide they actually want to stick with Yawp, but before they have accumulated enough room memberships that adding an anchor feels like a chore. Earlier (e.g., day 1) is noisy; later (e.g., day 30) is too late if anchor failure has already happened.

Repeat nudging is intentionally not built for v1. If we learn that one-shot is insufficient, a future ADR can revisit; the data model accommodates "last nudged at" because the dismissal timestamp is stored.

### Recover-existing-identity path

The recover branch at step 3 is brief here because ADR 007 owns the mechanics. In summary:

- The user types their 12-word mnemonic.
- The client derives the master keypair and the bundle-encryption key via HKDF per ADR 007.
- The client computes the DID, then fetches the encrypted bundle from any anchor it can reach. Anchor candidates come from: (a) the invite link's anchor (which may or may not be in the recovered anchor list); (b) any anchor named in a recovery hint the user supplies; (c) discovery URLs the user can paste.
- The bundle decrypts; the client populates local state (device subkeys, anchor list, room memberships, contacts).
- The client registers a fresh **device subkey** for this device, signs it with the master key, and pushes the PPE update to the anchors per ADR 006.

The recover path does not display a new mnemonic (the user already has one) and does not pass through step 4. It exits step 3 directly to step 5 — but with the existing DID and bundle state instead of an empty profile.

If recovery fails (no anchor reachable, bundle decryption fails, no anchor list available), the user is dropped back to step 3 with a clear error. Recovery is not retried automatically; it is an explicit user action.

### Deep-link handler scope

The client registers handlers for both URL schemes:

- **Custom scheme:** `yawp://<anchor-host>/invite?token=<...>`.
- **HTTPS scheme:** `https://<anchor-host>/invite?token=<...>`. The web server at the anchor renders a launch page that attempts to open the installed client via the custom scheme and falls back to the web app if no client is installed.

Both schemes feed into step 1 of the flow with the same token. The handler is also responsible for **room invite links** (ADR 015's `yawp://<host>/r/<id>?token=<...>`); the router distinguishes by path (`/invite` vs `/r/<id>`) and routes to the appropriate variant of step 5. The flow steps themselves are identical between anchor invites and room invites; only the server responding at step 5 differs.

Deep-link handlers explicitly do **not** include claim tokens (ADR 024). Claim tokens are pasted into the client manually, not delivered via a link.

## Consequences

### Positive

- One mandatory interrupt is the smallest believable budget for "you might lose your identity." Anything less would be irresponsible; anything more would tank onboarding completion.
- A new user is in the chat in under a minute (best case: existing DID on device → straight to room) or three to five minutes (worst case: create-new + mnemonic gate + display name skip).
- The friendly-default display name avoids "User, User, User, User" rosters without forcing every new user through a name-picking decision they may not want to make in the first 60 seconds.
- The 7-day second-anchor nudge is honest: we know one anchor is below the recommended redundancy, and we tell the user once at a moment when they can act on it.
- Recover and create branches diverge for exactly one screen and reconverge cleanly. The flow is testable end-to-end.
- The mnemonic-gate wording is pinned, so the most-important phrase the user reads on this flow doesn't drift between web and native and translations.

### Negative

- The checkbox-only mnemonic gate is a known weak verification. A user who taps "I have written these down" without writing them down is *as locked out* as if we had no gate at all. We accept this trade-off in v1 and document it.
- The friendly-default display name (`silver-fox-42`) is cute but will look unprofessional in some contexts. The user can change it; we accept the cosmetic risk.
- One-time, non-repeating second-anchor nudge means a user who dismisses while distracted may never add a second anchor. Acceptable; the alternative (recurring nudge) is more annoying and we have not seen evidence it converts.
- The deep-link handler must work cross-platform (iOS universal links, Android app links, web fallback). Real implementation work, but a one-time cost.
- Recovery at step 3 is a bigger UX than "type 12 words." A user with no anchor hint, no discovery URL, and no shared room with anyone is effectively in a "DID lookup" dead-end. ADR 007 owns this; surfaced here as a known UX wrinkle.

### Rejected alternatives

- **Skip the mnemonic gate; show the phrase in Settings later.** Users who never visit Settings never see their phrase. Defeats the purpose of having a recovery primitive. Rejected.
- **3-word re-entry verification in v1.** Real value, real completion drop. Worth doing but not on the path to M7. Deferred as a future hardening step.
- **Require a display name and avatar before reaching the chat.** Inflates the most-fragile moment (a first-time user) with two more decisions. Step 7 is skippable for a reason. Rejected.
- **Default display name is literally `User`.** Creates roster collisions and forces "who is that User?" disambiguation by DID. Rejected; the friendly word-pair default is cheap and better.
- **Repeating second-anchor nudge (day 7, day 30, day 90).** Annoying without evidence it works. Rejected for v1; revisit when we have data.
- **Onboarding tour (welcome screens, feature walkthrough) before step 8.** Pads time-to-chat for low signal. The product surfaces should teach themselves; we will revisit if we have evidence the flow leaves users confused. Rejected for v1.
- **Multiple anchor selection in the initial flow.** Forces a redundancy decision before the user has any equity in the system. Onboard to one anchor; nudge later. Rejected.

## Open questions

- **Mnemonic-gate re-entry verification.** Future hardening — pick a sample size (3 words? 4?) and decide whether to fail-closed. We are not ready to commit without data.
- **Localization of the BIP-39 wordlist.** ADR 007 noted the wordlist is English-by-default. The mnemonic gate's surrounding copy is localizable; the words themselves are not, in v1. A future ADR may pin a localized-wordlist policy.
- **What "skippable" looks like for a user who closes the app mid-flow.** A user who quits at step 4 (the mnemonic gate) without checking the box has a brand-new DID with no anchor relationship and no persisted mnemonic. The client treats this as "no identity yet" on next launch and re-runs the flow from step 1. Documented behavior; we may revisit if it creates orphan-keypair noise in local storage.
- **The friendly-default display-name dictionary.** Word-pair generation needs a curated wordlist for the adjective + noun. v1 ships an English dictionary; localization is a future task.

## References

- [CONTEXT.md](../../CONTEXT.md) — invite redemption flow, mnemonic gate, second-anchor nudge, invite link
- [ADR 005 — Identity model](005-identity-model.md)
- [ADR 006 — Anchor server architecture](006-anchor-server-architecture.md)
- [ADR 007 — Identity recovery via BIP-39 mnemonic](007-identity-recovery.md) — recovery mechanics
- [ADR 009 — Federation routing](009-federation-routing.md)
- [ADR 011 — Signup via invite link](011-signup-invites.md)
- [ADR 012 — Session tokens](012-session-tokens.md)
- [ADR 015 — Room membership, visibility, and invites](015-room-membership-invites.md) — room invite links
- [ADR 018 — Channels, categories, and channel types](018-channels-categories.md) — seeded default channels
- [ADR 024 — Server provisioning and admin separation](024-server-provisioning-admin.md) — distinction between invite tokens and claim tokens
