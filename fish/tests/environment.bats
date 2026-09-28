#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
FISH_BIN="$(command -v fish)"
FISH_LIB="$(dirname "$FISH_BIN")"
RG_BIN="$(command -v rg)"
TOOL_PATH="$FISH_LIB:$(dirname "$RG_BIN"):/usr/bin:/bin"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/env-test"
	HOME="$TEST_ROOT/home"
	STUB_BIN="$TEST_ROOT/stub-bin"
	BW_CALL_LOG="$TEST_ROOT/bw-calls.log"
	SEC_CALL_LOG="$TEST_ROOT/sec-calls.log"
	SEC_STDIN_LOG="$TEST_ROOT/sec-stdin.log"
	SEC_PASSWORD_LOG="$TEST_ROOT/sec-password.log"
	JQ_CALL_LOG="$TEST_ROOT/jq-calls.log"
	BW_ENCODE_JSON_LOG="$TEST_ROOT/bw-encode-json.log"
	mkdir -p "$HOME/.config/fish" "$STUB_BIN/devbox-tools"
	export HOME USER="${USER:-testuser}"
	unset TEST_BW_PASSWORD_OUT TEST_BW_GET_PASSWORD_EXIT TEST_BW_SYNC_EXIT \
		TEST_BW_ITEMS_JSON TEST_BW_FOLDERS_JSON TEST_BW_LIST_ITEMS_EXIT \
		TEST_BW_LIST_FOLDERS_EXIT TEST_BW_CREATE_EXIT TEST_BW_CREATE_FOLDER_EXIT \
		TEST_BW_ENCODE_EXIT TEST_SEC_ADD_EXIT TEST_JQ_FAIL_MATCH BW_KEY_FOLDER
	rm -f "$BW_CALL_LOG" "$SEC_CALL_LOG" "$SEC_STDIN_LOG" "$SEC_PASSWORD_LOG" \
		"$JQ_CALL_LOG" "$BW_ENCODE_JSON_LOG"
	write_bootstrap
	write_core_stubs
	install_empty_fish_extras
}

write_bootstrap() {
	cat >"$TEST_ROOT/bootstrap.fish" <<'EOF'
function security
    $STUB_BIN/security $argv
end
function devbox
    $STUB_BIN/devbox $argv
end
function direnv
    return 0
end
function jj
    return 0
end
function fzf
    return 0
end
function uname
    echo Linux
end
EOF
}

write_core_stubs() {
	local real_jq
	real_jq="$(command -v jq)"
	cat >"$STUB_BIN/security" <<'EOF'
#!/bin/sh
case "$1" in
-i)
	echo "security:-i" >>"${SEC_CALL_LOG:-/dev/null}" 2>/dev/null || true
	IFS= read -r sec_cmd || exit 1
	printf '%s\n' "$sec_cmd" >>"${SEC_STDIN_LOG:-/dev/null}" 2>/dev/null || true
	case "$sec_cmd" in
	add-generic-password*)
		if command -v python3 >/dev/null 2>&1; then
			python3 - "$sec_cmd" >>"${SEC_PASSWORD_LOG:-/dev/null}" 2>/dev/null <<'PY' || true
import shlex, sys
parts = shlex.split(sys.argv[1])
try:
    i = parts.index("-w")
    print(parts[i + 1], end="")
except (ValueError, IndexError):
    sys.exit(1)
PY
		fi
		exit "${TEST_SEC_ADD_EXIT:-0}"
		;;
	esac
	exit 1
	;;
find-generic-password)
	echo "find-generic-password $*" >>"${SEC_CALL_LOG:-/dev/null}" 2>/dev/null || true
	[ "$2" = -s ] || exit 1
	case "$3" in
	open-router-api-key) echo SYN_OPEN_ROUTER; exit 0 ;;
	firecrawl-api-key) echo SYN_FIRECRAWL; exit 0 ;;
	esac
	exit 1
	;;
add-generic-password)
	echo "argv:add-generic-password" >>"${SEC_CALL_LOG:-/dev/null}" 2>/dev/null || true
	exit "${TEST_SEC_ADD_EXIT:-0}"
	;;
esac
echo "$*" >>"${SEC_CALL_LOG:-/dev/null}" 2>/dev/null || true
exit 1
EOF
	cat >"$STUB_BIN/bw" <<'EOF'
#!/bin/sh
echo "$*" >>"${BW_CALL_LOG:-/dev/null}" 2>/dev/null || true
case "$1" in
sync) exit "${TEST_BW_SYNC_EXIT:-0}" ;;
get)
	shift
	case "$1" in
	password)
		[ -n "${TEST_BW_PASSWORD_OUT:-}" ] && printf '%s' "$TEST_BW_PASSWORD_OUT"
		exit "${TEST_BW_GET_PASSWORD_EXIT:-0}"
		;;
	item) exit "${TEST_BW_GET_ITEM_EXIT:-1}" ;;
	template)
		case "$2" in
		folder) printf '{"name":""}'; exit 0 ;;
		item) printf '{"name":""}'; exit 0 ;;
		esac
		;;
	esac
	;;
