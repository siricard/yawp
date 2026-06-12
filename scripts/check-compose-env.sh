#!/usr/bin/env bash
set -euo pipefail

compose_file="${1:-docker-compose.yml}"
env_file="${2:-.env.example}"

compose_vars="$(
  grep -Eoh '\$\{[A-Za-z_][A-Za-z0-9_]*[^}]*\}' "$compose_file" |
    sed -E 's/^\$\{//; s/[:?+-].*$//; s/\}$//' |
    sort -u
)"

env_vars="$(
  grep -E '^[[:space:]]*#?[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' "$env_file" |
    sed -E 's/^[[:space:]]*#?[[:space:]]*//; s/=.*$//' |
    sort -u
)"

missing="$(
  comm -23 <(printf '%s\n' "$compose_vars") <(printf '%s\n' "$env_vars")
)"

if [ -n "$missing" ]; then
  printf 'Variables used by %s but missing from %s:\n%s\n' "$compose_file" "$env_file" "$missing" >&2
  exit 1
fi

printf 'All docker compose variables are documented in %s.\n' "$env_file"
