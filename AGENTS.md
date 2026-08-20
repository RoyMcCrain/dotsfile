# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository Overview

dotfiles repository for macOS/WSL2 development environment. Uses devbox for tool management, dpp.vim (TypeScript/Deno) for Neovim plugin management, and jujutsu (jj) as git-compatible VCS.

## Required Tools (MUST)

Hard requirements for every agent in this environment (not Pi-only). Canonical copy: `claude/rules/required-tools.md`.

- MUST use `fd` for file and directory discovery. Do NOT use `find`. Examples: `fd PATTERN`, `fd -e ts`, `fd -t f PATTERN`, `fd -H -I PATTERN`. Exception: POSIX-only environments where `fd` is unavailable.
- MUST use `rg` for text/code search. Do NOT use recursive `grep`.
- MUST use `jq` / `yq` for JSON/YAML inspection and transformation. Do NOT hand-parse with ad-hoc shell when `jq`/`yq` can do it.
- MUST use `ast-grep` for syntax-aware code search and codemods when plain text search may be unsafe.
- MUST use `sd` for simple literal/regex replacements in shell workflows. Use precise edit tools for small source-file edits.
- MUST use `taplo` for TOML formatting and validation.
- MUST use `shellcheck` and `shfmt` for shell script validation and formatting.
- MUST prefer non-interactive, machine-readable commands in automated agent workflows. Do NOT use interactive tools such as `fzf` unless the user explicitly requests them.
- MUST NOT re-read the same vendor bundle (`node_modules/**/dist/*.mjs` 等) or large file across multiple turns in one session; once read, note the relevant API/lines and reuse that instead of reading again.

## Commands

### Environment Setup
```bash
./scripts/build_env/setup_fish.sh       # Create dotfile symlinks
devbox global install                   # Install tools from devbox.json
devbox global run setup-npm             # Install npm global packages (neovim, typescript)
```

### Neovim Configuration
```bash
deno lint                # Lint TypeScript plugin configs
deno fmt                 # Format TypeScript plugin configs
deno cache nvim/dpp.config.ts  # Cache Deno dependencies

# In Neovim
:call dpp#install()      # Install plugins
:call dpp#make_state()   # Rebuild plugin state
```

### Troubleshooting dpp/Deno
```bash
rm -fr ~/.cache/deno ~/.cache/dpp  # Clear cache on plugin errors
```

### AI Commit (LM Studio)
```bash
./scripts/ai-commit.sh   # Generate commit message (requires LM Studio on port 1234)
```

## Structure

- `/nvim/` - Neovim config
  - `dpp.config.ts` - Plugin manager config (TypeScript)
  - `init.lua` - Main Neovim config
  - `/lua/plugins/` - Lua plugin configs
  - `/toml/` - Plugin definitions (TOML)
  - `/denops/` - Deno plugins
- `/fish/` - Fish shell config
  - `config.fish`, `abbreviations.fish`, `/functions/`
- `/devbox/devbox.json` - Tool definitions (symlinked to ~/.local/share/devbox/global/default/)
- `/scripts/build_env/` - Setup scripts (cross-environment)
- `/scripts/wsl/` - WSL2専用の個人PC設定(systemdユニット、NAS認証情報同期等)
- `/claude/` - Claude Code config (symlinked to ~/.claude/)
  - `/rules/` - Coding rules (KISS, TypeScript, React, etc.)
  - `/skills/` - Claude-only real skills (e.g. `crm-postmortem`) plus symlinks to shared skills in `skills/`
  - `/hooks/` - Automation hooks
  - `settings.json` - Claude Code settings
- `/skills/` - **Canonical shared skills** for Pi, Codex, Claude (via symlinks), and other agents. Exposed globally via `~/.agents/skills/` by setup scripts; intentionally not Pi's project-local `.agents/skills` discovery path.
- `/codex/` - OpenAI Codex CLI config (symlinked to ~/.codex/)
  - `/skills/` - Codex-native skill overrides (`codex-review`, `mcp-delegate`)
- `/antigravity/` - Antigravity CLI (agy) config (symlinked to ~/.gemini/antigravity-cli/, 旧 Gemini CLI)
- `gitconfig`, `jjconfig.toml` - VCS configs

## Architecture

### Neovim
- **dpp.vim** plugin manager with Deno runtime
- Lazy-loaded plugins via TOML definitions
- LSP support: TypeScript (vtsls), Go (gopls), Lua, Tailwind, GraphQL, YAML

### Tool Management
- **devbox** manages all development tools globally
- Tools defined in `/devbox/devbox.json`
- Refresh: `devbox global shellenv --preserve-path-stack -r`

### VCS
- **jujutsu (jj)** as primary, git-compatible
- Config: `jjconfig.toml` (symlinked to ~/.config/jj/config.toml)

### AI Tools
- **Codex** - Primary AI assistant with custom rules/skills/hooks
  - 重い MCP プラグインは `enabledPlugins` で `false` 化しオンデマンド運用（手順は `Codex/rules/plugins.md`）
- **Codex CLI** - OpenAI Codex for design consultation and code review
- **Antigravity CLI (agy)** - research and documentation (旧 Gemini CLI、brew cask `antigravity-cli`)
