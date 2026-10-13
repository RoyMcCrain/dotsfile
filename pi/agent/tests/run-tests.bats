#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
	PRODUCTION_RUN_TESTS="$REPO_ROOT/scripts/run_tests.sh"
	TEST_REPO="$BATS_TEST_TMPDIR/fake-repo"
	STUB_BIN="$TEST_REPO/bin"
	BUN_LOG="$BATS_TEST_TMPDIR/bun-args.log"
	DENO_LOG="$BATS_TEST_TMPDIR/deno-args.log"
	NODE_LOG="$BATS_TEST_TMPDIR/node-args.log"
	BATS_LOG="$BATS_TEST_TMPDIR/bats-args.log"
	REAL_NODE=$(command -v node)
	REAL_FD=$(command -v fd)
	# Same Bash that runs this bats file (run_tests.sh needs mapfile).
	RUN_BASH=$BASH

	mkdir -p \
		"$STUB_BIN" \
		"$TEST_REPO/scripts" \
		"$TEST_REPO/pi/agent/tests" \
		"$TEST_REPO/skills/review-report/tests" \
		"$TEST_REPO/skills/implementation-report/tests" \
		"$TEST_REPO/fish/tests"
	cp "$PRODUCTION_RUN_TESTS" "$TEST_REPO/scripts/run_tests.sh"
	for tool in dirname env mkdir mktemp rm; do
		ln -s "$(command -v "$tool")" "$STUB_BIN/$tool"
	done
	ln -s "$RUN_BASH" "$STUB_BIN/bash"
}

