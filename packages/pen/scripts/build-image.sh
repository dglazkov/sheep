#!/usr/bin/env bash
# Builds the pen image as sheep-pen:dev. Run from anywhere; the context is
# packages/pen. Never pushes.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker build --tag sheep-pen:dev --file "$here/Dockerfile" "$here"
