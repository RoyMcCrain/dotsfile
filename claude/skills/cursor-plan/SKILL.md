---
name: cursor-plan
description: Cursor Agent CLIで実装プランを作成
metadata:
  target_agent: claude
---

# /cursor-plan

Cursor Agentを使った実装プラン作成のスキル。

## コマンド

- `/cursor-plan [指示]` - 実装プラン作成

## 実行

`cursor-agent` を `--mode plan`（read-only / プランニング、編集なし）で実行する。

## 実行手順

1. ユーザーの要件を整理
2. 要件の複雑さを判断:
   - **シンプルな場合**: 指示をそのままcursor-agentに渡す
   - **複雑な場合**: Claude側で関連コード・依存関係を収集し、コンテキストとしてpromptに含める
3. Bashで以下を実行:
   ```bash
   cursor-agent -p --trust --mode plan --model gpt-5.3-codex-xhigh "プラン作成指示"
   ```
4. cursor-agentの出力を要約してユーザーに報告

## 判断基準

以下に該当する場合は「複雑」と判断し、コンテキストを収集してから渡す:

- 複数ファイルにまたがる変更
- 既存の設計パターンに沿う必要がある
- 依存関係の把握が必要

## モデル

`gpt-5.3-codex-xhigh`（Codex 5.3 Extra High）。長考でプラン精度を上げる。
変更したい場合は `cursor-agent --list-models` で一覧確認。