load_bun_log() {
	local -a bun_records
	mapfile -t -n 5 bun_records <"$BUN_LOG"
	PI_BUN_ARGS=${bun_records[0]#ARGS:}
	PI_BUN_TMPDIR=${bun_records[1]#TMPDIR:}
	PI_BUN_AGENT_DIR=${bun_records[2]#PI_CODING_AGENT_DIR:}
	PI_BUN_HOME=${bun_records[3]#HOME:}
	PI_BUN_SENTINEL=${bun_records[4]#SENTINEL:}
}

assert_pi_bun_args() {
	[[ "$PI_BUN_ARGS" == *"--no-install"* ]]
	[[ "$PI_BUN_ARGS" == *" test "* ]]
	[[ "$PI_BUN_ARGS" == *"sample.test.ts"* ]]
	[[ "$PI_BUN_ARGS" != *".node.test.mjs"* ]]
	[[ "$PI_BUN_ARGS" != *"--allow-"* ]]
	[[ -n "$PI_BUN_TMPDIR" ]]
	[[ "$PI_BUN_AGENT_DIR" == "$PI_BUN_TMPDIR/pi-agent" ]]
	[[ "$PI_BUN_HOME" == "$PI_BUN_TMPDIR/home" ]]
	[[ -z "$PI_BUN_SENTINEL" ]]
}

install_fd_stub() {
	local node_fail=${1:-0}
	cat >"$STUB_BIN/fd" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\$*" == *'*.node.test.mjs'* ]]; then
	if [[ "$node_fail" -eq 1 ]]; then
		echo "stub fd: node discovery failed" >&2
		exit 1
	fi
	exec "$REAL_FD" "\$@"
fi
exec "$REAL_FD" "\$@"
EOF
	chmod +x "$STUB_BIN/fd"
}

install_tool_stubs() {
	local node_mode=${1:-pass}
	local bun_mode=${2:-pass}
	: >"$BUN_LOG"
	: >"$DENO_LOG"
	: >"$NODE_LOG"
	: >"$BATS_LOG"

	if [[ "$bun_mode" == "omit" ]]; then
		rm -f "$STUB_BIN/bun"
	else
		cat >"$STUB_BIN/bun" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	echo "TMPDIR:\${TMPDIR-}"
	echo "PI_CODING_AGENT_DIR:\${PI_CODING_AGENT_DIR-}"
	echo "HOME:\${HOME-}"
	echo "SENTINEL:\${PI_REVIEW_SENTINEL-}"
} >> "$BUN_LOG"
exit 0
EOF
		chmod +x "$STUB_BIN/bun"
	fi

	cat >"$STUB_BIN/deno" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	echo "TMPDIR:\${TMPDIR-}"
	echo "PI_CODING_AGENT_DIR:\${PI_CODING_AGENT_DIR-}"
	echo "HOME:\${HOME-}"
	echo "SENTINEL:\${PI_REVIEW_SENTINEL-}"
} >> "$DENO_LOG"
exit 0
EOF
	chmod +x "$STUB_BIN/deno"

	cat >"$STUB_BIN/bats" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$BATS_LOG"
exit 0
EOF
	chmod +x "$STUB_BIN/bats"

	if [[ "$node_mode" == "pass" ]]; then
		cat >"$STUB_BIN/node" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$NODE_LOG"
exec "$REAL_NODE" "\$@"
EOF
		chmod +x "$STUB_BIN/node"
	elif [[ "$node_mode" == "omit" ]]; then
		rm -f "$STUB_BIN/node"
	else
		cat >"$STUB_BIN/node" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$NODE_LOG"
exit 1
EOF
		chmod +x "$STUB_BIN/node"
	fi
}

write_minimal_fixture() {
	mkdir -p "$TEST_REPO/pi/agent/node_modules/.bin"
	cat >"$TEST_REPO/pi/agent/node_modules/.bin/tsc" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	chmod +x "$TEST_REPO/pi/agent/node_modules/.bin/tsc"
	cat >"$TEST_REPO/pi/agent/tests/sample.node.test.mjs" <<'EOF'
import test from "node:test";
test("stub pass", () => {});
EOF
	printf '%s\n' 'import test from "node:test"; test("space path", () => {});' \
		>"$TEST_REPO/pi/agent/tests/space name.node.test.mjs"
	cat >"$TEST_REPO/pi/agent/tests/sample.test.ts" <<'EOF'
test("bun stub target", () => {});
EOF
	cat >"$TEST_REPO/pi/agent/tests/stub.bats" <<'EOF'
@test "fixture stub" { true; }
EOF
}

run_copied_run_tests() {
	# Only explicitly installed tools are visible, including on hosts with /usr/bin/node.
	run env PATH="$STUB_BIN" PI_REVIEW_SENTINEL=caller-secret "$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
}

@test "copied run_tests.sh discovers node tests and passes vm flag to node" {
	install_fd_stub 0
	install_tool_stubs pass
	write_minimal_fixture

	run_copied_run_tests
	[ "$status" -eq 0 ]

	node_args=$(<"$NODE_LOG")
	[[ "$node_args" == *"--experimental-vm-modules"* ]]
	[[ "$node_args" == *"--test"* ]]
	[[ "$node_args" == *"sample.node.test.mjs"* ]]
	[[ "$node_args" == *"space name.node.test.mjs"* ]]

	load_bun_log
	assert_pi_bun_args
	[[ "$PI_BUN_ARGS" == *"$TEST_REPO/pi/agent/tests/sample.test.ts"* ]]
	[[ ! -d "$PI_BUN_TMPDIR" ]]
	[[ ! -d "$PI_BUN_AGENT_DIR" ]]
}

@test "copied run_tests.sh canonicalizes Pi temp and leaves caller TMPDIR and agent dir unchanged" {
	install_fd_stub 0
	install_tool_stubs pass
	write_minimal_fixture

	local fixture_base="$BATS_TEST_TMPDIR/caller base/fixture-temp"
	local caller_tmp_link="$BATS_TEST_TMPDIR/caller base/tmp link"
	local caller_agent_dir="$BATS_TEST_TMPDIR/caller-agent-dir"
	mkdir -p "$fixture_base" "$caller_agent_dir"
	echo caller-base-sentinel >"$fixture_base/sentinel"
	echo caller-agent-sentinel >"$caller_agent_dir/sentinel"
	ln -s "$fixture_base" "$caller_tmp_link"
	canon_base=$(cd "$fixture_base" && pwd -P)

	run env \
		PATH="$STUB_BIN" \
		PI_REVIEW_SENTINEL=caller-secret \
		TMPDIR="$caller_tmp_link" \
		PI_CODING_AGENT_DIR="$caller_agent_dir" \
		"$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
	[ "$status" -eq 0 ]

	load_bun_log
	assert_pi_bun_args
	[[ "$PI_BUN_TMPDIR" == "$canon_base"/* ]]
	[[ "$PI_BUN_AGENT_DIR" != "$caller_agent_dir" ]]
	[[ ! -d "$PI_BUN_TMPDIR" ]]
	[[ -f "$fixture_base/sentinel" ]]
	[[ "$(<"$fixture_base/sentinel")" == "caller-base-sentinel" ]]
	[[ -f "$caller_agent_dir/sentinel" ]]
	[[ "$(<"$caller_agent_dir/sentinel")" == "caller-agent-sentinel" ]]

	local -a deno_records
	mapfile -t deno_records <"$DENO_LOG"
	[[ "${deno_records[1]}" == "TMPDIR:$caller_tmp_link" ]]
	[[ "${deno_records[2]}" == "PI_CODING_AGENT_DIR:$caller_agent_dir" ]]
	[[ "${deno_records[3]}" == "HOME:$HOME" ]]
	[[ "${deno_records[4]}" == "SENTINEL:caller-secret" ]]
	[[ "$PI_BUN_HOME" == "$PI_BUN_TMPDIR/home" ]]
	[[ "$PI_BUN_HOME" != "$HOME" ]]
}

@test "copied run_tests.sh fails when bun is missing from PATH" {
	install_fd_stub 0
	install_tool_stubs pass omit
	write_minimal_fixture

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing required tool: bun"* ]]
}

@test "copied run_tests.sh fails when Pi node_modules is missing" {
	install_fd_stub 0
	install_tool_stubs pass
	write_minimal_fixture
	rm -rf "$TEST_REPO/pi/agent/node_modules"

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing pi/agent/node_modules; run: bun install --cwd pi/agent"* ]]
	[[ ! -s "$BUN_LOG" ]]
}

@test "copied run_tests.sh fails when node is missing from PATH" {
	install_fd_stub 0
	install_tool_stubs omit
	write_minimal_fixture

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing required tool: node"* ]]
}

@test "copied run_tests.sh propagates failing node tests" {
	install_fd_stub 0
	install_tool_stubs pass
	cat >"$TEST_REPO/pi/agent/tests/sample.test.ts" <<'EOF'
test("bun stub target", () => {});
EOF
	cat >"$TEST_REPO/pi/agent/tests/fail.node.test.mjs" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
test("stub fail", () => {
  assert.fail("expected failure");
});
EOF
	cat >"$TEST_REPO/pi/agent/tests/stub.bats" <<'EOF'
@test "fixture stub" { true; }
EOF
	mkdir -p \
		"$TEST_REPO/pi/agent/node_modules" \
		"$TEST_REPO/skills/review-report/tests" \
		"$TEST_REPO/skills/implementation-report/tests" \
		"$TEST_REPO/fish/tests"

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: node test (pi/agent *.node.test.mjs)"* ]]
}

@test "copied run_tests.sh fails when fd cannot discover node tests" {
	install_fd_stub 1
	install_tool_stubs pass
	write_minimal_fixture

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"failed to discover pi/agent node tests (fd)"* ]]

	load_bun_log
	[[ -n "$PI_BUN_TMPDIR" ]]
	[[ ! -d "$PI_BUN_TMPDIR" ]]
}

@test "copied run_tests.sh removes Pi temp root after Bun failure" {
	install_fd_stub 0
	install_tool_stubs pass
	write_minimal_fixture
	cat >"$STUB_BIN/bun" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	echo "TMPDIR:\${TMPDIR-}"
	echo "PI_CODING_AGENT_DIR:\${PI_CODING_AGENT_DIR-}"
	echo "HOME:\${HOME-}"
	echo "SENTINEL:\${PI_REVIEW_SENTINEL-}"
} >> "$BUN_LOG"
exit 1
EOF
	chmod +x "$STUB_BIN/bun"

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: bun test (pi/agent)"* ]]

	load_bun_log
	[[ -n "$PI_BUN_TMPDIR" ]]
	[[ ! -d "$PI_BUN_TMPDIR" ]]
	[[ ! -d "$PI_BUN_AGENT_DIR" ]]
}
