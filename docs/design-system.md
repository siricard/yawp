# Yawp Design System

> Extracted from the canonical visual reference `.designkit/sessions/12294-1779908337/content/yawp-screens-v16.html` ("v16"). This document is the source-of-truth for Yawp's **visual design**. Every token, recipe, and value below is taken verbatim from v16's `:root` block and component CSS — nothing here is invented.

---

## 1. Preamble — what is canonical, and what wins

**v16 is canonical for AESTHETICS ONLY.**

- If v16 shows a screen that uses a **feature** the product doesn't have yet, **features win on behavior.** The mockup's pixels tell you how a thing should *look*; they never tell you what the product *does*. Resolve any conflict between v16 and `features.json` / the ADRs **in favor of features/ADRs.**
- If `features.json` calls for a screen v16 does **not** show, the design system below tells you how to **compose** it (§8 — Net-new screen composition rules). Do not invent new tokens or a new visual language; assemble the screen out of the primitives and components defined here.
- v16 is a *design study*, not a product spec. It contains stub data, placeholder copy ("Nova", "Jules"), and screens (group calls, mobile workspace drawer) marked "TBD / not mocked." None of that is a behavioral commitment.
- The token layer that actually ships lives in `tokens.css` (`:root`) per the mission's Tailwind v4 rule. This document describes the **intended values**; when implementing, reference the CSS variables, never hard-code the literals.

When in doubt: **ADRs > CONTEXT.md > this document (aesthetics) > the v16 mockup file itself.**

---

## 2. Color palette

All colors are dark-faithful. Soft variants and gradients are built with OKLCH `color-mix` so a single base-color change re-tunes everything. Recipes are preserved exactly as v16 defines them.

### 2.1 Core surfaces & text

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#202831` | App background, deepest plane (inset wells, search bar, rails) |
| `--color-bg-2` | `#1a2128` | Secondary background (also `--search-bg-hover`) |
| `--color-surface` | `#353E4B` | Default panel / frame surface |
| `--color-surface-2` | `#485363` | Raised surface (ghost buttons, chips, avatars, bubbles) |
| `--color-surface-3` | `#5a6776` | Highest raised surface (hover states) |
| `--color-text` | `#f0efea` | Primary text |
| `--color-text-secondary` | `#b5b9bf` | Secondary text |
| `--color-text-tertiary` | `#7a8290` | Tertiary text, meta, placeholders, icons |
| `--color-border` | `#2a323d` | Hard borders (rail dividers) |
| `--color-border-soft` | `#4a5464` | Soft borders, hairline separators |

### 2.2 Brand & status

| Token | Value / recipe | Use |
|---|---|---|
| `--color-primary` | `#d8ee4d` | Lime. Reserved for **"you" / your voice / your connection** and primary affordances. NOT used for generic selection. |
| `--color-primary-hover` | `#c3d740` | Primary button hover |
| `--color-primary-soft` | `color-mix(in oklch, var(--color-primary) 22%, var(--color-surface))` | Tinted primary backdrops |
| `--color-on-primary` | `#202831` | Text/icon on a primary fill |
| `--color-success` | `#74cf86` | Green — online presence, verified, E2EE, read receipts |
| `--color-success-soft` | `color-mix(in oklch, var(--color-success) 22%, var(--color-surface))` | Success chip/banner backdrop |
| `--color-warning` | `#e8a06b` | Amber — caution banners, pending-verify, idle presence |
| `--color-warning-soft` | `color-mix(in oklch, var(--color-warning) 22%, var(--color-surface))` | Warning chip/banner backdrop |
| `--color-danger` | `#e8615a` | Red — destructive, mentions, decline/end-call, errors |
| `--color-danger-soft` | `color-mix(in oklch, var(--color-danger) 22%, var(--color-surface))` | Danger chip/banner backdrop |

### 2.3 Chrome palette (neutral grey)