list)
	shift
	case "$1" in
	folders)
		printf '%s' "${TEST_BW_FOLDERS_JSON:-[]}"
		exit "${TEST_BW_LIST_FOLDERS_EXIT:-0}"
		;;
	items)
		printf '%s' "${TEST_BW_ITEMS_JSON:-[]}"
		exit "${TEST_BW_LIST_ITEMS_EXIT:-0}"
		;;
	esac
	;;
encode)
	body=$(cat) || exit 1
	if [ -n "${BW_ENCODE_JSON_LOG:-}" ]; then
		printf '%s' "$body" >>"$BW_ENCODE_JSON_LOG"
	fi
	printf '%s' "$body"
	exit "${TEST_BW_ENCODE_EXIT:-0}"
	;;
create)
	case "$2" in
	item) exit "${TEST_BW_CREATE_EXIT:-0}" ;;
	folder) printf '{"id":"folder-stub-id"}'; exit "${TEST_BW_CREATE_FOLDER_EXIT:-0}" ;;
	esac
	exit 1
	;;
esac
exit 1
EOF
	cat >"$STUB_BIN/jq" <<EOF
#!/bin/sh
JQ_BIN='$real_jq'
echo "\$*" >>"\${JQ_CALL_LOG:-/dev/null}" 2>/dev/null || true
if [ "\${TEST_JQ_FAIL:-0}" = 1 ]; then
	exit 1
fi
if [ -n "\${TEST_JQ_FAIL_MATCH:-}" ]; then
	case " \$* " in
	*"\${TEST_JQ_FAIL_MATCH}"*)
		"\$JQ_BIN" "\$@"; exit 1
		;;
	esac
fi
exec "\$JQ_BIN" "\$@"
EOF
	chmod +x "$STUB_BIN/jq"
	cat >"$STUB_BIN/direnv" <<'EOF'
#!/bin/sh
exit 0
EOF
	cat >"$STUB_BIN/jj" <<'EOF'
#!/bin/sh
exit 0
EOF
	chmod +x "$STUB_BIN"/{security,bw,direnv,jj}
}

write_devbox_fish_stub() {
	local pnpm_home="${1:-$HOME/.local/share/pnpm}"
	cat >"$STUB_BIN/devbox" <<EOF
#!/bin/sh
if [ "\$1" = global ] && [ "\$2" = shellenv ]; then
  printf '%s\n' "set -gx PNPM_HOME '$pnpm_home'"
  printf '%s\n' "set -gx PATH '$STUB_BIN/devbox-tools' \"\\\$PATH\""
fi
EOF
	chmod +x "$STUB_BIN/devbox"
}

write_devbox_zsh_stub() {
	local pnpm_home="${1:-$HOME/.local/share/pnpm}"
	cat >"$STUB_BIN/devbox" <<EOF
#!/bin/sh
if [ "\$1" = global ] && [ "\$2" = shellenv ]; then
  printf '%s\n' "export PNPM_HOME='$pnpm_home'"
  printf '%s\n' "export PATH='$STUB_BIN/devbox-tools':\"\\\$PATH\""
fi
EOF
	chmod +x "$STUB_BIN/devbox"
}

install_empty_fish_extras() {
	: >"$HOME/.config/fish/abbreviations.fish"
	: >"$HOME/.config/fish/fzf.fish"
}

link_repo_config() {
	ln -sf "$REPO_ROOT/fish/config.fish" "$HOME/.config/fish/config.fish"
}

link_config_target() {
	local target="$1"
	ln -sf "$target" "$HOME/.config/fish/config.fish"
}

minimal_fish_path() {
	printf '%s' "$STUB_BIN:$TOOL_PATH"
}

fish_functions_repo() {
	printf '%s' "$REPO_ROOT/fish/functions"
}

