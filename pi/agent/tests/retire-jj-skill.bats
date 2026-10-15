#!/usr/bin/env bats

setup() {
	TEST_ROOT=$(mktemp -d)
	export TEST_ROOT
}

teardown() {
	rm -rf "$TEST_ROOT"
}

extract_zsh_cleanup() {
	local script="$BATS_TEST_DIRNAME/../../../scripts/build_env/create_symlink.sh"
	awk '
    /^for OLD_SKILL in cursor fugu crm-postmortem/ { capture = 1 }
    capture { print }
    capture && /^done$/ { exit }
  ' "$script" >"$TEST_ROOT/zsh-cleanup"
	[ -s "$TEST_ROOT/zsh-cleanup" ]
	awk '
    /^# Shared agent skills$/ { capture = 1 }
    capture && /^LIST_SKILLS=/ { exit }
    capture { print }
  ' "$script" >>"$TEST_ROOT/zsh-cleanup"
	[ -s "$TEST_ROOT/zsh-cleanup" ]
}

extract_fish_cleanup() {
	local script="$BATS_TEST_DIRNAME/../../../scripts/build_env/setup_fish.sh"
	awk '
    /^set AGENTS_SKILL_DIR / { capture = 1 }
    capture && /^set LIST_SKILLS / { exit }
    capture { print }
  ' "$script" >"$TEST_ROOT/fish-cleanup"
	[ -s "$TEST_ROOT/fish-cleanup" ]
}

prepare_fixture() {
	local home="$TEST_ROOT/home"
	local base="$TEST_ROOT/repo"
	mkdir -p "$home/.agents/skills" "$home/.agents/skill-backups" \
		"$home/.codex/skills" "$base/skills" "$TEST_ROOT/foreign-target"
	printf 'keep me\n' >"$TEST_ROOT/foreign-target/marker"
	ln -s "$base/skills/jj" "$home/.agents/skills/jj"
	ln -s "$base/skills/jj" "$home/.codex/skills/jj"
	ln -s "$TEST_ROOT/foreign-target" "$home/.agents/skills/jj-workspace"
	ln -s "$TEST_ROOT/foreign-target" "$home/.codex/skills/jj-workspace"
}

assert_foreign_links_preserved() {
	local home="$TEST_ROOT/home"
	[ -L "$home/.agents/skills/jj" ]
	[ -L "$home/.codex/skills/jj" ]
	[ "$(readlink "$home/.agents/skills/jj")" = "$TEST_ROOT/foreign-target" ]
	[ "$(readlink "$home/.codex/skills/jj")" = "$TEST_ROOT/foreign-target" ]
	[ "$(cat "$TEST_ROOT/foreign-target/marker")" = 'keep me' ]
	[ -L "$home/.agents/skills/jj-workspace" ]
	[ -L "$home/.codex/skills/jj-workspace" ]
}

assert_owned_directories_preserved() {
	local home="$TEST_ROOT/home"
	[ -f "$home/.agents/skills/jj/data" ]
	[ -f "$home/.codex/skills/jj/data" ]
}

@test 'Zsh setup retires only repository-owned jj skill links' {
	extract_zsh_cleanup
	prepare_fixture
	local home="$TEST_ROOT/home"
	local base="$TEST_ROOT/repo"
	# shellcheck disable=SC2016
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		zsh -f -c 'source "$1"; source "$1"' _ "$TEST_ROOT/zsh-cleanup"
	[ "$status" -eq 0 ]
	[ ! -L "$home/.agents/skills/jj" ]
	[ ! -L "$home/.codex/skills/jj" ]

	ln -s "$TEST_ROOT/foreign-target" "$home/.agents/skills/jj"
	ln -s "$TEST_ROOT/foreign-target" "$home/.codex/skills/jj"
	# shellcheck disable=SC2016
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		zsh -f -c 'source "$1"' _ "$TEST_ROOT/zsh-cleanup"
	[ "$status" -eq 0 ]
	assert_foreign_links_preserved

	rm "$home/.agents/skills/jj" "$home/.codex/skills/jj"
	mkdir "$home/.agents/skills/jj" "$home/.codex/skills/jj"
	printf 'owned\n' >"$home/.agents/skills/jj/data"
	printf 'owned\n' >"$home/.codex/skills/jj/data"
	# shellcheck disable=SC2016
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		zsh -f -c 'source "$1"' _ "$TEST_ROOT/zsh-cleanup"
	[ "$status" -eq 0 ]
	assert_owned_directories_preserved
}

@test 'Fish setup retires only repository-owned jj skill links' {
	extract_fish_cleanup
	prepare_fixture
	local home="$TEST_ROOT/home"
	local base="$TEST_ROOT/repo"
	cat >"$TEST_ROOT/fish-runner" <<'FISH'
function print_success
end
function print_warning
end
source $argv[1]
source $argv[1]
FISH
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		fish --no-config "$TEST_ROOT/fish-runner" "$TEST_ROOT/fish-cleanup"
	[ "$status" -eq 0 ]
	[ ! -L "$home/.agents/skills/jj" ]
	[ ! -L "$home/.codex/skills/jj" ]

	ln -s "$TEST_ROOT/foreign-target" "$home/.agents/skills/jj"
	ln -s "$TEST_ROOT/foreign-target" "$home/.codex/skills/jj"
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		fish --no-config "$TEST_ROOT/fish-runner" "$TEST_ROOT/fish-cleanup"
	[ "$status" -eq 0 ]
	assert_foreign_links_preserved

	rm "$home/.agents/skills/jj" "$home/.codex/skills/jj"
	mkdir "$home/.agents/skills/jj" "$home/.codex/skills/jj"
	printf 'owned\n' >"$home/.agents/skills/jj/data"
	printf 'owned\n' >"$home/.codex/skills/jj/data"
	run env -i HOME="$home" BASE_DIR="$base" PATH="$PATH" \
		fish --no-config "$TEST_ROOT/fish-runner" "$TEST_ROOT/fish-cleanup"
	[ "$status" -eq 0 ]
	assert_owned_directories_preserved
}
