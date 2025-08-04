# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a comprehensive dotfiles repository for personal development environment configuration, featuring:
- Neovim with TypeScript-based configuration using dpp.vim and Deno
- Fish and Zsh shell configurations with extensive customizations
- asdf for version management
- AI tooling integration (Claude Code CLI, LM Studio)
- WSL2 optimized setup

## Common Development Commands

### Environment Setup
```bash
# Initialize asdf plugins
./scripts/build_env/asdf_init_plugin.sh

# Install plugin versions
./scripts/build_env/asdf_install_plugin.sh

# Create symbolic links for dotfiles
./scripts/build_env/create_symlink.sh
```

### Neovim Configuration Development
```bash
# Lint TypeScript configuration files
deno lint

# Format TypeScript configuration files
deno fmt

# Clear Deno/dpp cache if plugin errors occur
rm -fr ~/.cache/deno ~/.cache/dpp
```

### AI-Powered Commit Messages
```bash
# Generate commit message using LM Studio
./scripts/ai-commit.sh
```

## Repository Structure

### Key Directories
- `/nvim/` - Neovim configuration with dpp.vim plugin manager
  - `/nvim/plugins/` - TypeScript plugin configurations
  - `/nvim/dpp/` - Plugin manager setup
- `/fish/` - Fish shell configuration and functions
- `/zsh/` - Zsh configuration with antigen plugin manager
- `/scripts/build_env/` - Environment setup automation scripts
- `/asdf/` - Version management configuration files

### Configuration Files
- `zshrc` - Main Zsh configuration entry point
- `gitconfig` - Git configuration with custom aliases
- `deno.json` - Deno configuration for Neovim TypeScript files

## Architecture and Patterns

### Neovim Configuration
- Uses dpp.vim as plugin manager with Deno runtime
- TypeScript-based configuration for type safety
- Lazy-loaded plugins for performance
- Extensive LSP setup for multiple languages (TypeScript, Tailwind, GraphQL, YAML)
- AI integration for code completion and commit messages

### Shell Environment
- Modular configuration with separate files for different concerns
- Custom abbreviations and functions for improved workflow
- Integration with tools like eza, fzf, ghq for enhanced productivity
- Japanese language support and localization

### Version Management
- asdf manages multiple language versions (Node.js, Python, Go, Ruby, etc.)
- `.tool-versions` defines project-specific versions
- Automated plugin installation and setup scripts

## Development Notes

### Troubleshooting Deno/dpp Issues
When encountering plugin loading errors like "Failed to load plugin" or version constraint errors:
```bash
rm -fr ~/.cache/deno
rm -fr ~/.cache/dpp
```

### WSL2-Specific Configuration
- WSL-Hello-sudo integration for Windows Hello authentication
- xsel for clipboard integration between WSL and Windows
- Optimized shell startup performance

### AI Commit Message Generation
The `ai-commit.sh` script integrates with LM Studio API to generate commit messages using the `qwen/qwen3-8b` model. 

Features:
- **Automatic execution**: Git commits from Neovim automatically trigger AI message generation
- **Context optimization**: Reduces diff context to 1 line (configurable) to minimize token usage
- **Large diff handling**: Automatically summarizes diffs over 500 lines (configurable)
- **Environment variables**:
  - `AI_COMMIT_MAX_LINES`: Maximum diff lines before summarization (default: 500)
  - `AI_COMMIT_CONTEXT`: Context lines in diff (default: 1)

Ensure LM Studio is running on port 1234 before using.