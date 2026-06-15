#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_a="${STAGING_SIM_PROJECT_A:-yawp-staging-sim-a}"
project_b="${STAGING_SIM_PROJECT_B:-yawp-staging-sim-b}"
work_dir="${STAGING_SIM_WORK_DIR:-${repo_root}/.cache/staging-sim}"
env_a="${work_dir}/anchor-a.env"
env_b="${work_dir}/anchor-b.env"
result_json="${work_dir}/result.json"
override_file="${work_dir}/compose.override.yml"
image_tag="${STAGING_SIM_IMAGE:-yawp-staging-sim:local}"
anchor_a_host="host.docker.internal:4400"
anchor_b_host="host.docker.internal:4500"
anchor_a_url="http://localhost:4400"
anchor_b_url="http://localhost:4500"
sim_network="yawp-staging-sim"

compose_a() {
  docker compose --env-file "$env_a" -p "$project_a" -f "$repo_root/docker-compose.yml" -f "$override_file" "$@"
}

compose_b() {
  docker compose --env-file "$env_b" -p "$project_b" -f "$repo_root/docker-compose.yml" -f "$override_file" "$@"
}

secret_base64() {
  openssl rand -base64 "$1" | tr -d '\n'
}

elixir_string() {
  python3 - "$1" <<'PY'
import json
import sys

print(json.dumps(sys.argv[1]))
PY
}

write_env() {
  local path="$1"
  local host="$2"
  local phx_port="$3"
  local http_port="$4"
  local https_port="$5"
  local db_name="$6"
  local pg_secret
  pg_secret="$(openssl rand -hex 24)"

  cat >"$path" <<ENV
PHX_HOST=localhost
PHX_PORT=${phx_port}
PHX_BIND_HOST=0.0.0.0
HTTP_PORT=${http_port}
HTTPS_PORT=${https_port}
CADDY_TLS_SNIPPET=local_tls
SECRET_KEY_BASE=$(secret_base64 64)
TOKEN_SIGNING_SECRET=$(secret_base64 64)
CLOAK_KEY=$(secret_base64 32)
ATTACHMENT_SIGNING_SECRET=$(secret_base64 48)
UPLOADS_DIR=/data/uploads
POSTGRES_USER=yawp
POSTGRES_PASSWORD=${pg_secret}
POSTGRES_DB=${db_name}
YAWP_IMAGE=${image_tag}
YAWP_FEDERATION_ANCHOR_ID=${host}
ENV
}

claim_token() {
  local project="$1"
  local email="$2"
  local account_secret code
  account_secret="$(openssl rand -hex 18)"
  code="
      email = $(elixir_string "$email")
      password = $(elixir_string "$account_secret")
      {:ok, account} =
        Yawp.Admin.create_account(%{
          email: email,
          password: password,
          password_confirmation: password
        }, authorize?: false)
      {:ok, token} = Yawp.Admin.generate_claim_token(%{created_by_account_id: account.id})
      IO.puts(token.token)
    "

  docker compose -p "$project" exec -T \
    phoenix \
    /app/bin/yawp rpc "$code" | tr -d '\r'
}

push_ppe() {
  local project="$1"
  local peer_host="$2"
  local ppe_json="$3"
  local ppe_b64 code
  ppe_b64="$(printf '%s' "$ppe_json" | base64 | tr -d '\n')"
  code="
      ppe = $(elixir_string "$ppe_b64") |> Base.decode64!() |> Jason.decode!()
      _peer = $(elixir_string "$peer_host")
      {:ok, status} = Yawp.Identity.apply_ppe_if_newer(ppe)
      IO.puts(Jason.encode!(%{status: status}))
    "

  docker compose -p "$project" exec -T \
    phoenix \
    /app/bin/yawp rpc "$code"
}

pull_inbox() {
  local project="$1"
  local did="$2"
  local code
  code="
      did = $(elixir_string "$did")
      {:ok, entries} = Yawp.Federation.pull_inbox(did, 0, 20)
      payload =
        Enum.map(entries, fn entry ->
          %{
            envelope_id: entry.envelope_id,
            conversation_id: entry.conversation_id,
            inbox_serial: entry.inbox_serial,
            body: entry.envelope[\"body\"]
          }
        end)
      IO.puts(Jason.encode!(payload))
    "

  docker compose -p "$project" exec -T \
    phoenix \
    /app/bin/yawp rpc "$code"
}

set_anchor_id() {
  local project="$1"
  local anchor="$2"
  docker compose -p "$project" exec -T phoenix \
    /app/bin/yawp rpc "Application.put_env(:yawp, Yawp.Federation.Client, [anchor_id: $(elixir_string "$anchor")])"
}

extract_json() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
value = data
for part in sys.argv[2].split("."):
    value = value[part]
print(json.dumps(value, separators=(",", ":")) if isinstance(value, (dict, list)) else value)
PY
}

