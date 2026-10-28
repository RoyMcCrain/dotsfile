#!/usr/bin/env bats

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/setup-fixture"
	REPO="$TEST_ROOT/repo"
	HOME_FIXTURE="$TEST_ROOT/home"
	BIN="$TEST_ROOT/bin"
	mkdir -p "$REPO/scripts/build_env" "$REPO/scripts" "$REPO/skills" "$REPO/codex/skills" "$REPO/devbox/runtime-packages" "$REPO/codex" "$REPO/pi/agent" "$HOME_FIXTURE" "$BIN"
	cp "$BATS_TEST_DIRNAME/../build_env/setup.sh" "$REPO/scripts/build_env/"
	cp "$BATS_TEST_DIRNAME/../build_env/setup_codex_config.sh" "$REPO/scripts/build_env/"
	cp "$BATS_TEST_DIRNAME/../build_env/list_shared_agent_skills.sh" "$REPO/scripts/build_env/"
	cat >"$REPO/pi/agent/resolve-model.sh" <<'EOF'
#!/usr/bin/env bash
printf 'synthetic-model\n'
EOF
	cp "$BATS_TEST_DIRNAME/../../scripts/build_env/setup_fish.sh" "$REPO/scripts/build_env/"
	cp "$BATS_TEST_DIRNAME/../../scripts/build_env/create_symlink.sh" "$REPO/scripts/build_env/"
	mkdir -p "$REPO/fish"
	printf 'synthetic fish config\n' >"$REPO/fish/config.fish"
	for name in jj-workspace sample; do
		mkdir -p "$REPO/skills/$name"
		printf 'synthetic %s\n' "$name" >"$REPO/skills/$name/SKILL.md"
	done
	for name in codex-review mcp-delegate context-loader; do
		mkdir -p "$REPO/codex/skills/$name"
		printf 'native %s\n' "$name" >"$REPO/codex/skills/$name/SKILL.md"
	done
	printf 'synthetic config\n' >"$REPO/codex/config.toml.example"
	printf 'synthetic fugu\n' >"$REPO/codex/fugu.config.toml.example"
	printf '{"synthetic":true}\n' >"$REPO/devbox/devbox.json"
	printf 'synthetic flake\n' >"$REPO/devbox/runtime-packages/flake.nix"
	printf '{"synthetic":true}\n' >"$REPO/devbox/runtime-packages/flake.lock"
	mkdir -p "$REPO/pi/agent"
	printf '{"synthetic":true}\n' >"$REPO/pi/agent/model-roles.json"
	mkdir -p "$REPO/claude/commands" "$REPO/antigravity/skills/context-loader" "$REPO/codex/hooks" "$REPO/codex/skills" "$REPO/pi/agent/extensions" "$REPO/pi/agent/lib"
	printf '{"mcpServers":{}}\n' >"$REPO/claude/mcp-servers.json"
	cat >"$BIN/git" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/claude" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	cat >"$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$HOME/systemctl.log"
