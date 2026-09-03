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
	CHILD_PID="$TEST_ROOT/child.pid"
	ATTEMPT_LOG="$TEST_ROOT/attempts.log"

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

attempt=1
if [[ -n "${FAKE_PI_ATTEMPT_LOG:-}" ]]; then
	if [[ -f "$FAKE_PI_ATTEMPT_LOG" ]]; then
		attempt=$(($(wc -l <"$FAKE_PI_ATTEMPT_LOG") + 1))
	fi
	printf '%s\n' "$attempt" >>"$FAKE_PI_ATTEMPT_LOG"
fi

printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_PI_ARGS"

config="$PI_CODING_AGENT_DIR"
retry_enabled=$(jq '.retry.enabled' "$config/settings.json")
jq -n \
	--arg config "$config" \
	--arg skip_update "${PI_SKIP_VERSION_CHECK:-}" \
	--argjson retry_enabled "$retry_enabled" \
	--argjson attempt "$attempt" \
	'{config:$config, skip_update:$skip_update, retry_enabled:$retry_enabled, attempt:$attempt}' \
	>"$FAKE_PI_ENV"

should_sleep=0
if [[ -n "${FAKE_PI_SLEEP:-}" ]]; then
	if [[ -z "${FAKE_PI_SLEEP_ATTEMPTS:-}" ]]; then
		should_sleep=1
	elif [[ ",${FAKE_PI_SLEEP_ATTEMPTS}," == *",${attempt},"* ]]; then
		should_sleep=1
	fi
fi
if ((should_sleep)); then
	sleep 60 &
	child=$!
	printf '%s\n' "$child" >"$FAKE_PI_CHILD_PID"
	if [[ -n "${FAKE_PI_SIGNAL_PARENT:-}" ]]; then
		kill "-$FAKE_PI_SIGNAL_PARENT" "$PPID"
	fi
	sleep 60
fi

