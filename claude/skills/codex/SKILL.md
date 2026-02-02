---
name: codex
description: Codex CLIでコードレビュー・設計相談を実行
metadata:
  target_agent: claude
---

# /codex

Codex CLIを使ったコードレビューと設計相談のスキル。

## コマンド

- `/codex review [対象]` - コードレビュー
- `/codex design [課題]` - 設計相談

## コードレビュー

```bash
codex --approval-mode full-auto "以下のコードをレビューしてください。バグ、セキュリティ問題、改善点を指摘してください: [対象]"
```

## 設計相談

```bash
codex --approval-mode full-auto "以下の設計について検討してください。トレードオフと推奨アプローチを提示してください: [課題]"
```

## 実行手順

1. ユーザーの依頼内容を整理
2. 関連するコードやドキュメントを収集
3. 上記コマンドでCodexを呼び出す
4. Codexの出力を要約してユーザーに報告
