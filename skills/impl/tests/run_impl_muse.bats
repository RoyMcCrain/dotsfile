#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)"
RUNNER="$REPO_ROOT/skills/impl/scripts/run_impl.sh"
MUSE_MODEL="meta/muse-spark-1.3-contributor:high"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/run-impl-muse"
	REAL_BUN=$(command -v bun)
	mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/home" "$TEST_ROOT/agent" "$TEST_ROOT/tmp" "$TEST_ROOT/runs" "$TEST_ROOT/work/sub"
	export REAL_BUN
	PATH="$TEST_ROOT/bin:$PATH"
	export PATH
	unset PI_PROVIDER PI_MODEL
	export HOME="$TEST_ROOT/home" TMPDIR="$TEST_ROOT/tmp" IMPL_RUNS_DIR="$TEST_ROOT/runs"
	export PI_CODING_AGENT_DIR="$TEST_ROOT/agent"
	export MODEL_ROLES_FILE="$REPO_ROOT/pi/agent/model-roles.json"
	export MODEL_RESOLVER="$REPO_ROOT/pi/agent/resolve-model.sh"
	export PI_IMPL_BIN="$TEST_ROOT/bin/pi"
	export OSS_CALLS="$TEST_ROOT/calls.json" OSS_STDIN="$TEST_ROOT/stdin" OSS_CWD="$TEST_ROOT/cwd"
	export OSS_FILES="$TEST_ROOT/approved.json" OSS_PROMPT="$TEST_ROOT/prompt" OSS_CONFIG="$TEST_ROOT/config.json"
	export USAGE_CALL_MARKER="$TEST_ROOT/usage-calls"
	printf '%s\n' 'Implement the approved task.' >"$TEST_ROOT/work/task.md"
	printf '%s\n' 'sub/source.txt' >"$TEST_ROOT/work/files.txt"
	printf '%s\n' 'approved content' >"$TEST_ROOT/work/sub/source.txt"
	write_fake_pi
	write_fake_bun
}

write_fake_pi() {
	cat >"$PI_IMPL_BIN" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" | jq -R . | jq -s . >"$OSS_CALLS"
printf '%s' "$PWD" >"$OSS_CWD"
jq -n \
	--argjson models "$([[ -e "$PI_CODING_AGENT_DIR/models.json" ]] && echo true || echo false)" \
	--argjson auth "$([[ -L "$PI_CODING_AGENT_DIR/auth.json" ]] && echo true || echo false)" \
	'{models_json: $models, auth_link: $auth}' >"$OSS_CONFIG"
cat >"$OSS_STDIN"
if [[ -n "${PI_OSS_APPROVED_FILES:-}" ]]; then cp -- "$PI_OSS_APPROVED_FILES" "$OSS_FILES"; fi
for arg in "$@"; do
	case "$arg" in @*) cat -- "${arg#@}" >"$OSS_PROMPT" ;; esac
done
printf '%s\n' \
	'{"type":"message_start","message":{"role":"assistant"}}' \
	'{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"done"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"cost":{"total":0}}}}' \
	'{"type":"agent_settled","aborted":false}'
exit 0
EOF
	chmod +x "$PI_IMPL_BIN"
}

# Stub bun only to detect the ordinary usage collector; every other call is real.
write_fake_bun() {
	cat >"$TEST_ROOT/bin/bun" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
	if [[ "$arg" == */query_impl_usage.ts ]]; then
		printf '%s\n' invoked >>"$USAGE_CALL_MARKER"
		exit 1
	fi
done
exec "$REAL_BUN" "$@"
EOF
	chmod +x "$TEST_ROOT/bin/bun"
}

write_resolver() {
	local model=$1
	cat >"$TEST_ROOT/bin/resolver" <<EOF
#!/usr/bin/env bash
printf '%s\n' '$model'
EOF
	chmod +x "$TEST_ROOT/bin/resolver"
}

muse_run() {
	run "$RUNNER" --role impl.muse --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
}

# Active Pi model as injected into model-callable Bash (PI_PROVIDER bare provider, PI_MODEL bare id).
use_active_model() {
	export PI_PROVIDER=$1 PI_MODEL=$2
}

assert_muse_dispatch() {
	jq -e --arg model "$MUSE_MODEL" '
		index("--no-builtin-tools") != null and index("-e") != null and index("--tools") == null
		and .[index("--model") + 1] == $model
	' "$OSS_CALLS" >/dev/null
	jq -e --arg path "$(realpath "$TEST_ROOT/work/sub/source.txt")" '. == [$path]' "$OSS_FILES" >/dev/null
	[ "$(cat "$OSS_PROMPT")" = 'Implement the approved task.' ]
	[ ! -e "$USAGE_CALL_MARKER" ]
}

@test "impl.muse dispatches one approved manifest with no built-in tools and no usage or fallback query" {
	muse_run <<<'Unapproved stdin'
	[ "$status" -eq 0 ]
	assert_muse_dispatch
	[ ! -s "$OSS_STDIN" ]
	[ "$(realpath "$(cat "$OSS_CWD")")" = "$(realpath "$TEST_ROOT/work")" ]
}

