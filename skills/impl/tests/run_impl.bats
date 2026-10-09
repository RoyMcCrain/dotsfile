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
	mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/agent" "$TEST_ROOT/work" "$TEST_ROOT/tmp"
	export TMPDIR="$TEST_ROOT/tmp"
	PROMPT="$TEST_ROOT/work/impl prompt.md"
	printf '%s\n' 'Implement the feature.' >"$PROMPT"
	PROMPT=$(resolve_test_path "$PROMPT")

	ARGS_LOG="$TEST_ROOT/args.json"
	ENV_LOG="$TEST_ROOT/env.json"
	CONFIG_SNAP="$TEST_ROOT/config-snap.json"
	FAKE_PI="$TEST_ROOT/bin/pi"
	FIXTURE_CATALOG="$TEST_ROOT/agent/model-roles.json"

	RUNNER="$BATS_TEST_DIRNAME/../scripts/run_impl.sh"

	write_fixture_catalog
	write_fake_pi

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

write_fake_pi() {
	cat >"$FAKE_PI" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' "$@" | jq -R . | jq -s . >"${FAKE_PI_ARGS:?}"
config="${PI_CODING_AGENT_DIR:?}"
printf '%s\n' '{}' >"$config/models-store.json"
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
		cwd: $pwd,
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
exit "${FAKE_PI_EXIT:-0}"
EOF
	chmod +x "$FAKE_PI"
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

@test "run_impl: defaults use impl.default model and invocation cwd" {
	local work_dir
	work_dir=$(cd "$TEST_ROOT/work" && pwd -P)
	cd "$work_dir" || exit 1
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	jq -e --arg cwd "$work_dir" '.cwd == $cwd' "$ENV_LOG" >/dev/null
}

@test "run_impl: --role selects alternate catalog role" {
	run "$RUNNER" --prompt "$PROMPT" --role review.test
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "provider/other:high"
}

@test "run_impl: catalog change updates --model on subsequent run" {
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 0 ]
	args_has_prefix_pair --model "openai-codex/gpt-6-luna:high"
	write_fixture_catalog "openrouter/vendor/model:high"
	run "$RUNNER" --prompt "$PROMPT"
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
	for flag in -p --no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp --no-approve; do
		args_contains "$flag"
	done
	args_has_prefix_pair --tools "read,bash,edit,write"
	args_contains "Implement the supplied task directly."
	jq -e 'map(select(. == "--system-prompt")) | length == 1' "$ARGS_LOG" >/dev/null
	if args_contains "--no-tools"; then
		false
	fi
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

@test "run_impl: propagates child failure exit status and cleans temp config" {
	export FAKE_PI_EXIT=17
	run "$RUNNER" --prompt "$PROMPT"
	[ "$status" -eq 17 ]
	local cfg
	cfg=$(jq -r '.config' "$ENV_LOG")
	[[ ! -d "$cfg" ]]
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

@test "legacy check_complexity wrapper forwards arguments and exit status" {
	local legacy="$BATS_TEST_DIRNAME/../../cursor-impl/scripts/check_complexity.sh"
	local impl="$BATS_TEST_DIRNAME/../scripts/check_complexity.sh"
	run bash "$legacy"
	[ "$status" -eq 2 ]
	run bash "$legacy" "$TEST_ROOT/missing.ts"
	[ "$status" -eq 2 ]
	[[ -x "$impl" ]]
}
