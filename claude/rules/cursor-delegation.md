# Cursor Agent Delegation Rule

## 基本方針

Cursor Agentはレビューとプラン作成専用。実装はClaude Codeが行う。

## Cursor Agentに委譲する

- コードレビュー・バグ・セキュリティの指摘
- 実装プラン作成・設計の妥当性チェック

## Claude Codeが自分でやる

- すべての実装作業
- 探索・調査

## 委譲方法

- `/cursor [レビュー指示]` でレビュー依頼
- `/cursor-plan [要件]` でプラン作成依頼