run_fish_autoload() {
	# $1: fish script using fish_function_path autoload (no manual source of key helpers)
	env -i \
		HOME="$HOME" \
		XDG_CONFIG_HOME="$HOME/.config" \
		USER="$USER" \
		LANG=C.UTF-8 \
		PATH="$(minimal_fish_path)" \
		STUB_BIN="$STUB_BIN" \
		REPO_ROOT="$REPO_ROOT" \
		BW_CALL_LOG="$BW_CALL_LOG" \
		SEC_CALL_LOG="$SEC_CALL_LOG" \
		SEC_STDIN_LOG="$SEC_STDIN_LOG" \
		SEC_PASSWORD_LOG="$SEC_PASSWORD_LOG" \
		JQ_CALL_LOG="$JQ_CALL_LOG" \
		BW_ENCODE_JSON_LOG="$BW_ENCODE_JSON_LOG" \
		TEST_BW_ITEMS_JSON="${TEST_BW_ITEMS_JSON:-}" \
		TEST_BW_FOLDERS_JSON="${TEST_BW_FOLDERS_JSON:-}" \
		TEST_BW_LIST_ITEMS_EXIT="${TEST_BW_LIST_ITEMS_EXIT:-}" \
		TEST_BW_LIST_FOLDERS_EXIT="${TEST_BW_LIST_FOLDERS_EXIT:-}" \
		TEST_BW_SYNC_EXIT="${TEST_BW_SYNC_EXIT:-}" \
		TEST_BW_GET_PASSWORD_EXIT="${TEST_BW_GET_PASSWORD_EXIT:-}" \
		TEST_BW_PASSWORD_OUT="${TEST_BW_PASSWORD_OUT-}" \
		TEST_BW_GET_ITEM_EXIT="${TEST_BW_GET_ITEM_EXIT:-}" \
		TEST_BW_CREATE_EXIT="${TEST_BW_CREATE_EXIT:-}" \
		TEST_BW_CREATE_FOLDER_EXIT="${TEST_BW_CREATE_FOLDER_EXIT:-}" \
		TEST_BW_ENCODE_EXIT="${TEST_BW_ENCODE_EXIT:-}" \
		TEST_JQ_FAIL="${TEST_JQ_FAIL:-}" \
		TEST_SEC_ADD_EXIT="${TEST_SEC_ADD_EXIT:-}" \
		BW_KEY_FOLDER="${BW_KEY_FOLDER-}" \
		BW_SESSION=synthetic-test-session \
		"$FISH_BIN" --no-config -c "
		set -gx STUB_BIN '$STUB_BIN'
		set -gx fish_function_path '$(fish_functions_repo)' \$fish_function_path
		source '$TEST_ROOT/bootstrap.fish'
		$1
	"
}

run_fish() {
	# $1: fish script body (no secrets in output)
	env -i \
		HOME="$HOME" \
		XDG_CONFIG_HOME="$HOME/.config" \
		USER="$USER" \
		LANG=C.UTF-8 \
		PATH="$(minimal_fish_path)" \
		STUB_BIN="$STUB_BIN" \
		REPO_ROOT="$REPO_ROOT" \
		BW_CALL_LOG="$BW_CALL_LOG" \
		SEC_CALL_LOG="$SEC_CALL_LOG" \
		SEC_STDIN_LOG="$SEC_STDIN_LOG" \
		SEC_PASSWORD_LOG="$SEC_PASSWORD_LOG" \
		JQ_CALL_LOG="$JQ_CALL_LOG" \
		BW_ENCODE_JSON_LOG="$BW_ENCODE_JSON_LOG" \
		TEST_BW_ITEMS_JSON="${TEST_BW_ITEMS_JSON:-}" \
		TEST_BW_FOLDERS_JSON="${TEST_BW_FOLDERS_JSON:-}" \
		TEST_BW_LIST_ITEMS_EXIT="${TEST_BW_LIST_ITEMS_EXIT:-}" \
		TEST_BW_LIST_FOLDERS_EXIT="${TEST_BW_LIST_FOLDERS_EXIT:-}" \
		TEST_BW_SYNC_EXIT="${TEST_BW_SYNC_EXIT:-}" \
		TEST_BW_GET_PASSWORD_EXIT="${TEST_BW_GET_PASSWORD_EXIT:-}" \
		TEST_BW_PASSWORD_OUT="${TEST_BW_PASSWORD_OUT-}" \
		TEST_BW_GET_ITEM_EXIT="${TEST_BW_GET_ITEM_EXIT:-}" \
		TEST_BW_CREATE_EXIT="${TEST_BW_CREATE_EXIT:-}" \
		TEST_BW_CREATE_FOLDER_EXIT="${TEST_BW_CREATE_FOLDER_EXIT:-}" \
		TEST_BW_ENCODE_EXIT="${TEST_BW_ENCODE_EXIT:-}" \
		TEST_JQ_FAIL="${TEST_JQ_FAIL:-}" \
		TEST_SEC_ADD_EXIT="${TEST_SEC_ADD_EXIT:-}" \
		BW_KEY_FOLDER="${BW_KEY_FOLDER-}" \
		BW_SESSION=synthetic-test-session \
		"$FISH_BIN" --no-config -c "
		set -gx STUB_BIN '$STUB_BIN'
		source '$TEST_ROOT/bootstrap.fish'
		$1
	"
}

run_zsh_profile() {
	env -i \
		HOME="$HOME" \
		USER="$USER" \
		LANG=C.UTF-8 \
		PATH="$STUB_BIN:/usr/bin:/bin" \
		zsh -f -c "$1"
}

