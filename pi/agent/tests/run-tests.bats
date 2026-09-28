#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
	PRODUCTION_RUN_TESTS="$REPO_ROOT/scripts/run_tests.sh"
	TEST_REPO="$BATS_TEST_TMPDIR/fake-repo"
	STUB_BIN="$TEST_REPO/bin"
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
	for tool in dirname env mktemp rm; do
		ln -s "$(command -v "$tool")" "$STUB_BIN/$tool"
	done
	ln -s "$RUN_BASH" "$STUB_BIN/bash"
}

# First deno stub invocation in DENO_LOG (Pi suite is always first in run_tests.sh).
load_first_deno_log() {
	local -a deno_records
	mapfile -t -n 3 deno_records <"$DENO_LOG"
	PI_DENO_ARGS=${deno_records[0]#ARGS:}
	PI_DENO_TMPDIR=${deno_records[1]#TMPDIR:}
	PI_DENO_AGENT_DIR=${deno_records[2]#PI_CODING_AGENT_DIR:}
}

assert_pi_deno_flags() {
	[[ "$PI_DENO_ARGS" == *"pi/agent/tests"* ]]
	[[ "$PI_DENO_ARGS" == *"**/*.node.test.mjs"* ]]
	[[ "$PI_DENO_ARGS" == *"--allow-read"* ]]
	[[ "$PI_DENO_ARGS" == *"--allow-env"* ]]
	[[ "$PI_DENO_ARGS" == *"--allow-sys=homedir"* ]]
	[[ "$PI_DENO_ARGS" == *"--no-prompt"* ]]
	[[ "$PI_DENO_ARGS" == *"--allow-write="* ]]
	[[ "$PI_DENO_ARGS" != *"--allow-run"* ]]
	[[ "$PI_DENO_ARGS" != *"--allow-net"* ]]
	[[ "$PI_DENO_ARGS" != *"--allow-all"* ]]
	[[ "$PI_DENO_ARGS" != *" -A "* ]]
	[[ "$PI_DENO_ARGS" != *" -A" ]]
	# No bare --allow-write (Pi must use scoped --allow-write=PATH only).
	[[ ! "$PI_DENO_ARGS" =~ (^|[[:space:]])--allow-write([[:space:]]|$) ]]
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
	: >"$DENO_LOG"
	: >"$NODE_LOG"
	: >"$BATS_LOG"

	cat >"$STUB_BIN/deno" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	echo "TMPDIR:\${TMPDIR-}"
	echo "PI_CODING_AGENT_DIR:\${PI_CODING_AGENT_DIR-}"
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
	cat >"$TEST_REPO/pi/agent/tests/sample.node.test.mjs" <<'EOF'
import test from "node:test";
test("stub pass", () => {});
EOF
	printf '%s\n' 'import test from "node:test"; test("space path", () => {});' \
		>"$TEST_REPO/pi/agent/tests/space name.node.test.mjs"
	cat >"$TEST_REPO/pi/agent/tests/sample.test.ts" <<'EOF'
Deno.test("deno stub target", () => {});
EOF
	cat >"$TEST_REPO/pi/agent/tests/stub.bats" <<'EOF'
@test "fixture stub" { true; }
EOF
}

run_copied_run_tests() {
	# Only explicitly installed tools are visible, including on hosts with /usr/bin/node.
	run env PATH="$STUB_BIN" "$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
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

	load_first_deno_log
	assert_pi_deno_flags
	[[ -n "$PI_DENO_TMPDIR" ]]
	[[ "$PI_DENO_AGENT_DIR" == "$PI_DENO_TMPDIR/pi-agent" ]]
	[[ "$PI_DENO_ARGS" == *"--allow-write=$PI_DENO_TMPDIR"* ]]
	[[ ! -d "$PI_DENO_TMPDIR" ]]
	[[ ! -d "$PI_DENO_AGENT_DIR" ]]
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
		TMPDIR="$caller_tmp_link" \
		PI_CODING_AGENT_DIR="$caller_agent_dir" \
		"$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
	[ "$status" -eq 0 ]

	load_first_deno_log
	assert_pi_deno_flags
	[[ -n "$PI_DENO_TMPDIR" ]]
	[[ "$PI_DENO_TMPDIR" == "$canon_base"/* ]]
	[[ "$PI_DENO_ARGS" == *"--allow-write=$PI_DENO_TMPDIR"* ]]
	[[ "$PI_DENO_AGENT_DIR" == "$PI_DENO_TMPDIR/pi-agent" ]]
	[[ "$PI_DENO_AGENT_DIR" != "$caller_agent_dir" ]]
	[[ ! -d "$PI_DENO_TMPDIR" ]]
	[[ -f "$fixture_base/sentinel" ]]
	[[ "$(<"$fixture_base/sentinel")" == "caller-base-sentinel" ]]
	[[ -f "$caller_agent_dir/sentinel" ]]
	[[ "$(<"$caller_agent_dir/sentinel")" == "caller-agent-sentinel" ]]

	local -a deno_records
	mapfile -t deno_records <"$DENO_LOG"
	[[ "${deno_records[4]}" == "TMPDIR:$caller_tmp_link" ]]
	[[ "${deno_records[5]}" == "PI_CODING_AGENT_DIR:$caller_agent_dir" ]]
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
	mkdir -p "$TEST_REPO/skills/review-report/tests" "$TEST_REPO/skills/implementation-report/tests" "$TEST_REPO/fish/tests"

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

	load_first_deno_log
	[[ -n "$PI_DENO_TMPDIR" ]]
	[[ ! -d "$PI_DENO_TMPDIR" ]]
}

@test "copied run_tests.sh removes Pi Deno temp root after Pi Deno failure" {
	install_fd_stub 0
	install_tool_stubs pass
	write_minimal_fixture
	cat >"$STUB_BIN/deno" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	echo "TMPDIR:\${TMPDIR-}"
	echo "PI_CODING_AGENT_DIR:\${PI_CODING_AGENT_DIR-}"
} >> "$DENO_LOG"
if [[ "\$*" == *"pi/agent/tests"* ]]; then
	exit 1
fi
exit 0
EOF
	chmod +x "$STUB_BIN/deno"

	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: deno test (pi/agent)"* ]]

	load_first_deno_log
	[[ -n "$PI_DENO_TMPDIR" ]]
	[[ ! -d "$PI_DENO_TMPDIR" ]]
	[[ ! -d "$PI_DENO_AGENT_DIR" ]]
}
