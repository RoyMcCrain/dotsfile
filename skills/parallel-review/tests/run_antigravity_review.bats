#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

resolve_test_path() {
	local path="$1"
	local dir base
	dir=$(cd "$(dirname "$path")" && pwd -P)
	base=$(basename "$path")
	printf '%s/%s\n' "$dir" "$base"
}

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/run-agy-review"
	TEST_HOME="$TEST_ROOT/home"
	AGENT_HOME="$TEST_HOME/.gemini/config/agents/patch-reviewer"
	mkdir -p "$AGENT_HOME" "$TEST_ROOT"
	PROMPT="$TEST_ROOT/prompt.md"
	PATCH="$TEST_ROOT/changes.patch"
	PLAN="$TEST_ROOT/plan.md"
	ARGS_LOG="$TEST_ROOT/args.json"
	STDIN_LOG="$TEST_ROOT/stdin.ndjson"
	CWD_LOG="$TEST_ROOT/agy.cwd"
	ATTEMPT_LOG="$TEST_ROOT/attempts.log"
	CHILD_PID="$TEST_ROOT/child.pid"
	CANONICAL_AGENT="$BATS_TEST_DIRNAME/../../../antigravity/agents/patch-reviewer/agent.md"
	REAL_MKTEMP=$(command -v mktemp)

	printf '%s\n' 'Review this patch' >"$PROMPT"
	printf '%s\n' 'diff --git a/a b/a' >"$PATCH"
	printf '%s\n' 'Expected behavior' >"$PLAN"

	PROMPT=$(resolve_test_path "$PROMPT")
	PATCH=$(resolve_test_path "$PATCH")
	PLAN=$(resolve_test_path "$PLAN")

	RUNNER="$BATS_TEST_DIRNAME/../scripts/run_antigravity_review.sh"
	FAKE_AGY="$TEST_ROOT/fake_agy.sh"
	cat >"$FAKE_AGY" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail

attempt=1
if [[ -n "${FAKE_AGY_ATTEMPT_LOG:-}" ]]; then
	if [[ -f "$FAKE_AGY_ATTEMPT_LOG" ]]; then
		attempt=$(($(wc -l <"$FAKE_AGY_ATTEMPT_LOG") + 1))
	fi
	printf '%s\n' "$attempt" >>"$FAKE_AGY_ATTEMPT_LOG"
fi

printf '%s\n' "$@" | jq -R . | jq -s . >"${FAKE_AGY_ARGS}.${attempt}"
cp "${FAKE_AGY_ARGS}.${attempt}" "$FAKE_AGY_ARGS"
pwd >"$FAKE_AGY_CWD"
cat >"$FAKE_AGY_STDIN"

if [[ -s "$FAKE_AGY_STDIN" ]]; then
	if ! jq -e . "$FAKE_AGY_STDIN" >/dev/null; then
		printf 'invalid stdin JSON\n' >&2
		exit 9
	fi
	if [[ "$(wc -l <"$FAKE_AGY_STDIN" | tr -d ' ')" -ne 1 ]]; then
		printf 'stdin must be compact single-line NDJSON\n' >&2
		exit 9
	fi
fi

should_sleep=0
if [[ -n "${FAKE_AGY_SLEEP:-}" ]]; then
	if [[ -z "${FAKE_AGY_SLEEP_ATTEMPTS:-}" ]]; then
		should_sleep=1
	elif [[ ",${FAKE_AGY_SLEEP_ATTEMPTS}," == *",${attempt},"* ]]; then
		should_sleep=1
	fi
fi
if ((should_sleep)); then
	sleep 60 &
	child=$!
	printf '%s\n' "$child" >"$FAKE_AGY_CHILD_PID"
	if [[ -n "${FAKE_AGY_SIGNAL_PARENT:-}" ]]; then
		kill "-$FAKE_AGY_SIGNAL_PARENT" "$PPID"
	fi
	sleep 60
fi