source_production_key_functions() {
	printf '%s\n' \
		"source '$REPO_ROOT/fish/functions/__keychain_command.fish'" \
		"source '$REPO_ROOT/fish/functions/sync-key.fish'" \
		"source '$REPO_ROOT/fish/functions/add-key.fish'"
}

# --- config / API keys ---

@test "config exports OPEN_ROUTER_API_KEY from open-router-api-key item" {
	link_repo_config
	write_devbox_fish_stub

	run run_fish "
		source '$HOME/.config/fish/config.fish'
		set -q OPEN_ROUTER_API_KEY; and echo marker:open_router_set; or echo marker:open_router_missing
		if set -q OPEN_ROUTER_API_KEY
			test \"\$OPEN_ROUTER_API_KEY\" = SYN_OPEN_ROUTER; and echo marker:value_ok
		end
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:open_router_set* ]]
	[[ "$output" == *marker:value_ok* ]]
	[[ "$output" != *SYN_* ]]
}

# --- PNPM PATH (fish) ---

@test "fish config appends PNPM_HOME/bin including nonexistent directory" {
	link_repo_config
	write_devbox_fish_stub "$HOME/my pnpm home"

	run run_fish "
		source '$HOME/.config/fish/config.fish'
		set -l want \"\$PNPM_HOME/bin\"
		contains -- \$want \$PATH; and echo marker:pnpm_in_path
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:pnpm_in_path* ]]
}

@test "fish config does not duplicate PNPM bin on re-source" {
	link_repo_config
	write_devbox_fish_stub

	run run_fish "
		source '$HOME/.config/fish/config.fish'
		set -l bin \"\$PNPM_HOME/bin\"
		set -l n1 0
		for p in \$PATH
			test \"\$p\" = \"\$bin\"; and set n1 (math \$n1 + 1)
		end
		source '$HOME/.config/fish/config.fish'
		set -l n2 0
		for p in \$PATH
			test \"\$p\" = \"\$bin\"; and set n2 (math \$n2 + 1)
		end
		test \$n1 -eq 1 -a \$n2 -eq 1; and echo marker:once
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:once* ]]
}

@test "fish config omits PNPM bin when PNPM_HOME is empty" {
	link_repo_config
	cat >"$STUB_BIN/devbox" <<'EOF'
#!/bin/sh
[ "$1 $2" = "global shellenv" ] && printf '%s\n' 'set -gx PNPM_HOME ""'
EOF
	chmod +x "$STUB_BIN/devbox"

	run run_fish "
		source '$HOME/.config/fish/config.fish'
		set -l legacy '$HOME/.local/share/pnpm/bin'
		contains -- \$legacy \$PATH; and echo marker:bad; or echo marker:absent
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:absent* ]]
}

@test "fish PNPM append keeps devbox pnpm ahead of PNPM_HOME bin" {
	link_repo_config
	write_devbox_fish_stub
	printf '%s\n' '#!/bin/sh' 'echo devbox-pnpm' >"$STUB_BIN/devbox-tools/pnpm"
	chmod +x "$STUB_BIN/devbox-tools/pnpm"

	run run_fish "
		source '$HOME/.config/fish/config.fish'
		set -l p (command -v pnpm)
		string match -q '*devbox-tools*' \$p; and echo marker:devbox_first
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:devbox_first* ]]
}

# --- PNPM PATH (zprofile) ---

@test "zprofile appends PNPM_HOME/bin after devbox" {
	write_devbox_zsh_stub "$HOME/zsh pnpm home"

	run run_zsh_profile "
		source '$REPO_ROOT/zprofile'
		parts=( \${(s.:.)PATH} )
		count=0
		for p in \$parts; do
		  [[ \"\$p\" == \"\$PNPM_HOME/bin\" ]] && (( count++ ))
		done
		(( count == 1 )) && echo marker:once
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:once* ]]
}

@test "zprofile idempotent PNPM bin append" {
	write_devbox_zsh_stub

	run run_zsh_profile "
		source '$REPO_ROOT/zprofile'
		parts=( \${(s.:.)PATH} )
		n1=0
		for p in \$parts; do [[ \"\$p\" == \"\$PNPM_HOME/bin\" ]] && (( n1++ )); done
		source '$REPO_ROOT/zprofile'
		parts=( \${(s.:.)PATH} )
		n2=0
		for p in \$parts; do [[ \"\$p\" == \"\$PNPM_HOME/bin\" ]] && (( n2++ )); done
		(( n1 == 1 && n2 == 1 )) && echo marker:once
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:once* ]]
}

@test "zprofile skips PNPM bin when PNPM_HOME unset" {
	cat >"$STUB_BIN/devbox" <<'EOF'
#!/bin/sh
[ "$1 $2" = "global shellenv" ] && export PATH="/usr/bin"
EOF
	chmod +x "$STUB_BIN/devbox"

	run run_zsh_profile "
		unset PNPM_HOME
		source '$REPO_ROOT/zprofile'
		parts=( \${(s.:.)PATH} )
		for p in \$parts; do
		  [[ \"\$p\" == *pnpm/bin* ]] && { echo marker:bad; exit 0; }
		done
		echo marker:absent
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:absent* ]]
}

# --- sync-key ---

@test "sync-key succeeds and sets env without printing secret" {
	TEST_BW_PASSWORD_OUT=SYN_BW_VAL TEST_SEC_ADD_EXIT=0 BW_SESSION=fake \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = SYN_BW_VAL; and echo marker:var_set; or echo marker:var_missing
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:0* ]]
	[[ "$output" == *marker:var_set* ]]
	[[ "$output" == *反映しました* ]]
	[[ "$output" != *SYN_* ]]
}