The v16 study page chrome (titles, nav, section headers, frame labels, notes) lives in its own neutral-grey register so product screens read as distinct. **In the shipping product these are study-page only** — but keep the tokens if you build any design-study / docs surface.

| Token | Value |
|---|---|
| `--chrome-bg` | `#141416` |
| `--chrome-surface` | `#1c1c1e` |
| `--chrome-surface-2` | `#232325` |
| `--chrome-text` | `#ededed` |
| `--chrome-text-secondary` | `#9a9a9a` |
| `--chrome-text-tertiary` | `#6b6b6b` |
| `--chrome-border` | `#28282a` |
| `--chrome-border-soft` | `#2f2f31` |

### 2.4 Search tokens (shared by Home + Conversation)

| Token | Value |
|---|---|
| `--search-bg` | `var(--color-bg)` |
| `--search-bg-hover` | `#1a2128` |
| `--search-border-focus` | `var(--color-primary)` |
| `--search-fg` | `var(--color-text)` |
| `--search-fg-placeholder` | `var(--color-text-tertiary)` |
| `--search-icon` | `var(--color-text-tertiary)` |
| `--search-height` | `36px` |
| `--search-radius` | `var(--radius-pill)` |
| `--search-padding-x` | `14px` |
| `--search-gap` | `10px` |
| `--search-font` | `var(--font-sm)` |

### 2.5 Call-control tokens (shared by Active call + Ringer + Conversation header)

| Token | Value |
|---|---|
| `--call-ctrl-size` | `56px` |
| `--call-ctrl-bg` | `var(--color-surface-2)` |
| `--call-ctrl-fg` | `var(--color-text)` |
| `--call-ctrl-bg-active` | `var(--color-primary)` |
| `--call-ctrl-fg-active` | `var(--color-on-primary)` |
| `--call-ctrl-bg-danger` | `var(--color-danger)` |
| `--call-ctrl-fg-danger` | `#fff` |
| `--call-ctrl-bg-accept` | `var(--color-success)` |

### 2.6 Surface gradients

Applied to every frame. Each is a `color-mix` of an accent into a base surface.

| Token | Recipe |
|---|---|
| `--grad-surface-warm` | `radial-gradient(ellipse at top, color-mix(in oklch, var(--color-primary) 8%, var(--color-surface)) 0%, var(--color-surface) 70%)` |
| `--grad-surface-cool` | `radial-gradient(ellipse at top, color-mix(in oklch, var(--color-success) 8%, var(--color-surface)) 0%, var(--color-surface) 70%)` |
| `--grad-surface-soft` | `linear-gradient(180deg, color-mix(in oklch, var(--color-text) 1.5%, var(--color-surface)) 0%, var(--color-surface) 60%)` |
| `--grad-stage-success` | `radial-gradient(ellipse at center 30%, color-mix(in oklch, var(--color-success) 8%, var(--color-surface)) 0%, var(--color-surface) 65%)` |
| `--grad-stage-primary` | `radial-gradient(ellipse at top, color-mix(in oklch, var(--color-primary) 10%, var(--color-surface)) 0%, var(--color-surface) 60%)` |
| `--grad-mobile-warm` | `radial-gradient(ellipse at top, color-mix(in oklch, var(--color-primary) 8%, var(--color-bg)) 0%, var(--color-bg) 70%)` |
| `--grad-mobile-cool` | `radial-gradient(ellipse at top, color-mix(in oklch, var(--color-success) 8%, var(--color-bg)) 0%, var(--color-bg) 70%)` |

**Color usage law (from v16 notes, "still in force"):** Lime = you / your voice / your connection — *not* selection. Selection is communicated by a lighter surface + bold text + a hairline ring, never by lime fill.

---

## 3. Typography

Three families, loaded from Google Fonts in v16:

