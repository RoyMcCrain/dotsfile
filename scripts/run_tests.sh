#!/usr/bin/env bash
# Run all repo tests (Bun + Node + bats). Bun has no Deno --allow-* sandbox.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"
fail=0

for tool in bats fd node bun; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "missing required tool: $tool" >&2
		exit 1
	fi
done

run_tmp=$(mktemp -d "${TMPDIR:-/tmp}/pi-agent-tests.XXXXXX")
run_tmp=$(cd "$run_tmp" && pwd -P)
cleanup_run_tmp() { rm -rf "$run_tmp"; }
trap cleanup_run_tmp EXIT
run() {
	local label=$1
	shift
	echo "==> $label"
	if ! "$@"; then
		echo "FAILED: $label" >&2
		fail=1
	fi
}
private_env() {
	mkdir -p "$run_tmp/$1/home" "$run_tmp/$1/tmp" "$run_tmp/$1/agent" \
		"$run_tmp/$1/cache" "$run_tmp/$1/config" "$run_tmp/$1/data" "$run_tmp/$1/state"
}
clean_run() {
	local label=$1 envdir=$2
	shift 2
	run "$label" env -i PATH="$PATH" HOME="$run_tmp/$envdir/home" \
		TMPDIR="$run_tmp/$envdir/tmp" PI_CODING_AGENT_DIR="$run_tmp/$envdir/agent" \
		XDG_CACHE_HOME="$run_tmp/$envdir/cache" XDG_CONFIG_HOME="$run_tmp/$envdir/config" \
		XDG_DATA_HOME="$run_tmp/$envdir/data" XDG_STATE_HOME="$run_tmp/$envdir/state" "$@"
}
if [[ ! -d "$REPO_ROOT/pi/agent/node_modules" ]]; then
	echo "missing pi/agent/node_modules; run: bun install --cwd pi/agent" >&2
	exit 1
fi
for suite in pi-agent skills; do private_env "$suite"; done
collect() {
	local out=$1 pattern=$2 label=$3
	shift 3
	if ! fd -H -0 -g "$pattern" "$@" >"$out"; then
		echo "failed to discover $label tests (fd)" >&2
		fail=1
		return 1
	fi
}
read_paths() {
	local input=$1 prefix=${2:-}
	local path
	while IFS= read -r -d '' path; do
		if [[ -n "$prefix" ]]; then REPLY_PATHS+=("$prefix/${path#./}"); else REPLY_PATHS+=("$path"); fi
	done <"$input"
}
REPLY_PATHS=()
pi_nul="$run_tmp/pi-tests.nul"
if collect "$pi_nul" '*.test.ts' 'pi/agent' pi/agent/tests; then
	read_paths "$pi_nul" "$REPO_ROOT"
fi
if ((${#REPLY_PATHS[@]} == 0)); then
	echo "no pi/agent TypeScript tests found" >&2
	fail=1
else
	clean_run "bun test (pi/agent)" pi-agent bun --config=/dev/null --no-env-file --no-install test "${REPLY_PATHS[@]}"
fi
run "tsc (pi/agent tests/assert.ts)" "$REPO_ROOT/pi/agent/node_modules/.bin/tsc" -p "$REPO_ROOT/pi/agent/tsconfig.json"
run "tsc (migrated skills)" "$REPO_ROOT/pi/agent/node_modules/.bin/tsc" -p "$REPO_ROOT/pi/agent/tsconfig.skills.json"
REPLY_PATHS=()
node_nul="$run_tmp/node-tests.nul"
node_tests=()
if collect "$node_nul" '*.node.test.mjs' 'pi/agent node' pi/agent/tests; then
	read_paths "$node_nul"
	node_tests=("${REPLY_PATHS[@]}")
fi
if ((${#node_tests[@]} == 0)); then
	echo "no pi/agent Node tests found" >&2
	fail=1
else
	run "node test (pi/agent *.node.test.mjs)" node --experimental-vm-modules --test "${node_tests[@]}"
fi

REPLY_PATHS=()
for suite in parallel-review implementation-report review-report review-model-eval jev-audit impl; do
	dir="skills/$suite/tests"
	nul="$run_tmp/$suite-tests.nul"
	files=()
	if collect "$nul" '*_test.ts' "$suite" "$dir"; then
		REPLY_PATHS=()
		read_paths "$nul" "$REPO_ROOT"
		files=("${REPLY_PATHS[@]}")
	fi
	if ((${#files[@]} == 0)); then
		echo "no TypeScript tests found for skills/$suite" >&2
		fail=1
		continue
	fi
	suite_env=()
	if [[ "$suite" == impl ]]; then
		mkdir -p "$run_tmp/skills/impl-runs"
		suite_env=(IMPL_TEST_ROOT="$run_tmp/skills/tmp" IMPL_RUNS_DIR="$run_tmp/skills/impl-runs" IMPL_TEST_SYMLINK=1)
	fi
	clean_run "bun test (skills/$suite)" skills "${suite_env[@]}" bun --config=/dev/null --no-env-file --no-install test "${files[@]}"
done
mapfile -d '' -t bats_files < <(fd -H -e bats -0 . pi/agent/tests skills fish/tests scripts/tests)
if [[ ${#bats_files[@]} -eq 0 ]]; then
	echo "no bats tests found" >&2
	fail=1
else
	for f in "${bats_files[@]}"; do run "bats $f" bats "$f"; done
fi
if [[ $fail -ne 0 ]]; then
	echo "Tests failed." >&2
	exit 1
fi
echo "All tests passed."
