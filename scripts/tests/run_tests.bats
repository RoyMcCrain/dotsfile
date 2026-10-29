#!/usr/bin/env bats
set -o pipefail

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/runner-fixture"
	REPO="$TEST_ROOT/repo"
	BIN="$TEST_ROOT/bin"
	LOG="$TEST_ROOT/bun.jsonl"
	REAL_FD=$(command -v fd)
	mkdir -p "$REPO/scripts/tests" "$REPO/pi/agent/node_modules/.bin" "$BIN"
	cp "$BATS_TEST_DIRNAME/../run_tests.sh" "$REPO/scripts/run_tests.sh"
	chmod +x "$REPO/scripts/run_tests.sh"
	for dir in skills/review-report/tests skills/implementation-report/tests skills/impl/tests skills/parallel-review/tests skills/review-model-eval/tests skills/jev-audit/tests pi/agent/tests fish/tests; do
		mkdir -p "$REPO/$dir"
	done
	: >"$REPO/pi/agent/tests/fixture.test.ts"
	: >"$REPO/pi/agent/tests/fixture.node.test.mjs"
	: >"$REPO/scripts/tests/fixture.bats"
	for suite in parallel-review implementation-report review-report review-model-eval jev-audit impl; do
		: >"$REPO/skills/$suite/tests/fixture_test.ts"
	done
	cat >"$BIN/bun" <<EOF
#!/usr/bin/env bash
jq -cn \\
	--arg home "\${HOME-}" --arg tmpdir "\${TMPDIR-}" \\
	--arg pi_dir "\${PI_CODING_AGENT_DIR-}" \\
	--argjson env_dirs_exist "\$([[ -d \${HOME-} && -d \${TMPDIR-} && -d \${PI_CODING_AGENT_DIR-} && -d \${XDG_CACHE_HOME-} && -d \${XDG_CONFIG_HOME-} && -d \${XDG_DATA_HOME-} && -d \${XDG_STATE_HOME-} ]] && echo true || echo false)" \\
	--arg xdg_cache "\${XDG_CACHE_HOME-}" --arg xdg_config "\${XDG_CONFIG_HOME-}" \\
	--arg xdg_data "\${XDG_DATA_HOME-}" --arg xdg_state "\${XDG_STATE_HOME-}" \\
	--arg canary "\${RUNNER_CANARY:-absent}" \\
	--arg impl_root "\${IMPL_TEST_ROOT-}" --arg impl_runs "\${IMPL_RUNS_DIR-}" --arg impl_symlink "\${IMPL_TEST_SYMLINK-}" \\
	--args '{argv: \$ARGS.positional, home: \$home, tmpdir: \$tmpdir, pi_dir: \$pi_dir, xdg: [\$xdg_cache, \$xdg_config, \$xdg_data, \$xdg_state], canary: \$canary, env_dirs_exist: \$env_dirs_exist, impl_root: \$impl_root, impl_runs: \$impl_runs, impl_symlink: \$impl_symlink}' \\
	-- "\$@" >>"$LOG"
if [[ -f "$TEST_ROOT/fail-match" && "\${*}" == *"\$(<"$TEST_ROOT/fail-match")"* ]]; then exit 1; fi
EOF
	cat >"$BIN/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$REPO/pi/agent/node_modules/.bin/tsc" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"$REPO/pi/agent/tsc.log"
exit 0
EOF
	cat >"$BIN/bats" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	for tool in fd jq bash; do ln -s "$(command -v "$tool")" "$BIN/$tool"; done
	chmod +x "$BIN/bun" "$BIN/node" "$BIN/bats" "$REPO/pi/agent/node_modules/.bin/tsc"
	PATH="$BIN:/usr/bin:/bin"
	export PATH
}

