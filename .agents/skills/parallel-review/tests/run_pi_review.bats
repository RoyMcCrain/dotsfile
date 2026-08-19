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
	TEST_ROOT="$BATS_TEST_TMPDIR/run-pi-review"
	mkdir -p "$TEST_ROOT"
	PROMPT="$TEST_ROOT/prompt.md"
	PATCH="$TEST_ROOT/changes.patch"
	PLAN="$TEST_ROOT/plan.md"
	ARGS_LOG="$TEST_ROOT/args.json"
	ENV_LOG="$TEST_ROOT/env.json"
	CURSOR_ARGS_LOG="$TEST_ROOT/cursor-args.json"
	CHILD_PID="$TEST_ROOT/child.pid"

	printf '%s\n' 'Review this patch' >"$PROMPT"
	printf '%s\n' 'diff --git a/a b/a' >"$PATCH"
	printf '%s\n' 'Expected behavior' >"$PLAN"

	PROMPT=$(resolve_test_path "$PROMPT")
	PATCH=$(resolve_test_path "$PATCH")
	PLAN=$(resolve_test_path "$PLAN")

	RUNNER="$BATS_TEST_DIRNAME/../scripts/run_pi_review.sh"
	FAKE_PI="$TEST_ROOT/fake_pi.sh"
	cat >"$FAKE_PI" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail

printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_PI_ARGS"

config="$PI_CODING_AGENT_DIR"
retry_enabled=$(jq '.retry.enabled' "$config/settings.json")
jq -n \
	--arg config "$config" \
	--arg skip_update "${PI_SKIP_VERSION_CHECK:-}" \
	--argjson retry_enabled "$retry_enabled" \
	'{config:$config, skip_update:$skip_update, retry_enabled:$retry_enabled}' \
	>"$FAKE_PI_ENV"

if [[ -n "${FAKE_PI_SLEEP:-}" ]]; then
	sleep 60 &
	child=$!
	printf '%s\n' "$child" >"$FAKE_PI_CHILD_PID"
	if [[ -n "${FAKE_PI_SIGNAL_PARENT:-}" ]]; then
		kill "-$FAKE_PI_SIGNAL_PARENT" "$PPID"
	fi
	sleep 60
fi

printf '%s\n' 'review complete'
exit "${FAKE_PI_EXIT:-0}"
EOF
	chmod +x "$FAKE_PI" "$RUNNER"

	FAKE_CURSOR="$TEST_ROOT/fake_cursor_agent.sh"
	cat >"$FAKE_CURSOR" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail

printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_CURSOR_ARGS"

if [[ -n "${FAKE_CURSOR_SLEEP:-}" ]]; then
	sleep 60 &
	child=$!
	printf '%s\n' "$child" >"$FAKE_CURSOR_CHILD_PID"
	if [[ -n "${FAKE_CURSOR_SIGNAL_PARENT:-}" ]]; then
		kill "-$FAKE_CURSOR_SIGNAL_PARENT" "$PPID"
	fi
	sleep 60
fi

printf '%s\n' 'cursor review complete'
exit "${FAKE_CURSOR_EXIT:-0}"
EOF
	chmod +x "$FAKE_CURSOR"
}