down() {
  compose_a down -v --remove-orphans || true
  compose_b down -v --remove-orphans || true
  docker network rm "$sim_network" >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--down" ]]; then
  mkdir -p "$work_dir"
  [ -f "$env_a" ] || write_env "$env_a" "$anchor_a_host" 4400 8500 8600 yawp_staging_sim_a
  [ -f "$env_b" ] || write_env "$env_b" "$anchor_b_host" 4500 8501 8601 yawp_staging_sim_b
  export STAGING_SIM_ALIAS=anchor-a
  down
  exit 0
fi

trap down EXIT

mkdir -p "$work_dir"
write_env "$env_a" "$anchor_a_host" 4400 8500 8600 yawp_staging_sim_a
write_env "$env_b" "$anchor_b_host" 4500 8501 8601 yawp_staging_sim_b
docker network create "$sim_network" >/dev/null 2>&1 || true
cat >"$override_file" <<YAML
services:
  phoenix:
    networks:
      default:
      staging_sim:
        aliases:
          - \${STAGING_SIM_ALIAS}
networks:
  staging_sim:
    external: true
    name: ${sim_network}
YAML

printf 'staging sim projects: %s %s\n' "$project_a" "$project_b"
export STAGING_SIM_ALIAS=anchor-a
compose_a build phoenix
compose_a up -d --wait
export STAGING_SIM_ALIAS=anchor-b
compose_b up -d --wait
docker compose -p "$project_a" exec -T phoenix curl -fsS "http://${anchor_b_host}/health" >/dev/null
docker compose -p "$project_b" exec -T phoenix curl -fsS "http://${anchor_a_host}/health" >/dev/null
set_anchor_id "$project_a" "$anchor_a_host"
set_anchor_id "$project_b" "$anchor_b_host"

key_a="$(curl -fsS "${anchor_a_url}/.well-known/yawp/server-key.json")"
key_b="$(curl -fsS "${anchor_b_url}/.well-known/yawp/server-key.json")"

if [ "$key_a" = "$key_b" ]; then
  printf 'server-key documents unexpectedly match\n' >&2
  exit 1
fi
printf 'server-key documents differ\n'

claim_a="$(claim_token "$project_a" "staging-sim-a@example.invalid")"
claim_b="$(claim_token "$project_b" "staging-sim-b@example.invalid")"

NODE_TLS_REJECT_UNAUTHORIZED=0 node "$repo_root/scripts/staging-sim.mjs" \
  --anchor-a "$anchor_a_url" \
  --anchor-b "$anchor_b_url" \
  --advertised-a "$anchor_a_host" \
  --advertised-b "$anchor_b_host" \
  --claim-a "$claim_a" \
  --claim-b "$claim_b" \
  --prepare >"$result_json"

alice_ppe="$(extract_json "$result_json" "ppes.alice")"
bob_ppe="$(extract_json "$result_json" "ppes.bob")"
bob_did="$(extract_json "$result_json" "bob.did")"

push_ppe "$project_a" "$anchor_b_host" "$bob_ppe"
push_ppe "$project_a" "$anchor_b_host" "$alice_ppe"
push_ppe "$project_b" "$anchor_a_host" "$alice_ppe"
push_ppe "$project_b" "$anchor_a_host" "$bob_ppe"

NODE_TLS_REJECT_UNAUTHORIZED=0 node "$repo_root/scripts/staging-sim.mjs" \
  --anchor-a "$anchor_a_url" \
  --anchor-b "$anchor_b_url" \
  --advertised-a "$anchor_a_host" \
  --advertised-b "$anchor_b_host" \
  --input "$result_json" >"$result_json.tmp"
mv "$result_json.tmp" "$result_json"
envelope_id="$(extract_json "$result_json" "dm.envelopeId")"

inbox_json="[]"
for _ in $(seq 1 30); do
  inbox_json="$(pull_inbox "$project_b" "$bob_did")"
  if python3 - "$inbox_json" "$envelope_id" <<'PY'
import json
import sys

entries = json.loads(sys.argv[1])
target = sys.argv[2]
raise SystemExit(0 if any(entry.get("envelope_id") == target for entry in entries) else 1)
PY
  then
    printf 'cross-stack DM delivered to stack B inbox\n'
    printf '%s\n' "$inbox_json"
    compose_a ps
    compose_b ps
    exit 0
  fi
  sleep 1
done

printf 'DM %s did not appear in B inbox; last inbox=%s\n' "$envelope_id" "$inbox_json" >&2
exit 1
