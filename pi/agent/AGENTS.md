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

Shared implementation/review delegation, safety and AI-send boundaries, browser policy, and Web routing are owned by `APPEND_SYSTEM.md`; follow that policy without duplicating its details here.

- **Model catalog and resolver**: `pi/agent/model-roles.json` is authoritative for model IDs; skills/runners reference catalog roles only, never literal model IDs. Resolve via `~/.pi/agent/resolve-model.sh ROLE` (`--field cursor` is compatibility only; `--list` lists roles; `--review-level N` resolves review tiers). Resolver `--apply`/`--check` may synchronize/check only the model of an existing live Codex config. Optional interactive scope is user-managed in Pi via `/scoped-models`; role edits affect resolution without syncing Pi settings.
- **Fugu**: automatic routing/escalation is disabled by default; standalone/manual roles remain available.
- **Complexity gate**: Follow the scoped cccc policy in the canonical `impl` skill. Classify by intended retention/deployment; disposable snippets may skip mandatory cccc, durable source (including under `/tmp`) may not. Check WARNING thresholds for new/AI-added processing and compare existing functions with baseline plus diff. Exit 0 is measured/no hard, 1 hard, 2 unverified; required UNVERIFIED is not accepted. This does not replace tests, types, lint, or spec checks.
- **GitHub PR screenshots**: Attach requested screenshots with `gh pr create --attach <file>` or `gh pr edit <number> --attach <file>`. Do not use browser upload unless explicitly requested; report unavailable or failed CLI attachment instead of falling back.
- **Hosted MCP**: use `mcp-delegate` for hosted OAuth workflows (Slack, Sentry, Notion, etc.), with its connection gate and read-only hardening. Do not scrape private Slack URLs. Sentry issue workspace flow remains `jj-workspace`.
