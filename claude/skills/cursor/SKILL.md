---
name: cursor
description: Cursor Agent CLIでコードレビューを実行
metadata:
  target_agent: claude
---

# /cursor

Cursor AgentとClaude自身で並行レビューを実行するスキル。

## コマンド

- `/cursor [指示]` - コードレビュー

## 実行手順

1. ユーザーのレビュー対象・観点を整理
2. 以下を**並行**で実行する:
   - Bashで `cursor-agent -p --trust --mode ask --model gpt-5.5-high "プロンプト"` を実行（headless / read-only Q&A）
   - Agentツールで `code-reviewer` サブエージェントを起動し、同じ観点でレビュー
3. 両方の結果を統合して報告する:
   - 両者が一致する指摘 → 確度が高い
   - 片方のみの指摘 → 補足として報告
   - 矛盾する指摘 → 両方の見解を併記

## モデル

`gpt-5.5-high`（GPT-5.5 1M High）。長考型でレビューの推論精度が高い。
実装特化のレビューに切り替えたい場合は `composer-2.5` も可。
変更したい場合は `cursor-agent --list-models` で一覧確認。

## 関連スキル

- 実装まで委譲する場合は `/cursor-impl`（Composer 2.5 に write/shell 込みで実装させる）