| Token | Stack | Role |
|---|---|---|
| `--font-family` | `"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` | Body / UI sans |
| `--font-display` | `"Cal Sans", "Geist", ui-sans-serif, system-ui, sans-serif` | Display — headlines, channel titles, mnemonic words, peer names |
| `--font-mono` | `"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` | Meta, fingerprints, timestamps, badges, code, labels |

### 3.1 Size scale

| Token | Value |
|---|---|
| `--font-xs` | `0.75rem` |
| `--font-sm` | `0.875rem` |
| `--font-base` | `1rem` |
| `--font-lg` | `1.25rem` |
| `--font-xl` | `1.5rem` |
| `--font-2xl` | `2rem` |
| `--font-3xl` | `2.75rem` |

Sub-token sizes used inline in v16 for very small meta on mobile: `0.65rem`, `0.62rem`, `0.6rem`, `0.55rem`. Treat these as mobile-meta exceptions, not part of the named scale.

### 3.2 Weights actually used

Geist is loaded at `300;400;500;600;700`. In practice v16 uses:
- **400** — body, display text (Cal Sans ships only one weight but reads heavy)
- **500** — nav links, secondary labels, offline member names
- **600** — chips, tabs, buttons-secondary, labels, search input
- **700** — headlines, names, section titles, badges, workspace tiles, statusbar

### 3.3 Type details (from v16)

- `body` sets `font-feature-settings: "cv11", "ss03"` and antialiasing.
- Numeric / timestamp / badge surfaces use `font-variant-numeric: tabular-nums` (`.time`, `.badge`, `.count-pill`, `.key-fp`, `code`, `.hash`, etc.).
- Headlines (`.id-headline`, `.section-title`, channel/peer titles) use `letter-spacing: -0.015em` to `-0.04em` and `text-wrap: balance`. Cal Sans display titles run tight: `-0.025em` to `-0.035em`.

---

## 4. Spacing, radius, shadow

### 4.1 Spacing scale (semantic `--space-*`, never Tailwind's reserved `--spacing-*`)

| Token | Value |
|---|---|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `12px` |
| `--space-lg` | `16px` |
| `--space-xl` | `24px` |
| `--space-2xl` | `32px` |
| `--space-3xl` | `48px` |

### 4.2 Radius scale

| Token | Value |
|---|---|
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `18px` |
| `--radius-xl` | `22px` |
| `--radius-pill` | `999px` |

### 4.3 Shadows

Card / elevation shadows (tinted toward slate, never pure black):

| Token | Value |
|---|---|
| `--shadow-card` | `0 1px 0 0 rgba(255,255,255,.02) inset, 0 6px 22px rgba(8,12,18,.28), 0 1px 2px rgba(8,12,18,.18)` |
| `--shadow-elev` | `0 14px 40px rgba(8,12,18,.42), 0 4px 12px rgba(8,12,18,.22)` |
| `--shadow-tint` | `8 12 18` (the slate RGB triple the tinted shadows pull toward) |

Accent **glow** shadows — reserved for focal/interactive accent surfaces ONLY (primary CTAs, send, call controls, ringer accept/decline). Opacity was deliberately softened in v16 (18–28%).

| Token | Value |
|---|---|
| `--glow-primary-sm` | `0 3px 10px color-mix(in oklch, var(--color-primary) 18%, transparent)` |
| `--glow-primary-md` | `0 5px 16px color-mix(in oklch, var(--color-primary) 22%, transparent)` |
| `--glow-primary-lg` | `0 8px 22px color-mix(in oklch, var(--color-primary) 28%, transparent)` |
| `--glow-success-sm` | `0 3px 10px color-mix(in oklch, var(--color-success) 20%, transparent)` |
| `--glow-success-md` | `0 5px 18px color-mix(in oklch, var(--color-success) 28%, transparent)` |
| `--glow-success-lg` | `0 8px 24px color-mix(in oklch, var(--color-success) 34%, transparent)` |
| `--glow-danger-sm` | `0 3px 10px color-mix(in oklch, var(--color-danger) 20%, transparent)` |
| `--glow-danger-md` | `0 5px 18px color-mix(in oklch, var(--color-danger) 28%, transparent)` |
| `--glow-danger-lg` | `0 8px 24px color-mix(in oklch, var(--color-danger) 34%, transparent)` |

