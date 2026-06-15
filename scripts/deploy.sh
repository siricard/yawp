#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REMOTE_DIR="/opt/yawp"
REMOTE_DIR="${REMOTE_DIR:-$DEFAULT_REMOTE_DIR}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-5}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-5}"

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy.sh <image:tag> <ssh-target>
  scripts/deploy.sh --health-check <url>

Environment:
  DRY_RUN=1                 Print the remote deployment sequence without network access.
  REMOTE_DIR=/opt/yawp      Directory on the remote host containing docker-compose.yml and .env.
  HEALTH_CHECK_URL=<url>    Public health URL to poll after deploy.
  HEALTH_INSECURE=1         Allow self-signed TLS for local release smoke checks.
  HEALTH_RETRIES=30         Maximum health poll attempts.
  HEALTH_INTERVAL_SECONDS=5 Delay between health poll attempts.
  HEALTH_TIMEOUT_SECONDS=5  Per-request curl timeout.
EOF
}

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

health_check() {
  url="${1:?health url required}"
  attempt=1
  curl_args=(-fsS --max-time "$HEALTH_TIMEOUT_SECONDS")

  if [ "${HEALTH_INSECURE:-0}" = "1" ]; then
    curl_args+=(-k)
  fi

  while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
    if curl "${curl_args[@]}" "$url" >/dev/null; then
      printf 'health check passed: %s\n' "$url"
      return 0
    fi

    if [ "$attempt" -lt "$HEALTH_RETRIES" ]; then
      printf 'health check pending (%s/%s): %s\n' "$attempt" "$HEALTH_RETRIES" "$url" >&2
      sleep "$HEALTH_INTERVAL_SECONDS"
    fi

    attempt=$((attempt + 1))
  done

  die "health check timed out after ${HEALTH_RETRIES} attempts: ${url}"
}

remote_host_from_target() {
  target="${1:?ssh target required}"
  host="${target##*@}"
  host="${host%%:*}"
  printf '%s\n' "$host"
}

render_remote_sequence() {
  image="${1:?image required}"
  health_url="${2:?health url required}"

  cat <<EOF
cd ${REMOTE_DIR}
tmp_env=\$(mktemp)
if [ -f .env ]; then
  grep -v '^YAWP_IMAGE=' .env >"\$tmp_env"
fi
printf 'YAWP_IMAGE=%s\n' '${image}' >>"\$tmp_env"
install -m 600 "\$tmp_env" .env
rm -f "\$tmp_env"
docker compose pull && docker compose up -d
HEALTH_RETRIES=${HEALTH_RETRIES} HEALTH_INTERVAL_SECONDS=${HEALTH_INTERVAL_SECONDS} HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS} scripts/deploy.sh --health-check '${health_url}'
EOF
}

run_remote_deploy() {
  image="${1:?image required}"
  target="${2:?ssh target required}"
  health_url="${HEALTH_CHECK_URL:-https://$(remote_host_from_target "$target")/health}"
  remote_sequence="$(render_remote_sequence "$image" "$health_url")"

  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf 'ssh target: %s\n' "$target"
    printf '%s\n' "$remote_sequence"
    return 0
  fi

  printf '%s\n' "$remote_sequence" | ssh "$target" "bash -se"
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 2
fi

case "$1" in
  --health-check)
    [ "$#" -eq 2 ] || die "--health-check requires exactly one URL"
    health_check "$2"
    ;;
  -h | --help)
    usage
    ;;
  --*)
    die "unknown option: $1"
    ;;
  *)
    [ "$#" -eq 2 ] || die "expected image tag and ssh target"
    run_remote_deploy "$1" "$2"
    ;;
esac
