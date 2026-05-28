#!/usr/bin/env bash
#
# Install Yawp's git hooks into .git/hooks. Idempotent.
# Run once after cloning the repo.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
src="$repo_root/scripts/git-hooks"
dst="$repo_root/.git/hooks"

mkdir -p "$dst"
for hook in "$src"/*; do
  name="$(basename "$hook")"
  install -m 0755 "$hook" "$dst/$name"
  echo "installed: $dst/$name"
done
