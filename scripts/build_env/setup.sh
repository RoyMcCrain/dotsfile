#!/usr/bin/env bash
# Canonical, idempotent dotfiles setup. Safe to run before installing the full Devbox config.
set -euo pipefail

BASE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)

say() { printf '%s\n' "$*"; }

link_managed() {
	local source=$1 destination=$2 allow_missing=${3:-false} parent backup
	[[ -e "$source" || -L "$source" || "$allow_missing" == true ]] || {
		say "skip (missing source): $source"
		return 0
	}
	parent=$(dirname "$destination")
	mkdir -p "$parent"
	if [[ -L "$destination" ]]; then
		[[ $(readlink "$destination") == "$source" ]] && return 0
		rm -- "$destination"
	elif [[ -e "$destination" ]]; then
		if [[ $destination == "$HOME/.agents/skills/"* ]]; then
			backup="$HOME/.agents/skill-backups/$(basename "$destination").backup-$(date +%Y%m%d%H%M%S)"
		else
			backup="${destination}.backup-$(date +%Y%m%d%H%M%S)"
		fi
		[[ ! -e "$backup" && ! -L "$backup" ]] || {
			say "refusing to overwrite backup: $backup" >&2
			return 1
		}
		mv -- "$destination" "$backup"
		say "backed up existing data: $destination -> $backup"
	fi
	ln -s -- "$source" "$destination"
}

link_shared_skills() {
	local name source effective_source native_source root
	mkdir -p "$HOME/.agents/skills" "$HOME/.agents/skill-backups" "$HOME/.codex/skills"
	while IFS= read -r source; do
		name=$(basename "$source")
		native_source="$BASE_DIR/codex/skills/$name"
		effective_source=$source
		[[ -f "$native_source/SKILL.md" ]] && effective_source=$native_source
		link_managed "$effective_source" "$HOME/.agents/skills/$name"
		# A real directory is explicitly user-owned and opts out of Codex delivery.
		if [[ ! -d "$HOME/.codex/skills/$name" || -L "$HOME/.codex/skills/$name" ]]; then
			link_managed "$effective_source" "$HOME/.codex/skills/$name"
		fi
	done <<<"$shared_skill_inventory_text"
	for name in cursor fugu large-diff-review cursor-review crm-postmortem; do
		# Retired names should not remove foreign links or real user data.
		for root in "$HOME/.agents/skills" "$HOME/.codex/skills"; do
			[[ -L "$root/$name" && $(readlink "$root/$name") == "$BASE_DIR/skills/$name" ]] && rm -- "$root/$name"
		done
	done
	local hunk="$HOME/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review"
	# This stable Devbox profile path is populated by the later install.
	link_managed "$hunk" "$HOME/.agents/skills/hunk-review" true
}

say "Setting up dotfiles from $BASE_DIR"
# Fish, Zsh and shared editor/VCS configuration.
for item in config.fish abbreviations.fish fzf.fish; do link_managed "$BASE_DIR/fish/$item" "$HOME/.config/fish/$item"; done
link_managed "$BASE_DIR/fish/functions" "$HOME/.config/fish/functions"
link_managed "$BASE_DIR/fish/completions" "$HOME/.config/fish/completions"
for item in nvim gitconfig bash_profile zprofile; do
	if [[ $item == nvim ]]; then
		link_managed "$BASE_DIR/$item" "$HOME/.config/nvim"
	else link_managed "$BASE_DIR/$item" "$HOME/.$item"; fi
done
link_managed "$BASE_DIR/gitignore" "$HOME/.config/git/ignore"
mkdir -p "$HOME/.local/bin"
link_managed "$BASE_DIR/scripts/ai-commit.sh" "$HOME/.local/bin/ai-commit"

# Devbox config symlink plus real flake copies (Nix pure evaluation rejects symlinked flake files).
devbox_dir="$HOME/.local/share/devbox/global/default"
mkdir -p "$devbox_dir"
link_managed "$BASE_DIR/devbox/devbox.json" "$devbox_dir/devbox.json"
runtime_dir="$devbox_dir/runtime-packages"
if [[ -L "$runtime_dir" ]]; then
	say "refusing symlink runtime packages directory: $runtime_dir" >&2
	exit 1
fi
mkdir -p "$runtime_dir"
for item in flake.nix flake.lock; do
	[[ ! -L "$runtime_dir/$item" ]] || {
		say "refusing symlink runtime package file: $runtime_dir/$item" >&2
		exit 1
	}
	cp "$BASE_DIR/devbox/runtime-packages/$item" "$runtime_dir/$item"
done

