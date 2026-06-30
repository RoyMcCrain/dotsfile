# Pi Global Agent Instructions

This file provides global instructions for Pi Coding Agent sessions.

## AI Agent Routing

- **Implementation**: Use the `cursor-impl` skill (`/skill:cursor-impl` in Pi) to delegate actively to Cursor Agent CLI `composer-2.5`. Pi prepares the implementation prompt and validates the resulting diff, lint, and tests. Only trivial few-line edits may be done directly.
- **Web research**: Use the `firecrawl` skill (`/skill:firecrawl`) for general web search, scraping, URL fetches, docs crawling, and browser interaction. Use `firecrawl-agent` (`/skill:firecrawl-agent`) when structured JSON extraction or autonomous multi-page extraction is needed.
- **Web research double-check**: Use `cross-research` (`/skill:cross-research`) for important research that needs verification; it runs Firecrawl and `agy` (Antigravity CLI, successor to Gemini CLI) in parallel. Use `antigravity-research` (`/skill:antigravity-research`) only for agy-only broad summaries where facts are not treated as confirmed.
- **Review**: Use `cursor` or `fugu` (`/skill:cursor`, `/skill:fugu`) for Cursor Agent CLI `composer-2.5` + Codex/Fugu parallel review, `codex-review` (`/skill:codex-review`) for Codex review, and `claude-review` (`/skill:claude-review`) for Claude Opus review; compare findings before acting.
- **MCP integrations**: Use Claude Sonnet for MCP-connected workflows, especially Slack and Sentry. Sentry issue workspace flow is covered by `jj-workspace` (`/skill:jj-workspace`); use a dedicated MCP delegation skill when available.