mode="${FAKE_AGY_MODE:-success}"
if [[ -n "${FAKE_AGY_MODE_SEQUENCE:-}" ]]; then
	IFS=',' read -ra modes <<<"$FAKE_AGY_MODE_SEQUENCE"
	idx=$((attempt - 1))
	if ((idx < ${#modes[@]})); then
		mode="${modes[$idx]}"
	fi
fi

case "$mode" in
success)
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:"## 所見\n\n重大な問題なし"}}'
	;;
empty)
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:"   "}}'
	;;
failed)
	jq -c -n '{event:"result",result:{status:"FAILED",response:"error"}}'
	;;
badjson)
	printf '%s\n' 'not-json'
	;;
missing_result)
	jq -c -n '{event:"step_update",step_update:{step_type:"thinking"}}'
	;;
tool)
	jq -c -n '{event:"step_update",step_update:{step_type:"tool",tool_name:"view_file"}}'
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:"ok"}}'
	;;
tool_error)
	jq -c -n '{event:"step_update",step_update:{step_type:"tool",tool_name:"finish",tool_info:{error:"blocked"}}}'
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:"ok"}}'
	;;
badtype)
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:42}}'
	;;
denied)
	jq -c -n '{event:"result",result:{status:"SUCCESS",response:"ok",denied_actions:[{reason:"blocked"}]}}'
	;;
nonzero)
	printf '%s\n' 'auth token missing' >&2
	exit "${FAKE_AGY_EXIT:-7}"
	;;
esac
exit 0
EOF
	chmod +x "$FAKE_AGY" "$RUNNER"

	cp "$CANONICAL_AGENT" "$AGENT_HOME/agent.md"
}

write_fake_catalog() {
	RESOLVER_DIR="$TEST_ROOT/agent"
	mkdir -p "$RESOLVER_DIR"
	cat >"$RESOLVER_DIR/model-roles.json" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.antigravity": { "agy": "gemini-test-model", "label": "Antigravity Test" },
    "review.test": { "pi": "provider/from-role:high", "label": "Test Model" }
  }
}
EOF
	cp "$BATS_TEST_DIRNAME/../../../pi/agent/resolve-model.sh" "$RESOLVER_DIR/resolve-model.sh"
	chmod +x "$RESOLVER_DIR/resolve-model.sh"
}

apply_runner_env() {
	cp "$CANONICAL_AGENT" "$AGENT_HOME/agent.md"
	export HOME="$TEST_HOME"
	export AGY_REVIEW_BIN="$FAKE_AGY"
	export FAKE_AGY_ARGS="$ARGS_LOG"
	export FAKE_AGY_STDIN="$STDIN_LOG"
	export FAKE_AGY_CWD="$CWD_LOG"
	export FAKE_AGY_CHILD_PID="$CHILD_PID"
	export FAKE_AGY_ATTEMPT_LOG="$ATTEMPT_LOG"
	export FAKE_AGY_MODE=success
	unset FAKE_AGY_SLEEP FAKE_AGY_SLEEP_ATTEMPTS FAKE_AGY_EXIT FAKE_AGY_MODE_SEQUENCE FAKE_AGY_SIGNAL_PARENT MODEL_RESOLVER
	rm -f "$ATTEMPT_LOG" "$ARGS_LOG" "$STDIN_LOG" "$CWD_LOG"
}

install_mktemp_stub() {
	local fail_call="$1"
	MKTEMP_STUB_DIR="$TEST_ROOT/bin"
	MKTEMP_LOG="$TEST_ROOT/mktemp.log"
	mkdir -p "$MKTEMP_STUB_DIR"
	cat >"$MKTEMP_STUB_DIR/mktemp" <<EOF
#!/usr/bin/env bash
real_mktemp='${REAL_MKTEMP}'
log='${MKTEMP_LOG}'
fail_call='${fail_call}'
count=0
if [[ -f "\$log" ]]; then
	count=\$(wc -l <"\$log" | tr -d ' ')
fi
call=\$((count + 1))
if [[ -n "\$fail_call" && "\$call" == "\$fail_call" ]]; then
	printf '%s FAIL\n' "\$call" >>"\$log"
	exit 1
fi
result=\$("\$real_mktemp" "\$@")
status=\$?
printf '%s %s\n' "\$call" "\$result" >>"\$log"
printf '%s\n' "\$result"
exit "\$status"
EOF
	chmod +x "$MKTEMP_STUB_DIR/mktemp"
	: >"$MKTEMP_LOG"
}