for spec in \
	"$BASE_DIR/jjconfig.toml:$HOME/.config/jj/config.toml" \
	"$BASE_DIR/hunk/config.toml:$HOME/.config/hunk/config.toml" \
	"$BASE_DIR/cmux:$HOME/.config/cmux" \
	"$BASE_DIR/ghostty:$HOME/.config/ghostty" \
	"$BASE_DIR/ssh/config:$HOME/.ssh/config"; do
	link_managed "${spec%%:*}" "${spec#*:}"
done
if [[ $(uname -r 2>/dev/null || true) == *microsoft* ]]; then
	link_managed "$BASE_DIR/scripts/wsl/bitwarden-ssh-agent.service" "$HOME/.config/systemd/user/bitwarden-ssh-agent.service"
	if ! systemctl --user daemon-reload; then
		say 'warning: systemd user daemon-reload failed; start manually with: systemctl --user daemon-reload && systemctl --user enable --now bitwarden-ssh-agent.service' >&2
	elif ! systemctl --user enable --now bitwarden-ssh-agent.service; then
		say 'warning: unable to enable/start the WSL bridge; retry manually with: systemctl --user enable --now bitwarden-ssh-agent.service' >&2
	fi
fi

for item in settings.json statusline.sh; do link_managed "$BASE_DIR/claude/$item" "$HOME/.claude/$item"; done
for item in agents commands hooks rules skills sandbox; do link_managed "$BASE_DIR/claude/$item" "$HOME/.claude/$item"; done
if [[ -f "$BASE_DIR/claude/mcp-servers.json" ]] && command -v jq >/dev/null && command -v claude >/dev/null; then
	while IFS= read -r name; do
		claude mcp remove -s user "$name" >/dev/null 2>&1 || true
		claude mcp add-json -s user "$name" "$(jq -c --arg name "$name" '.[$name]' "$BASE_DIR/claude/mcp-servers.json")" >/dev/null 2>&1 || say "failed MCP registration: $name"
	done < <(jq -r 'keys[]' "$BASE_DIR/claude/mcp-servers.json")
fi

# Only retire the exact obsolete repository-owned AGY agent link. Keep CLI research support.
agy_agent="$HOME/.gemini/config/agents/patch-reviewer/agent.md"
if [[ -L "$agy_agent" && $(readlink "$agy_agent") == "$BASE_DIR/antigravity/agents/patch-reviewer/agent.md" ]]; then rm -- "$agy_agent"; fi
for item in AGENTS.md instructions.md; do link_managed "$BASE_DIR/antigravity/$item" "$HOME/.gemini/antigravity-cli/$item"; done
link_managed "$BASE_DIR/antigravity/skills/context-loader" "$HOME/.gemini/antigravity-cli/skills/context-loader"

for item in AGENTS.md APPEND_SYSTEM.md settings.json models.json model-roles.json resolve-model.sh extensions lib; do
	link_managed "$BASE_DIR/pi/agent/$item" "$HOME/.pi/agent/$item"
done
if command -v npm >/dev/null 2>&1; then bash "$BASE_DIR/scripts/build_env/patch_pi_min_output_tokens.sh"; fi

# Read and validate the authoritative inventory once before distributing shared skills.
shared_skill_inventory_text=$(bash "$BASE_DIR/scripts/build_env/list_shared_agent_skills.sh" "$BASE_DIR")
[[ -n "$shared_skill_inventory_text" ]] || {
	say 'shared skill inventory is empty' >&2
	exit 1
}
mkdir -p "$HOME/.codex/skills"
for item in AGENTS.md instructions.md hooks.json hooks; do link_managed "$BASE_DIR/codex/$item" "$HOME/.codex/$item"; done
bash "$BASE_DIR/scripts/build_env/setup_codex_config.sh" "$BASE_DIR"
link_managed "$BASE_DIR/codex/fugu.json" "$HOME/.codex/fugu.json"
if [[ ! -e "$HOME/.codex/fugu.config.toml" && ! -L "$HOME/.codex/fugu.config.toml" ]]; then cp "$BASE_DIR/codex/fugu.config.toml.example" "$HOME/.codex/fugu.config.toml"; fi
link_shared_skills
# Codex-only skills are intentionally absent from the shared Pi inventory.
for source in "$BASE_DIR"/codex/skills/*; do
	[[ -f "$source/SKILL.md" ]] || continue
	destination="$HOME/.codex/skills/$(basename "$source")"
	[[ -d "$destination" && ! -L "$destination" ]] && continue
	link_managed "$source" "$destination"
done
# Retire only pre-existing links exactly targeting this repository's legacy shared jj skill.
for destination in "$HOME/.agents/skills/jj" "$HOME/.codex/skills/jj"; do
	if [[ -L "$destination" && $(readlink "$destination") == "$BASE_DIR/skills/jj" ]]; then rm -- "$destination"; fi
done

# Repository-local hook configuration; no package installation or Devbox activation here.
git -C "$BASE_DIR" config --local core.hooksPath .githooks
say 'Dotfiles setup completed.'
