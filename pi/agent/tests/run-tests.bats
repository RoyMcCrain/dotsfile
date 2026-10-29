#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
	PRODUCTION_RUN_TESTS="$REPO_ROOT/scripts/run_tests.sh"
	TEST_REPO="$BATS_TEST_TMPDIR/fake-repo"
	STUB_BIN="$TEST_REPO/bin"
	BUN_LOG="$BATS_TEST_TMPDIR/bun-args.log"
	NODE_LOG="$BATS_TEST_TMPDIR/node-args.log"
	BATS_LOG="$BATS_TEST_TMPDIR/bats-args.log"
	REAL_NODE=$(command -v node)
	REAL_FD=$(command -v fd)
	RUN_BASH=$BASH
	mkdir -p "$STUB_BIN" "$TEST_REPO/scripts" "$TEST_REPO/pi/agent/tests" \
		"$TEST_REPO/pi/agent/node_modules/.bin" "$TEST_REPO/fish/tests"
	for suite in parallel-review implementation-report review-report review-model-eval jev-audit impl; do
		mkdir -p "$TEST_REPO/skills/$suite/tests"
		: >"$TEST_REPO/skills/$suite/tests/sample_test.ts"
	done
	cp "$PRODUCTION_RUN_TESTS" "$TEST_REPO/scripts/run_tests.sh"
	for tool in dirname env mkdir mktemp rm; do ln -s "$(command -v "$tool")" "$STUB_BIN/$tool"; done
	ln -s "$RUN_BASH" "$STUB_BIN/bash"
	install_fd_stub
	install_tool_stubs
	write_minimal_fixture
}

install_fd_stub() {
	cat >"$STUB_BIN/fd" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *'*.node.test.mjs'* && -f "$TEST_REPO/fd-fail" ]]; then
	echo 'stub fd: node discovery failed' >&2
	exit 1
fi
exec "$REAL_FD" "\$@"
EOF
	chmod +x "$STUB_BIN/fd"
}

install_tool_stubs() {
	: >"$BUN_LOG"
	: >"$NODE_LOG"
	: >"$BATS_LOG"
	cat >"$STUB_BIN/bun" <<EOF
#!/usr/bin/env bash
{
	echo "ARGS:\$*"
	for key in HOME TMPDIR PI_CODING_AGENT_DIR XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME PI_REVIEW_SENTINEL; do
		eval 'value=\${'"\$key"'-}'
		echo "\$key:\$value"
	done
	[[ -d \${HOME-} && -d \${TMPDIR-} && -d \${PI_CODING_AGENT_DIR-} && -d \${XDG_CACHE_HOME-} && -d \${XDG_CONFIG_HOME-} && -d \${XDG_DATA_HOME-} && -d \${XDG_STATE_HOME-} ]]
	echo "PRIVATE_DIRS_EXIST:\$?"
} >>"$BUN_LOG"
[[ ! -f "$TEST_REPO/bun-fail" || "\$*" != *"\$(<"$TEST_REPO/bun-fail")"* ]]
EOF
	cat >"$STUB_BIN/node" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"$NODE_LOG"
exec "$REAL_NODE" "\$@"
EOF
	cat >"$STUB_BIN/bats" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"$BATS_LOG"
exit 0
EOF
	cat >"$TEST_REPO/pi/agent/node_modules/.bin/tsc" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"$TEST_REPO/tsc.log"
exit 0
EOF
	chmod +x "$STUB_BIN/bun" "$STUB_BIN/node" "$STUB_BIN/bats" "$TEST_REPO/pi/agent/node_modules/.bin/tsc"
	PATH="$STUB_BIN:$PATH"
	export PATH
}

write_minimal_fixture() {
	cat >"$TEST_REPO/pi/agent/tests/sample.node.test.mjs" <<'EOF'
import test from "node:test";
test("stub pass", () => {});
EOF
	printf '%s\n' 'import test from "node:test"; test("space path", () => {});' >"$TEST_REPO/pi/agent/tests/space name.node.test.mjs"
	: >"$TEST_REPO/pi/agent/tests/sample.test.ts"
	: >"$TEST_REPO/pi/agent/tests/stub.bats"
}

run_copied_run_tests() {
	run env PATH="$STUB_BIN" PI_REVIEW_SENTINEL=caller-secret "$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
}

assert_private_dirs_cleaned() {
	while IFS= read -r private_dir; do
		[ ! -e "$private_dir" ]
	done < <(rg '^(HOME|TMPDIR|PI_CODING_AGENT_DIR|XDG_CACHE_HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_STATE_HOME):' "$BUN_LOG" | cut -d: -f2- | sort -u)
}

