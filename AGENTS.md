# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository Overview

dotfiles repository for macOS/WSL2 development environment. Uses devbox for tool management, dpp.vim (TypeScript/Deno) for Neovim plugin management, and jujutsu (jj) as git-compatible VCS.

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
- `/scripts/build_env/` - Setup scripts
- `/Codex/` - Codex config (symlinked to ~/.Codex/)
  - `/rules/` - Coding rules (KISS, TypeScript, React, etc.)
  - `/skills/` - Custom skills (jj, line, cursor-*, antigravity-*, firecrawl-*)
  - `/hooks/` - Automation hooks
  - `settings.json` - Codex settings
- `/codex/` - OpenAI Codex CLI config (symlinked to ~/.codex/)
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
