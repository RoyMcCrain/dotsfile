#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
	TEST_BIN="$BATS_TEST_TMPDIR/obsidian-bin"
	mkdir -p "$TEST_BIN"
	ln -s "$(command -v bash)" "$TEST_BIN/bash"
	cat >"$TEST_BIN/obsidian" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do printf '<%s>\n' "$arg"; done
exit "${OBSIDIAN_STATUS:-0}"
EOF
	chmod +x "$TEST_BIN/obsidian"
	SCRIPT="$BATS_TEST_DIRNAME/../obsidian/obsidian-local"
}

@test 'unset vault passes arguments through and preserves official CLI status' {
	run env -u OBSIDIAN_CLI_VAULT OBSIDIAN_STATUS=23 PATH="$TEST_BIN" "$SCRIPT" search 'query=with spaces'
	[ "$status" -eq 23 ]
	[ "$output" = $'<search>\n<query=with spaces>' ]
}

@test 'default vault and query with spaces remain separate single arguments' {
	run env OBSIDIAN_CLI_VAULT='My Vault' PATH="$TEST_BIN" "$SCRIPT" search 'query=with spaces'
	[ "$status" -eq 0 ]
	[ "$output" = $'<vault=My Vault>\n<search>\n<query=with spaces>' ]
}

@test 'explicit first vault overrides the default' {
	run env OBSIDIAN_CLI_VAULT='My Vault' PATH="$TEST_BIN" "$SCRIPT" 'vault=Work Notes' search
	[ "$status" -eq 0 ]
	[ "$output" = $'<vault=Work Notes>\n<search>' ]
}

@test 'missing official CLI reports setup guidance and exits 127' {
	mkdir "$TEST_BIN/without-obsidian"
	ln -s "$(command -v bash)" "$TEST_BIN/without-obsidian/bash"
	run -127 env PATH="$TEST_BIN/without-obsidian" "$SCRIPT" help
	[ "$status" -eq 127 ]
	[[ "$output" == *'Settings'*'General'*'Command line interface'* ]]
}

@test 'no arguments are passed through unchanged for interactive mode' {
	run env OBSIDIAN_CLI_VAULT='My Vault' PATH="$TEST_BIN" "$SCRIPT"
	[ "$status" -eq 0 ]
	[ -z "$output" ]
}