run_runner() {
	local timeout=5
	local model="gemini-test-model"
	local -a extra=()
	if (($# >= 2)); then
		timeout=$1
		model=$2
		shift 2
	fi
	extra=("$@")

	apply_runner_env
	run "$RUNNER" --model "$model" --prompt "$PROMPT" --input "$PATCH" \
		--timeout "$timeout" --cwd "$TEST_ROOT" "${extra[@]}"
}

assert_process_gone() {
	local pid="$1"
	sleep 0.1
	if kill -0 "$pid" 2>/dev/null; then
		fail "process $pid still running"
	fi
}

@test "invokes agy with verified safe args from empty cwd" {
	run_runner
	[ "$status" -eq 0 ]

	jq -e 'index("--agent")' "$ARGS_LOG" >/dev/null
	[ "$(jq -r '.[index("--agent") + 1]' "$ARGS_LOG")" = "patch-reviewer" ]
	jq -e 'index("--mode")' "$ARGS_LOG" >/dev/null
	[ "$(jq -r '.[index("--mode") + 1]' "$ARGS_LOG")" = "plan" ]
	jq -e 'index("--sandbox")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--disable-slash-commands")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--input-format")' "$ARGS_LOG" >/dev/null
	[ "$(jq -r '.[index("--input-format") + 1]' "$ARGS_LOG")" = "stream-json" ]
	jq -e 'index("--output-format")' "$ARGS_LOG" >/dev/null
	[ "$(jq -r '.[index("--output-format") + 1]' "$ARGS_LOG")" = "stream-json" ]
	jq -e 'index("--dangerously-skip-permissions")' "$ARGS_LOG" >/dev/null 2>&1 && fail "must not use --dangerously-skip-permissions"
	agy_cwd=$(<"$CWD_LOG")
	[ "$agy_cwd" != "$TEST_ROOT" ]
	[[ "$output" == *重大な問題なし* ]]
}

@test "stdin is compact single-line NDJSON" {
	run_runner
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$STDIN_LOG" | tr -d ' ')" -eq 1 ]
	jq -e '.event == "user"' "$STDIN_LOG" >/dev/null
}

@test "stdin includes prompt and multiple inputs once" {
	run_runner 5 gemini-test-model --input "$PLAN"
	[ "$status" -eq 0 ]

	jq -e '.event == "user"' "$STDIN_LOG" >/dev/null
	jq -e --arg prompt "$(<"$PROMPT")" '.message.content | contains($prompt)' "$STDIN_LOG" >/dev/null
	jq -e --arg patch "$(<"$PATCH")" '.message.content | contains($patch)' "$STDIN_LOG" >/dev/null
	jq -e --arg plan "$(<"$PLAN")" '.message.content | contains($plan)' "$STDIN_LOG" >/dev/null
}

@test "paths containing spaces and Japanese are preserved in stdin" {
	SPACE_PATCH="$TEST_ROOT/my patch 日本語.patch"
	printf '%s\n' 'diff --git a/a b/a' '+// 日本語' >"$SPACE_PATCH"
	SPACE_PATCH=$(resolve_test_path "$SPACE_PATCH")

	apply_runner_env
	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$SPACE_PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
	jq -e --arg content "$(<"$SPACE_PATCH")" '.message.content | contains($content)' "$STDIN_LOG" >/dev/null
}

@test "large UTF-8 input goes through stdin not argv" {
	LARGE_PATCH="$TEST_ROOT/large.patch"
	{
		printf '%s\n' 'diff --git a/a b/a'
		for _ in $(seq 1 200); do
			printf '%s\n' '+// 日本語テストデータ'
		done
	} >"$LARGE_PATCH"
	LARGE_PATCH=$(resolve_test_path "$LARGE_PATCH")

	apply_runner_env
	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$LARGE_PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
	[ "$(jq -r 'length' "$ARGS_LOG")" -lt 20 ]
	jq -e --arg content "$(<"$LARGE_PATCH")" '.message.content | contains($content)' "$STDIN_LOG" >/dev/null
}

@test "--role resolves agy model from catalog" {
	write_fake_catalog
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.antigravity --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
	[ "$(jq -r '.[index("--model") + 1]' "$ARGS_LOG")" = "gemini-test-model" ]
}

@test "--role rejects pi-only roles" {
	write_fake_catalog
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.test --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *has\ no\ field:\ agy* ]]
	[ ! -f "$ARGS_LOG" ]
}