@test "runner uses Bun, scrubs suite environments, and scans each skill explicitly" {
	export RUNNER_CANARY=do-not-leak
	local caller_home="$TEST_ROOT/caller-home" caller_tmp="$TEST_ROOT/caller-tmp"
	local caller_cache="$TEST_ROOT/caller-cache" caller_config="$TEST_ROOT/caller-config"
	local caller_data="$TEST_ROOT/caller-data" caller_state="$TEST_ROOT/caller-state"
	mkdir -p "$caller_home" "$caller_tmp"
	printf 'caller sentinel\n' >"$caller_home/sentinel"
	export HOME="$caller_home" TMPDIR="$caller_tmp" XDG_CACHE_HOME="$caller_cache" \
		XDG_CONFIG_HOME="$caller_config" XDG_DATA_HOME="$caller_data" XDG_STATE_HOME="$caller_state"
	run bash "$REPO/scripts/run_tests.sh"
	[ "$status" -eq 0 ]
	[ "$(jq -s 'length' "$LOG")" -eq 7 ]
	jq -s -e --arg root "$REPO" --arg caller_home "$HOME" --arg caller_tmp "$TMPDIR" \
		--arg cache "$XDG_CACHE_HOME" --arg config "$XDG_CONFIG_HOME" --arg data "$XDG_DATA_HOME" --arg state "$XDG_STATE_HOME" '
		length == 7 and all(.[]; .canary == "absent" and .home != $caller_home and .tmpdir != $caller_tmp and
		(.home | endswith("/home")) and (.tmpdir | endswith("/tmp")) and
		(.pi_dir | endswith("/agent")) and (.xdg | all(.[]; endswith("/cache") or endswith("/config") or endswith("/data") or endswith("/state"))) and .env_dirs_exist and
		(.xdg | all(.[]; . != $cache and . != $config and . != $data and . != $state)) and
		(.argv | any(endswith("fixture_test.ts")) or any(endswith("fixture.test.ts")))) and
		([.[].argv[] | select(contains("skills/"))] | length) == 6 and
		all(.[].argv[]; (contains("--allow-") | not)) and
		all(.[].argv[] | select(endswith(".ts")); startswith($root + "/")) and
		([.[] | select(.argv | any(contains("/skills/impl/tests/"))) | select(.impl_symlink == "1" and (.impl_root | endswith("/skills/tmp")) and (.impl_runs | endswith("/skills/impl-runs")))] | length) == 1
	' "$LOG"
	[ "$(wc -l <"$REPO/pi/agent/tsc.log" | tr -d ' ')" -eq 2 ]
	[[ "$(<"$REPO/pi/agent/tsc.log")" == *"tsconfig.skills.json"* ]]
	[ "$HOME" = "$caller_home" ] && [ "$TMPDIR" = "$caller_tmp" ]
	[ "$(<"$caller_home/sentinel")" = "caller sentinel" ]
	jq -r '.home, .tmpdir, .pi_dir, .xdg[]' "$LOG" | sort -u | while IFS= read -r private_dir; do
		[ ! -e "$private_dir" ] || exit 1
	done
}

@test "runner propagates Bun suite failures and continues to later suites and Bats" {
	: >"$LOG"
	printf 'parallel-review/tests/fixture_test.ts' >"$TEST_ROOT/fail-match"
	run bash "$REPO/scripts/run_tests.sh"
	[ "$status" -eq 1 ]
	[[ "$output" == *"FAILED: bun test (skills/parallel-review)"* ]]
	[ "$(jq -s 'length' "$LOG")" -eq 7 ]
	jq -r '.home, .tmpdir, .pi_dir, .xdg[]' "$LOG" | sort -u | while IFS= read -r private_dir; do
		[ ! -e "$private_dir" ] || exit 1
	done
}

@test "runner fails when Bun is missing and never requires Deno" {
	rm -f "$BIN/bun"
	run bash "$REPO/scripts/run_tests.sh"
	[ "$status" -eq 1 ]
	[[ "$output" == *"missing required tool: bun"* ]]
}

@test "runner reports discovery errors and empty skill suites while continuing" {
	rm -f "$BIN/fd"
	cat >"$BIN/fd" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"parallel-review/tests"* ]]; then exit 1; fi
if [[ "$*" == *"implementation-report/tests"* ]]; then exit 0; fi
exec "$REAL_FD" "$@"
EOF
	export REAL_FD
	chmod +x "$BIN/fd"
	run bash "$REPO/scripts/run_tests.sh"
	[ "$status" -eq 1 ]
	[[ "$output" == *"failed to discover parallel-review tests (fd)"* ]]
	[[ "$output" == *"no TypeScript tests found for skills/implementation-report"* ]]
	[ "$(jq -s 'length' "$LOG")" -ge 5 ]
}
