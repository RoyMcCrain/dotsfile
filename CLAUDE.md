# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