@test "rejects missing agent definition before agy invocation" {
	apply_runner_env
	rm -f "$AGENT_HOME/agent.md"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *agent\ definition\ not\ found* ]]
	[ ! -f "$ARGS_LOG" ]
}

@test "rejects unsafe modified agent tools before agy invocation" {
	apply_runner_env
	sd 'finish' 'view_file' "$AGENT_HOME/agent.md"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *does\ not\ match\ trusted\ template* ]]
	[ ! -f "$ARGS_LOG" ]
}

@test "rejects modified agent body before agy invocation" {
	apply_runner_env
	sd 'strict patch-only' 'compromised reviewer' "$AGENT_HOME/agent.md"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *does\ not\ match\ trusted\ template* ]]
	[ ! -f "$ARGS_LOG" ]
}

@test "rejects secret input path" {
	apply_runner_env
	SECRET="$TEST_ROOT/.env.local"
	printf '%s\n' 'SECRET=value' >"$SECRET"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$SECRET" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *secret\ input\ path* ]]
	[ ! -f "$ARGS_LOG" ]
}

@test "rejects private key marker in patch" {
	apply_runner_env
	printf '%s\n' '+-----BEGIN PRIVATE KEY-----' >"$PATCH"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "rejects private key marker in prompt" {
	apply_runner_env
	printf '%s\n' '-----BEGIN PRIVATE KEY-----' >"$PROMPT"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "rejects private key marker in non-patch txt input with diff prefix" {
	apply_runner_env
	CHANGES="$TEST_ROOT/changes.txt"
	printf '%s\n' '+-----BEGIN PRIVATE KEY-----' '+secret' >"$CHANGES"
	CHANGES=$(resolve_test_path "$CHANGES")

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$CHANGES" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "rejects private key marker in md input with deleted diff prefix" {
	apply_runner_env
	NOTES="$TEST_ROOT/notes.md"
	printf '%s\n' '------BEGIN ENCRYPTED PRIVATE KEY-----' >"$NOTES"
	NOTES=$(resolve_test_path "$NOTES")

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$NOTES" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "rejects private key marker in extensionless input with space prefix" {
	apply_runner_env
	CHANGES="$TEST_ROOT/changes"
	printf '%s\n' ' -----BEGIN RSA PRIVATE KEY-----' >"$CHANGES"
	CHANGES=$(resolve_test_path "$CHANGES")

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$CHANGES" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "allows private key marker as code string in txt input" {
	apply_runner_env
	CHANGES="$TEST_ROOT/changes.txt"
	printf '%s\n' '+    "-----BEGIN PRIVATE KEY-----",' >"$CHANGES"
	CHANGES=$(resolve_test_path "$CHANGES")

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$CHANGES" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
}

@test "dies when agy work dir mktemp fails before reviewer invocation" {
	apply_runner_env
	install_mktemp_stub 1

	run env PATH="$MKTEMP_STUB_DIR:$PATH" "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *failed\ to\ create\ agy\ work\ directory* ]]
	[ ! -f "$ARGS_LOG" ]
	[ "$(wc -l <"$MKTEMP_LOG" | tr -d ' ')" -eq 1 ]
}

@test "dies when empty cwd mktemp fails and cleans work dir" {
	apply_runner_env
	install_mktemp_stub 2

	run env PATH="$MKTEMP_STUB_DIR:$PATH" "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *failed\ to\ create\ agy\ empty\ cwd* ]]
	[ ! -f "$ARGS_LOG" ]
	[ "$(wc -l <"$MKTEMP_LOG" | tr -d ' ')" -eq 2 ]
	work_dir=$(awk '$1 == 1 { print $2; exit }' "$MKTEMP_LOG")
	[ -n "$work_dir" ]
	[ ! -d "$work_dir" ]
}

@test "rejects empty successful agy response" {
	apply_runner_env
	export FAKE_AGY_MODE=empty

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *response\ is\ empty* ]]
}

