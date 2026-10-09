#!/usr/bin/env bash
# Run all repo tests (Deno + Node + bats). Used by the git pre-push hook and manually.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

fail=0

# Required tools: missing any of them is a failure, not a silent skip,
# otherwise the pre-push hook would let untested code through.
for tool in deno bats fd node; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "missing required tool: $tool" >&2
		exit 1
	fi
done

pi_deno_test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/pi-deno-perms.XXXXXX")
pi_deno_test_tmp=$(cd "$pi_deno_test_tmp" && pwd -P)
node_tests_nul="$pi_deno_test_tmp/node-tests.nul"

cleanup_pi_deno_test_tmp() {
	rm -rf "$pi_deno_test_tmp"
}
trap cleanup_pi_deno_test_tmp EXIT

run() {
	local label=$1
	shift
	echo "==> $label"
	if ! "$@"; then
		echo "FAILED: $label" >&2
		fail=1
	fi
}

# Deno tests (pi extensions); *.node.test.mjs run below with node --experimental-vm-modules
run "deno test (pi/agent)" env \
	TMPDIR="$pi_deno_test_tmp" \
	PI_CODING_AGENT_DIR="$pi_deno_test_tmp/pi-agent" \
	deno test --no-prompt \
	--allow-read \
	--allow-env \
	--allow-sys=homedir \
	--allow-write="$pi_deno_test_tmp" \
	--quiet \
	--ignore='**/*.node.test.mjs' \
	pi/agent/tests/

if ! fd -H -0 -g '*.node.test.mjs' pi/agent/tests >"$node_tests_nul"; then
	echo "failed to discover pi/agent node tests (fd)" >&2
	exit 1
fi
node_agent_tests=()
while IFS= read -r -d '' file; do
	node_agent_tests+=("$file")
done <"$node_tests_nul"
if ((${#node_agent_tests[@]} > 0)); then
	run "node test (pi/agent *.node.test.mjs)" node --experimental-vm-modules --test "${node_agent_tests[@]}"
fi

# Deno tests (report skills)
# These are integration tests that spawn git/jj and re-exec deno (via the full
# Deno.execPath()) and write to temp dirs, so they need broad run/write access.
run "deno test (report skills)" deno test --allow-read --allow-write --allow-run --quiet \
	skills/review-report/tests/ \
	skills/implementation-report/tests/

impl_deno_tmp=$(mktemp -d "${TMPDIR:-/tmp}/impl-deno.XXXXXX")
impl_deno_tmp=$(cd "$impl_deno_tmp" && pwd -P)
run "deno test (impl history)" env \
	IMPL_TEST_SYMLINK=0 \
	TMPDIR="$impl_deno_tmp" \
	IMPL_TEST_ROOT="$impl_deno_tmp" \
	IMPL_RUNS_DIR="$impl_deno_tmp/impl-runs" \
	HOME="$impl_deno_tmp/home" \
	deno test --no-prompt --allow-read --allow-write="$impl_deno_tmp" --allow-env --quiet \
	skills/impl/tests/impl_history_test.ts

# Deno.symlink requires unscoped grants; only these fixture-only cases use them.
run "deno test (impl history symlink fixtures)" env \
	TMPDIR="$impl_deno_tmp" \
	IMPL_TEST_ROOT="$impl_deno_tmp" \
	IMPL_TEST_SYMLINK=1 \
	HOME="$impl_deno_tmp/home" \
	deno test --no-prompt --allow-read --allow-write --allow-env --quiet --filter symlink \
	skills/impl/tests/impl_history_test.ts

run "deno test (impl stream/events)" env \
	TMPDIR="$impl_deno_tmp" \
	IMPL_TEST_ROOT="$impl_deno_tmp" \
	IMPL_RUNS_DIR="$impl_deno_tmp/impl-runs" \
	HOME="$impl_deno_tmp/home" \
	deno test --no-prompt --allow-read --allow-write="$impl_deno_tmp" --allow-run --allow-env --quiet \
	skills/impl/tests/impl_stream_test.ts \
	skills/impl/tests/run_impl_events_test.ts

# bats tests
mapfile -d '' -t bats_files < <(fd -H -e bats -0 . pi/agent/tests skills fish/tests scripts/tests)
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