`--focus-ring`: `0 0 0 2px color-mix(in oklch, var(--color-primary) 70%, transparent)` — see §7.

**Shadow restraint law (v16 notes):** shadow color must match the element's accent, and shadows are reserved for elements the user should focus on — interactive primary affordances and nothing else. Chips, banners, step rows, message bubbles, verified-ticks, and identity avatars carry **no** shadow.

---

## 5. Layout primitives

v16 px values are preserved. Web frames sit in `--grad-surface-warm`/`-cool`; the phone frame is `340×720`, padding `11px`, mobile screen radius `30px`.

### 5.1 Workspace bar (`.ws-bar`)
Top strip of the app shell. `display:flex`, `gap: var(--space-md)`, `padding: 10px var(--space-lg)`, `background: var(--color-bg)`, `border-bottom: 1px solid var(--color-border)`. Contains: brand-mark (sm) → `.ws-divider` (1px×22px) → `.ws-list` (workspace tiles, gap `6px`) → `.ws-spacer` (flex:1) → optional `.voice-dock` pill.

### 5.2 Tab row (`.tab-row`)
Below the workspace bar. `display:flex`, `gap: 4px`, `padding: 8px var(--space-md)`, `background: var(--color-bg)`, `border-bottom: 1px solid var(--color-border)`. Holds `.rooms-btn`, `.tab-divider`s, `.tab.dropdown-header` section headers, the scrollable `.tabs` container (channels + DM chips + voice-in tab), and an end `.scroll-btn`.

### 5.3 Channel header (`.ch-head`)
`display:grid`, `grid-template-columns: auto 1fr auto auto auto`, two rows. Row 1 = big Cal Sans `.h-title` (`--font-2xl`, weight 400, `#` in lime at `0.92em`). Row 2 = `.topic` + `.members-count` (`.online` in success). Right cluster spans both rows: `.e2ee-pill`, `.bell`, `.ch-search`. `padding: var(--space-lg) var(--space-xl)`, `border-bottom: 1px solid var(--color-border-soft)`, `background: var(--color-surface)`. DM mode (`.ch-head.dm-mode`) swaps the title for a peer block (avatar + name + verified-tick + fingerprint + online).

### 5.4 Message row
Two patterns:
- **Group / channel** (`.group-msg`): `grid` `auto 1fr`, gap `--space-md`; header line = `.who` (700) + verified-tick / pending chip + `.time` (mono); body `.group-msg-text` (`--font-sm`, line-height 1.55, max-width `62ch`); optional `.reactions`.
- **DM bubbles** (`.bubble`): max-width `64%`, `padding: 10px var(--space-md)`, `radius: var(--radius-lg)` with the "tail" corner cut to `6px`. Incoming = `--color-surface-2`; outgoing = `color-mix(in oklch, var(--color-primary) 18%, var(--color-surface-2))`. Meta line below in mono `0.68rem`; read receipt in success.

### 5.5 Composer (`.composer` inside `.composer-wrap`)
`composer-wrap`: `padding: var(--space-md) var(--space-xl) var(--space-lg)`, top border `--color-border-soft`, translucent `color-mix(... 92% ...)` surface + `backdrop-filter: blur(8px)`. `.composer`: flex pill (`--radius-pill`) on `--color-surface-2`, `padding: 6px 6px 6px var(--space-md)`. Focus-within = primary halo (no inner ring). `.ctrl` icon buttons (32px) + `.send` (36px circle, primary fill, `--glow-primary-md`). Send icon toggles signal-bars (empty) ↔ arrow (typed) via `:placeholder-shown`.

