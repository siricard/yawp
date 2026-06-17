#!/usr/bin/env bash
set -euo pipefail

app_dir="$PWD"

usage() {
  cat <<'EOF'
Usage: scripts/setup-url.sh [--app-dir PATH]

Prints the current first-boot setup URL from the Phoenix container logs.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-dir)
      app_dir="${2:?--app-dir requires a path}"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$app_dir/docker-compose.yml" ]; then
  echo "docker-compose.yml not found in ${app_dir}" >&2
  exit 2
fi

compose_args=(-f "$app_dir/docker-compose.yml")
if [ -f "$app_dir/docker-compose.staging.yml" ]; then
  compose_args+=(-f "$app_dir/docker-compose.staging.yml")
fi

if ! logs="$(docker compose "${compose_args[@]}" logs --no-color phoenix 2>/dev/null)"; then
  echo "stack not running, or phoenix logs are unavailable" >&2
  exit 1
fi

url="$(
  printf '%s\n' "$logs" |
    grep -Eo 'https?://[^[:space:]]+/admin/setup\?token=[^[:space:]]+' |
    tail -n 1 || true
)"

if [ -z "$url" ]; then
  echo "server already claimed, or no setup URL was found in phoenix logs" >&2
  exit 1
fi

printf '%s\n' "$url"