runner_command() {
	local timeout=5
	local model="provider/model:medium"
	local -a inputs=()

	if (($# >= 2)); then
		timeout=$1
		model=$2
		shift 2
	fi
	inputs=("$@")
	if ((${#inputs[@]} == 0)); then
		inputs=("$PATCH")
	fi

	local -a cmd=("$RUNNER" --model "$model" --prompt "$PROMPT")
	local input
	for input in "${inputs[@]}"; do
		cmd+=(--input "$input")
	done
	cmd+=(--timeout "$timeout" --cwd "$TEST_ROOT")
	printf '%s\0' "${cmd[@]}"
}

apply_runner_env() {
	export PI_REVIEW_BIN="$FAKE_PI"
	export FAKE_PI_ARGS="$ARGS_LOG"
	export FAKE_PI_ENV="$ENV_LOG"
	export FAKE_PI_CHILD_PID="$CHILD_PID"
	export CURSOR_REVIEW_BIN="$FAKE_CURSOR"
	export FAKE_CURSOR_ARGS="$CURSOR_ARGS_LOG"
	export FAKE_CURSOR_CHILD_PID="$CHILD_PID"
	unset FAKE_PI_SLEEP FAKE_PI_EXIT FAKE_PI_SIGNAL_PARENT \
		FAKE_CURSOR_SLEEP FAKE_CURSOR_EXIT FAKE_CURSOR_SIGNAL_PARENT MODEL_RESOLVER
}

run_runner() {
	local timeout=5
	local model="provider/model:medium"
	local -a inputs=()

	if (($# >= 2)); then
		timeout=$1
		model=$2
		shift 2
	fi
	inputs=("$@")
	if ((${#inputs[@]} == 0)); then
		inputs=("$PATCH")
	fi

	apply_runner_env

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command "$timeout" "$model" "${inputs[@]}")

	run "${cmd[@]}"
}

assert_process_gone() {
	local pid="$1"
	sleep 0.1
	if kill -0 "$pid" 2>/dev/null; then
		fail "process $pid still running"
	fi
}

assert_tools_absent() {
	if jq -e 'index("--tools")' "$ARGS_LOG" >/dev/null 2>&1; then
		fail "--tools should not be present"
	fi
}

assert_runner_signal() {
	local signal=$1
	local expected_status=$2

	apply_runner_env
	export FAKE_PI_SLEEP=1
	export FAKE_PI_SIGNAL_PARENT="$signal"

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 10 provider/model:medium)

	run "${cmd[@]}"
	[ "$status" -eq "$expected_status" ]
	[ -f "$CHILD_PID" ]
	assert_process_gone "$(cat "$CHILD_PID")"
}

@test "builds isolated read-only command" {
	run_runner
	[ "$status" -eq 0 ]

	jq -e 'index("--no-session")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-skills")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-prompt-templates")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-context-files")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-approve")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-extensions")' "$ARGS_LOG" >/dev/null
	jq -e 'index("--no-tools")' "$ARGS_LOG" >/dev/null
	assert_tools_absent

	model=$(jq -r '.[index("--model") + 1]' "$ARGS_LOG")
	[ "$model" = "provider/model:medium" ]
	jq -e --arg patch "@$PATCH" 'index($patch)' "$ARGS_LOG" >/dev/null
	jq -e --arg prompt "@$PROMPT" 'index($prompt)' "$ARGS_LOG" >/dev/null

	jq -e '.skip_update == "1"' "$ENV_LOG" >/dev/null
	jq -e '.retry_enabled == false' "$ENV_LOG" >/dev/null
}

@test "multiple inputs stay toolless" {
	run_runner 5 provider/model:medium "$PATCH" "$PLAN"
	[ "$status" -eq 0 ]

	jq -e 'index("--no-tools")' "$ARGS_LOG" >/dev/null
	assert_tools_absent
	jq -e --arg patch "@$PATCH" 'index($patch)' "$ARGS_LOG" >/dev/null
	jq -e --arg plan "@$PLAN" 'index($plan)' "$ARGS_LOG" >/dev/null
}

@test "--role review.cursor uses cursor-agent in ask mode" {
	write_fake_catalog_with_cursor
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.cursor --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]

	jq -e 'index("-p")' "$CURSOR_ARGS_LOG" >/dev/null
	mode=$(jq -r '.[index("--mode") + 1]' "$CURSOR_ARGS_LOG")
	[ "$mode" = "ask" ]
	jq -e 'index("--trust")' "$CURSOR_ARGS_LOG" >/dev/null
	if jq -e 'index("--force")' "$CURSOR_ARGS_LOG" >/dev/null 2>&1; then
		fail "--force should not be present for cursor review"
	fi

	model=$(jq -r '.[index("--model") + 1]' "$CURSOR_ARGS_LOG")
	[ "$model" = "cursor-grok-4.6-high" ]
	workspace=$(jq -r '.[index("--workspace") + 1]' "$CURSOR_ARGS_LOG")
	expected_cwd=$(cd "$TEST_ROOT" && pwd -P)
	[ "$workspace" = "$expected_cwd" ]

	prompt_arg=$(jq -r '.[-1]' "$CURSOR_ARGS_LOG")
	[[ "$prompt_arg" == *prompt.md* ]]
	[[ "$prompt_arg" == *changes.patch* ]]

	[ ! -f "$ARGS_LOG" ]
}

@test "cursor role propagates exit status" {
	write_fake_catalog_with_cursor
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"
	export FAKE_CURSOR_EXIT=7

	run "$RUNNER" --role review.cursor --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 7 ]
}

@test "cursor role timeout kills process group" {
	write_fake_catalog_with_cursor
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"
	export FAKE_CURSOR_SLEEP=1

	run "$RUNNER" --role review.cursor --prompt "$PROMPT" --input "$PATCH" \
		--timeout 1 --cwd "$TEST_ROOT"
	[ "$status" -eq 124 ]
	[[ "$output" == *timed\ out* ]]
	[ -f "$CHILD_PID" ]
	assert_process_gone "$(cat "$CHILD_PID")"
}

write_fake_catalog() {
	RESOLVER_DIR="$TEST_ROOT/agent"
	mkdir -p "$RESOLVER_DIR"
	cat >"$RESOLVER_DIR/model-roles.json" <<'EOF'
{
  "enabledModels": ["provider/from-role:high"],
  "roles": {
    "review.test": { "pi": "provider/from-role:high", "label": "Test Model" }
  }
}
EOF
	cp "$BATS_TEST_DIRNAME/../../../../pi/agent/resolve-model.sh" "$RESOLVER_DIR/resolve-model.sh"
	chmod +x "$RESOLVER_DIR/resolve-model.sh"
}

write_fake_catalog_with_cursor() {
	RESOLVER_DIR="$TEST_ROOT/agent"
	mkdir -p "$RESOLVER_DIR"
	cat >"$RESOLVER_DIR/model-roles.json" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.cursor": { "cursor": "cursor-grok-4.6-high", "label": "Cursor Grok" },
    "review.test": { "pi": "provider/from-role:high", "label": "Test Model" }
  }
}
EOF
	cp "$BATS_TEST_DIRNAME/../../../../pi/agent/resolve-model.sh" "$RESOLVER_DIR/resolve-model.sh"
	chmod +x "$RESOLVER_DIR/resolve-model.sh"
}

@test "--role resolves the model id from the catalog" {
	write_fake_catalog
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.test --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -eq 0 ]

	model=$(jq -r '.[index("--model") + 1]' "$ARGS_LOG")
	[ "$model" = "provider/from-role:high" ]
}

@test "--role rejects an unknown role" {
	write_fake_catalog
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.missing --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *unknown\ model\ role* ]]
}

@test "--role and --model are mutually exclusive" {
	write_fake_catalog
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role review.test --model provider/model:medium \
		--prompt "$PROMPT" --input "$PATCH" --timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *mutually\ exclusive* ]]
}

