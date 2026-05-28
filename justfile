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

# Full local CI-parity gate: same steps GitHub Actions runs, plus mix format
# check. Run this before `git push`; the pre-push hook runs it for you.
ci:
    nix develop -c mix format --check-formatted
    nix develop -c mix compile --warnings-as-errors
    nix develop -c bash -c 'cd apps/yawp && mix ash.setup --quiet'
    nix develop -c mix test
    nix develop -c bash -c 'cd apps/yawp/assets && npx tsc --noEmit'
    nix develop -c bash -c 'cd apps/yawp/assets/native && npx tsc --noEmit'
    nix develop -c bash -c 'cd apps/yawp/assets/native && npm test --silent'
    just verify-singletons

# Reset dev DB (drop, create, migrate, seed)
db-reset:
    nix develop -c mix ecto.reset

# Reset the dev DB, boot Phoenix, and walk the latest end-to-end demo.
# See docs/walkthroughs/latest.md for the current scripted flow.
demo:
    nix develop -c mix ecto.reset
    @echo ""
    @echo "--- demo ---"
    @echo "After Phoenix boots, look for: OPERATOR SETUP <url>"
    @echo "Then follow docs/walkthroughs/latest.md"
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

# Serve the shared component library via Ladle (web) at :61000.
ladle:
    nix develop -c bash -c 'cd apps/yawp/assets/native && npx ladle serve'

# Walk the M7.4-design slice: component library viewer + the M7.3 demo with
# the v16 visual polish applied. See docs/walkthroughs/m7-4-design.md.
demo-m7-4-design:
    @echo ""
    @echo "--- demo M7.4-design ---"
    @echo "1. Open the component library:  just ladle  (http://localhost:61000)"
    @echo "2. Boot the M7.3 demo, now visually polished:  just demo-m7-3"
    @echo "3. Optional native parity check:"
    @echo "     cd apps/yawp/assets/native && npx react-native start --port 8081"
    @echo "     (then in another shell)  just rn-ios  /  just rn-android  /  just rn-macos"
    @echo ""
    @echo "Walkthrough: docs/walkthroughs/m7-4-design.md"
    @echo ""

# Verify that singleton-required packages (react, react-native-css-interop,
# nativewind, …) appear exactly once in each platform's bundle. Guards the
# Metro `resolveRequest` dedup rules in apps/yawp/assets/native/metro.config.js.
verify-singletons:
    nix develop -c node apps/yawp/assets/native/scripts/verify-singletons.mjs

# Open Phoenix routes
routes:
    nix develop -c mix phx.routes
