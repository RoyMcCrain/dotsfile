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
		make_skill ".agents/skills/$name"
	done
	for name in codex-review mcp-delegate; do
		make_skill "codex/skills/$name"
	done
}

@test "emits every immediate .agents/skills directory deterministically" {
	make_shared_skills
	make_skill "claude/skills/crm-postmortem"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" = "5" ]
	[[ "$output" == "$ROOT/.agents/skills/alpha"$'\n'"$ROOT/.agents/skills/beta"$'\n'"$ROOT/.agents/skills/gamma"$'\n'"$ROOT/codex/skills/codex-review"$'\n'"$ROOT/codex/skills/mcp-delegate" ]]
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

@test "does not emit claude-only crm-postmortem" {
	make_shared_skills
	make_skill "claude/skills/crm-postmortem"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[[ "$output" != *"crm-postmortem"* ]]
}

@test "fails when .agents/skills has no skill directories" {
	mkdir -p "$ROOT/.agents/skills"
	make_skill "codex/skills/codex-review"
	make_skill "codex/skills/mcp-delegate"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing shared skills under $ROOT/.agents/skills"* ]]
}

@test "fails when an immediate .agents/skills directory lacks SKILL.md" {
	make_shared_skills
	mkdir -p "$ROOT/.agents/skills/incomplete"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing SKILL.md: $ROOT/.agents/skills/incomplete"* ]]
}
