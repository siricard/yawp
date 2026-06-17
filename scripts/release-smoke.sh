#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_name="yawp-release-smoke-${GITHUB_RUN_ID:-local}-$$"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/yawp-release-smoke.XXXXXX")"
env_file="${work_dir}/.env"
upload_file="${work_dir}/upload.bin"
download_file="${work_dir}/download.bin"
upload_response="${work_dir}/upload-response.json"
image_tag="yawp-release-smoke:${GITHUB_SHA:-local}"

compose() {
  docker compose --env-file "$env_file" -p "$project_name" -f "$repo_root/docker-compose.yml" "$@"
}

cleanup() {
  status=$?
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work_dir"
  exit "$status"
}

random_port() {
  python3 - "$@" <<'PY'
import socket
import sys

start = int(sys.argv[1])
end = int(sys.argv[2])
for port in range(start, end + 1):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        raise SystemExit(0)
raise SystemExit(f"no free port in {start}-{end}")
PY
}

secret_base64() {
  openssl rand -base64 "$1" | tr -d '\n'
}

trap cleanup EXIT

phx_port="$(random_port 4300 4399)"
http_port="$(random_port 8300 8399)"
https_port="$(random_port 8400 8499)"
postgres_password="$(openssl rand -hex 24)"
postgres_user="yawp"
postgres_db="yawp_prod"

cat >"$env_file" <<ENV
PHX_HOST=localhost
PHX_PORT=${phx_port}
HTTP_PORT=${http_port}
HTTPS_PORT=${https_port}
CADDY_TLS_SNIPPET=local_tls
SECRET_KEY_BASE=$(secret_base64 64)
TOKEN_SIGNING_SECRET=$(secret_base64 64)
CLOAK_KEY=$(secret_base64 32)
ATTACHMENT_SIGNING_SECRET=$(secret_base64 48)
UPLOADS_DIR=/data/uploads
POSTGRES_USER=${postgres_user}
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=${postgres_db}
YAWP_IMAGE=${image_tag}
ENV

printf 'release smoke project=%s phx_port=%s http_port=%s https_port=%s\n' \
  "$project_name" "$phx_port" "$http_port" "$https_port"

compose build phoenix
compose up -d --wait

base_url="https://localhost:${https_port}"
curl_flags=(-fsSk)

HEALTH_RETRIES=12 HEALTH_INTERVAL_SECONDS=1 HEALTH_TIMEOUT_SECONDS=5 HEALTH_INSECURE=1 \
  "$repo_root/scripts/deploy.sh" --health-check "${base_url}/health"
curl "${curl_flags[@]}" "${base_url}/version" >/dev/null
curl "${curl_flags[@]}" "${base_url}/.well-known/yawp/server-key.json" >/dev/null

setup_url="$(COMPOSE_PROJECT_NAME="$project_name" "$repo_root/scripts/setup-url.sh" --app-dir "$repo_root")"
case "$setup_url" in
  http://localhost:4000/admin/setup\?token=* | https://localhost:443/admin/setup\?token=*) ;;
  *)
    printf 'unexpected setup URL: %s\n' "$setup_url" >&2
    exit 1
    ;;
esac

python3 - "$upload_file" <<'PY'
import hashlib
import sys

path = sys.argv[1]
payload = b"yawp release smoke\n" + hashlib.sha256(path.encode()).digest()
with open(path, "wb") as fh:
    fh.write(payload)
PY

curl "${curl_flags[@]}" \
  -F "file=@${upload_file};type=application/octet-stream" \
  "${base_url}/api/uploads" >"$upload_response"

download_url="$(
  python3 - "$upload_response" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
print(data["download_url"])
PY
)"

download_path="$(
  python3 - "$download_url" <<'PY'
from urllib.parse import urlparse
import sys

parsed = urlparse(sys.argv[1])
if parsed.scheme != "https" or parsed.hostname != "localhost" or parsed.port not in (None, 443):
    raise SystemExit(f"unexpected download_url origin: {sys.argv[1]}")
path = parsed.path
if parsed.query:
    path += "?" + parsed.query
print(path)
PY
)"

curl "${curl_flags[@]}" "${base_url}${download_path}" -o "$download_file"

upload_sha="$(shasum -a 256 "$upload_file" | awk '{print $1}')"
download_sha="$(shasum -a 256 "$download_file" | awk '{print $1}')"

if [ "$upload_sha" != "$download_sha" ]; then
  printf 'sha256 mismatch: upload=%s download=%s\n' "$upload_sha" "$download_sha" >&2
  exit 1
fi

compose ps
printf 'release smoke passed sha256=%s\n' "$upload_sha"