@test "sync-key honors explicit ENV_VAR override" {
	TEST_BW_PASSWORD_OUT=x TEST_SEC_ADD_EXIT=0 BW_SESSION=fake \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		sync-key my-item CUSTOM_VAR_NAME
		test \"\$CUSTOM_VAR_NAME\" = x; and echo marker:custom; or echo marker:no
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:custom* ]]
}

@test "sync-key fails on bw sync without changing prior env" {
	TEST_BW_SYNC_EXIT=1 TEST_BW_PASSWORD_OUT=SYN_BW_VAL BW_SESSION=fake \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		set -gx TEST_API_KEY marker:old
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = marker:old; and echo marker:unchanged:yes
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *marker:unchanged:yes* ]]
	[[ "$output" != *反映しました* ]]
	run rg -q 'security:-i' "$SEC_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
}

@test "sync-key fails when bw get password exits nonzero despite output" {
	TEST_BW_SYNC_EXIT=0 TEST_BW_GET_PASSWORD_EXIT=1 TEST_BW_PASSWORD_OUT=leaked BW_SESSION=fake \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		set -gx TEST_API_KEY marker:prior
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = marker:prior; and echo marker:still_set
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *marker:still_set* ]]
	[[ "$output" != *leaked* ]]
	[[ "$output" != *反映しました* ]]
	run rg -q 'security:-i' "$SEC_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
}

@test "sync-key fails on Keychain write without exporting" {
	TEST_BW_SYNC_EXIT=0 TEST_BW_PASSWORD_OUT=x TEST_SEC_ADD_EXIT=1 BW_SESSION=fake \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		set -gx TEST_API_KEY marker:prior
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = marker:prior; and echo marker:unchanged
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *marker:unchanged* ]]
	[[ "$output" != *反映しました* ]]
}

# --- add-key ---

run_add_key() {
	local item="$1"
	local secret="$2"
	printf '%s\n' "$secret" | env -i \
		HOME="$HOME" \
		XDG_CONFIG_HOME="$HOME/.config" \
		USER="$USER" \
		LANG=C.UTF-8 \
		PATH="$(minimal_fish_path)" \
		STUB_BIN="$STUB_BIN" \
		REPO_ROOT="$REPO_ROOT" \
		BW_CALL_LOG="$BW_CALL_LOG" \
		SEC_CALL_LOG="$SEC_CALL_LOG" \
		SEC_STDIN_LOG="$SEC_STDIN_LOG" \
		SEC_PASSWORD_LOG="$SEC_PASSWORD_LOG" \
		JQ_CALL_LOG="$JQ_CALL_LOG" \
		BW_ENCODE_JSON_LOG="$BW_ENCODE_JSON_LOG" \
		TEST_BW_ITEMS_JSON="${TEST_BW_ITEMS_JSON:-[]}" \
		TEST_BW_FOLDERS_JSON="${TEST_BW_FOLDERS_JSON:-[]}" \
		TEST_BW_LIST_ITEMS_EXIT="${TEST_BW_LIST_ITEMS_EXIT:-0}" \
		TEST_BW_LIST_FOLDERS_EXIT="${TEST_BW_LIST_FOLDERS_EXIT:-0}" \
		TEST_BW_SYNC_EXIT="${TEST_BW_SYNC_EXIT:-0}" \
		TEST_BW_GET_ITEM_EXIT="${TEST_BW_GET_ITEM_EXIT:-1}" \
		TEST_BW_CREATE_EXIT="${TEST_BW_CREATE_EXIT:-0}" \
		TEST_BW_CREATE_FOLDER_EXIT="${TEST_BW_CREATE_FOLDER_EXIT:-0}" \
		TEST_BW_ENCODE_EXIT="${TEST_BW_ENCODE_EXIT:-0}" \
		TEST_JQ_FAIL="${TEST_JQ_FAIL:-}" \
		TEST_JQ_FAIL_MATCH="${TEST_JQ_FAIL_MATCH:-}" \
		TEST_BW_PASSWORD_OUT="${TEST_BW_PASSWORD_OUT:-x}" \
		TEST_SEC_ADD_EXIT="${TEST_SEC_ADD_EXIT:-0}" \
		BW_KEY_FOLDER="${BW_KEY_FOLDER-}" \
		BW_SESSION=fake \
		"$FISH_BIN" --no-config -c "
		set -gx STUB_BIN '$STUB_BIN'
		set -gx BW_SESSION fake
		set -gx fish_function_path '$(fish_functions_repo)' \$fish_function_path
		source '$TEST_ROOT/bootstrap.fish'
		add-key $item
		echo marker:status:\$status
	"
}