@test "propagates exit status" {
	apply_runner_env
	export FAKE_PI_EXIT=7

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command)

	run "${cmd[@]}"
	[ "$status" -eq 7 ]
}

@test "normal completion cancels watchdog immediately" {
	local started=$SECONDS

	run_runner 5 provider/model:medium

	[ "$status" -eq 0 ]
	[ "$((SECONDS - started))" -lt 3 ]
	[[ "$output" != *Terminated* ]]
}

@test "timeout kills process group" {
	apply_runner_env
	export FAKE_PI_SLEEP=1

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 1 provider/model:medium)

	run "${cmd[@]}"
	[ "$status" -eq 124 ]
	[[ "$output" == *timed\ out* ]]
	[ -f "$CHILD_PID" ]
	assert_process_gone "$(cat "$CHILD_PID")"
}

@test "decimal timeout is accepted and returns 124" {
	apply_runner_env
	export FAKE_PI_SLEEP=1

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 1.2 provider/model:medium)

	run "${cmd[@]}"
	[ "$status" -eq 124 ]
	[[ "$output" == *timed\ out* ]]
	[ -f "$CHILD_PID" ]
	assert_process_gone "$(cat "$CHILD_PID")"
}

@test "invalid timeout is cleanly rejected" {
	apply_runner_env
	local -a bad_values=(0 -1 abc "")
	local value
	for value in "${bad_values[@]}"; do
		run "$RUNNER" --model provider/model:medium --prompt "$PROMPT" --input "$PATCH" --timeout "$value" --cwd "$TEST_ROOT"
		[ "$status" -ne 0 ]
		[[ "$output" == *timeout\ must\ be\ greater\ than\ zero* ]]
	done
}

