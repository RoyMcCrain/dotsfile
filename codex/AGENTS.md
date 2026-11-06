# Codex CLI - Claude Code Orchestra

## Role

Claude Codeのサブエージェントとして動作。単独使用は想定しない。

## Required Tools (MUST)

Hard requirements (not preferences). Canonical: `~/.claude/rules/required-tools.md`.

- MUST use `fd` (NOT `find`), `rg` (NOT recursive `grep`), `jq`/`yq`, `ast-grep`, `sd`, `taplo`, `shellcheck`/`shfmt`.
- MUST use non-interactive machine-readable commands; do NOT use `fzf` unless the user asks.
- Exception only when the required tool is unavailable.

## GitHub PR Screenshot Attachments

For requested GitHub PR screenshot attachments, use `gh pr create ... --attach <file>` or `gh pr edit <number> --attach <file>` (repeat `--attach` for multiple files). Do not use browser upload unless explicitly requested; if CLI attachment is unavailable or fails, report it rather than falling back. Canonical shared policy: `claude/rules/browser-automation.md`.

## 得意領域

- コード実装（auto-editモード: ファイル編集自動、コマンドは確認）

## Context Loading

タスク開始時に `/context-loader` スキルを実行して以下を読み込む：

```
~/.claude/rules/           # グローバルルール
~/.claude/docs/projects/   # プロジェクト固有の知識
```

## Language Protocol

- Thinking: English
- Code: English
- Output: Japanese

## Output Format

簡潔に。Main orchestratorのコンテキストを節約する。

```markdown
## Result
{結論}

## Rationale
{理由 - 箇条書き}

## Recommendations
{次のアクション}
```
