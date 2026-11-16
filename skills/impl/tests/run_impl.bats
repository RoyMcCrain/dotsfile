#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)"
REAL_RESOLVER="$REPO_ROOT/pi/agent/resolve-model.sh"

resolve_test_path() {
	local path="$1"
	local dir base
	dir=$(cd "$(dirname "$path")" && pwd -P)
	base=$(basename "$path")
	printf '%s/%s\n' "$dir" "$base"
}

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/run-impl"
	REAL_BUN=$(command -v bun)
	mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/agent" "$TEST_ROOT/work" "$TEST_ROOT/tmp" "$TEST_ROOT/impl-runs"
	PATH="$TEST_ROOT/bin:$PATH"
	export PATH REAL_BUN
	export TMPDIR="$TEST_ROOT/tmp"
	export IMPL_RUNS_DIR="$TEST_ROOT/impl-runs"
	export HOME="$TEST_ROOT/home"
	mkdir -p "$HOME"
	PROMPT="$TEST_ROOT/work/impl prompt.md"
	printf '%s\n' 'Implement the feature.' >"$PROMPT"
	PROMPT=$(resolve_test_path "$PROMPT")

	ARGS_LOG="$TEST_ROOT/args.json"
	USAGE_CALL_MARKER="$TEST_ROOT/usage-calls"
	export USAGE_CALL_MARKER
	ENV_LOG="$TEST_ROOT/env.json"
	CONFIG_SNAP="$TEST_ROOT/config-snap.json"
	FAKE_PI="$TEST_ROOT/bin/pi"
	FIXTURE_CATALOG="$TEST_ROOT/agent/model-roles.json"

	RUNNER="$BATS_TEST_DIRNAME/../scripts/run_impl.sh"

	write_fixture_catalog
	write_fake_pi
	write_fake_bun
	export IMPL_USAGE_FIXTURE='{"claude":{"unavailable":"unknown"},"openai":{"unavailable":"unknown"}}'

	export MODEL_ROLES_FILE="$FIXTURE_CATALOG"
	export MODEL_RESOLVER="$REAL_RESOLVER"
	export PI_IMPL_BIN="$FAKE_PI"
	export PI_CODING_AGENT_DIR="$TEST_ROOT/agent"
	export FAKE_PI_ARGS="$ARGS_LOG"
	export FAKE_PI_ENV="$ENV_LOG"
	export FAKE_PI_CONFIG_SNAP="$CONFIG_SNAP"
	unset FAKE_PI_EXIT FAKE_PI_DROP_FILE FAKE_PI_TOUCH BAD_MODEL
}

write_fixture_catalog() {
	local pi_model=${1:-openai-codex/gpt-6-luna:high}
	cat >"$FIXTURE_CATALOG" <<EOF
{
  "enabledModels": ["$pi_model", "provider/other:high"],
  "roles": {
    "impl.default": {
      "pi": "$pi_model",
      "label": "GPT-6 Luna High"
    },
    "impl.haiku": {
      "pi": "provider/haiku:high",
      "label": "Claude Haiku"
    },
    "impl.luna": {
      "pi": "$pi_model",
      "label": "GPT-6 Luna High"
    },
    "review.test": {
      "pi": "provider/other:high",
      "label": "Other Pi"
    },
    "impl.cursor": {
      "cursor": "composer-fast",
      "label": "Composer Fast"
    }
  }
}
EOF
}

write_fake_bun() {
	cat >"$TEST_ROOT/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
	if [[ "$arg" == */query_impl_usage.ts ]]; then
		printf '%s\n' invoked >>"${USAGE_CALL_MARKER:?}"
		printf '%s\n' "${IMPL_USAGE_FIXTURE:?}"
		exit 0
	fi
done
exec "$REAL_BUN" "$@"
EOF
	chmod +x "$TEST_ROOT/bin/bun"
}