@test "rejects failed agy result status" {
	apply_runner_env
	export FAKE_AGY_MODE=failed

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *failed\ with\ status* ]]
}

@test "rejects malformed JSON in stream output" {
	apply_runner_env
	export FAKE_AGY_MODE=badjson

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *malformed\ JSON* ]]
}

@test "rejects stream without result event" {
	apply_runner_env
	export FAKE_AGY_MODE=missing_result

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *without\ result\ event* ]]
}

@test "rejects unsafe tool usage in stream output" {
	apply_runner_env
	export FAKE_AGY_MODE=tool

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *unsafe\ tool\ call* ]]
}

@test "rejects finish tool error in stream output" {
	apply_runner_env
	export FAKE_AGY_MODE=tool_error

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *tool\ call\ denied\ or\ failed* ]]
}

@test "rejects non-string response in stream output" {
	apply_runner_env
	export FAKE_AGY_MODE=badtype

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *missing\ response* ]]
}

@test "rejects denied actions in result" {
	apply_runner_env
	export FAKE_AGY_MODE=denied

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *denied\ actions* ]]
}

@test "retries once after invalid output then succeeds" {
	apply_runner_env
	export FAKE_AGY_MODE=empty
	export FAKE_AGY_MODE_SEQUENCE="empty,success"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 2 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
}

@test "two failures then timeout then succeeds on attempt 4" {
	apply_runner_env
	export FAKE_AGY_SLEEP=1
	export FAKE_AGY_SLEEP_ATTEMPTS=3
	export FAKE_AGY_MODE_SEQUENCE="empty,badjson,success"

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 1 --attempts 4 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 4 ]
	[[ "$output" == *重大な問題なし* ]]
}

@test "success on first attempt runs only once with --attempts 2" {
	run_runner 5 gemini-test-model --attempts 2
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 1 ]
}

@test "success cancels watchdog promptly" {
	run_runner 5 gemini-test-model --attempts 1
	[ "$status" -eq 0 ]
	[ ! -f "$CHILD_PID" ]
}

@test "timeout kills process group and returns 124" {
	apply_runner_env
	export FAKE_AGY_SLEEP=1

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 1 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -eq 124 ]
	[[ "$output" == *timed\ out* ]]
	[ -f "$CHILD_PID" ]
	assert_process_gone "$(cat "$CHILD_PID")"
}

@test "TERM on runner kills fake agy descendants" {
	apply_runner_env
	export FAKE_AGY_SLEEP=1

	"$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 30 --attempts 1 --cwd "$TEST_ROOT" &
	runner_pid=$!
	for _ in $(seq 1 50); do
		[[ -f "$CHILD_PID" ]] && break
		sleep 0.05
	done
	[[ -f "$CHILD_PID" ]] || fail "fake agy child pid not recorded"
	child_pid=$(<"$CHILD_PID")
	kill -TERM "$runner_pid"
	wait "$runner_pid" || true
	assert_process_gone "$child_pid"
}

@test "--retry-timeout uses distinct print-timeout on attempt 2" {
	apply_runner_env
	export FAKE_AGY_SLEEP=1
	export FAKE_AGY_SLEEP_ATTEMPTS=1,2

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 1 --retry-timeout 3 --attempts 2 --cwd "$TEST_ROOT"
	[ "$status" -eq 124 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
	[ "$(jq -r '.[index("--print-timeout") + 1]' "${ARGS_LOG}.2")" = "3s" ]
}

@test "propagates nonzero exit from agy with stderr tail" {
	apply_runner_env
	export FAKE_AGY_MODE=nonzero
	export FAKE_AGY_EXIT=7

	run "$RUNNER" --model gemini-test-model --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --attempts 1 --cwd "$TEST_ROOT"
	[ "$status" -eq 7 ]
	[[ "$output" == *auth\ token\ missing* ]]
}
