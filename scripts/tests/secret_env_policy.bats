#!/usr/bin/env bats

setup() {
	HOOK="$BATS_TEST_DIRNAME/../../claude/hooks/block-dangerous-commands.sh"
	SETTINGS="$BATS_TEST_DIRNAME/../../claude/settings.json"
}

invoke_hook() {
	printf '%s' "$1" | bash "$HOOK"
}

@test "Read allows sample suffixes and denies real env names" {
	for path in '.env.example' '.env.example.local' '.env.example.bak' '/repo/.env.example.local' '/repo/.env.example.bak'; do
		run invoke_hook "$(jq -cn --arg path "$path" '{tool_name:"Read",tool_input:{file_path:$path}}')"
		[ "$status" -eq 0 ]
		[ -z "$output" ]
	done
	for path in '/repo/.env.production.local' '/repo/.env.local'; do
		run invoke_hook "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$path\"}}"
		[[ "$output" == *'"permissionDecision":"deny"'* ]]
	done
}

@test "Bash uses shared env path policy for tokens and option values" {
	for command in \
		'cat .env.example' \
		'cat .env.example.local' \
		'cat .env.example.bak' \
		'cat /repo/.env.example.local' \
		'cat ".env.example.local"' \
		'cat /repo/.env.example.local /repo/.env.local' \
		'cat ".env.example.local" "/repo/.env.local"' \
		'cat /repo/.env.local' \
		'cat "config/.env.production.local"' \
		'rg --file=.env.example.local x' \
		'rg --file=.env.local x' \
		'cat .env.example.key' \
		'cat .env.example.pem' \
		'cat .env.example.p12' \
		'cat .env.example.pfx'; do
		run invoke_hook "$(jq -cn --arg command "$command" '{tool_name:"Bash",tool_input:{command:$command}}')"
		case "$command" in
		*'.env.local'* | *'.env.production.local'* | *'.env.example.key'* | *'.env.example.pem'* | *'.env.example.p12'* | *'.env.example.pfx'*)
			[[ "$output" == *'"permissionDecision":"deny"'* ]]
			;;
		*) [ -z "$output" ] ;;
		esac
	done
	run invoke_hook '{"tool_name":"Bash","tool_input":{"command":"cat .env.example.local/.env.local"}}'
	[[ "$output" == *'"permissionDecision":"deny"'* ]]
	run invoke_hook '{"tool_name":"Bash","tool_input":{"command":"cat .env.example.local/file"}}'
	[[ "$output" == *'"permissionDecision":"deny"'* ]]
}

@test "main push guard remains active" {
	for command in 'git push origin main' 'git push' 'jj git push -b main'; do
		run invoke_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$command\"}}"
		[[ "$output" == *'"permissionDecision":"deny"'* ]]
	done
}

@test "settings replaces broad local-env deny with Read hook check" {
	run jq -e '
    (.permissions.deny | index("Read(**/.env.*.local)")) == null and
    ([.permissions.deny[] | select(. == "Read(**/.env)" or . == "Read(**/.env.local)" or . == "Read(**/.envrc.local)" or . == "Read(~/.config/gh/**)")] | length) == 4 and
    ([.hooks.PreToolUse[] | select(.matcher == "Bash|Read") | .hooks[] | select(.command | startswith("\"$HOME\"/.claude/hooks/block-dangerous-commands.sh"))] | length) == 1
  ' "$SETTINGS"
	[ "$status" -eq 0 ]
}