@test "add-key appends to indented api_key_items line" {
	local target="$TEST_ROOT/cfg-indented.fish"
	printf '%s\n' 'if command -q security' '    set -l api_key_items firecrawl-api-key' 'end' '# unrelated' >"$target"
	link_config_target "$target"

	run run_add_key brand-new-key 'paste-value'

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:0* ]]
	run rg -q 'brand-new-key' "$target"
	[ "$status" -eq 0 ]
	run rg -q 'unrelated' "$target"
	[ "$status" -eq 0 ]
}

@test "add-key appends to unindented api_key_items line" {
	local target="$TEST_ROOT/cfg-flat.fish"
	echo 'set -l api_key_items alpha-key' >"$target"
	link_config_target "$target"

	run run_add_key beta-key 'paste-value'

	[ "$status" -eq 0 ]
	run rg 'set -l api_key_items' "$target"
	[[ "$output" == *beta-key* ]]
	[[ "$output" != *beta-key*beta-key* ]]
}

@test "add-key does not duplicate existing item name" {
	local target="$TEST_ROOT/cfg-dup.fish"
	echo '    set -l api_key_items already-there' >"$target"
	link_config_target "$target"

	run run_add_key already-there 'paste-value'

	run rg -o 'already-there' "$target"
	[ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" = "1" ]
}

@test "add-key preserves config symlink target" {
	local target="$TEST_ROOT/real-config.fish"
	echo '    set -l api_key_items base-key' >"$target"
	link_config_target "$target"
	[ -L "$HOME/.config/fish/config.fish" ]

	run run_add_key extra-key 'paste-value'

	[ "$status" -eq 0 ]
	[ -L "$HOME/.config/fish/config.fish" ]
	[ "$(readlink "$HOME/.config/fish/config.fish")" = "$target" ]
	run rg -q 'extra-key' "$target"
	[ "$status" -eq 0 ]
}

@test "add-key fails when api_key_items declaration missing" {
	local target="$TEST_ROOT/cfg-nodecl.fish"
	echo '# no list' >"$target"
	link_config_target "$target"

	run run_add_key orphan-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" != *追記しました* ]]
}

@test "add-key fails when config.fish is missing" {
	rm -f "$HOME/.config/fish/config.fish"

	run run_add_key ghost-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *見つかりません* ]]
}

@test "add-key does not register when Bitwarden create pipeline fails" {
	local target="$TEST_ROOT/cfg-createfail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_CREATE_EXIT=1 run run_add_key fail-create 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg -q 'fail-create' "$target"
	[ "$status" -ne 0 ]
}

@test "add-key does not register when sync-key fails" {
	local target="$TEST_ROOT/cfg-syncfail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_SYNC_EXIT=1 run run_add_key after-sync-fail 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg -q 'after-sync-fail' "$target"
	[ "$status" -ne 0 ]
}

@test "sync-key uses security -i not argv -w" {
	rm -f "$SEC_CALL_LOG"
	TEST_BW_PASSWORD_OUT=SYN_BW_VAL TEST_SEC_ADD_EXIT=0 \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		sync-key test-api-key
	"

	[ "$status" -eq 0 ]
	run rg -q 'security:-i' "$SEC_CALL_LOG"
	[ "$status" -eq 0 ]
	run rg -q 'argv:add-generic-password' "$SEC_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "sync-key rejects invalid item name without bw calls" {
	rm -f "$BW_CALL_LOG"
	run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		sync-key 'Bad_Name'
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:2* ]]
	[ ! -e "$BW_CALL_LOG" ]
}

@test "sync-key rejects reserved ENV_VAR override" {
	run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		sync-key test-api-key PATH
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:2* ]]
}

@test "sync-key rejects multiline password from bw" {
	TEST_BW_PASSWORD_OUT=$'line1\nline2' TEST_SEC_ADD_EXIT=0 \
		run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		set -gx TEST_API_KEY marker:prior
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = marker:prior; and echo marker:unchanged
	"

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *marker:unchanged* ]]
	run rg -q 'security:-i' "$SEC_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
}

@test "add-key rejects extra arguments without side effects" {
	local target="$TEST_ROOT/cfg-extra-args.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	rm -f "$BW_CALL_LOG"

	run run_fish "
		$(source_production_key_functions)
		set -gx BW_SESSION fake
		add-key extra one
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:2* ]]
	[ ! -e "$BW_CALL_LOG" ]
}

