# Required Tools Rule (MUST)

These are hard requirements for every agent (Claude Code, Pi, Codex, Antigravity/agy, Cursor, etc.), not preferences. Do not use the legacy alternatives when the required tool is available.

- MUST use `fd` for file and directory discovery. Do NOT use `find`. Examples: `fd PATTERN`, `fd -e ts`, `fd -t f PATTERN`, `fd -H -I PATTERN`. Exception: POSIX-only environments where `fd` is unavailable.
- MUST use `rg` for text/code search. Do NOT use recursive `grep`.
- MUST use `jq` / `yq` for JSON/YAML inspection and transformation. Do NOT hand-parse with ad-hoc shell when `jq`/`yq` can do it.
- MUST use `ast-grep` for syntax-aware code search and codemods when plain text search may be unsafe.
- MUST use `sd` for simple literal/regex replacements in shell workflows. Use precise edit tools for small source-file edits.
- MUST use `taplo` for TOML formatting and validation.
- MUST use `shellcheck` and `shfmt` for shell script validation and formatting.
- MUST prefer non-interactive, machine-readable commands in automated agent workflows. Do NOT use interactive tools such as `fzf` unless the user explicitly requests them.
- MUST NOT re-read the same vendor bundle (`node_modules/**/dist/*.mjs` 等) or large file across multiple turns in one session; once read, note the relevant API/lines and reuse that instead of reading again. Re-reads compound conversation history and inflate cached input tokens on every subsequent request.