@test "omitted role in an active Meta Muse session auto-selects impl.muse for both families" {
	local model
	for model in muse-spark-fixture muse-wonder-fixture; do
		rm -f "$OSS_CALLS" "$OSS_FILES" "$OSS_PROMPT" "$USAGE_CALL_MARKER"
		use_active_model meta "$model"
		run "$RUNNER" --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt" </dev/null
		[ "$status" -eq 0 ]
		assert_muse_dispatch
	done
}

@test "omitted role in an active Meta Muse session without approval stops before Pi and quota" {
	use_active_model meta muse-spark-fixture-contributor
	run "$RUNNER" --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[[ "$output" == *"impl.muse requires explicit --share-with-meta"* ]]
	[ ! -e "$OSS_CALLS" ]
	[ ! -e "$USAGE_CALL_MARKER" ]
	run "$RUNNER" --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[[ "$output" == *"impl.muse requires explicit --cwd and --files"* ]]
	[ ! -e "$OSS_CALLS" ]
	[ ! -e "$USAGE_CALL_MARKER" ]
}

@test "impl.muse requires explicit consent, cwd, and file list before spawning" {
	run "$RUNNER" --role impl.muse --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	run "$RUNNER" --role impl.muse --share-with-meta --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	run "$RUNNER" --role impl.muse --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "ordinary roles cannot receive consent or approved-file flags" {
	local role
	for role in impl.default impl.haiku impl.luna; do
		run "$RUNNER" --role "$role" --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
		[ "$status" -ne 0 ]
		run "$RUNNER" --role "$role" --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
		[ "$status" -ne 0 ]
	done
	[ ! -e "$OSS_CALLS" ]
}

@test "retired OSS roles are rejected before dispatch and never aliased" {
	local role
	for role in oss.impl oss.design oss.review; do
		run "$RUNNER" --role "$role" --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
		[ "$status" -ne 0 ]
	done
	[ ! -e "$OSS_CALLS" ]
}

@test "impl.muse requires explicit --files even with consent and an inherited manifest" {
	printf '["%s"]\n' "$(realpath "$TEST_ROOT/work/sub/source.txt")" >"$TEST_ROOT/inherited.json"
	export PI_OSS_APPROVED_FILES="$TEST_ROOT/inherited.json"
	run "$RUNNER" --role impl.muse --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[[ "$output" == *"impl.muse requires explicit --cwd and --files"* ]]
	[ ! -e "$OSS_CALLS" ]
}

@test "impl.muse child config excludes inherited models.json and keeps auth reuse" {
	printf '%s\n' '{"models":[]}' >"$PI_CODING_AGENT_DIR/models.json"
	printf '%s\n' '{}' >"$PI_CODING_AGENT_DIR/auth.json"
	run "$RUNNER" --role impl.muse --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt" </dev/null
	[ "$status" -eq 0 ]
	jq -e '.models_json == false and .auth_link == true' "$OSS_CONFIG" >/dev/null
}

@test "impl.muse rejects a resolved model that is not a Meta Contributor" {
	write_resolver "provider/other:high"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/resolver" "$RUNNER" --role impl.muse --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "ordinary role cannot alias a Meta Contributor model" {
	write_resolver "meta/example-contributor:high"
	run env MODEL_RESOLVER="$TEST_ROOT/bin/resolver" "$RUNNER" --role impl.alias --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "impl.muse snapshots relative inputs before changing cwd with relative TMPDIR" {
	printf '%s\n' 'source.txt' >"$TEST_ROOT/work/files.txt"
	printf '%s\n' 'other.txt' >"$TEST_ROOT/work/sub/files.txt"
	printf '%s\n' 'wrong child cwd file' >"$TEST_ROOT/work/sub/other.txt"
	mkdir -p "$TEST_ROOT/work/relative-tmp"
	(
		cd "$TEST_ROOT/work"
		TMPDIR=relative-tmp "$RUNNER" --role impl.muse --share-with-meta --cwd sub --prompt task.md --files files.txt </dev/null
	)
	jq -e --arg path "$(realpath "$TEST_ROOT/work/sub/source.txt")" '. == [$path]' "$OSS_FILES" >/dev/null
	[ "$(cat "$OSS_PROMPT")" = 'Implement the approved task.' ]
	rmdir "$TEST_ROOT/work/relative-tmp"
}

@test "impl.muse rejects sensitive markers in approved content without dispatch" {
	printf '%s\n' 'SERVICE_API_KEY=synthetic-placeholder-value' >"$TEST_ROOT/work/sub/source.txt"
	muse_run
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
	printf '%s\n' '{"apiKey": "synthetic-placeholder-value"}' >"$TEST_ROOT/work/sub/source.txt"
	muse_run
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
	printf '%s\n' '-----BEGIN PRIVATE KEY-----' >"$TEST_ROOT/work/sub/source.txt"
	muse_run
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "impl.muse rejects an escaping symlink without dispatch" {
	printf '%s\n' secret >"$TEST_ROOT/outside.txt"
	ln -s "$TEST_ROOT/outside.txt" "$TEST_ROOT/work/escape.txt"
	printf '%s\n' 'escape.txt' >"$TEST_ROOT/work/files.txt"
	muse_run
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}