if [[ ${SYSTEMCTL_FAIL:-} == "$*" ]]; then exit 1; fi
exit 0
EOF
	mkdir -p "$REPO/scripts/wsl"
	printf '[Unit]\nDescription=synthetic WSL bridge\n' >"$REPO/scripts/wsl/bitwarden-ssh-agent.service"
	cat >"$REPO/scripts/build_env/patch_pi_min_output_tokens.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
	chmod +x "$BIN"/* "$REPO/scripts/build_env/patch_pi_min_output_tokens.sh"
	PATH="$BIN:/usr/bin:/bin"
	export PATH
}

run_setup() { env -i HOME="$HOME_FIXTURE" PATH="$PATH" bash "$REPO/scripts/build_env/setup.sh"; }

@test 'fresh setup delivers Codex native overrides to Pi and Codex and preserves user-owned Codex dirs' {
	mkdir -p "$HOME_FIXTURE/.codex/skills/codex-review" "$HOME_FIXTURE/.codex/skills/sample"
	printf 'user data\n' >"$HOME_FIXTURE/.codex/skills/codex-review/data"
	printf 'ordinary user data\n' >"$HOME_FIXTURE/.codex/skills/sample/data"
	run_setup
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/codex-review")" = "$(realpath "$REPO")/codex/skills/codex-review" ]
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/mcp-delegate")" = "$(realpath "$REPO")/codex/skills/mcp-delegate" ]
	[ "$(readlink "$HOME_FIXTURE/.codex/skills/mcp-delegate")" = "$(realpath "$REPO")/codex/skills/mcp-delegate" ]
	[ "$(readlink "$HOME_FIXTURE/.codex/skills/context-loader")" = "$(realpath "$REPO")/codex/skills/context-loader" ]
	[ ! -e "$HOME_FIXTURE/.agents/skills/context-loader" ]
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/sample")" = "$(realpath "$REPO")/skills/sample" ]
	[ -f "$HOME_FIXTURE/.codex/skills/codex-review/data" ]
	[ "$(cat "$HOME_FIXTURE/.codex/skills/codex-review/data")" = 'user data' ]
	[ -d "$HOME_FIXTURE/.codex/skills/sample" ]
	[ ! -L "$HOME_FIXTURE/.codex/skills/sample" ]
	[ "$(cat "$HOME_FIXTURE/.codex/skills/sample/data")" = 'ordinary user data' ]
}

@test 'real shared skill data is backed up outside discovery and repeated setup is idempotent' {
	mkdir -p "$HOME_FIXTURE/.agents/skills/sample" "$HOME_FIXTURE/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review"
	printf 'old sample skill\n' >"$HOME_FIXTURE/.agents/skills/sample/SKILL.md"
	printf 'sample user data\n' >"$HOME_FIXTURE/.agents/skills/sample/user-data"
	mkdir -p "$HOME_FIXTURE/.agents/skills/hunk-review"
	printf 'old hunk skill\n' >"$HOME_FIXTURE/.agents/skills/hunk-review/SKILL.md"
	printf 'hunk user data\n' >"$HOME_FIXTURE/.agents/skills/hunk-review/user-data"
	printf 'installed hunk skill\n' >"$HOME_FIXTURE/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review/SKILL.md"
	run_setup
	backup_root="$HOME_FIXTURE/.agents/skill-backups"
	shopt -s nullglob
	sample_backups=("$backup_root"/sample.backup-*)
	hunk_backups=("$backup_root"/hunk-review.backup-*)
	[ "${#sample_backups[@]}" -eq 1 ]
	[ "${#hunk_backups[@]}" -eq 1 ]
	[ "$(cat "${sample_backups[0]}/SKILL.md")" = 'old sample skill' ]
	[ "$(cat "${sample_backups[0]}/user-data")" = 'sample user data' ]
	[ "$(cat "${hunk_backups[0]}/SKILL.md")" = 'old hunk skill' ]
	[ "$(cat "${hunk_backups[0]}/user-data")" = 'hunk user data' ]
	agent_skill_backups=("$HOME_FIXTURE/.agents/skills"/sample.backup-* "$HOME_FIXTURE/.agents/skills"/hunk-review.backup-*)
	[ "${#agent_skill_backups[@]}" -eq 0 ]
	[ -L "$HOME_FIXTURE/.agents/skills/sample" ]
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/sample")" = "$(realpath "$REPO")/skills/sample" ]
	[ -L "$HOME_FIXTURE/.agents/skills/hunk-review" ]
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/hunk-review")" = "$HOME_FIXTURE/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review" ]
	run_setup
	sample_backups=("$backup_root"/sample.backup-*)
	hunk_backups=("$backup_root"/hunk-review.backup-*)
	[ "${#sample_backups[@]}" -eq 1 ]
	[ "${#hunk_backups[@]}" -eq 1 ]
}

@test 'WSL optional service failures do not stop skill delivery; healthy service still succeeds' {
	cat >"$BIN/uname" <<'EOF'
#!/usr/bin/env bash
printf 'Linux synthetic-microsoft\n'
EOF
	chmod +x "$BIN/uname"
	for failure in '--user daemon-reload' '--user enable --now bitwarden-ssh-agent.service' ''; do
		rm -rf "$HOME_FIXTURE"
		mkdir -p "$HOME_FIXTURE"
		run env -i HOME="$HOME_FIXTURE" PATH="$PATH" SYSTEMCTL_FAIL="$failure" bash "$REPO/scripts/build_env/setup.sh"
		[ "$status" -eq 0 ]
		[[ "$output" == *'Dotfiles setup completed.'* ]]
		[ -L "$HOME_FIXTURE/.agents/skills/sample" ]
		[ -L "$HOME_FIXTURE/.codex/skills/codex-review" ]
		systemctl_calls=$(cat "$HOME_FIXTURE/systemctl.log")
		[[ $systemctl_calls == *'--user daemon-reload'* ]]
		if [[ $failure == '--user daemon-reload' ]]; then
			[[ $output == *'warning: systemd user daemon-reload failed'* ]]
			[[ $systemctl_calls != *'--user enable --now bitwarden-ssh-agent.service'* ]]
		elif [[ $failure == '--user enable --now bitwarden-ssh-agent.service' ]]; then
			[[ $output == *'warning: unable to enable/start the WSL bridge'* ]]
			[[ $systemctl_calls == *'--user enable --now bitwarden-ssh-agent.service'* ]]
		else
			[[ $output != *'warning:'* ]]
			[[ $systemctl_calls == *'--user enable --now bitwarden-ssh-agent.service'* ]]
		fi
	done
}

@test 'retired exact repository links are removed from both skill roots only' {
	mkdir -p "$HOME_FIXTURE/.agents/skills" "$HOME_FIXTURE/.codex/skills" "$TEST_ROOT/foreign"
	for name in cursor fugu large-diff-review cursor-review crm-postmortem; do
		[[ $name == large-diff-review ]] || ln -s "$(realpath "$REPO")/skills/$name" "$HOME_FIXTURE/.agents/skills/$name"
		[[ $name == cursor-review ]] || ln -s "$(realpath "$REPO")/skills/$name" "$HOME_FIXTURE/.codex/skills/$name"
	done
	rm "$HOME_FIXTURE/.agents/skills/cursor" "$HOME_FIXTURE/.codex/skills/fugu"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.agents/skills/cursor"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.codex/skills/fugu"
	mkdir -p "$HOME_FIXTURE/.agents/skills/large-diff-review" "$HOME_FIXTURE/.codex/skills/cursor-review"
	printf 'agent data\n' >"$HOME_FIXTURE/.agents/skills/large-diff-review/data"
	printf 'codex data\n' >"$HOME_FIXTURE/.codex/skills/cursor-review/data"
	run_setup
	for name in cursor fugu large-diff-review cursor-review crm-postmortem; do
		[ ! -L "$HOME_FIXTURE/.agents/skills/$name" ] || [[ $(readlink "$HOME_FIXTURE/.agents/skills/$name") == "$TEST_ROOT/foreign" ]]
		[ ! -L "$HOME_FIXTURE/.codex/skills/$name" ] || [[ $(readlink "$HOME_FIXTURE/.codex/skills/$name") == "$TEST_ROOT/foreign" ]]
	done
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/cursor")" = "$TEST_ROOT/foreign" ]
	[ "$(readlink "$HOME_FIXTURE/.codex/skills/fugu")" = "$TEST_ROOT/foreign" ]
	[ "$(cat "$HOME_FIXTURE/.agents/skills/large-diff-review/data")" = 'agent data' ]
	[ "$(cat "$HOME_FIXTURE/.codex/skills/cursor-review/data")" = 'codex data' ]
}

@test 'required shared skill inventory failure makes actual setup fail' {
	rm "$REPO/skills/sample/SKILL.md"
	run run_setup
	[ "$status" -ne 0 ]
}

@test 'fresh setup works without Fish, ghq, or Zsh and keeps private config and user data' {
	mkdir -p "$HOME_FIXTURE/.codex" "$HOME_FIXTURE/.agents/skills/user-skill" "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer"
	printf 'private config\n' >"$HOME_FIXTURE/.codex/config.toml"
	printf 'owned AGY agent\n' >"$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md"
	printf 'user data\n' >"$HOME_FIXTURE/.agents/skills/user-skill/data"
	run_setup
	[ "$(cat "$HOME_FIXTURE/.codex/config.toml")" = 'private config' ]
	[ "$(cat "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md")" = 'owned AGY agent' ]
	[ -f "$HOME_FIXTURE/.agents/skills/user-skill/data" ]
	[ -L "$HOME_FIXTURE/.config/fish/config.fish" ]
}

@test 'compatibility entrypoints are idempotent and runtime flakes are copied' {
	for entrypoint in setup_fish.sh create_symlink.sh setup_fish.sh create_symlink.sh; do env -i HOME="$HOME_FIXTURE" PATH="$PATH" bash "$REPO/scripts/build_env/$entrypoint"; done
	[ "$(realpath "$HOME_FIXTURE/.agents/skills/sample")" = "$(realpath "$REPO/skills/sample")" ]
	[ -L "$HOME_FIXTURE/.claude/commands" ]
	[ "$(readlink "$HOME_FIXTURE/.claude/commands")" = "$(realpath "$REPO")/claude/commands" ]
	[ ! -e "$REPO/claude/commands/commands" ]
	cmp "$REPO/devbox/runtime-packages/flake.nix" "$HOME_FIXTURE/.local/share/devbox/global/default/runtime-packages/flake.nix"
}

@test 'Hunk profile link is created before install and resolves after profile appears' {
	run_setup
	hunk="$HOME_FIXTURE/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review"
	[ -L "$HOME_FIXTURE/.agents/skills/hunk-review" ]
	mkdir -p "$hunk"
	printf 'installed\n' >"$hunk/SKILL.md"
	[ "$(cat "$HOME_FIXTURE/.agents/skills/hunk-review/SKILL.md")" = installed ]
}

@test 'setup refuses symlink runtime destinations and retires only exact owned jj and AGY links' {
	mkdir -p "$HOME_FIXTURE/.agents/skills" "$HOME_FIXTURE/.codex/skills" "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer" "$TEST_ROOT/foreign"
	ln -s "$(realpath "$REPO")/skills/jj" "$HOME_FIXTURE/.agents/skills/jj"
	ln -s "$(realpath "$REPO")/skills/jj" "$HOME_FIXTURE/.codex/skills/jj"
	ln -s "$REPO/antigravity/agents/patch-reviewer/agent.md" "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.agents/skills/jj-workspace"
	run_setup
	[ ! -L "$HOME_FIXTURE/.agents/skills/jj" ]
	[ ! -L "$HOME_FIXTURE/.codex/skills/jj" ]
	[ ! -e "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md" ]
	[ -L "$HOME_FIXTURE/.agents/skills/jj-workspace" ]
	runtime="$HOME_FIXTURE/.local/share/devbox/global/default/runtime-packages"
	rm -rf "$runtime"
	ln -s "$TEST_ROOT/foreign" "$runtime"
	run env -i HOME="$HOME_FIXTURE" PATH="$PATH" bash "$REPO/scripts/build_env/setup.sh"
	[ "$status" -ne 0 ]
	[ -L "$runtime" ]
}

@test 'setup preserves foreign retired skill links and non-owned AGY agents' {
	mkdir -p "$HOME_FIXTURE/.agents/skills" "$HOME_FIXTURE/.codex/skills" "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer" "$TEST_ROOT/foreign"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.agents/skills/jj"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.codex/skills/jj"
	ln -s "$TEST_ROOT/foreign" "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md"
	mkdir -p "$HOME_FIXTURE/.gemini/config/agents/regular-agent"
	printf 'regular agent\n' >"$HOME_FIXTURE/.gemini/config/agents/regular-agent/agent.md"
	run_setup
	[ -L "$HOME_FIXTURE/.agents/skills/jj" ]
	[ "$(readlink "$HOME_FIXTURE/.agents/skills/jj")" = "$TEST_ROOT/foreign" ]
	[ -L "$HOME_FIXTURE/.codex/skills/jj" ]
	[ "$(readlink "$HOME_FIXTURE/.codex/skills/jj")" = "$TEST_ROOT/foreign" ]
	[ -L "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md" ]
	[ "$(readlink "$HOME_FIXTURE/.gemini/config/agents/patch-reviewer/agent.md")" = "$TEST_ROOT/foreign" ]
	[ "$(cat "$HOME_FIXTURE/.gemini/config/agents/regular-agent/agent.md")" = 'regular agent' ]
	# Runtime file symlink refusal must leave its external target untouched.
	runtime="$HOME_FIXTURE/.local/share/devbox/global/default/runtime-packages"
	rm "$runtime/flake.nix"
	printf 'external sentinel\n' >"$TEST_ROOT/sentinel"
	ln -s "$TEST_ROOT/sentinel" "$runtime/flake.nix"
	run env -i HOME="$HOME_FIXTURE" PATH="$PATH" bash "$REPO/scripts/build_env/setup.sh"
	[ "$status" -ne 0 ]
	[ -L "$runtime/flake.nix" ]
	[ "$(cat "$TEST_ROOT/sentinel")" = 'external sentinel' ]
}

@test 'setup preserves a real user-owned retired jj directory' {
	mkdir -p "$HOME_FIXTURE/.agents/skills/jj"
	printf 'user jj data\n' >"$HOME_FIXTURE/.agents/skills/jj/data"
	run_setup
	[ -d "$HOME_FIXTURE/.agents/skills/jj" ]
	[ ! -L "$HOME_FIXTURE/.agents/skills/jj" ]
	[ "$(cat "$HOME_FIXTURE/.agents/skills/jj/data")" = 'user jj data' ]
}