### 5.6 Modal shell
v16 does not ship a literal `.modal` class. Compose modals from the elevation primitives: a centered panel on `--color-surface` (or `--grad-surface-soft`), `--radius-xl`, `--shadow-elev`, with `--space-xl` internal padding, a title (display or 700 sans), body copy, and a right-aligned button cluster (ghost + primary). The optional grain overlay and focus-ring rules apply.

### 5.7 Drawer
v16 marks the mobile workspaces drawer "not yet mocked." Compose it from: a full-height panel on `--color-bg`/`--color-surface`, slide-in via the `--ease-spring` curve and `--dur-base`, `--shadow-elev`, reusing `.ws` tiles in a vertical list. Same tokens, no new visual language.

### 5.8 Member / peer rails
`.member-rail` / `.conv-rail` / `.home-rail`: fixed `240–280px` column, `background: var(--color-bg)`, `border-left: 1px solid var(--color-border)`, `padding: var(--space-lg)`, sections labelled with mono `// `-prefixed `h4`.

---

## 6. Component vocabulary

Each entry: intended use → states → token references → example markup. Markup mirrors v16's class names; in the React/RN codebase translate these into the shared components, but keep the token references identical.

### 6.1 Button (`.btn`)
**Use:** all click affordances. Variants: `btn-primary`, `btn-ghost` (secondary), `btn-danger`. Sizes: default, `btn-lg` (`padding: 14px 22px; font-size: var(--font-base)`), and `btn-block` (full width). (v16 has no distinct "sm" button class — use the default for sm.)

**Base:** inline-flex, `gap: 6px`, `padding: 10px 18px`, `--radius-pill`, `--font-sm`, weight 600.

**States:**
- default: variant fill.
- hover: `translateY(-1px)`; primary → `--color-primary-hover` + `--glow-primary-lg`; ghost → `--color-surface-3`.
- active/press: `translateY(0)` then global `scale(0.97)`.
- focus-visible: `--focus-ring`.
- disabled: reduce opacity / drop the glow (compose; v16 shows no disabled fill but the rule is "no glow when not actionable").

| Variant | bg | fg | shadow |
|---|---|---|---|
| primary | `--color-primary` | `--color-on-primary` | `--glow-primary-md` → `-lg` hover |
| ghost | `--color-surface-2` | `--color-text` | none (→`surface-3` hover) |
| danger | `--color-danger` | `#fff` | `--glow-danger-md` |

```html
<button class="btn btn-primary">I've written it down <i class="ph-light ph-arrow-right"></i></button>
<button class="btn btn-ghost"><i class="ph-light ph-copy"></i> Copy phrase</button>
```

**Icon button (`.icon-btn`):** 32px circle on `--color-surface-2`, `--font-sm`, hover → `surface-3`. Modifiers `.is-primary` (lime + `--glow-primary-sm`) and `.is-danger`.

### 6.2 Input (text / password / textarea)
v16's text inputs live inside composite shells (`.ch-search .search-input`, `.composer .composer-input`) — transparent background, no border, no outline, `color: var(--color-text)`, `font-family: var(--font-family)`, placeholder in `--color-text-tertiary`. Compose a standalone field by wrapping the input in a surface pill/box:
- container: `--color-bg` (or `surface-2`), `1px solid transparent`, `--radius-sm`/`pill`, focus → border `--color-primary` (or composer-style halo).
- password: same shell + a trailing `.icon-btn` eye toggle.
- textarea: same shell, multi-line, `--radius-md`.
- error state: border / ring in `--color-danger`, helper text `--color-danger`.

### 6.3 Autocomplete (mnemonic suggestion dropdown)
**Use:** the BIP-39 word-suggestion dropdown during recovery-phrase entry/verification. **MUST be a positioned overlay**, never an in-flow element that pushes layout.

