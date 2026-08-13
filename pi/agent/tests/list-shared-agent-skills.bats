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

make_required_skills() {
	for name in cmux cmux-task-name cheap-pr cursor-review fugu-review implementation-report review-report review-verify parallel-review jj-workspace; do
		make_skill ".agents/skills/$name"
	done
	for name in claude-review cursor-impl firecrawl-cli firecrawl-agent cross-research antigravity-research; do
		make_skill "claude/skills/$name"
	done
	for name in codex-review mcp-delegate; do
		make_skill "codex/skills/$name"
	done
}

@test "prints required shared agent skills without trailing slashes" {
	make_required_skills

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -eq 0 ]
	[ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" = "18" ]
	[[ "$output" == *"$ROOT/.agents/skills/cmux"* ]]
	[[ "$output" == *"$ROOT/.agents/skills/review-verify"* ]]
	[[ "$output" == *"$ROOT/claude/skills/firecrawl-cli"* ]]
	[[ "$output" != *"/"$'\n'* ]]
}

@test "fails when a named required skill is missing" {
	make_required_skills
	rm -rf "$ROOT/.agents/skills/review-verify"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing skill dir: $ROOT/.agents/skills/review-verify"* ]]
}

@test "fails when no cmux skills are present" {
	make_required_skills
	rm -rf "$ROOT/.agents/skills/cmux" "$ROOT/.agents/skills/cmux-task-name"

	run bash "$SCRIPT" "$ROOT"

	[ "$status" -ne 0 ]
	[[ "$output" == *"missing cmux skills under $ROOT/.agents/skills"* ]]
}
