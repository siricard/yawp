#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_script="${repo_root}/scripts/deploy.sh"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/yawp-deploy-test.XXXXXX")"

cleanup() {
  status=$?
  if [ -n "${server_pid:-}" ]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_dir"
  exit "$status"
}

trap cleanup EXIT

assert_contains() {
  haystack="${1:?haystack required}"
  needle="${2:?needle required}"

  if [[ "$haystack" != *"$needle"* ]]; then
    printf 'expected output to contain: %s\nactual output:\n%s\n' "$needle" "$haystack" >&2
    exit 1
  fi
}

find_port() {
  python3 - 8500 8599 <<'PY'
import socket
import sys

for port in range(int(sys.argv[1]), int(sys.argv[2]) + 1):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        raise SystemExit(0)
raise SystemExit("no free port")
PY
}

fake_bin="${tmp_dir}/bin"
mkdir -p "$fake_bin"
cat >"${fake_bin}/ssh" <<'SH'
#!/usr/bin/env bash
printf 'ssh must not be called during dry-run\n' >&2
exit 99
SH
chmod +x "${fake_bin}/ssh"

dry_run_output="$(
  PATH="${fake_bin}:$PATH" \
  DRY_RUN=1 \
  HEALTH_RETRIES=2 \
  HEALTH_INTERVAL_SECONDS=0 \
  HEALTH_CHECK_URL=https://anchor-a.staging.example/health \
  "$deploy_script" ghcr.io/example/yawp:abc123 deploy@fakehost
)"

assert_contains "$dry_run_output" "ssh target: deploy@fakehost"
assert_contains "$dry_run_output" "cd /opt/yawp"
assert_contains "$dry_run_output" "printf 'YAWP_IMAGE=%s\n' 'ghcr.io/example/yawp:abc123'"
assert_contains "$dry_run_output" "docker compose pull && docker compose up -d"
assert_contains "$dry_run_output" "scripts/deploy.sh --health-check 'https://anchor-a.staging.example/health'"

healthy_port="$(find_port)"
python3 - "$healthy_port" <<'PY' &
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import sys

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *_args):
        return

HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY
server_pid=$!

for _ in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${healthy_port}/health" >/dev/null; then
    break
  fi
  sleep 0.2
done

HEALTH_RETRIES=3 \
HEALTH_INTERVAL_SECONDS=0 \
HEALTH_TIMEOUT_SECONDS=1 \
"$deploy_script" --health-check "http://127.0.0.1:${healthy_port}/health"

closed_port="$(find_port)"
if HEALTH_RETRIES=2 \
  HEALTH_INTERVAL_SECONDS=0 \
  HEALTH_TIMEOUT_SECONDS=1 \
  "$deploy_script" --health-check "http://127.0.0.1:${closed_port}/health"; then
  printf 'closed-port health check unexpectedly succeeded\n' >&2
  exit 1
fi

printf 'deploy tests passed\n'