Compose: anchor on the focused input; render a panel `position: absolute` directly below it, `background: var(--color-surface-2)`, `--radius-md`, `--shadow-elev`, `z-index` above siblings. Each row = mono word text (`--font-sm`), hover/active row `--color-surface-3`, selected row hairline ring or lime text. Reuse the `--ease-out-quint` fade on open. Because it overlays, the surrounding mnemonic grid never reflows as suggestions appear.

```html
<div class="field" style="position:relative">
  <input class="word-input" />
  <div class="suggest-overlay">   <!-- position:absolute; box-shadow: var(--shadow-elev) -->
    <div class="suggest-row">harbor</div>
    <div class="suggest-row is-active">harvest</div>
  </div>
</div>
```

### 6.4 Card
**Use:** grouped content (me-card, peer-detail-card, ringer-id-row well). `background: var(--grad-surface-warm)` (or `--color-surface`), `--radius-lg`, `padding: var(--space-lg)`, `--shadow-card`. No hover state unless interactive.

### 6.5 Banner
**Use:** inline status messages above a stream or in a flow. Three flavors seen in v16:
- **warning** (`.id-warning`, `.offline-banner`): `--color-warning-soft` (or `color-mix(... warning 12% ...)`), warning-colored icon, text in `--color-text`, `--radius-md`. The offline banner adds `inset 0 0 0 1px color-mix(... warning 35% ...)`.
- **verify** (`.verify-banner`): `color-mix(... primary 8% surface-2)` bg, bottom border `color-mix(... primary 35% ...)`, primary icon, inline `.btn-verify` (primary pill) + `.btn-learn` (text).
- Compose **error/success** banners by swapping the accent to `--color-danger` / `--color-success` with their `-soft` backdrops.

### 6.6 Modal
See §5.6. Panel on `--color-surface`/`--grad-surface-soft`, `--radius-xl`, `--shadow-elev`, `--space-xl` padding, title + body + right-aligned ghost/primary cluster. Dismiss affordance is an `.icon-btn`. No new tokens.

### 6.7 Field / Form
A field = label (mono `// `-prefixed or sans 600, `--color-text-secondary`) + input shell (§6.2) + optional helper/error line (`--font-xs`). Stack fields with `--space-md`/`--space-lg`. Submit cluster uses §6.1 buttons. v16's flows (identity stages, me-card actions) show fields composed this way rather than via a dedicated form component.

### 6.8 Section / Subsection
Section header pattern: a row with a mono numbered label and a title (`.section-title` `--font-lg` weight 700; mono `.num`), `border-bottom: 1px solid var(--color-border-soft)`, sub-line `.section-sub` (`--font-sm`, `--color-text-secondary`, max `60ch`). Rail subsections use `h4` with mono `// ` prefix, uppercase, letter-spacing `.08em`.

### 6.9 Avatar (`.av`)
**Use:** identity presence. Circle, `--color-surface-2` default, weight 700. **Never glows** (identity, not action). Sizes: `av-sm 28`, `av-md 40`, `av-lg 56`, `av-xl 96`, `av-xxl 144` px. Per-person tints are `color-mix` blends of status colors into `surface-2` (e.g. `.av-nova` = primary 40%, `.av-jules` = success 50%). `.av-me` = `color-mix(... text 80%, primary)`.

**Presence dot (`.presence`):** absolute bottom-right, `2px` border in surface color. `.on` = success **and pulses** (`presence-pulse` 2.4s); `.idle` = warning (static); `.off` = tertiary (static). Per-size dot dimensions 9–18px.

### 6.10 Badge (`.badge`)
**Use:** unread counts on tabs. `--color-primary` fill / `--color-on-primary` text, pill, `0.6rem`, weight 700, mono, `min-width: 18px`, centered. `.muted` modifier → `--color-surface-3` / `--color-text-secondary`. Community variant (`.community-unread`) is larger (`--font-xs`, `min-width 22px`).

