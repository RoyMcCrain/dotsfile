#!/usr/bin/env bats

setup() {
	ROOT="$BATS_TEST_TMPDIR/repo"
	SCRIPT="$BATS_TEST_DIRNAME/../../../scripts/build_env/list_shared_agent_skills.sh"
	mkdir -p "$ROOT"
}

make_skill() {
	local path="$ROOT/$1"
	mkdir -p "$path"
	cat >"$path/SKILL.md" <<'EOF'
---
name: test-skill
description: Test skill.
---
EOF
}

make_shared_skills() {
	for name in alpha beta gamma; do
		make_skill "skills/$name"
	done
	for name in codex-review mcp-delegate; do
		make_skill "codex/skills/$name"
	done
}

@test "emits every immediate skills directory deterministically" {
	make_shared_skills
	make_skill "claude/skills/crm-postmortem"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" = "5" ]
	[[ "$output" == "$ROOT/skills/alpha"$'\n'"$ROOT/skills/beta"$'\n'"$ROOT/skills/gamma"$'\n'"$ROOT/codex/skills/codex-review"$'\n'"$ROOT/codex/skills/mcp-delegate" ]]
	[[ "$output" != *"crm-postmortem"* ]]
	[[ "$output" != *"claude/skills"* ]]
}

@test "emits codex-native overrides from codex/skills" {
	make_shared_skills

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[[ "$output" == *"$ROOT/codex/skills/codex-review"* ]]
	[[ "$output" == *"$ROOT/codex/skills/mcp-delegate"* ]]
}

@test "output paths have no trailing slashes" {
	make_shared_skills

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	while IFS= read -r line; do
		[[ "$line" != */ ]]
	done <<<"$output"
}

@test "production repo lists impl shared skill when present" {
	local repo_root
	repo_root=$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)
	run bash "$SCRIPT" "$repo_root"
	[ "$status" -eq 0 ]
	printf '%s\n' "$output" | rg -Fx -- "$repo_root/skills/impl"
}

@test "production claude impl symlink points at canonical skills/impl" {
	local repo_root target
	repo_root=$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)
	[[ -L "$repo_root/claude/skills/impl" ]]
	target=$(readlink "$repo_root/claude/skills/impl")
	[[ "$target" == "../../skills/impl" ]]
	[[ -f "$repo_root/skills/impl/SKILL.md" ]]
}

@test "production repo lists cursor-impl alias skill when present" {
	local repo_root
	repo_root=$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)
	run bash "$SCRIPT" "$repo_root"
	[ "$status" -eq 0 ]
	printf '%s\n' "$output" | rg -Fx -- "$repo_root/skills/cursor-impl"
}

@test "does not emit claude-only crm-postmortem" {
	make_shared_skills
	make_skill "claude/skills/crm-postmortem"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[[ "$output" != *"crm-postmortem"* ]]
}

@test "fails when skills has no skill directories" {
	mkdir -p "$ROOT/skills"
	make_skill "codex/skills/codex-review"
	make_skill "codex/skills/mcp-delegate"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing shared skills under $ROOT/skills"* ]]
}

@test "fails when an immediate skills directory lacks SKILL.md" {
	make_shared_skills
	mkdir -p "$ROOT/skills/incomplete"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing SKILL.md: $ROOT/skills/incomplete"* ]]
}