@test "paths containing spaces preserve one argument boundary" {
	SPACE_PATCH="$TEST_ROOT/my patch.patch"
	printf '%s\n' 'diff --git a/a b/a' >"$SPACE_PATCH"
	SPACE_PATCH=$(resolve_test_path "$SPACE_PATCH")

	run_runner 5 provider/model:medium "$SPACE_PATCH"
	[ "$status" -eq 0 ]
	jq -e --arg patch "@$SPACE_PATCH" 'index($patch)' "$ARGS_LOG" >/dev/null
}

@test "sigterm kills process group" {
	assert_runner_signal TERM 143
}

@test "sighup kills process group" {
	assert_runner_signal HUP 129
}

@test "sigint kills process group" {
	assert_runner_signal INT 130
}

@test "rejects secret input path" {
	SECRET="$TEST_ROOT/.env.local"
	printf '%s\n' 'SECRET=value' >"$SECRET"

	run_runner 5 provider/model:medium "$SECRET"
	[ "$status" -ne 0 ]
	[[ "$output" == *secret\ input\ path* ]]
}

@test "rejects symlink to secret input path" {
	SECRET="$TEST_ROOT/.env.local"
	SAFE_LINK="$TEST_ROOT/safe.patch"
	printf '%s\n' 'SECRET=value' >"$SECRET"
	ln -s .env.local "$SAFE_LINK"

	run_runner 5 provider/model:medium "$SAFE_LINK"
	[ "$status" -ne 0 ]
	[[ "$output" == *secret\ input\ path* ]]
}

@test "rejects secret path inside patch" {
	printf '%s\n' 'diff --git a/.env b/.env' '--- a/.env' '+++ b/.env' >"$PATCH"

	run_runner
	[ "$status" -ne 0 ]
	[[ "$output" == *secret\ path\ in\ patch* ]]
}

@test "rejects actual private key header" {
	printf '%s\n' '+-----BEGIN PRIVATE KEY-----' '+secret' >"$PATCH"

	run_runner
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
}

@test "rejects encrypted private key header" {
	printf '%s\n' '+-----BEGIN ENCRYPTED PRIVATE KEY-----' '+secret' >"$PATCH"

	run_runner
	[ "$status" -ne 0 ]
	[[ "$output" == *private\ key\ marker* ]]
}

@test "allows private key marker as code string" {
	printf '%s\n' '+    "-----BEGIN PRIVATE KEY-----",' >"$PATCH"

	run_runner
	[ "$status" -eq 0 ]
}

@test "does not parse plan as diff" {
	printf '%s\n' '--- .env is excluded' >"$PLAN"

	run_runner 5 provider/model:medium "$PATCH" "$PLAN"
	[ "$status" -eq 0 ]
}