### 6.11 Pill / Chip (`.chip`)
**Use:** small status tags. inline-flex, `gap: 5px`, `padding: 3px 9px`, `--radius-pill`, `--color-surface-2` / `--color-text-secondary`, `--font-xs`, weight 600. Variants: `chip-verified` (success-soft/success), `chip-danger`, `chip-warning`, `chip-primary` (primary-soft/text). Related pills: `.e2ee-pill` (success-soft, expands on hover via `max-width` transition), `.voice-dock`, `.call-shield`, `.ringer-id-row`.

### 6.12 Spinner
v16 ships no literal spinner; its "alive" motion is the **signal-bars** motif (`.signal-bars`, 4 verticals) and the **typing-bubble** (3 dots, `typing-bounce`). For a loading spinner, compose from these: prefer the animated `.signal-bars.is-alive` (lime or faint) as the brand-faithful busy indicator, sizes `is-sm`/`is-lg`. Honor `prefers-reduced-motion`.

### 6.13 Toast
v16 has no standalone toast. Compose from the Banner (§6.5) + elevation: a small floating card, `--shadow-elev`, `--radius-md`, accent-soft backdrop matching severity (success/warning/danger), auto-dismiss with the `--ease-out-quint` fade. Keep it brief; no new tokens.

### 6.14 Tile (`.ws` — workspace bar)
**Use:** a workspace in the workspace bar. `38×38px`, `border-radius: 12px` (squircle), `--color-surface-2`, mono weight 700, `--font-sm`. States: hover → `surface-3`; `.active` → `--color-surface` + `inset 0 0 0 1.5px var(--color-primary)` (lime ring = selection here is the one place selection touches lime, as a ring not a fill); `.dm` (sans `@`), `.add` (transparent + dashed-ish soft inset border); per-community tints `.yb/.ff/.kt`. `.unread-dot` (lime) / `.unread-dot.mention` (danger) absolute top-right.

### 6.15 DidPill / fingerprint (`.key-fp`, `.me-fp`, `.peer-fp`)
**Use:** the long DID / public-key fingerprint display. Mono, `--font-xs`, `--color-text-tertiary`, letter-spacing `.04em`, tabular-nums. `.key-fp .prefix` renders the leading bytes (e.g. `yp:8f3a`) in `--color-primary`. When boxed (`.me-fp`): sits in a `--color-bg` well, `--radius-sm`, `padding: var(--space-sm) var(--space-md)`, with a tertiary `.label` and a copy `.icon-btn`. For a full DID, wrap the mono string in this well and allow truncation/ellipsis or wrap; keep the lime prefix to anchor recognition.

---

## 7. Motion / interaction

v16 replaces default easings with spring curves and defines durations:

| Token | Value |
|---|---|
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--dur-fast` | `180ms` |
| `--dur-base` | `280ms` |
| `--dur-slow` | `520ms` |

**Interactive transition recipe** (applied to buttons, icon-btns, tabs, chips, reactions, ctrls, ws tiles, etc.):
```
transition:
  transform        var(--dur-base) var(--ease-spring),
  box-shadow       var(--dur-base) var(--ease-out-quint),
  background-color var(--dur-fast) var(--ease-out-quint),
  color            var(--dur-fast) var(--ease-out-quint),
  border-color     var(--dur-fast) var(--ease-out-quint);
