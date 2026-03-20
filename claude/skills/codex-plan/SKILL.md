---
name: codex-plan
description: Codex CLIで実装プランを作成
metadata:
  target_agent: claude
---

# /codex-plan

Codex MCPを使った実装プラン作成のスキル。

## コマンド

- `/codex-plan [指示]` - 実装プラン作成

## 実行

`mcp__codex__codex` ツールを使って読み取り専用モードでプランを作成する。

## 実行手順

1. ユーザーの要件を整理
2. 要件の複雑さを判断:
   - **シンプルな場合**: 指示をそのままCodexに渡す
   - **複雑な場合**: Claude側で関連コード・依存関係を収集し、コンテキストとしてpromptに含める
3. `mcp__codex__codex` を以下のパラメータで呼び出す:
   - `prompt`: プラン作成指示
   - `sandbox`: `read-only`
4. Codexの出力を要約してユーザーに報告

## 判断基準

以下に該当する場合は「複雑」と判断し、コンテキストを収集してから渡す:

- 複数ファイルにまたがる変更
- 既存の設計パターンに沿う必要がある
- 依存関係の把握が必要
