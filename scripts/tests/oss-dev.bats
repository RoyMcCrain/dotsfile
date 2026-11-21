#!/usr/bin/env bats

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd -P)"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/oss-dev"
	mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/home/.pi/agent" "$TEST_ROOT/work/sub" "$TEST_ROOT/tmp" "$TEST_ROOT/runs"
	export HOME="$TEST_ROOT/home" TMPDIR="$TEST_ROOT/tmp" IMPL_RUNS_DIR="$TEST_ROOT/runs"
	export PI_CODING_AGENT_DIR="$REPO_ROOT/pi/agent" MODEL_RESOLVER="$REPO_ROOT/pi/agent/resolve-model.sh"
	export PI_IMPL_BIN="$TEST_ROOT/bin/pi" PATH="$TEST_ROOT/bin:$PATH"
	export OSS_CALLS="$TEST_ROOT/calls.json" OSS_STDIN="$TEST_ROOT/stdin" OSS_CWD="$TEST_ROOT/cwd" OSS_FILES="$TEST_ROOT/approved.json" OSS_PROMPT="$TEST_ROOT/prompt" OSS_HAS_MODELS="$TEST_ROOT/has-models"
	cat >"$PI_IMPL_BIN" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" | jq -R . | jq -s . >"$OSS_CALLS"
printf '%s' "$PWD" >"$OSS_CWD"
if [[ -e "$PI_CODING_AGENT_DIR/models.json" ]]; then printf yes >"$OSS_HAS_MODELS"; else printf no >"$OSS_HAS_MODELS"; fi
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
	printf '%s\n' 'Implement the approved task.' >"$TEST_ROOT/work/task.md"
	printf '%s\n' 'sub/source.txt' >"$TEST_ROOT/work/files.txt"
	printf '%s\n' 'approved content' >"$TEST_ROOT/work/sub/source.txt"
	printf '%s\n' 'diff --git a/source.txt b/source.txt' '--- a/source.txt' '+++ b/source.txt' '@@ -1 +1 @@' '-old' '+new' >"$TEST_ROOT/input.patch"
	export OSS_DEV="$REPO_ROOT/scripts/oss-dev.sh"
}

@test "design rejects an unrecognized consent flag before spawning" {
	run "$OSS_DEV" design --not-approved
	[ "$status" -ne 0 ]
	[[ "$output" == *"explicit --share-with-meta approval is required"* ]]
	[ ! -e "$OSS_CALLS" ]
}

