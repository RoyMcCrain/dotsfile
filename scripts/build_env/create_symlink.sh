#!/usr/bin/env bash
# Compatibility entrypoint; all setup behavior lives in setup.sh.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
exec bash "$SCRIPT_DIR/setup.sh" "$@"
