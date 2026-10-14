#!/usr/bin/env bats

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/runner-fixture"
	REPO="$TEST_ROOT/repo"
	BIN="$TEST_ROOT/bin"
	LOG="$TEST_ROOT/deno.jsonl"
	mkdir -p "$REPO/scripts/tests" "$REPO/pi/agent/node_modules/.bin" "$BIN"
	cp "$BATS_TEST_DIRNAME/../run_tests.sh" "$REPO/scripts/run_tests.sh"
	chmod +x "$REPO/scripts/run_tests.sh"
	for dir in skills/review-report/tests skills/implementation-report/tests skills/impl/tests skills/parallel-review/tests skills/review-model-eval/tests skills/jev-audit/tests pi/agent/tests fish/tests; do
		mkdir -p "$REPO/$dir"
	done
	: >"$REPO/pi/agent/tests/fixture.test.ts"
	: >"$REPO/pi/agent/tests/fixture.node.test.mjs"
	: >"$REPO/scripts/tests/fixture.bats"
	cat >"$BIN/deno" <<EOF
#!/usr/bin/env bash
jq -cn \\
	--arg home "\${HOME-}" \\
	--arg tmpdir "\${TMPDIR-}" \\
	--arg xdg_cache "\${XDG_CACHE_HOME-}" \\
	--arg xdg_config "\${XDG_CONFIG_HOME-}" \\
	--arg xdg_data "\${XDG_DATA_HOME-}" \\
	--arg xdg_state "\${XDG_STATE_HOME-}" \\
	--arg canary "\${RUNNER_CANARY:-absent}" \\
	--argjson home_exists "\$([[ -d \${HOME-} ]] && echo true || echo false)" \\
	--argjson tmpdir_exists "\$([[ -d \${TMPDIR-} ]] && echo true || echo false)" \\
	--argjson cache_exists "\$([[ -d \${XDG_CACHE_HOME-} ]] && echo true || echo false)" \\
	--argjson config_exists "\$([[ -d \${XDG_CONFIG_HOME-} ]] && echo true || echo false)" \\
	--argjson data_exists "\$([[ -d \${XDG_DATA_HOME-} ]] && echo true || echo false)" \\
	--argjson state_exists "\$([[ -d \${XDG_STATE_HOME-} ]] && echo true || echo false)" \\
	--args '{argv: \$ARGS.positional, home: \$home, tmpdir: \$tmpdir, xdg_cache: \$xdg_cache, xdg_config: \$xdg_config, xdg_data: \$xdg_data, xdg_state: \$xdg_state, canary: \$canary, dirs_exist: [\$home_exists, \$tmpdir_exists, \$cache_exists, \$config_exists, \$data_exists, \$state_exists]}' \\
	-- "\$@" >>"$LOG"
failure_suite=""
if [[ -f "$TEST_ROOT/fail-suite" ]]; then
	failure_suite="\$(<"$TEST_ROOT/fail-suite")"
fi
if [[ -n "\$failure_suite" && " \${*} " == *" \$failure_suite "* ]]; then
	exit 1
fi
EOF
	cat >"$BIN/bun" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$REPO/pi/agent/node_modules/.bin/tsc" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/bats" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	chmod +x "$BIN"/* "$REPO/pi/agent/node_modules/.bin/tsc"
	PATH="$BIN:$PATH"
	export PATH
}

@test "runner redirects and scrubs environment for added Deno suites" {
	export RUNNER_CANARY="do-not-leak"
	export HOME="$TEST_ROOT/caller-home"
	export XDG_CACHE_HOME="$TEST_ROOT/caller-cache"
	export XDG_CONFIG_HOME="$TEST_ROOT/caller-config"
	export XDG_DATA_HOME="$TEST_ROOT/caller-data"
	export XDG_STATE_HOME="$TEST_ROOT/caller-state"
	mkdir -p "$TEST_ROOT/private-tmp"
	TMPDIR="$(cd "$TEST_ROOT/private-tmp" && pwd -P)"
	export TMPDIR
	run bash "$REPO/scripts/run_tests.sh"
	[ "$status" -eq 0 ]

	jq -s -e --arg fixture_tmp "$TMPDIR" --arg caller_home "$HOME" --arg caller_tmp "$TMPDIR" --arg caller_cache "$XDG_CACHE_HOME" --arg caller_config "$XDG_CONFIG_HOME" --arg caller_data "$XDG_DATA_HOME" --arg caller_state "$XDG_STATE_HOME" '
		. as $records |
		["skills/parallel-review/tests/", "skills/review-model-eval/tests/", "skills/jev-audit/tests/"] as $suites |
		[$records[] as $record | $record | select(any($suites[]; . as $suite | $record.argv | index($suite) != null))] as $targets |
		all($suites[]; . as $suite | ([$records[] | select(.argv | index($suite) != null)] | length) == 1) and
		($targets | length) > 0 and
		all($targets[];
			([.home, .tmpdir, .xdg_cache, .xdg_config, .xdg_data, .xdg_state] as $paths |
			(.canary == "absent" and
			all($paths[]; . != "" and startswith($fixture_tmp + "/") and . != $caller_home and . != $caller_tmp and . != $caller_cache and . != $caller_config and . != $caller_data and . != $caller_state) and
			all(.dirs_exist[]; . == true) and
			(.argv | index("--allow-sys=uid") != null) and
			([.argv[] | select(. == "--allow-net" or startswith("--allow-net=") or . == "-A" or . == "--allow-all")] | length == 0)))
		)
	' "$LOG"
}

@test "runner propagates each added-suite failure and continues" {
	for suite in skills/parallel-review/tests/ skills/review-model-eval/tests/ skills/jev-audit/tests/; do
		printf '%s' "$suite" >"$TEST_ROOT/fail-suite"
		: >"$LOG"
		run bash "$REPO/scripts/run_tests.sh"
		[ "$status" -eq 1 ]
		[[ "$output" == *'deno test (impl history)'* ]] || false
	done
}
