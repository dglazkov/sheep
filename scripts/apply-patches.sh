#!/usr/bin/env bash
# Apply lamb's patch set to the pinned pi checkout in vendor/pi. Idempotent:
# a patch that already applies in reverse is already in.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
for patch in vendor/patches/*.patch; do
  if git -C vendor/pi apply --reverse --check "../../$patch" 2>/dev/null; then
    echo "already applied: $patch"
  else
    git -C vendor/pi apply "../../$patch"
    echo "applied: $patch"
  fi
done
