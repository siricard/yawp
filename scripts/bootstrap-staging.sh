#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/yawp"
APP_USER=""
BRANCH="main"
HOSTNAME_VALUE=""
REPO_URL="https://github.com/siricard/yawp.git"

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-staging.sh --hostname HOSTNAME [--app-dir PATH] [--app-user USER] [--repo-url URL] [--branch BRANCH]

Clones or updates Yawp, provisions the host, then starts the Docker Compose stack.

Options:
  --hostname HOSTNAME  Public hostname for this server.
  --app-dir PATH       Checkout and application directory. Default: /opt/yawp
  --app-user USER      Unix user that owns the application directory. Default: sudo user or current user
  --repo-url URL       Git repository URL. Default: https://github.com/siricard/yawp.git
  --branch BRANCH      Git branch to deploy. Default: main
  -h, --help           Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --hostname)
      HOSTNAME_VALUE="${2:?--hostname requires a hostname}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:?--app-dir requires a path}"
      shift 2
      ;;
    --app-user)
      APP_USER="${2:?--app-user requires a user}"
      shift 2
      ;;
    --repo-url)
      REPO_URL="${2:?--repo-url requires a URL}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:?--branch requires a branch}"
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

if [ -z "$HOSTNAME_VALUE" ]; then
  read -r -p "Hostname: " HOSTNAME_VALUE
fi

if [ -z "$HOSTNAME_VALUE" ]; then
  echo "hostname is required" >&2
  exit 2
fi

if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(id -un)}"
fi

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_prerequisites() {
  if ! command -v git >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
    as_root sh -c 'command -v apt-get >/dev/null 2>&1 && apt-get update && apt-get install -y git ca-certificates curl || true'
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "git is required and could not be installed automatically" >&2
    exit 1
  fi
}

clone_or_update() {
  if [ -d "${APP_DIR}/.git" ]; then
    git -C "$APP_DIR" fetch --prune origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  elif [ -e "$APP_DIR" ] && [ "$(ls -A "$APP_DIR")" ]; then
    echo "${APP_DIR} exists and is not an empty git checkout" >&2
    exit 1
  else
    as_root mkdir -p "$(dirname "$APP_DIR")"
    as_root git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

compose() {
  docker compose -f docker-compose.yml -f docker-compose.staging.yml "$@"
}

ensure_prerequisites
clone_or_update
as_root bash "${APP_DIR}/scripts/provision-staging.sh" --app-dir "$APP_DIR" --app-user "$APP_USER" --hostname "$HOSTNAME_VALUE"
docker compose version >/dev/null
cd "$APP_DIR"

if compose pull; then
  echo "Using published image from GHCR."
  compose up -d --wait
else
  echo "Published image unavailable; building locally on this host."
  compose up -d --build --wait
fi

compose ps
bash "${APP_DIR}/scripts/setup-url.sh" --app-dir "$APP_DIR" || true