@test "review and impl require explicit sharing consent" {
	run "$OSS_DEV" review --patch "$TEST_ROOT/input.patch"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
	run "$OSS_DEV" impl --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "generic dispatch rejects reserved OSS review role" {
	run "$REPO_ROOT/skills/impl/scripts/run_impl.sh" --role oss.review --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "direct OSS impl cannot authorize with inherited manifest alone" {
	printf '["%s"]\n' "$(realpath "$TEST_ROOT/work/sub/source.txt")" >"$TEST_ROOT/work/inherited.json"
	export PI_OSS_APPROVED_FILES="$TEST_ROOT/work/inherited.json"
	run "$REPO_ROOT/skills/impl/scripts/run_impl.sh" --role oss.impl --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "patch review dispatches only supplied patch without tools in neutral cwd or stdin" {
	run "$OSS_DEV" review --share-with-meta --patch "$TEST_ROOT/input.patch"
	[ "$status" -eq 0 ]
	jq -e 'index("--no-tools") != null and index("-p") != null and .[index("--model") + 1] == "meta/muse-spark-1.3-contributor:high"' "$OSS_CALLS" >/dev/null
	[[ "$(cat "$OSS_CWD")" == "$(realpath "$TMPDIR")"/oss-dev-*/neutral ]]
	[ ! -s "$OSS_STDIN" ]
	jq -e 'map(select(startswith("@") and endswith("/input.patch"))) | length == 1' "$OSS_CALLS" >/dev/null
}

@test "suspicious patch is rejected without dispatch" {
	printf '%s\n' 'diff --git a/x b/x' '+Authorization: Bearer abcdefghijklmnop' >"$TEST_ROOT/bad.patch"
	run "$OSS_DEV" review --share-with-meta --patch "$TEST_ROOT/bad.patch"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "patch review rejects Git's encoded binary payload without dispatch" {
	printf '%s\n' 'diff --git a/x b/x' 'GIT binary patch' 'literal 4' 'Lc$@<O00001' >"$TEST_ROOT/binary.patch"
	run "$OSS_DEV" review --share-with-meta --patch "$TEST_ROOT/binary.patch"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "implementation dispatches an exact approved file manifest" {
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -eq 0 ]
	jq -e 'index("--no-builtin-tools") != null and index("-e") != null and .[index("--model") + 1] == "meta/muse-spark-1.3-contributor:high"' "$OSS_CALLS" >/dev/null
	jq -e --arg path "$(realpath "$TEST_ROOT/work/sub/source.txt")" '. == [$path]' "$OSS_FILES" >/dev/null
	[ ! -s "$OSS_STDIN" ]
}

@test "OSS child config excludes inherited models.json" {
	mkdir -p "$TEST_ROOT/source-config"
	printf '%s\n' '{"models":[]}' >"$TEST_ROOT/source-config/models.json"
	export PI_CODING_AGENT_DIR="$TEST_ROOT/source-config"
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -eq 0 ]
	[ "$(cat "$OSS_HAS_MODELS")" = no ]
}

@test "ordinary role cannot alias a Meta Contributor model" {
	cat >"$TEST_ROOT/bin/resolver" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'meta/example-contributor:high'
EOF
	chmod +x "$TEST_ROOT/bin/resolver"
	export MODEL_RESOLVER="$TEST_ROOT/bin/resolver"
	run "$REPO_ROOT/skills/impl/scripts/run_impl.sh" --role impl.alias --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "direct OSS implementation snapshots relative inputs before changing cwd with relative TMPDIR" {
	printf '%s\n' 'source.txt' >"$TEST_ROOT/work/files.txt"
	printf '%s\n' 'other.txt' >"$TEST_ROOT/work/sub/files.txt"
	printf '%s\n' 'wrong child cwd file' >"$TEST_ROOT/work/sub/other.txt"
	mkdir -p "$TEST_ROOT/work/relative-tmp"
	(
		cd "$TEST_ROOT/work"
		TMPDIR=relative-tmp "$REPO_ROOT/skills/impl/scripts/run_impl.sh" --role oss.impl --share-with-meta --cwd sub --prompt task.md --files files.txt
	)
	jq -e --arg path "$(realpath "$TEST_ROOT/work/sub/source.txt")" '. == [$path]' "$OSS_FILES" >/dev/null
	[ "$(cat "$OSS_PROMPT")" = 'Implement the approved task.' ]
	rmdir "$TEST_ROOT/work/relative-tmp"
}

@test "implementation rejects uppercase env and quoted JSON key declarations" {
	printf '%s\n' 'SERVICE_API_KEY=synthetic-placeholder-value' >"$TEST_ROOT/work/sub/source.txt"
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
	printf '%s\n' '{"apiKey": "synthetic-placeholder-value"}' >"$TEST_ROOT/work/sub/source.txt"
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "implementation rejects a private-key marker in approved content without dispatch" {
	printf '%s\n' '-----BEGIN PRIVATE KEY-----' >"$TEST_ROOT/work/sub/source.txt"
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}

@test "implementation rejects an escaping symlink without dispatch" {
	printf '%s\n' secret >"$TEST_ROOT/outside.txt"
	ln -s "$TEST_ROOT/outside.txt" "$TEST_ROOT/work/escape.txt"
	printf '%s\n' 'escape.txt' >"$TEST_ROOT/work/files.txt"
	run "$OSS_DEV" impl --share-with-meta --cwd "$TEST_ROOT/work" --prompt "$TEST_ROOT/work/task.md" --files "$TEST_ROOT/work/files.txt"
	[ "$status" -ne 0 ]
	[ ! -e "$OSS_CALLS" ]
}
