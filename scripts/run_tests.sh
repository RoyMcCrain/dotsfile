#!/usr/bin/env bash
# Run all repo tests (Deno + bats). Used by the git pre-push hook and manually.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

fail=0

# Required tools: missing any of them is a failure, not a silent skip,
# otherwise the pre-push hook would let untested code through.
for tool in deno bats fd; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "missing required tool: $tool" >&2
		exit 1
	fi
done

run() {
	local label=$1
	shift
	echo "==> $label"
	if ! "$@"; then
		echo "FAILED: $label" >&2
		fail=1
	fi
}

# Deno tests (pi extensions)
run "deno test (pi/agent)" deno test --allow-read --quiet pi/agent/tests/

# Deno tests (report skills)
# These are integration tests that spawn git/jj and re-exec deno (via the full
# Deno.execPath()) and write to temp dirs, so they need broad run/write access.
run "deno test (report skills)" deno test --allow-read --allow-write --allow-run --quiet \
	.agents/skills/review-report/tests/ \
	.agents/skills/implementation-report/tests/

# bats tests
mapfile -d '' -t bats_files < <(fd -H -e bats -0 . pi/agent/tests .agents/skills)
if [[ ${#bats_files[@]} -eq 0 ]]; then
	echo "no bats tests found" >&2
	exit 1
fi
for f in "${bats_files[@]}"; do
	run "bats $f" bats "$f"
done

if [[ $fail -ne 0 ]]; then
	echo "Tests failed." >&2
	exit 1
fi

echo "All tests passed."