@test "add-key rejects duplicate exact item name from list query" {
	local target="$TEST_ROOT/cfg-dup-list.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_ITEMS_JSON='[{"name":"dup-key","id":"1"}]' \
		run run_add_key dup-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *既に存在* ]]
	run rg -q 'dup-key' "$target"
	[ "$status" -ne 0 ]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key aborts when list items lookup fails" {
	local target="$TEST_ROOT/cfg-listfail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_LIST_ITEMS_EXIT=1 run run_add_key list-fail-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg -q 'list-fail-key' "$target"
	[ "$status" -ne 0 ]
}

@test "add-key does not pass secret via jq --arg password" {
	local target="$TEST_ROOT/cfg-jqarg.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	rm -f "$JQ_CALL_LOG"
	local secret='SYN_JQ_SECRET_VALUE'
	run run_add_key jq-safe-key "$secret"

	[[ "$output" == *marker:status:0* ]]
	run rg -q 'SYN_JQ_SECRET_VALUE' "$JQ_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
	run rg -q -- '--arg k' "$JQ_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
	run jq -er '.login.password' "$BW_ENCODE_JSON_LOG"
	[ "$status" -eq 0 ]
	[ "$output" = "$secret" ]
}

@test "add-key partial failure advises sync-key recovery" {
	local target="$TEST_ROOT/cfg-partial.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_SEC_ADD_EXIT=1 run run_add_key partial-sync-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *sync-key* ]]
	[[ "$output" == *作成済み* ]]
	[[ "$output" == *api_key_items* ]]
	run rg -q 'partial-sync-key' "$target"
	[ "$status" -ne 0 ]
}

@test "sync-key autoloads helpers via fish_function_path" {
	TEST_BW_PASSWORD_OUT=SYN_AUTOLOAD TEST_SEC_ADD_EXIT=0 \
		run run_fish_autoload "
		set -gx BW_SESSION fake
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$TEST_API_KEY\" = SYN_AUTOLOAD; and echo marker:var_ok
	"

	[ "$status" -eq 0 ]
	[[ "$output" == *marker:status:0* ]]
	[[ "$output" == *marker:var_ok* ]]
	[[ "$output" != *SYN_AUTOLOAD* ]]
}

@test "keychain command round-trips special characters through security -i stub" {
	rm -f "$SEC_STDIN_LOG" "$SEC_PASSWORD_LOG"
	run run_fish_autoload "
		set -l syn 'sp ace'\''semi;colon\$back\\\\slash\"quote'
		set -l cmd (__keychain_command round-trip-item \"\$syn\")
		test (count (string split \\n -- \$cmd)) -eq 1; and echo marker:single_line
		string match -qr ';.*add-generic-password' \$cmd; and echo marker:injected; or echo marker:clean
		printf '%s\n' \$cmd | security -i >/dev/null 2>&1
		echo marker:sec_status:\$status
		set -l got (cat '$SEC_PASSWORD_LOG')
		test \"\$got\" = \"\$syn\"; and echo marker:password_match; or echo marker:password_mismatch
	"

	[[ "$output" == *marker:single_line* ]]
	[[ "$output" == *marker:clean* ]]
	[[ "$output" == *marker:sec_status:0* ]]
	[[ "$output" == *marker:password_match* ]]
	[ "$(wc -l <"$SEC_STDIN_LOG" | tr -d ' ')" = "1" ]
}

@test "sync-key round-trips UTF-8 password to security stub" {
	local syn=$'utf8-€-key'
	TEST_BW_PASSWORD_OUT="$syn" TEST_SEC_ADD_EXIT=0 \
		run run_fish_autoload "
		set -gx BW_SESSION fake
		sync-key test-api-key
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:0* ]]
	run cat "$SEC_PASSWORD_LOG"
	[ "$output" = "$syn" ]
}

@test "sync-key rejects empty explicit ENV_VAR override" {
	run run_fish_autoload "
		set -gx BW_SESSION fake
		sync-key test-api-key ''
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:2* ]]
	run rg -q 'security:-i' "$SEC_CALL_LOG" 2>/dev/null
	[ "$status" -ne 0 ]
}

@test "sync-key rejects wrong argument count without bw" {
	rm -f "$BW_CALL_LOG"
	run run_fish_autoload "
		set -gx BW_SESSION fake
		sync-key
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:2* ]]
	[ ! -e "$BW_CALL_LOG" ]
}

