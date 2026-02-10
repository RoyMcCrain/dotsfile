---
name: codex
description: Codex CLIでコード実装を実行
metadata:
  target_agent: claude
---

# /codex

Codex CLIを使ったコード実装のスキル。

## コマンド

- `/codex [指示]` - コード実装

## 実装

```bash
codex --approval-mode auto-edit "以下を実装してください: [指示]"
```

## 実行手順

1. ユーザーの依頼内容を整理
2. 関連するコードやドキュメントを収集
3. 上記コマンドでCodexを呼び出す
4. Codexの出力を要約してユーザーに報告
