#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/yawp"
APP_USER="yawp"
HOSTNAME_VALUE="anchor-a.staging.example"
HTTP_PORT_VALUE="80"
HTTPS_PORT_VALUE="443"
PHX_PORT_VALUE=""
CADDY_TLS_SNIPPET_VALUE="public_tls"
DRY_RUN=0
PRINT_ENV=0

usage() {
  cat <<'EOF'
Usage: scripts/provision-staging.sh [--dry-run] [--app-dir PATH] [--app-user USER] [--hostname HOSTNAME] [--print-env]

Prepares a Debian or Ubuntu host for a Yawp staging anchor.

Options:
  --dry-run            Print the full plan without changing the host.
  --app-dir PATH       Application directory to create. Default: /opt/yawp
  --app-user USER      Unix user that owns the application directory. Default: yawp
  --hostname HOSTNAME  PHX_HOST value written to a new .env. Default: anchor-a.staging.example
  --http-port PORT     Host HTTP port for Caddy. Default: 80
  --https-port PORT    Host HTTPS port for Caddy. Default: 443
  --phx-port PORT      Optional loopback Phoenix host port for local checks.
  --tls-snippet NAME    Caddy TLS snippet name. Default: public_tls
  --print-env          Print a generated .env to stdout and exit without host changes.
  -h, --help           Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --app-dir)
      APP_DIR="${2:?--app-dir requires a path}"
      shift 2
      ;;
    --app-user)
      APP_USER="${2:?--app-user requires a user}"
      shift 2
      ;;
    --hostname)
      HOSTNAME_VALUE="${2:?--hostname requires a hostname}"
      shift 2
      ;;
    --http-port)
      HTTP_PORT_VALUE="${2:?--http-port requires a port}"
      shift 2
      ;;
    --https-port)
      HTTPS_PORT_VALUE="${2:?--https-port requires a port}"
      shift 2
      ;;
    --phx-port)
      PHX_PORT_VALUE="${2:?--phx-port requires a port}"
      shift 2
      ;;
    --tls-snippet)
      CADDY_TLS_SNIPPET_VALUE="${2:?--tls-snippet requires a name}"
      shift 2
      ;;
    --print-env)
      PRINT_ENV=1
      shift
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

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

rand_base64() {
  openssl rand -base64 "$1" | tr -d '\n'
}

generate_env() {
  if [ -n "$PHX_PORT_VALUE" ]; then
    phx_port_line="PHX_PORT=${PHX_PORT_VALUE}"
  else
    phx_port_line=""
  fi

  pg_secret="$(rand_base64 32)"

  cat <<EOF
PHX_HOST=${HOSTNAME_VALUE}
${phx_port_line}
HTTP_PORT=${HTTP_PORT_VALUE}
HTTPS_PORT=${HTTPS_PORT_VALUE}
CADDY_TLS_SNIPPET=${CADDY_TLS_SNIPPET_VALUE}
SECRET_KEY_BASE=$(rand_base64 64)
TOKEN_SIGNING_SECRET=$(rand_base64 64)
CLOAK_KEY=$(rand_base64 32)
ATTACHMENT_SIGNING_SECRET=$(rand_base64 48)
UPLOADS_DIR=/data/uploads
POSTGRES_USER=yawp
POSTGRES_PASSWORD=${pg_secret}
POSTGRES_DB=yawp_prod
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
EOF
}

print_plan() {
  cat <<EOF
Yawp staging provisioning plan

Host preparation:
  1. Verify this host is Debian or Ubuntu.
  2. Install Docker Engine and Compose v2 when docker compose is missing.
  3. Create the ${APP_USER} user when it does not exist.
  4. Create ${APP_DIR} and make ${APP_USER} its owner.
  5. Create ${APP_DIR}/.env with generated secrets when it does not exist.
  6. Leave existing Docker, users, directories, and .env files unchanged.

Operator follow-up:
  1. Copy docker-compose.yml, docker-compose.staging.yml, and Caddyfile into ${APP_DIR}.
  2. Confirm DNS points ${HOSTNAME_VALUE} at this host.
  3. Allow inbound 22/tcp, 80/tcp, and 443/tcp only.
  4. Run: cd ${APP_DIR} && docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait

Firewall hints:
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw deny 4000/tcp
  sudo ufw enable
  sudo ufw status verbose
EOF
}

ensure_supported_os() {
  if [ ! -r /etc/os-release ]; then
    echo "Cannot read /etc/os-release" >&2
    exit 1
  fi

  os_id="$(awk -F= '$1 == "ID" { gsub(/"/, "", $2); print $2 }' /etc/os-release)"
  os_like="$(awk -F= '$1 == "ID_LIKE" { gsub(/"/, "", $2); print $2 }' /etc/os-release)"

  case " ${os_id} ${os_like} " in
    *" debian "* | *" ubuntu "*)
      ;;
    *)
      echo "This script supports Debian and Ubuntu hosts only." >&2
      exit 1
      ;;
  esac
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker Engine with Compose v2 already installed."
    return
  fi

  run sh -c "curl -fsSL https://get.docker.com | sh"
}

ensure_user() {
  if id "$APP_USER" >/dev/null 2>&1; then
    echo "User ${APP_USER} already exists."
  else
    run useradd --system --create-home --shell /bin/bash "$APP_USER"
  fi

  if groups "$APP_USER" | grep -Eq '(^| )docker( |$)'; then
    echo "User ${APP_USER} is already in the docker group."
  else
    run usermod -aG docker "$APP_USER"
  fi
}

ensure_app_dir() {
  if [ -d "$APP_DIR" ]; then
    echo "Directory ${APP_DIR} already exists."
  else
    run mkdir -p "$APP_DIR"
  fi

  run chown "$APP_USER:$APP_USER" "$APP_DIR"
  run chmod 750 "$APP_DIR"
}

ensure_env_file() {
  env_path="${APP_DIR}/.env"

  if [ -f "$env_path" ]; then
    echo "${env_path} already exists; leaving it unchanged."
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] create ${env_path} with generated secrets for ${HOSTNAME_VALUE}"
    return
  fi

  tmp_env="$(mktemp)"
  generate_env >"$tmp_env"
  install -m 600 -o "$APP_USER" -g "$APP_USER" "$tmp_env" "$env_path"
  rm -f "$tmp_env"
}

if [ "$PRINT_ENV" -eq 1 ]; then
  generate_env
  exit 0
fi

print_plan

if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

ensure_supported_os
install_docker_if_missing
ensure_user
ensure_app_dir
ensure_env_file

cat <<EOF

Provisioning complete.

Next:
  cd ${APP_DIR}
  docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
EOF