write_fake_pi() {
	cat >"$FAKE_PI" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' "$@" | jq -R . | jq -s . >"${FAKE_PI_ARGS:?}"
config="${PI_CODING_AGENT_DIR:?}"
printf '%s\n' '{}' >"$config/models-store.json"
json_mode=false
for ((i = 1; i < $#; i++)); do
	if [[ "${!i}" == "--mode" ]]; then
		j=$((i + 1))
		if [[ "${!j}" == "json" ]]; then
			json_mode=true
		fi
	fi
done
auth_link=false
models_link=false
auth_present=false
[[ -L "$config/auth.json" ]] && auth_link=true
[[ -L "$config/models.json" ]] && models_link=true
[[ -e "$config/auth.json" ]] && auth_present=true
system_prompt=""
for ((i = 1; i < $#; i++)); do
	if [[ "${!i}" == "--system-prompt" ]]; then
		j=$((i + 1))
		system_prompt="${!j}"
	fi
done
system_readable=false
if [[ -n "$system_prompt" && -r "$system_prompt" ]]; then
	system_readable=true
fi
jq -n \
	--arg config "$config" \
	--arg offline "${PI_OFFLINE:-}" \
	--arg skip "${PI_SKIP_VERSION_CHECK:-}" \
	--arg telem "${PI_TELEMETRY:-}" \
	--arg usage_credits "${PI_CLAUDE_CODE_ALLOW_USAGE_CREDITS:-}" \
	--arg pwd "$PWD" \
	--arg system_prompt "$system_prompt" \
	--argjson auth_link "$auth_link" \
	--argjson models_link "$models_link" \
	--argjson auth_present "$auth_present" \
	--argjson system_readable "$system_readable" \
	'{
		config: $config,
		pi_offline: $offline,
		pi_skip_version_check: $skip,
		pi_telemetry: $telem,
		usage_credits: $usage_credits,
		cwd: $pwd,
		dotenv_canary_present: (env | has("DOTSFILE_DOTENV_CANARY")),
		auth_link: $auth_link,
		models_link: $models_link,
		auth_present: $auth_present,
		system_prompt: $system_prompt,
		system_readable: $system_readable
	}' >"${FAKE_PI_ENV:?}"
if [[ -f "$config/settings.json" ]]; then
	jq -n \
		--slurpfile settings "$config/settings.json" \
		'{
			settings: $settings[0]
		}' >"${FAKE_PI_CONFIG_SNAP:?}"
fi
if [[ -n "${FAKE_PI_DROP_FILE:-}" ]]; then
	printf 'extra\n' >"$config/$FAKE_PI_DROP_FILE"
fi
if [[ "$json_mode" == true ]]; then
	if [[ -n "${FAKE_PI_STREAM_FILE:-}" && -f "$FAKE_PI_STREAM_FILE" ]]; then
		cat "$FAKE_PI_STREAM_FILE"
	else
		text="${FAKE_PI_STDOUT_TEXT:-done}"
		printf '%s\n' \
			'{"type":"message_start","message":{"role":"assistant"}}' \
			"{\"type\":\"message_end\",\"message\":{\"role\":\"assistant\",\"stopReason\":\"stop\",\"content\":[{\"type\":\"text\",\"text\":\"$text\"}],\"usage\":{\"input\":3,\"output\":2,\"cacheRead\":0,\"cacheWrite\":0,\"cost\":{\"total\":0.001}}}}" \
			'{"type":"agent_settled","aborted":false}'
	fi
fi
exit "${FAKE_PI_EXIT:-0}"
EOF
	chmod +x "$FAKE_PI"
}

latest_run_dir() {
	local root=${1:-$IMPL_RUNS_DIR}
	fd -t d -d 1 . "$root" | head -n 1
}

write_echo_resolver() {
	local model=$1
	local dest=${2:-"$TEST_ROOT/bin/bad-resolver.sh"}
	cat >"$dest" <<EOF
#!/usr/bin/env bash
printf '%s\n' '$model'
EOF
	chmod +x "$dest"
}

args_contains() {
	jq -e --arg needle "$1" 'map(select(. == $needle)) | length > 0' "$ARGS_LOG" >/dev/null
}

args_has_prefix_pair() {
	local flag=$1
	local value=$2
	jq -e --arg flag "$flag" --arg value "$value" '
		[range(0; length - 1) as $i | select(.[$i] == $flag and .[$i + 1] == $value)] | length > 0
	' "$ARGS_LOG" >/dev/null
}

args_at_prompt() {
	local prompt=$1
	jq -e --arg prompt "@$prompt" 'map(select(. == $prompt)) | length == 1' "$ARGS_LOG" >/dev/null
}

run_log_dir() {
	printf '%s\n' "$1" | rg '^run_impl.sh: run log directory: ' | sd '^run_impl.sh: run log directory: ' ''
}

set_haiku_model() {
	local model=$1
	jq --arg model "$model" '.enabledModels += [$model] | .roles["impl.haiku"].pi = $model' "$FIXTURE_CATALOG" >"$FIXTURE_CATALOG.tmp"
	mv "$FIXTURE_CATALOG.tmp" "$FIXTURE_CATALOG"
}

@test "run_impl: defaults use fallback Haiku first and invocation cwd" {
	local work_dir
	work_dir=$(cd "$TEST_ROOT/work" && pwd -P)
	cd "$work_dir" || exit 1
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/haiku:high"
	jq -e --arg cwd "$work_dir" '.cwd == $cwd' "$ENV_LOG" >/dev/null
}

@test "run_impl: --role selects alternate catalog role" {
	run "$RUNNER" --prompt "$PROMPT" --role review.test
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/other:high"
}

@test "run_impl: default and omitted roles alternate while pins do not consume turns" {
	local roles=() dir role_root="$TEST_ROOT/separate-runs"
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":50},"openai":{"remainingPercent":50}}'
	for role in '' impl.haiku impl.luna impl.default '' impl.default; do
		if [[ -n "$role" ]]; then
			run "$RUNNER" --prompt "$PROMPT" --role "$role"
		else
			run "$RUNNER" --prompt "$PROMPT"
		fi
		[ "$status" -eq 0 ]
		dir=$(run_log_dir "$output")
		[[ -n "$dir" ]]
		roles+=("$(jq -r .role "$dir/metadata.json")")
	done
	[[ "${roles[*]}" == "impl.haiku impl.haiku impl.luna impl.luna impl.haiku impl.luna" ]]

	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$role_root"
	[ "$status" -eq 0 ]
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.haiku"' "$dir/metadata.json" >/dev/null

	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.haiku"' "$dir/metadata.json" >/dev/null
}

@test "run_impl: catalog change updates --model on subsequent run" {
	run "$RUNNER" --prompt "$PROMPT" --role impl.luna
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	write_fixture_catalog "openrouter/vendor/model:high"
	run "$RUNNER" --prompt "$PROMPT" --role impl.luna
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openrouter/vendor/model:high"
}

@test "run_impl: spaces in prompt and cwd paths work" {
	local spaced_dir="$TEST_ROOT/with spaces"
	local spaced_prompt="$spaced_dir/task prompt.md"
	mkdir -p "$spaced_dir"
	printf 'task\n' >"$spaced_prompt"
	spaced_prompt=$(resolve_test_path "$spaced_prompt")
	spaced_dir=$(resolve_test_path "$spaced_dir")
	run "$RUNNER" --prompt "$spaced_prompt" --cwd "$spaced_dir"
	[ "$status" -eq 0 ]
	jq -e --arg cwd "$spaced_dir" '.cwd == $cwd' "$ENV_LOG" >/dev/null
	args_at_prompt "$spaced_prompt"
}

@test "run_impl: relative prompt path resolves before cwd change" {
	local rel_root="$TEST_ROOT/rel"
	local other_cwd="$TEST_ROOT/other"
	mkdir -p "$rel_root/sub" "$other_cwd"
	local rel_prompt="sub/rel prompt.md"
	printf 'rel\n' >"$rel_root/$rel_prompt"
	cd "$rel_root" || exit 1
	run "$RUNNER" --prompt "$rel_prompt" --cwd "$other_cwd"
	[ "$status" -eq 0 ]
	jq -e --arg suffix "/sub/rel prompt.md" 'map(select(endswith($suffix))) | length >= 1' "$ARGS_LOG" >/dev/null
	jq -e --arg cwd "$(cd "$other_cwd" && pwd -P)" '.cwd == $cwd' "$ENV_LOG" >/dev/null
}

@test "run_impl: tilde prompt path expands before relative resolution" {
	local home_dir="$TEST_ROOT/home"
	mkdir -p "$home_dir"
	home_dir=$(cd "$home_dir" && pwd -P)
	local home_prompt="$home_dir/task.md"
	printf 'tilde\n' >"$home_prompt"
	# shellcheck disable=SC2088
	run env HOME="$home_dir" "$RUNNER" --prompt "~/task.md" --cwd "$TEST_ROOT/work"
	[ "$status" -eq 0 ]
	args_at_prompt "$home_prompt"
}

@test "run_impl: passes Pi isolation flags and implementation tools" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	for flag in -p --mode json --no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp --no-approve; do
		args_contains "$flag"
	done
	args_has_prefix_pair --tools "read,bash,edit,write"
	args_contains "Implement the supplied task directly."
	jq -e 'map(select(. == "--system-prompt")) | length == 1' "$ARGS_LOG" >/dev/null
	if args_contains "--no-tools"; then
		false
	fi
}

@test "run_impl: Claude Haiku explicitly loads only provider package and disables usage credits" {
	local package="$TEST_ROOT/claude-extension"
	mkdir -p "$package" "$TEST_ROOT/work/other"
	set_haiku_model "claude-code/synthetic-haiku:high"
	export PI_CLAUDE_CODE_EXTENSION="$package" PI_CLAUDE_CODE_ALLOW_USAGE_CREDITS=1
	export PI_CLAUDE_CODE_EXTENSION="$TEST_ROOT/missing-extension"
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":10},"openai":{"remainingPercent":90}}'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	jq -e 'index("-e") == null' "$ARGS_LOG" >/dev/null
	export PI_CLAUDE_CODE_EXTENSION="$package"
	export IMPL_USAGE_FIXTURE='{"claude":{"unavailable":"unknown"},"openai":{"unavailable":"unknown"}}'
	run "$RUNNER" --prompt "$PROMPT" --cwd "$TEST_ROOT/work/other"
	[ "$status" -eq 0 ]
	args_has_prefix_pair -e "$package"
	args_contains --no-extensions
	jq -e '[.[] | select(. == "-e")] | length == 1' "$ARGS_LOG" >/dev/null
	jq -e '.usage_credits == "0"' "$ENV_LOG" >/dev/null
	jq -e '.role == "impl.haiku" and .resolvedModel == "claude-code/synthetic-haiku:high"' "$(run_log_dir "$output")/metadata.json" >/dev/null

	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e 'index("-e") == null' "$ARGS_LOG" >/dev/null
	jq -e '.usage_credits == "1"' "$ENV_LOG" >/dev/null
}

@test "run_impl: Claude package default and relative override resolve before cwd; selected missing package stops before dispatch" {
	local initial_pwd="$PWD" relative="$TEST_ROOT/work/relative-extension"
	local default_package="$TEST_ROOT/agent/git/github.com/earendil-works/pi-claude-code"
	mkdir -p "$relative" "$TEST_ROOT/work/other" "$default_package"
	default_package=$(cd "$default_package" && pwd -P)
	set_haiku_model "claude-code/synthetic-haiku:high"
	unset PI_CLAUDE_CODE_EXTENSION
	run "$RUNNER" --prompt "$PROMPT" --role impl.haiku
	[ "$status" -eq 0 ]
	args_has_prefix_pair -e "$default_package"
	cd "$TEST_ROOT/work" || exit 1
	export PI_CLAUDE_CODE_EXTENSION=relative-extension
	run "$RUNNER" --prompt "$PROMPT" --cwd "$TEST_ROOT/work/other"
	[ "$status" -eq 0 ]
	args_has_prefix_pair -e "$relative"

	export PI_CLAUDE_CODE_EXTENSION="$TEST_ROOT/missing-extension"
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":50},"openai":{"remainingPercent":50}}'
	rm -f "$TEST_ROOT/missing-runs/.default-routing.sqlite"
	rm -f "$ARGS_LOG"
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$TEST_ROOT/missing-runs"
	[ "$status" -ne 0 ]
	[[ "$output" == *"pi update --extensions"* ]]
	[[ ! -f "$ARGS_LOG" ]]
	[[ -e "$TEST_ROOT/missing-runs/.default-routing.sqlite" ]]
	[[ -z "$(fd -t d -d 1 . "$TEST_ROOT/missing-runs")" ]]
	cd "$initial_pwd" || exit 1
}

@test "run_impl: non-Claude role never loads extension even with invalid override" {
	export PI_CLAUDE_CODE_EXTENSION="$TEST_ROOT/missing-extension"
	run "$RUNNER" --prompt "$PROMPT" --role impl.luna
	[ "$status" -eq 0 ]
	jq -e 'index("-e") == null' "$ARGS_LOG" >/dev/null
}

@test "run_impl: quota priority and fallback preserve actual models and metadata" {
	local dir
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":10},"openai":{"remainingPercent":90}}'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.luna" and .resolvedModel == "openai-codex/gpt-6-luna:high"' "$dir/metadata.json" >/dev/null
	export IMPL_USAGE_FIXTURE='{"claude":{"unavailable":"unknown"},"openai":{"unavailable":"unknown"}}'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/haiku:high"
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.haiku" and .resolvedModel == "provider/haiku:high"' "$dir/metadata.json" >/dev/null
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":80},"openai":{"remainingPercent":20}}'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/haiku:high"
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.haiku" and .resolvedModel == "provider/haiku:high"' "$dir/metadata.json" >/dev/null
	export IMPL_USAGE_FIXTURE='{"claude":{"unavailable":"unknown"},"openai":{"unavailable":"unknown"}}'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	dir=$(run_log_dir "$output")
	jq -e '.role == "impl.luna" and .resolvedModel == "openai-codex/gpt-6-luna:high"' "$dir/metadata.json" >/dev/null
}

@test "run_impl: pins bypass usage collector and both exhausted sides stop before dispatch" {
	local dir
	export IMPL_USAGE_FIXTURE='not-json'
	rm -f "$USAGE_CALL_MARKER"
	run "$RUNNER" --prompt "$PROMPT" --role impl.haiku
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/haiku:high"
	[ ! -e "$USAGE_CALL_MARKER" ]
	rm -f "$USAGE_CALL_MARKER"
	run "$RUNNER" --prompt "$PROMPT" --role impl.luna
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	[ ! -e "$USAGE_CALL_MARKER" ]
	local malformed_runs="$TEST_ROOT/malformed-runs"
	rm -f "$ARGS_LOG"
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$malformed_runs"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
	[[ ! -e "$malformed_runs/.default-routing.sqlite" ]]
	[[ -z "$(fd -t d -d 1 . "$malformed_runs")" ]]
	export IMPL_USAGE_FIXTURE='{"claude":{"remainingPercent":0},"openai":{"remainingPercent":0}}'
	local exhausted_runs="$TEST_ROOT/exhausted-runs"
	rm -f "$ARGS_LOG"
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$exhausted_runs"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
	[[ "$output" == *"both observed windows are exhausted"* ]]
	[[ ! -e "$exhausted_runs/.default-routing.sqlite" ]]
	[[ -z "$(fd -t d -d 1 . "$exhausted_runs")" ]]
}

@test "run_impl: persists private run log under IMPL_RUNS_DIR" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	[[ "$output" == *"run log directory:"* ]]
	local run_dir meta
	run_dir=$(latest_run_dir)
	[[ -n "$run_dir" ]]
	meta="$run_dir/metadata.json"
	[[ -f "$meta" ]]
	jq -e '.schemaVersion == 1 and .executionStatus == "completed" and .role == "impl.haiku" and .resolvedModel == "provider/haiku:high"' "$meta" >/dev/null
	[[ -f "$run_dir/events.jsonl" ]]
}

