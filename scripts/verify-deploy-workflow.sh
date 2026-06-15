#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_workflow="${repo_root}/.github/workflows/deploy.yml"
release_workflow="${repo_root}/.github/workflows/release.yml"
deploy_script="${repo_root}/scripts/deploy.sh"

run_actionlint() {
  if command -v actionlint >/dev/null 2>&1; then
    actionlint "${repo_root}/.github/workflows"/*.yml
  else
    nix run nixpkgs#actionlint -- "${repo_root}/.github/workflows"/*.yml
  fi
}

yq_eval() {
  if command -v yq >/dev/null 2>&1; then
    yq e "$@"
  else
    nix run nixpkgs#yq-go -- "$@"
  fi
}

assert_yq() {
  expression="${1:?expression required}"
  file="${2:?file required}"
  message="${3:?message required}"

  if [ "$(yq_eval "$expression" "$file")" != "true" ]; then
    printf 'assertion failed: %s\n' "$message" >&2
    printf 'expression: %s\n' "$expression" >&2
    exit 1
  fi
}

assert_no_latest_in_dispatch_deploy() {
  if yq_eval '.jobs.deploy-staging-a.steps[] | select(.name == "Resolve image") | .run' "$deploy_workflow" | grep -F 'inputs.tag' >/dev/null &&
    yq_eval '.jobs.deploy-staging-a.steps[] | select(.name == "Resolve image") | .run' "$deploy_workflow" | grep -F ':latest' >/dev/null; then
    printf 'assertion failed: rollback image resolution must not deploy latest\n' >&2
    exit 1
  fi
}

run_actionlint

assert_yq '."on".push.branches | (length == 1 and .[0] == "main")' "$deploy_workflow" "deploy workflow must run on pushes to main"
assert_yq '."on".workflow_dispatch.inputs.tag.required == true' "$deploy_workflow" "rollback tag input must be required"
assert_yq '.jobs."ci-gate".steps[].run | select(. == "nix develop -c just ci") | . == "nix develop -c just ci"' "$deploy_workflow" "ci-gate must run just ci"
assert_yq '[.jobs."ci-gate".steps[].run | select(. == "nix develop -c mix deps.get")] | length == 1' "$deploy_workflow" "ci-gate must fetch Elixir dependencies before just ci"
assert_yq '[.jobs."ci-gate".steps[].run | select(. == "nix develop -c bash -c '\''cd apps/yawp/assets && npm ci --legacy-peer-deps --no-audit --no-fund'\''")] | length == 1' "$deploy_workflow" "ci-gate must install web asset dependencies before just ci"
assert_yq '[.jobs."ci-gate".steps[].run | select(. == "nix develop -c bash -c '\''cd apps/yawp/assets/native && npm ci --legacy-peer-deps --no-audit --no-fund'\''")] | length == 1' "$deploy_workflow" "ci-gate must install React Native dependencies before just ci"
assert_yq '.jobs."build-image".needs == "ci-gate"' "$deploy_workflow" "build-image must need ci-gate"
assert_yq '.jobs."build-image".if | (contains("github.event_name") and contains("push"))' "$deploy_workflow" "build-image must be skipped for rollback dispatch"
assert_yq '.jobs."build-image".steps[] | select(.uses == "docker/build-push-action@v6") | .with.tags | (contains("github.sha") and contains(":latest"))' "$deploy_workflow" "build-image must push sha and latest"
assert_yq '.jobs."deploy-staging-a".needs | (length == 2 and .[0] == "ci-gate" and .[1] == "build-image")' "$deploy_workflow" "deploy-staging-a must need ci-gate and build-image"
assert_yq '.jobs."deploy-staging-b".needs == "deploy-staging-a"' "$deploy_workflow" "deploy-staging-b must need deploy-staging-a"
assert_yq '.jobs."deploy-staging-a".outputs.health | contains("steps.health-check.outcome")' "$deploy_workflow" "deploy-staging-a must expose health-check outcome"
assert_yq '.jobs."deploy-staging-b".if | (contains("needs.deploy-staging-a.outputs.health") and contains("success"))' "$deploy_workflow" "deploy-staging-b must be gated on staging A health success"
assert_yq '.jobs."deploy-staging-a".steps[] | select(.id == "image") | .run | (contains("inputs.tag") and contains("github.sha"))' "$deploy_workflow" "deploy-staging-a must thread rollback tag and push sha image"
assert_yq '.jobs."deploy-staging-b".steps[] | select(.id == "image") | .run | (contains("inputs.tag") and contains("github.sha"))' "$deploy_workflow" "deploy-staging-b must thread rollback tag and push sha image"
assert_yq '.jobs."deploy-staging-a".steps[] | select(.id == "health-check") | .run | (contains("scripts/deploy.sh") and contains("secrets.STAGING_A_HOST"))' "$deploy_workflow" "deploy-staging-a must invoke deploy script with staging A host secret"
assert_yq '.jobs."deploy-staging-b".steps[] | select(.run | type == "!!str") | .run | select(contains("scripts/deploy.sh")) | contains("secrets.STAGING_B_HOST")' "$deploy_workflow" "deploy-staging-b must invoke deploy script with staging B host secret"
assert_yq '[.jobs."deploy-staging-a".steps[] | select(.run | type == "!!str") | .run | select(contains("secrets.")) | contains("secrets.STAGING_SSH_KEY")] | any' "$deploy_workflow" "deploy-staging-a must install the staging SSH key secret"
assert_yq '[.jobs."deploy-staging-b".steps[] | select(.run | type == "!!str") | .run | select(contains("secrets.")) | contains("secrets.STAGING_SSH_KEY")] | any' "$deploy_workflow" "deploy-staging-b must install the staging SSH key secret"
assert_yq '.jobs."deploy-staging-a".steps[] | select(.id == "health-check") | .env.SSH_KEY_FILE == "~/.ssh/staging"' "$deploy_workflow" "deploy-staging-a must pass the SSH key file to deploy.sh"
assert_yq '.jobs."deploy-staging-b".steps[] | select(.run | type == "!!str") | select(.run | contains("scripts/deploy.sh")) | .env.SSH_KEY_FILE == "~/.ssh/staging"' "$deploy_workflow" "deploy-staging-b must pass the SSH key file to deploy.sh"
assert_no_latest_in_dispatch_deploy
assert_yq '.jobs."build-and-push".steps[] | select(.uses == "docker/build-push-action@v6") | .with.tags | (contains("github.ref_name") and (contains(":latest") | not))' "$release_workflow" "release workflow must publish only the literal v* tag"

secrets="$(
  grep -Rho 'secrets\.[A-Z_]*' "${repo_root}/.github/workflows"/*.yml | sort -u
)"
expected_secrets=$'secrets.GITHUB_TOKEN\nsecrets.STAGING_A_HOST\nsecrets.STAGING_B_HOST\nsecrets.STAGING_SSH_KEY'
if [ "$secrets" != "$expected_secrets" ]; then
  printf 'unexpected workflow secret references:\n%s\n' "$secrets" >&2
  exit 1
fi

if grep -RInE 'anchor-[ab]\.staging\.|([0-9]{1,3}\.){3}[0-9]{1,3}' "${repo_root}/.github/workflows" >/dev/null; then
  printf 'staging hostname or IP literal found in workflows\n' >&2
  exit 1
fi

if ! grep -F 'SSH_KEY_FILE' "$deploy_script" >/dev/null ||
  ! grep -F -- "-i \"\$key_file\"" "$deploy_script" >/dev/null ||
  ! grep -F -- '-o IdentitiesOnly=yes' "$deploy_script" >/dev/null ||
  ! grep -F -- '-o StrictHostKeyChecking=accept-new' "$deploy_script" >/dev/null; then
  printf 'deploy script does not explicitly consume SSH_KEY_FILE for ssh\n' >&2
  exit 1
fi

printf 'deploy workflow verification passed\n'