```

- **Hover:** buttons lift `translateY(-1px)`; primary buttons gain the larger glow; the trailing icon on `.btn-primary` magnetically shifts `translate(2px, -1px)`.
- **Press:** global `:active { transform: scale(0.97) }` on the interactive set.
- **Focus ring:** keyboard users get `:focus-visible { box-shadow: var(--focus-ring); border-radius: var(--radius-sm) }`. Mouse focus is suppressed (`:focus { outline: none }`). The composer suppresses the inner ring and uses its focus-within halo instead.
- **Micro-interactions / living signals:** `presence-pulse` (online dots, voice pulse, 2.4s), `signal-bars-pulse` (1.1s, staggered), `typing-bounce`, `ringer-pulse` / `ringer-ripple`, `wave` (call waveform), `brand-cursor-pulse` (the lime underbar on the wordmark). The voice-active app shell lights a lime hairline perimeter + bottom-edge gradient (`.app-shell.is-in-voice`).
- **Scroll entry:** sections fade/translate/deblur in over 700ms `--ease-out-quint` (study-page only).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses all durations to `1ms` and disables reveal transforms. Always honor this.

A fine grain/noise overlay (`body::before`, opacity `.055`, `mix-blend-mode: overlay`) breaks digital flatness on dark surfaces.

---

## 8. Net-new screen composition rules

For any screen `features.json` requires that v16 does not show, follow this recipe:

1. **Pick the layout primitive** (§5) that matches the screen's structure — flow stage (like Identity), app-shell body, rail, modal, or drawer.
2. **Compose with components** (§6) — never invent a new visual language. Reuse buttons, fields, banners, cards, chips, avatars.
3. **Reference tokens** (§2–§4, §7) — colors, spacing, radius, shadow, motion all come from the named variables. No literals, no new tokens.

Apply the laws: lime = you/your connection (not selection); shadows only on focal affordances; identity avatars never glow; honor `prefers-reduced-motion`.

### Screens to compose (not in v16):

- **LockedScreen** — Identity-flow stage layout (`.id-frame`, `--grad-surface-warm`). Centered brand-mark, a lock glyph (Phosphor `ph-lock-simple`), a display headline, body copy, and a single primary CTA ("Unlock"). If passphrase-gated, add one password field (§6.2) + error banner (§6.5, danger). No workspace chrome.
- **PassphraseSettingsScreen** — settings panel: Section header (§6.8), a Form (§6.7) of password fields (current / new / confirm) in surface wells, helper text in `--font-xs`, a primary "Update" + ghost "Cancel" cluster. Optionally a warning banner about no-recovery semantics.
- **Second-anchor nudge banner** — Banner (§6.5), primary/verify flavor (`color-mix(... primary 8% ...)`), lock/shield icon, short copy, a primary `.btn-verify`-style action + a ghost dismiss. Lives above the stream or on Home. Per AGENTS.md, its dismissal flag persists in the identity bundle, not localStorage.
- **Server invites admin section** — Section/Subsection (§6.8) inside an admin panel; a Card (§6.4) per invite showing a DidPill-style code (§6.15), a status chip (§6.11), and ghost/danger action buttons. A "Mint invite" primary button opens the mint form below.
- **Restore-from-mnemonic flow** — Identity-flow stages (`.id-stage-row` progress) + a mnemonic entry grid mirroring `.mnemonic-grid`, each cell a field (§6.2) wired to the **Autocomplete overlay** (§6.3). Warning banner (§6.5) about phrase secrecy. Primary "Restore" CTA, gated until 12 valid words.
- **Multi-use invite mint form** — Modal (§6.6) or settings card: fields for max-uses and expiry (§6.7), a generated DidPill code (§6.15) with a copy icon-btn, and a primary "Create" / ghost "Cancel" cluster. On success, surface a Toast (§6.13).

---

## 9. Versioning

- **v16 is the locked starting point** for M7.4-design. Its tokens and components, as captured above, are the baseline every M7.4-design feature cites.
- **During M7.4-design:** newer versions (v17+) MAY be consumed if they appear in `.designkit/`, but ONLY with an explicit handoff note citing the exact diff (which tokens/components changed and why). Do not silently adopt a newer mockup.
- **After M7.4-design closes:** new `.designkit` versions are **design-system change requests**. They do NOT auto-propagate into this document or the codebase. A change to a token or component must go through a deliberate update to `tokens.css` + this doc, not by pointing at a fresher HTML file.
- This document — not the raw HTML — is the citation target for downstream features. If the HTML and this doc ever disagree, treat it as a bug in this doc and fix the doc (re-extracting from v16), rather than diverging.
