#!/usr/bin/env bats
# shellcheck disable=SC2016,SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/devin-wiki"
	mkdir -p "$TEST_ROOT"
	RUNNER="$BATS_TEST_DIRNAME/../../../skills/devin-wiki/scripts/run.sh"
	ARGS_LOG="$TEST_ROOT/claude-args.json"
	PROMPT_LOG="$TEST_ROOT/claude-prompt.txt"
	TOUCH_MARKER="$TEST_ROOT/touch-marker"

	FAKE_CLAUDE="$TEST_ROOT/fake_claude.sh"
	cat >"$FAKE_CLAUDE" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail

printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_CLAUDE_ARGS"

subcommand="${1:-}"
shift || true

case "$subcommand" in
mcp)
	case "${1:-}" in
	list)
		printf '%s\n' "${FAKE_CLAUDE_MCP_LIST:-devin: https://mcp.devin.ai/mcp ✔ Connected}"
		exit 0
		;;
	get)
		[[ "${2:-}" == "devin" ]] || exit 1
		printf '%s\n' "${FAKE_CLAUDE_MCP_GET:-devin:
  Scope: User config
  Status: ✔ Connected}"
		exit 0
		;;
	esac
	;;
-p)
	cat >"$FAKE_CLAUDE_PROMPT"
	printf 'delegated answer\n'
	exit 0
	;;
esac

printf 'unexpected claude invocation: %s\n' "$subcommand" >&2
exit 99
EOF
	chmod +x "$FAKE_CLAUDE"

	export CLAUDE_BIN="$FAKE_CLAUDE"
	export FAKE_CLAUDE_ARGS="$ARGS_LOG"
	export FAKE_CLAUDE_PROMPT="$PROMPT_LOG"
	export FAKE_CLAUDE_MCP_LIST="devin: https://mcp.devin.ai/mcp ✔ Connected"
	export FAKE_CLAUDE_MCP_GET=$'devin:\n  Scope: User config\n  Status: ✔ Connected'
	unset FAKE_CLAUDE_MCP_DISCONNECTED
}

run_devin_wiki() {
	local mode="$1"
	shift
	local payload="$*"
	run bash -c 'printf "%s" "$1" | env PATH="$2:$PATH" CLAUDE_BIN="$3" FAKE_CLAUDE_ARGS="$4" FAKE_CLAUDE_PROMPT="$5" FAKE_CLAUDE_MCP_LIST="$6" FAKE_CLAUDE_MCP_GET="$7" "$8" "$9"' \
		_ "$payload" "$TEST_ROOT" "$FAKE_CLAUDE" "$ARGS_LOG" "$PROMPT_LOG" \
		"${FAKE_CLAUDE_MCP_LIST}" "${FAKE_CLAUDE_MCP_GET}" "$RUNNER" "$mode"
}

assert_allowed_tools() {
	local expected="$1"
	local actual
	actual=$(jq -r '
		.[index("--allowedTools") + 1] // empty
	' "$ARGS_LOG")
	[[ "$actual" == "$expected" ]]
}

assert_disallowed_includes() {
	local needle="$1"
	local actual
	actual=$(jq -r '
		.[index("--disallowedTools") + 1] // empty
	' "$ARGS_LOG")
	[[ "$actual" == *"$needle"* ]]
}

assert_prompt_includes() {
	local needle="$1"
	rg -Fq "$needle" "$PROMPT_LOG"
}

@test "ask mode uses exact allow-list and denies generate_wiki" {
	run_devin_wiki ask "How does auth work?"

	[ "$status" -eq 0 ]
	assert_allowed_tools "ToolSearch,mcp__devin__ask_question,mcp__devin__list_available_repos"
	assert_disallowed_includes "mcp__devin__generate_wiki"
	jq -e 'index("-p")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--permission-mode")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--model")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-session-persistence")' "$ARGS_LOG" >/dev/null
}

@test "wiki mode uses exact allow-list and excludes ask_question" {
	run_devin_wiki wiki "Show wiki structure for my-repo"

	[ "$status" -eq 0 ]
	assert_allowed_tools "ToolSearch,mcp__devin__read_wiki_structure,mcp__devin__read_wiki_contents,mcp__devin__list_available_repos"
	local allowed
	allowed=$(jq -r '.[index("--allowedTools") + 1]' "$ARGS_LOG")
	[[ "$allowed" != *"ask_question"* ]]
	assert_disallowed_includes "mcp__devin__generate_wiki"
}

@test "request is passed via stdin not argv and shell metacharacters are not executed" {
	local payload='repo: foo$(touch '"$TOUCH_MARKER"')bar'
	run_devin_wiki ask "$payload"

	[ "$status" -eq 0 ]
	[ ! -e "$TOUCH_MARKER" ]
	assert_prompt_includes "$payload"
	jq -e --arg payload "$payload" 'all(. | contains($payload) | not)' "$ARGS_LOG"
	jq -e 'all(. | contains("$(touch") | not)' "$ARGS_LOG"
}

@test "disconnected Devin fails before claude -p" {
	export FAKE_CLAUDE_MCP_LIST="devin: https://mcp.devin.ai/mcp needs authentication"
	export FAKE_CLAUDE_MCP_GET="devin: https://mcp.devin.ai/mcp needs authentication"

	run_devin_wiki ask "question"

	[ "$status" -ne 0 ]
	[ ! -e "$PROMPT_LOG" ]
	[[ "$output" == *"Devin"* || "$output" == *"devin"* ]]
	[[ "$output" == *"DEVIN_API_KEY"* || "$output" == *"接続"* || "$output" == *"Connected"* ]]
}

@test "another connected server does not satisfy Devin connection gate" {
	export FAKE_CLAUDE_MCP_LIST=$'github: https://example.com ✔ Connected\ndevin: https://mcp.devin.ai/mcp needs authentication'
	export FAKE_CLAUDE_MCP_GET="devin: https://mcp.devin.ai/mcp needs authentication"

	run_devin_wiki ask "question"

	[ "$status" -ne 0 ]
	[ ! -e "$PROMPT_LOG" ]
	[[ "$output" == *"Devin"* || "$output" == *"devin"* ]]
}

@test "empty request fails" {
	run bash -c "printf '' | env PATH=\"$TEST_ROOT:\$PATH\" CLAUDE_BIN=\"$FAKE_CLAUDE\" FAKE_CLAUDE_ARGS=\"$ARGS_LOG\" FAKE_CLAUDE_PROMPT=\"$PROMPT_LOG\" \"$RUNNER\" ask"

	[ "$status" -ne 0 ]
	[ ! -e "$PROMPT_LOG" ]
}

@test "invalid mode fails" {
	run_devin_wiki generate "anything"

	[ "$status" -ne 0 ]
	[ ! -e "$PROMPT_LOG" ]
}

@test "prompt includes read-only and untrusted-content constraints" {
	run_devin_wiki ask "What is the deployment flow?"

	[ "$status" -eq 0 ]
	assert_prompt_includes "read"
	assert_prompt_includes "untrusted"
	assert_prompt_includes "generate_wiki"
	assert_prompt_includes "MUST call at least one mode-specific Devin MCP tool"
	assert_prompt_includes "do not answer from model memory"
}
