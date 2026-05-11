# List recipes
default:
    @just --list

# Start Phoenix dev server (web + API).
# Runs `mix phx.server` from the umbrella `:yawp` app directory so that
# `Mix.Project.config()[:app]` resolves to `:yawp` for the runtime
# `AshPhoenix.Plug.CheckCodegenStatus` codegen check.
# Anchor A: PORT=4000, DATABASE=yawp_dev (defaults). For Anchor B see `just dev-anchor-b`.
dev:
    nix develop -c bash -c 'cd apps/yawp && mix phx.server'

# Start a second Phoenix dev server (Anchor B) bound to :4100 against the
# yawp_anchor_b_dev database. Used for cross-anchor federation work (M7.4+).
# Creates the DB on first run; `mix ecto.create` is idempotent.
dev-anchor-b:
    nix develop -c bash -c 'cd apps/yawp && DATABASE=yawp_anchor_b_dev mix ecto.create && PORT=4100 DATABASE=yawp_anchor_b_dev mix phx.server'

# Open IEx shell with the app loaded
iex:
    nix develop -c bash -c 'cd apps/yawp && iex -S mix phx.server'

# One-time setup: install deps, create DB, run migrations
setup:
    nix develop -c mix setup

# Fetch and compile deps
deps:
    nix develop -c mix deps.get
    nix develop -c mix deps.compile

# Compile the project
compile:
    nix develop -c mix compile

# Run tests
test *ARGS:
    nix develop -c mix test {{ARGS}}

# Format Elixir code
fmt:
    nix develop -c mix format

# Lint / static checks
check:
    nix develop -c mix compile --warnings-as-errors

# Reset dev DB (drop, create, migrate, seed)
db-reset:
    nix develop -c mix ecto.reset

# M7.1 vertical slice: fresh DB + Phoenix; prints the
# operator setup URL on startup. See docs/walkthroughs/m7-1.md.
demo-m7-1:
    nix develop -c mix ecto.reset
    @echo ""
    @echo "--- M7.1 walkthrough ---"
    @echo "After Phoenix boots, look for: OPERATOR SETUP <url>"
    @echo "Then follow docs/walkthroughs/m7-1.md"
    @echo ""
    nix develop -c bash -c 'cd apps/yawp && mix phx.server'

# M7.2 vertical slice: fresh DB + Phoenix; builds on M7.1 and
# adds real-time #general messaging between two browser sessions
# bound to the chat-owner identity. See docs/walkthroughs/m7-2.md.
demo-m7-2:
    nix develop -c mix ecto.reset
    @echo ""
    @echo "--- M7.2 walkthrough ---"
    @echo "After Phoenix boots, look for: OPERATOR SETUP <url>"
    @echo "1. Run M7.1 steps 1-5 (operator + chat-owner claim)."
    @echo "2. Open the workspace tile, then #general (window A)."
    @echo "3. Open a private/incognito window B at http://localhost:4000/"
    @echo "   - it auto-binds a NEW device to the same chat-owner identity."
    @echo "4. Send messages back and forth (~250ms round-trip)."
    @echo "Full instructions: docs/walkthroughs/m7-2.md"
    @echo ""
    nix develop -c bash -c 'cd apps/yawp && mix phx.server'

# M7.3 vertical slice: fresh DB + Phoenix; builds on M7.2 and adds
# the mnemonic-gate onboarding ceremony, restore-from-mnemonic, and
# server invites that let a SECOND identity join #general. See
# docs/walkthroughs/m7-3.md.
demo-m7-3:
    nix develop -c mix ecto.reset
    @echo ""
    @echo "--- M7.3 walkthrough ---"
    @echo "After Phoenix boots, look for: OPERATOR SETUP <url>"
    @echo "1. Run M7.1 steps 1-5 (operator + chat-owner claim) — you"
    @echo "   will walk through the mnemonic-gate ceremony as part of"
    @echo "   the claim flow."
    @echo "2. Follow M7.2 step 5 to send a few messages in #general"
    @echo "   between two windows of the chat-owner identity."
    @echo "3. In /admin → 'Server invites', click Mint and copy the"
    @echo "   26-char base32 token."
    @echo "4. Open a SECOND private/incognito browser at the same URL"
    @echo "   (http://localhost:4000/), create a new identity, and use"
    @echo "   '+ Add server' with token-kind = Invite to redeem."
    @echo "5. Land in #general; send messages between the two users."
    @echo "Full instructions: docs/walkthroughs/m7-3.md"
    @echo ""
    nix develop -c bash -c 'cd apps/yawp && mix phx.server'

# Generate Ash migrations
ash-migrate:
    nix develop -c mix ash.codegen

# Regenerate TypeScript types from Ash resources
gen-types:
    nix develop -c mix ash_typescript.codegen

# Regenerate Ash TS types into the shared codebase.
# Future workers: ALWAYS run this after editing Ash resources — `mix ash.codegen --check`
# (which AshPhoenix.Plug.CheckCodegenStatus uses) will block HTTP routes with a 500 if
# the generated artifacts are stale.
#
# The shared output at apps/yawp/assets/app/ash_generated.ts is consumed directly by
# both the web bundle (Phoenix esbuild) and the React Native bundle (Metro).
codegen:
    nix develop -c bash -c 'cd apps/yawp && mix ash_typescript.codegen --output "assets/app/ash_generated.ts"'

# Run the React Native app on iOS
rn-ios:
    nix develop -c bash -c 'cd apps/yawp/assets/native && npx react-native run-ios'

# Run the React Native app on Android
rn-android:
    nix develop -c bash -c 'cd apps/yawp/assets/native && npx react-native run-android'

# Run the React Native app on macOS
rn-macos:
    nix develop -c bash -c 'export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; cd apps/yawp/assets/native && npx react-native run-macos'

# Start the React Native Metro bundler
rn-metro:
    nix develop -c bash -c 'cd apps/yawp/assets/native && npx react-native start --port 8081'

# Verify that singleton-required packages (react, react-native-css-interop,
# nativewind, …) appear exactly once in each platform's bundle. Guards the
# Metro `resolveRequest` dedup rules in apps/yawp/assets/native/metro.config.js.
verify-singletons:
    nix develop -c node apps/yawp/assets/native/scripts/verify-singletons.mjs

# Open Phoenix routes
routes:
    nix develop -c mix phx.routes
