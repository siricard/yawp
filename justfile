# List recipes
default:
    @just --list

# Start Phoenix dev server (web + API)
dev:
    nix develop -c mix phx.server

# Open IEx shell with the app loaded
iex:
    nix develop -c iex -S mix phx.server

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

# Generate Ash migrations
ash-migrate:
    nix develop -c mix ash.codegen

# Regenerate TypeScript types from Ash resources
gen-types:
    nix develop -c mix ash_typescript.codegen

# Run the React Native app on iOS
rn-ios:
    nix develop -c bash -c 'cd assets/native && npx react-native run-ios'

# Run the React Native app on Android
rn-android:
    nix develop -c bash -c 'cd assets/native && npx react-native run-android'

# Run the React Native app on macOS
rn-macos:
    nix develop -c bash -c 'export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; cd assets/native && npx react-native run-macos'

# Start the React Native Metro bundler
rn-metro:
    nix develop -c bash -c 'cd assets/native && npx react-native start --port 8081'

# Open Phoenix routes
routes:
    nix develop -c mix phx.routes