@test "run_impl: forwards final assistant text to stdout" {
	export FAKE_PI_STDOUT_TEXT='hello-impl'
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	[[ "$output" == *"hello-impl"* ]]
}

@test "run_impl: rejects missing bun without calling Pi" {
	local filtered_path=""
	local part
	IFS=':' read -r -a path_parts <<<"$PATH"
	for part in "${path_parts[@]}"; do
		[[ -n "$part" && -x "$part/bun" ]] && continue
		filtered_path+="${part}:"
	done
	run env PATH="${filtered_path%:}" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects invalid runs dir without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$TEST_ROOT/not-a-dir/file"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: missing default candidate fails preflight without consuming turn" {
	jq 'del(.roles["impl.luna"])' "$FIXTURE_CATALOG" >"$FIXTURE_CATALOG.tmp"
	mv "$FIXTURE_CATALOG.tmp" "$FIXTURE_CATALOG"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
	[[ ! -e "$IMPL_RUNS_DIR/.default-routing.sqlite" ]]

	write_fixture_catalog
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/haiku:high"
	jq -e '.role == "impl.haiku"' "$(run_log_dir "$output")/metadata.json" >/dev/null
}

@test "run_impl: broken balanced state fails closed but explicit role works" {
	printf '%s\n' 'not a sqlite database' >"$IMPL_RUNS_DIR/.default-routing.sqlite"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
	[[ -z "$(fd -t d -d 1 . "$IMPL_RUNS_DIR")" ]]

	run "$RUNNER" --prompt "$PROMPT" --role impl.luna
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	jq -e '.role == "impl.luna"' "$(run_log_dir "$output")/metadata.json" >/dev/null
}

@test "run_impl: relative spaced runs-dir resolves before cwd change" {
	local spaced="$TEST_ROOT/run logs"
	mkdir -p "$TEST_ROOT/work"
	cd "$TEST_ROOT/work" || exit 1
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "../run logs"
	[ "$status" -eq 0 ]
	[[ -d "$spaced" ]]
	jq -e '.executionStatus == "completed"' "$(latest_run_dir "$spaced")/metadata.json" >/dev/null
}

@test "run_impl: child PI_CODING_AGENT_DIR is private temp with minimal settings" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	local cfg
	cfg=$(jq -r '.config' "$ENV_LOG")
	[[ "$cfg" == /* ]]
	[[ "$cfg" == *"/pi-impl-config-"* ]]
	[[ "$cfg" != "$PI_CODING_AGENT_DIR" ]]
	jq -e '.settings | keys | sort == ["defaultProjectTrust", "enableInstallTelemetry"]' "$CONFIG_SNAP" >/dev/null
	jq -e '.settings.defaultProjectTrust == "never"' "$CONFIG_SNAP" >/dev/null
	jq -e '.settings.enableInstallTelemetry == false' "$CONFIG_SNAP" >/dev/null
	jq -e '.settings | has("packages") | not' "$CONFIG_SNAP" >/dev/null
	[[ ! -d "$cfg" ]]
}

@test "run_impl: child isolation environment flags are set" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e '.pi_offline == "1" and .pi_skip_version_check == "1" and .pi_telemetry == "0"' "$ENV_LOG" >/dev/null
}

@test "run_impl: bundled system prompt path is readable in child" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e '.system_readable == true' "$ENV_LOG" >/dev/null
	jq -e '.system_prompt | length > 0' "$ENV_LOG" >/dev/null
}

@test "run_impl: symlinks auth.json and models.json when source provides them" {
	printf '%s\n' '{"secret":"redacted"}' >"$TEST_ROOT/agent/auth.json"
	printf '%s\n' '{}' >"$TEST_ROOT/agent/models.json"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e '.auth_link == true and .models_link == true' "$ENV_LOG" >/dev/null
}

@test "run_impl: optional auth and models absent in temp config" {
	rm -f "$TEST_ROOT/agent/auth.json" "$TEST_ROOT/agent/models.json"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e '.auth_link == false and .models_link == false and .auth_present == false' "$ENV_LOG" >/dev/null
}

@test "run_impl: source auth and models unchanged after cleanup" {
	printf '%s\n' '{"secret":"redacted"}' >"$TEST_ROOT/agent/auth.json"
	printf '%s\n' '{"models":[]}' >"$TEST_ROOT/agent/models.json"
	local before_auth before_models
	before_auth=$(shasum -a 256 "$TEST_ROOT/agent/auth.json" | awk '{print $1}')
	before_models=$(shasum -a 256 "$TEST_ROOT/agent/models.json" | awk '{print $1}')
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	[[ "$(shasum -a 256 "$TEST_ROOT/agent/auth.json" | awk '{print $1}')" == "$before_auth" ]]
	[[ "$(shasum -a 256 "$TEST_ROOT/agent/models.json" | awk '{print $1}')" == "$before_models" ]]
}

@test "run_impl: failed child consumes its balanced turn without fallback" {
	export FAKE_PI_EXIT=17
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 17 ]
	local cfg meta next_dir
	cfg=$(jq -r '.config' "$ENV_LOG")
	[[ ! -d "$cfg" ]]
	meta="$(latest_run_dir)/metadata.json"
	jq -e '.executionStatus == "failed" and .exitCode == 17 and .role == "impl.haiku"' "$meta" >/dev/null
	export FAKE_PI_EXIT=0
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	next_dir=$(run_log_dir "$output")
	jq -e '.role == "impl.luna"' "$next_dir/metadata.json" >/dev/null
}

@test "run_impl: parallel default calls allocate balanced roles" {
	local pids=() i role_root="$TEST_ROOT/parallel-runs"
	for i in 1 2 3 4; do
		FAKE_PI_ARGS="$TEST_ROOT/args-$i.json" FAKE_PI_ENV="$TEST_ROOT/env-$i.json" \
			FAKE_PI_CONFIG_SNAP="$TEST_ROOT/config-$i.json" \
			"$RUNNER" --prompt "$PROMPT" --runs-dir "$role_root" >"$TEST_ROOT/out-$i" 2>&1 &
		pids+=("$!")
	done
	for i in "${pids[@]}"; do
		wait "$i" || return 1
	done
	local haiku=0 luna=0 dir role
	for dir in "$role_root"/*; do
		[[ -d "$dir" ]] || continue
		role=$(jq -r .role "$dir/metadata.json")
		if [[ "$role" == impl.haiku ]]; then
			jq -e '.resolvedModel == "provider/haiku:high"' "$dir/metadata.json" >/dev/null
			((haiku += 1))
		elif [[ "$role" == impl.luna ]]; then
			jq -e '.resolvedModel == "openai-codex/gpt-6-luna:high"' "$dir/metadata.json" >/dev/null
			((luna += 1))
		fi
	done
	[[ "$haiku" -eq 2 && "$luna" -eq 2 ]]
}

@test "run_impl: rejects explicit empty --runs-dir without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --runs-dir ""
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: does not chmod pre-existing runs directory" {
	local shared="$TEST_ROOT/shared-runs"
	mkdir -p "$shared"
	chmod 0755 "$shared"
	run "$RUNNER" --prompt "$PROMPT" --runs-dir "$shared"
	[ "$status" -eq 0 ]
	[[ "$(stat -f '%Lp' "$shared" 2>/dev/null || stat -c '%a' "$shared")" == "755" ]]
}

@test "run_impl isolates cwd Bun config while preserving the requested cwd" {
	local cwd="$TEST_ROOT/work"
	printf '%s\\n' 'DOTSFILE_DOTENV_CANARY=from-dotenv' >"$cwd/.env"
	cat >"$cwd/bunfig.toml" <<EOF
preload = ["./preload.js"]
EOF
	cat >"$cwd/preload.js" <<'EOF'
await Bun.write(process.env.BUN_PRELOAD_MARKER, "loaded");
EOF
	export BUN_PRELOAD_MARKER="$TEST_ROOT/preload-marker"
	run "$RUNNER" --prompt "$PROMPT" --cwd "$cwd"
	[ "$status" -eq 0 ]
	[ ! -e "$BUN_PRELOAD_MARKER" ]
	jq -e --arg cwd "$(cd "$cwd" && pwd -P)" '.cwd == $cwd and .dotenv_canary_present == false' "$ENV_LOG" >/dev/null
	unset BUN_PRELOAD_MARKER
}

@test "run_impl: relative IMPL_RUNS_DIR resolves from invocation cwd" {
	local rel="$TEST_ROOT/from-invocation"
	mkdir -p "$TEST_ROOT/work"
	cd "$TEST_ROOT/work" || exit 1
	export IMPL_RUNS_DIR="../from-invocation"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	[[ -d "$rel" ]]
	jq -e '.executionStatus == "completed"' "$(latest_run_dir "$rel")/metadata.json" >/dev/null
}

@test "run_impl: warns and keeps temp dir when unexpected files remain" {
	export FAKE_PI_DROP_FILE="extra.txt"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	local cfg
	cfg=$(jq -r '.config' "$ENV_LOG")
	[[ -d "$cfg" ]]
	[[ -f "$cfg/extra.txt" ]]
	[[ "$output" == *"warning:"* ]]
}

@test "run_impl: rejects empty prompt file without calling Pi" {
	local empty="$TEST_ROOT/empty.md"
	: >"$empty"
	run "$RUNNER" --prompt "$empty"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing prompt without calling Pi" {
	run "$RUNNER" --prompt "$TEST_ROOT/missing.md"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing --prompt value without calling Pi" {
	run "$RUNNER" --prompt
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing --cwd value without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --cwd
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects explicit empty --cwd without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --cwd ""
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects explicit empty --role without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --role ""
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing --role value without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --role
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing prompt argument without calling Pi" {
	run "$RUNNER"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects invalid cwd without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --cwd "$TEST_ROOT/not-a-dir"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing resolver without calling Pi" {
	run env MODEL_RESOLVER="$TEST_ROOT/no-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects unknown role without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --role does.not.exist
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects cursor-only role via pi field without calling Pi" {
	run "$RUNNER" --prompt "$PROMPT" --role impl.cursor
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects unknown arguments" {
	run "$RUNNER" --prompt "$PROMPT" --model evil
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects missing nonexecutable Pi binary without calling Pi" {
	run env PI_IMPL_BIN="$TEST_ROOT/not-pi" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: relative PI_IMPL_BIN resolves before cwd change" {
	mkdir -p "$TEST_ROOT/rel-layout/bin"
	cp "$FAKE_PI" "$TEST_ROOT/rel-layout/bin/pi"
	chmod +x "$TEST_ROOT/rel-layout/bin/pi"
	cd "$TEST_ROOT/rel-layout" || exit 1
	export PI_IMPL_BIN="bin/pi"
	export PI_CODING_AGENT_DIR="agent"
	mkdir -p agent
	cp "$FIXTURE_CATALOG" agent/model-roles.json
	export MODEL_ROLES_FILE="$TEST_ROOT/rel-layout/agent/model-roles.json"
	export MODEL_RESOLVER="$REAL_RESOLVER"
	run "$RUNNER" --prompt "$PROMPT" --cwd "$TEST_ROOT/work"
	[ "$status" -eq 0 ]
}

@test "run_impl: relative MODEL_RESOLVER and PI_CODING_AGENT_DIR work" {
	mkdir -p "$TEST_ROOT/rel2/agent" "$TEST_ROOT/rel2/bin"
	ln -sf "$REAL_RESOLVER" "$TEST_ROOT/rel2/bin/resolve-model.sh"
	cp "$FIXTURE_CATALOG" "$TEST_ROOT/rel2/agent/model-roles.json"
	cd "$TEST_ROOT/rel2" || exit 1
	export MODEL_RESOLVER="bin/resolve-model.sh"
	export PI_CODING_AGENT_DIR="agent"
	export MODEL_ROLES_FILE="$TEST_ROOT/rel2/agent/model-roles.json"
	export PI_IMPL_BIN="$FAKE_PI"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
}

@test "run_impl: relative TMPDIR yields absolute temp config path" {
	mkdir -p "$TEST_ROOT/work/rel-tmp"
	cd "$TEST_ROOT/work" || exit 1
	export TMPDIR="rel-tmp"
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	jq -e '.config | startswith("/")' "$ENV_LOG" >/dev/null
}

@test "run_impl: rejects bare model id from resolver without calling Pi" {
	write_echo_resolver "model"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects slash-only model id from resolver without calling Pi" {
	write_echo_resolver "/model"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects provider slash model id from resolver without calling Pi" {
	write_echo_resolver "provider/"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects wildcard model id from resolver without calling Pi" {
	write_echo_resolver 'provider/*'
	run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -ne 0 ]
	[[ ! -f "$ARGS_LOG" ]]
}

@test "run_impl: rejects control characters in model id without calling Pi" {
	local model
	for model in $'provider/model\t' $'provider/model\x1b' $'provider/model\x01'; do
		write_echo_resolver "$model"
		run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
		[ "$status" -ne 0 ]
		[[ ! -f "$ARGS_LOG" ]]
	done
}

@test "run_impl: accepts slash-rich model id from resolver" {
	write_echo_resolver "openrouter/vendor/model:high"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/bad-resolver.sh" "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openrouter/vendor/model:high"
}
