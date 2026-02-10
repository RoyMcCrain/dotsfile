# Codex CLI - Claude Code Orchestra

## Role

Claude Codeのサブエージェントとして動作。単独使用は想定しない。

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
