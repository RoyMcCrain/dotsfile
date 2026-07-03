# Pi Global Agent Instructions

This file provides global instructions for Pi Coding Agent sessions.

## Tool Preferences

- Prefer `fd` over `find` for file and directory discovery. Examples: `fd PATTERN`, `fd -e ts`, `fd -t f PATTERN`, `fd -H -I PATTERN`. Use `find` only when POSIX-specific behavior is required or `fd` is unavailable.
- Prefer `rg` over recursive `grep` for text/code search.
- Prefer `jq` and `yq` for JSON/YAML inspection and transformation.
- Prefer `ast-grep` for syntax-aware code search and codemods when plain text search may be unsafe.
- Prefer `sd` for simple literal/regex replacements in shell workflows; use precise edit tools for small source-file edits.
- Prefer `taplo` for TOML formatting and validation.
- Prefer `stylua` for Lua formatting.
- Prefer `shellcheck` and `shfmt` for shell script validation and formatting.
- Prefer `hyperfine` when comparing command performance.
- Prefer `just` when a project provides a `justfile`/`Justfile` for common tasks.
- Prefer non-interactive, machine-readable commands in automated agent workflows; avoid interactive tools such as `fzf` unless explicitly requested.

## AI Agent Routing

- **Implementation**: Use the `cursor-impl` skill (`/skill:cursor-impl` in Pi) to delegate actively to Cursor Agent CLI `composer-2.5`. Pi prepares the implementation prompt and validates the resulting diff, lint, and tests. Only trivial few-line edits may be done directly.
- **Web research**: Use the `firecrawl` skill (`/skill:firecrawl`) for general web search, scraping, URL fetches, docs crawling, and browser interaction. Use `firecrawl-agent` (`/skill:firecrawl-agent`) when structured JSON extraction or autonomous multi-page extraction is needed.
- **Web research double-check**: Use `cross-research` (`/skill:cross-research`) for important research that needs verification; it runs Firecrawl and `agy` (Antigravity CLI, successor to Gemini CLI) in parallel. Use `antigravity-research` (`/skill:antigravity-research`) only for agy-only broad summaries where facts are not treated as confirmed.
- **Review**: Use `cursor` or `fugu` (`/skill:cursor`, `/skill:fugu`) for Cursor Agent CLI `composer-2.5` + Codex/Fugu parallel review, `codex-review` (`/skill:codex-review`) for Codex review, and `claude-review` (`/skill:claude-review`) for Claude Opus review; compare findings before acting.
- **MCP integrations**: Use Claude Sonnet for MCP-connected workflows, especially Slack and Sentry. Sentry issue workspace flow is covered by `jj-workspace` (`/skill:jj-workspace`); use a dedicated MCP delegation skill when available.
