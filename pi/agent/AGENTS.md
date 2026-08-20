# Pi Global Agent Instructions

This file provides global instructions for Pi Coding Agent sessions.

## Required Tools (MUST)

These are hard requirements for every agent (Pi and others), not preferences. Canonical shared rule: `claude/rules/required-tools.md`. Do not use the legacy alternatives when the required tool is available.

- MUST use `fd` for file and directory discovery. Do NOT use `find`. Examples: `fd PATTERN`, `fd -e ts`, `fd -t f PATTERN`, `fd -H -I PATTERN`. Exception: POSIX-only environments where `fd` is unavailable.
- MUST use `rg` for text/code search. Do NOT use recursive `grep`.
- MUST use `jq` / `yq` for JSON/YAML inspection and transformation. Do NOT hand-parse with ad-hoc shell when `jq`/`yq` can do it.
- MUST use `ast-grep` for syntax-aware code search and codemods when plain text search may be unsafe.
- MUST use `sd` for simple literal/regex replacements in shell workflows. Use precise edit tools for small source-file edits.
- MUST use `taplo` for TOML formatting and validation.
- MUST use `shellcheck` and `shfmt` for shell script validation and formatting.
- MUST prefer non-interactive, machine-readable commands in automated agent workflows. Do NOT use interactive tools such as `fzf` unless the user explicitly requests them.
- MUST NOT re-read the same vendor bundle (`node_modules/**/dist/*.mjs` 等) or large file across multiple turns in one session; once read, note the relevant API/lines and reuse that instead of reading again. Re-reads compound conversation history and inflate cached input tokens on every subsequent request.

## AI Agent Routing

- **Model budget**: Fugu は週次 quota が厳しいため主モデルには自動選択しない。単体 `fugu-review` はユーザーが明示した場合だけ。ただし `parallel-review` は fugu-ultra を既定 reviewer に含む（現在 provider と一致時は除外）。quota/rate-limit 時は再試行しない。長いセッションは `/new` または `/compact` で区切る。
- **Model IDs**: `pi/agent/model-roles.json` is the single source of truth. Skills and runners reference roles (`review.codex`, `review.claude`, `review.fugu`, `review.grok`, `impl.cursor`, `research.xai`), never literal model IDs. Resolve Pi roles with `~/.pi/agent/resolve-model.sh ROLE`; resolve the Cursor Agent role with `--field cursor ROLE`; list with `--list`; after editing the catalog run `--apply` to sync `enabledModels` into `settings.json`.
- **Implementation**: Use the `cursor-impl` skill (`/skill:cursor-impl` in Pi) to delegate actively to `cursor-agent` with role `impl.cursor` (resolve via `--field cursor`). Pi prepares the implementation prompt and validates the resulting diff, lint, and tests. Only trivial few-line edits may be done directly.
- **Web research**: Use the `firecrawl` skill (`/skill:firecrawl`; sourced from `claude/skills/firecrawl-cli`) for general web search, scraping, URL fetches, docs crawling, and browser interaction. Use `firecrawl-agent` (`/skill:firecrawl-agent`) when structured JSON extraction or autonomous multi-page extraction is needed. These are linked into `~/.agents/skills/` via `scripts/build_env/list_shared_agent_skills.sh`.
- **Web research double-check**: Use `cross-research` (`/skill:cross-research`) for important research that needs verification; it runs Firecrawl, `agy` (Antigravity CLI, successor to Gemini CLI), and Grok X Search in parallel. Use `antigravity-research` (`/skill:antigravity-research`) only for agy-only broad summaries where facts are not treated as confirmed.
- **Review**: Plain 「レビューして」 uses `parallel-review`: one secret-filtered patch, isolated Pi headless reviewers in parallel at a chosen tier (`reviewLevels` 1=light, 2=standard/default, 3=deep). Tiers change precision only; each reviewer's timeout is sized from the patch (base + perKb*KB, capped). Each reviewer is retried once on transient failures only (not on timeout); the fugu reviewer is never retried to protect its quota. The reviewer whose provider matches the current session (`PI_PROVIDER`) is excluded. Child reviewers must disable skills/context to prevent recursive review spawning. Use a single-reviewer skill only when named (`codex-review`, `claude-review`, `fugu-review`, `grok-review`).
- **MCP integrations**: Use `mcp-delegate` (`/skill:mcp-delegate`) for Slack links and other hosted OAuth MCP workflows (Slack, Sentry, Notion, etc.). It delegates to Claude Sonnet with a connection gate and read-only hardening. Sentry issue workspace flow is still covered by `jj-workspace` (`/skill:jj-workspace`). Do not scrape private Slack URLs with Firecrawl/browser.