@test "runner uses explicit absolute Bun paths, Node VM tests, and isolated skill environments" {
	run_copied_run_tests
	[ "$status" -eq 0 ]
	[[ "$(<"$NODE_LOG")" == *"--experimental-vm-modules --test"* ]]
	[[ "$(<"$NODE_LOG")" == *"space name.node.test.mjs"* ]]
	[ "$(rg -c '^ARGS:.*skills/' "$BUN_LOG")" -eq 6 ]
	[ "$(rg -c '^ARGS:.*pi/agent/tests/sample.test.ts' "$BUN_LOG")" -eq 1 ]
	if rg -q 'Deno|--allow-' "$BUN_LOG"; then false; fi
	while IFS= read -r keyline; do
		case "$keyline" in
		HOME:* | TMPDIR:* | PI_CODING_AGENT_DIR:* | XDG_CACHE_HOME:* | XDG_CONFIG_HOME:* | XDG_DATA_HOME:* | XDG_STATE_HOME:*)
			[[ "$keyline" == *"/pi-agent-tests."* || "$keyline" == *"/skills."* ]]
			;;
		PI_REVIEW_SENTINEL:) ;;
		PRIVATE_DIRS_EXIST:0) ;;
		*) false ;;
		esac
	done < <(rg '^(HOME|TMPDIR|PI_CODING_AGENT_DIR|XDG_CACHE_HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_STATE_HOME|PI_REVIEW_SENTINEL):' "$BUN_LOG")
	if rg -q 'caller-secret' "$BUN_LOG"; then false; fi
	[ "$(rg -c '^PRIVATE_DIRS_EXIST:0$' "$BUN_LOG")" -eq 7 ]
	[[ "$(<"$TEST_REPO/tsc.log")" == *"tsconfig.skills.json"* ]]
	assert_private_dirs_cleaned
}

@test "runner keeps caller TMPDIR and agent directory intact" {
	local caller_tmp="$BATS_TEST_TMPDIR/caller tmp" caller_agent="$BATS_TEST_TMPDIR/caller-agent"
	mkdir -p "$caller_tmp" "$caller_agent"
	echo keep >"$caller_tmp/sentinel"
	echo keep >"$caller_agent/sentinel"
	run env PATH="$STUB_BIN" TMPDIR="$caller_tmp" PI_CODING_AGENT_DIR="$caller_agent" \
		PI_REVIEW_SENTINEL=caller-secret "$RUN_BASH" "$TEST_REPO/scripts/run_tests.sh"
	[ "$status" -eq 0 ]
	[ "$(<"$caller_tmp/sentinel")" = keep ]
	[ "$(<"$caller_agent/sentinel")" = keep ]
	[[ "$(<"$caller_tmp/sentinel")" == keep ]]
	if rg -Fqx "TMPDIR:$caller_tmp" "$BUN_LOG" || rg -Fqx "PI_CODING_AGENT_DIR:$caller_agent" "$BUN_LOG" || rg -q 'caller-secret' "$BUN_LOG"; then false; fi
	[ "$(rg -c '^PRIVATE_DIRS_EXIST:0$' "$BUN_LOG")" -eq 7 ]
	assert_private_dirs_cleaned
}

@test "runner fails when Bun is missing from PATH and does not require Deno" {
	rm -f "$STUB_BIN/bun"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing required tool: bun"* ]]
}

@test "runner fails when Pi node_modules is missing" {
	rm -r "$TEST_REPO/pi/agent/node_modules"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing pi/agent/node_modules; run: bun install --cwd pi/agent"* ]]
	[ ! -s "$BUN_LOG" ]
}

@test "runner fails when Node is missing" {
	rm -f "$STUB_BIN/node"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing required tool: node"* ]]
}

@test "runner propagates Node failures and continues to later suites" {
	cat >"$STUB_BIN/node" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$NODE_LOG"
exit 1
EOF
	chmod +x "$STUB_BIN/node"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: node test (pi/agent *.node.test.mjs)"* ]]
	[ "$(rg -c '^ARGS:.*skills/' "$BUN_LOG")" -eq 6 ]
}

@test "runner reports fd discovery failure" {
	touch "$TEST_REPO/fd-fail"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"failed to discover pi/agent node tests (fd)"* ]]
}

@test "runner propagates Bun failures and continues to following suites and Bats" {
	printf 'parallel-review/tests/sample_test.ts' >"$TEST_REPO/bun-fail"
	run_copied_run_tests
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: bun test (skills/parallel-review)"* ]]
	[ "$(rg -c '^ARGS:.*skills/' "$BUN_LOG")" -eq 6 ]
	[ -s "$BATS_LOG" ]
	assert_private_dirs_cleaned
}
