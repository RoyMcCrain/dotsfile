#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
RUNTIME="${EXPLAINER_RUNTIME:-$SKILL_DIR/runtime}"
export EXPLAINER_RUNTIME="$RUNTIME"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$RUNTIME/.browsers}"

usage() {
	echo "Usage: $0 setup|verify|build|figure|book [arguments...]" >&2
}

command_name="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
case "$command_name" in
setup)
	npm ci --ignore-scripts --no-audit --no-fund --prefix "$RUNTIME"
	"$RUNTIME/node_modules/.bin/playwright" install chromium
	;;
verify)
	exec node "$SCRIPT_DIR/verify-doc.mjs" "$@"
	;;
build)
	exec node "$SCRIPT_DIR/build-html.mjs" "$@"
	;;
figure)
	exec node "$SCRIPT_DIR/figure-check.mjs" "$@"
	;;
book)
	exec node "$SKILL_DIR/../explainer-book/scripts/verify-book.mjs" "$@"
	;;
*)
	usage
	exit 2
	;;
esac