@test "sync-key trace isolation preserves fish_trace and hides exported secret" {
	TEST_BW_PASSWORD_OUT=SYN_TRACE_PASSWORD TEST_SEC_ADD_EXIT=0 \
		run run_fish_autoload "
		set -gx SYN_TRACE_DECOY decoy-exported
		set -gx TEST_API_KEY marker:prior
		set -gx fish_trace 1
		sync-key test-api-key
		echo marker:status:\$status
		test \"\$fish_trace\" = 1; and echo marker:trace_on; or echo marker:trace_off
		set -lu fish_trace
		test \"\$TEST_API_KEY\" = \"\$TEST_BW_PASSWORD_OUT\"; and echo marker:var_set; or echo marker:var_bad
	"

	[[ "$output" == *marker:status:0* ]]
	[[ "$output" == *marker:trace_on* ]]
	[[ "$output" == *marker:var_set* ]]
	[[ "$output" != *SYN_TRACE_PASSWORD* ]]
	[[ "$output" != *decoy-exported* ]]
}

@test "add-key rejects malformed items JSON object without create" {
	local target="$TEST_ROOT/cfg-bad-items-json.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_ITEMS_JSON='{}' run run_add_key bad-json-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects malformed items list member without create" {
	local target="$TEST_ROOT/cfg-bad-items-member.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_ITEMS_JSON='[{"name":"other-item"},42]' run run_add_key fresh-list-key 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects malformed folders list member without create" {
	local target="$TEST_ROOT/cfg-bad-folders-member.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[{"name":"other-folder"},null]' \
		run run_add_key folder-member 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create folder' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects existing folder with non-string id without create" {
	local target="$TEST_ROOT/cfg-folder-bad-id.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[{"name":"env","id":42}]' \
		run run_add_key folder-bad-id 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create folder' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects existing folder with null id without create" {
	local target="$TEST_ROOT/cfg-folder-null-id.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[{"name":"env","id":null}]' \
		run run_add_key folder-null-id 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key aborts when new-folder jq succeeds then exits nonzero without create" {
	local target="$TEST_ROOT/cfg-jq-folder-fail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[]' TEST_JQ_FAIL_MATCH="{name:\$n}" \
		run run_add_key jq-folder-fail 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create folder' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key aborts when item jq succeeds then exits nonzero without create" {
	local target="$TEST_ROOT/cfg-jq-item-fail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_JQ_FAIL_MATCH='folderId:(if' run run_add_key jq-item-fail 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects ambiguous folder names without create" {
	local target="$TEST_ROOT/cfg-ambig-folder.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[{"name":"env","id":"a"},{"name":"env","id":"b"}]' \
		run run_add_key ambig-folder 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key rejects invalid paste control characters before folder create" {
	local target="$TEST_ROOT/cfg-ctrl-paste.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	BW_KEY_FOLDER=env TEST_BW_FOLDERS_JSON='[]' \
		run run_add_key ctrl-paste $'bad\x01value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create folder' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key aborts when bw encode fails before create item" {
	local target="$TEST_ROOT/cfg-encode-fail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	TEST_BW_ENCODE_EXIT=1 run run_add_key encode-fail 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	run rg 'create item' "$BW_CALL_LOG"
	[ "$status" -ne 0 ]
}

@test "add-key config preflight prevents bw list when declaration missing" {
	local target="$TEST_ROOT/cfg-preflight-nodecl.fish"
	echo '# no api_key_items' >"$target"
	link_config_target "$target"
	rm -f "$BW_CALL_LOG"

	run run_add_key preflight-nodecl 'paste-value'

	[[ "$output" == *marker:status:1* ]]
	[ ! -e "$BW_CALL_LOG" ]
}

@test "add-key partial config write failure warns without advising blind retry" {
	local target="$TEST_ROOT/cfg-configfail.fish"
	echo '    set -l api_key_items solo' >"$target"
	link_config_target "$target"
	rm -f "$BW_CALL_LOG"

	TEST_BW_PASSWORD_OUT=x TEST_SEC_ADD_EXIT=0 run run_fish "
		set -gx fish_function_path '$(fish_functions_repo)' \$fish_function_path
		source '$TEST_ROOT/bootstrap.fish'
		set -gx BW_SESSION fake
		function mktemp
			return 1
		end
		printf '%s\n' 'paste-value' | add-key config-fail-key
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" == *手動* ]]
	[[ "$output" == *"add-key は再実行しない"* ]]
	run rg -q 'config-fail-key' "$target"
	[ "$status" -ne 0 ]
}

@test "__keychain_command rejects overlong encoded command" {
	run run_fish_autoload "
		set -l big (string repeat -n 5000 'a')
		__keychain_command test-api-key \$big >/dev/null
		echo marker:status:\$status
	"
	[[ "$output" == *marker:status:4* ]]
}

@test "sync-key error output does not echo bw password on get failure" {
	TEST_BW_GET_PASSWORD_EXIT=1 TEST_BW_PASSWORD_OUT=SYN_ERR_LEAK \
		run run_fish_autoload "
		set -gx BW_SESSION fake
		sync-key test-api-key
		echo marker:status:\$status
	"

	[[ "$output" == *marker:status:1* ]]
	[[ "$output" != *SYN_ERR_LEAK* ]]
}
