# Pi Global Agent Instructions

This file provides global instructions for Pi Coding Agent sessions.

## Tool Preferences

- Prefer `fd` over `find` for file and directory discovery. Examples: `fd PATTERN`, `fd -e ts`, `fd -t f PATTERN`, `fd -H -I PATTERN`. Use `find` only when POSIX-specific behavior is required or `fd` is unavailable.
- Prefer `rg` over recursive `grep` for text/code search.
- Prefer `jq` and `yq` for JSON/YAML inspection and transformation.
- Prefer `ast-grep` for syntax-aware code search and codemods when plain text search may be unsafe.
- Prefer `sd` for simple literal/regex replacements in shell workflows; use precise edit tools for small source-file edits.
- Prefer `taplo` for TOML formatting and validation.
- Prefer `shellcheck` and `shfmt` for shell script validation and formatting.
- Prefer non-interactive, machine-readable commands in automated agent workflows; avoid interactive tools such as `fzf` unless explicitly requested.
- Avoid re-reading the same vendor bundle (`node_modules/**/dist/*.mjs` 等) or large file across multiple turns in one session; once read, note the relevant API/lines and reuse that instead of reading again. Re-reads compound conversation history and inflate cached input tokens on every subsequent request.

## AI Agent Routing

- **Model budget**: Fugu は週次 quota が厳しいため自動選択しない。`fugu-review` はユーザーが明示した場合だけ使い、quota/rate-limit 時は再試行しない。長いセッションは `/new` または `/compact` で区切る。
- **Implementation**: Use the `cursor-impl` skill (`/skill:cursor-impl` in Pi) to delegate actively to Pi headless with `cursor/composer-2.5-fast`. Pi prepares the implementation prompt and validates the resulting diff, lint, and tests. Only trivial few-line edits may be done directly.
- **Web research**: Use the `firecrawl` skill (`/skill:firecrawl`) for general web search, scraping, URL fetches, docs crawling, and browser interaction. Use `firecrawl-agent` (`/skill:firecrawl-agent`) when structured JSON extraction or autonomous multi-page extraction is needed.
- **Web research double-check**: Use `cross-research` (`/skill:cross-research`) for important research that needs verification; it runs Firecrawl and `agy` (Antigravity CLI, successor to Gemini CLI) in parallel. Use `antigravity-research` (`/skill:antigravity-research`) only for agy-only broad summaries where facts are not treated as confirmed.
- **Review**: Plain 「レビューして」 uses `parallel-review`: one secret-filtered patch, two isolated Pi headless reviewers in parallel, 120-second timeout each, no automatic retry. Child reviewers must disable skills/context to prevent recursive review spawning. Use a single-reviewer skill only when named; Fugu is explicit-only.
- **MCP integrations**: Use Claude Sonnet for MCP-connected workflows, especially Slack and Sentry. Sentry issue workspace flow is covered by `jj-workspace` (`/skill:jj-workspace`); use a dedicated MCP delegation skill when available.