exit_code="${FAKE_PI_EXIT:-0}"
if [[ -n "${FAKE_PI_EXIT_SEQUENCE:-}" ]]; then
	IFS=',' read -ra exits <<<"$FAKE_PI_EXIT_SEQUENCE"
	idx=$((attempt - 1))
	if ((idx < ${#exits[@]})); then
		exit_code="${exits[$idx]}"
	fi
fi

printf '%s\n' 'review complete'
exit "$exit_code"
EOF
	chmod +x "$FAKE_PI" "$RUNNER"
}

runner_command() {
	local timeout=5
	local retry_timeout=''
	local model="provider/model:medium"
	local attempts=1
	local -a inputs=()

	if (($# >= 2)); then
		timeout=$1
		model=$2
		shift 2
	fi
	while (($# > 0)); do
		case "$1" in
		--attempts)
			shift
			attempts=$1
			;;
		--retry-timeout)
			shift
			retry_timeout=$1
			;;
		*)
			inputs+=("$1")
			;;
		esac
		shift
	done
	if ((${#inputs[@]} == 0)); then
		inputs=("$PATCH")
	fi

	local -a cmd=("$RUNNER" --model "$model" --prompt "$PROMPT")
	local input
	for input in "${inputs[@]}"; do
		cmd+=(--input "$input")
	done
	cmd+=(--timeout "$timeout" --attempts "$attempts" --cwd "$TEST_ROOT")
	if [[ -n "$retry_timeout" ]]; then
		cmd+=(--retry-timeout "$retry_timeout")
	fi
	printf '%s\0' "${cmd[@]}"
}

apply_runner_env() {
	export PI_REVIEW_BIN="$FAKE_PI"
	export FAKE_PI_ARGS="$ARGS_LOG"
	export FAKE_PI_ENV="$ENV_LOG"
	export FAKE_PI_CHILD_PID="$CHILD_PID"
	export FAKE_PI_ATTEMPT_LOG="$ATTEMPT_LOG"
	unset FAKE_PI_SLEEP FAKE_PI_SLEEP_ATTEMPTS FAKE_PI_EXIT FAKE_PI_EXIT_SEQUENCE FAKE_PI_SIGNAL_PARENT MODEL_RESOLVER
	rm -f "$ATTEMPT_LOG"
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

assert_bash_major_at_least() {
	local label="$1"
	local major="$2"
	[[ "$major" =~ ^[0-9]+$ ]] || fail "$label returned an invalid Bash major version: $major"
	((major >= 5)) || fail "$label requires Bash 5 or newer, got major version: $major"
}

assert_runner_bash_runtime() {
	assert_bash_major_at_least "bats shell" "${BASH_VERSINFO[0]}"

	local env_bash_major
	# shellcheck disable=SC2016 # Expanded by the child Bash.
	env_bash_major=$(env bash -c 'printf "%s" "${BASH_VERSINFO[0]}"')
	assert_bash_major_at_least "env bash" "$env_bash_major"
}

write_large_safe_utf8_patch() {
	local path="$1"
	local i

	{
		printf '%s\n' 'diff --git a/src/components/Form.tsx b/src/components/Form.tsx'
		printf '%s\n' '--- a/src/components/Form.tsx'
		printf '%s\n' '+++ b/src/components/Form.tsx'
		for ((i = 1; i <= 500; i++)); do
			printf '%s\n' "+// 行${i}: Textarea — locationId=\$locationId /* 日本語コメント */"
		done
	} >"$path"
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
	cp "$BATS_TEST_DIRNAME/../../../pi/agent/resolve-model.sh" "$RESOLVER_DIR/resolve-model.sh"
	chmod +x "$RESOLVER_DIR/resolve-model.sh"
}

write_fake_catalog_with_impl_cursor() {
	RESOLVER_DIR="$TEST_ROOT/agent"
	mkdir -p "$RESOLVER_DIR"
	cat >"$RESOLVER_DIR/model-roles.json" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "impl.cursor": { "cursor": "composer-2.5-fast", "label": "Composer Fast" },
    "review.test": { "pi": "provider/from-role:high", "label": "Test Model" }
  }
}
EOF
	cp "$BATS_TEST_DIRNAME/../../../pi/agent/resolve-model.sh" "$RESOLVER_DIR/resolve-model.sh"
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

@test "--role rejects cursor-only roles" {
	write_fake_catalog_with_impl_cursor
	apply_runner_env
	export MODEL_RESOLVER="$RESOLVER_DIR/resolve-model.sh"

	run "$RUNNER" --role impl.cursor --prompt "$PROMPT" --input "$PATCH" \
		--timeout 5 --cwd "$TEST_ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *has\ no\ model\ id* ]]
	[ ! -f "$ARGS_LOG" ]
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
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "accepts large safe utf-8 patch without per-line process substitution" {
	LARGE_PATCH="$TEST_ROOT/large-safe.patch"
	write_large_safe_utf8_patch "$LARGE_PATCH"
	LARGE_PATCH=$(resolve_test_path "$LARGE_PATCH")

	run_runner 5 provider/model:medium "$LARGE_PATCH"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 1 ]
}

@test "rejects invalid diff --git header with too few tokens" {
	printf '%s\n' 'diff --git a/only' >"$PATCH"

	run_runner
	[ "$status" -ne 0 ]
	[[ "$output" == *invalid\ diff\ header* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "runner resolves bash 5 or newer" {
	assert_runner_bash_runtime
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

@test "--attempts 2 retries a normal nonzero exit and succeeds if the second attempt succeeds" {
	apply_runner_env
	export FAKE_PI_EXIT_SEQUENCE="7,0"

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 5 provider/model:medium --attempts 2)

	run "${cmd[@]}"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
}

@test "--attempts 2 retries a timeout (124) exactly once" {
	apply_runner_env
	export FAKE_PI_SLEEP=1
	export FAKE_PI_SLEEP_ATTEMPTS=1

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 1 provider/model:medium --attempts 2)

	run "${cmd[@]}"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
}

@test "success on first attempt runs only once even with --attempts 2" {
	apply_runner_env

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 5 provider/model:medium --attempts 2)

	run "${cmd[@]}"
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 1 ]
}

@test "invalid attempts are rejected cleanly" {
	apply_runner_env
	local -a bad_values=(0 -1 abc "")
	local value
	for value in "${bad_values[@]}"; do
		run "$RUNNER" --model provider/model:medium --prompt "$PROMPT" --input "$PATCH" \
			--timeout 5 --attempts "$value" --cwd "$TEST_ROOT"
		[ "$status" -ne 0 ]
		[[ "$output" == *attempts\ must\ be\ a\ positive\ integer* ]]
	done
}

@test "--retry-timeout uses distinct budget on attempt 2" {
	apply_runner_env
	export FAKE_PI_EXIT_SEQUENCE="7,0"
	export FAKE_PI_SLEEP=1
	export FAKE_PI_SLEEP_ATTEMPTS=2

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 1 provider/model:medium --attempts 2 --retry-timeout 3)

	run "${cmd[@]}"
	[ "$status" -eq 124 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
	[[ "$output" == *timed\ out\ after\ 3s* ]]
}

@test "omitting --retry-timeout keeps initial timeout on retries" {
	apply_runner_env
	export FAKE_PI_SLEEP=1
	export FAKE_PI_SLEEP_ATTEMPTS=1,2

	local -a cmd=()
	while IFS= read -r -d '' token; do
		cmd+=("$token")
	done < <(runner_command 1 provider/model:medium --attempts 2)

	run "${cmd[@]}"
	[ "$status" -eq 124 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 2 ]
	[[ "$output" == *timed\ out\ after\ 1s* ]]
	[[ "$output" != *timed\ out\ after\ 3s* ]]
}

@test "rejects unquoted spaced binary diff --git path ending in secret .env" {
	{
		printf '%s\n' 'diff --git a/safe one two/.env b/safe one two/.env'
		printf '%s\n' 'new file mode 100644'
		printf '%s\n' 'index 0000000000..f00f0a13c2'
		printf '%s\n' 'Binary files /dev/null and b/safe one two/.env differ'
	} >"$PATCH"

	run_runner
	[ "$status" -ne 0 ]
	[[ "$output" == *secret\ path\ in\ patch* ]]
	[ ! -f "$ATTEMPT_LOG" ]
}

@test "accepts unquoted spaced binary diff --git path without secret component" {
	{
		printf '%s\n' 'diff --git a/safe one two/readme.txt b/safe one two/readme.txt'
		printf '%s\n' 'new file mode 100644'
		printf '%s\n' 'index 0000000000..f00f0a13c2'
		printf '%s\n' 'Binary files /dev/null and b/safe one two/readme.txt differ'
	} >"$PATCH"

	run_runner
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 1 ]
}

@test "accepts hunk body line that looks like --- metadata" {
	{
		printf '%s\n' 'diff --git a/query.sql b/query.sql'
		printf '%s\n' '--- a/query.sql'
		printf '%s\n' '+++ b/query.sql'
		printf '%s\n' '@@ -1 +1 @@'
		printf '%s\n' '--- .env is documented here'
		printf '%s\n' '+SELECT 1;'
	} >"$PATCH"

	run_runner
	[ "$status" -eq 0 ]
	[ "$(wc -l <"$ATTEMPT_LOG" | tr -d ' ')" -eq 1 ]
}

@test "invalid retry-timeout is cleanly rejected" {
	apply_runner_env
	local -a bad_values=(0 -1 abc "")
	local value
	for value in "${bad_values[@]}"; do
		run "$RUNNER" --model provider/model:medium --prompt "$PROMPT" --input "$PATCH" \
			--timeout 5 --retry-timeout "$value" --cwd "$TEST_ROOT"
		[ "$status" -ne 0 ]
		[[ "$output" == *retry\ timeout\ must\ be\ greater\ than\ zero* ]]
		[ ! -f "$ARGS_LOG" ]
	done
}
