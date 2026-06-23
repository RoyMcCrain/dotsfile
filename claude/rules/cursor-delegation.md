# Cursor Agent Delegation Rule

## 基本方針

Cursor Agent はレビューと実装委譲に使う。**実装は積極的に Composer 2.5 に委譲する（Claude が直接書くより速いため、これをデフォルトにする）**。実装委譲時は Claude が「正確な指示」を作って渡し、実装後の検証は Claude が行う。

## Cursor Agent に委譲する

- コードレビュー・バグ・セキュリティの指摘
- 実装作業（Composer 2.5 に write/shell 込みで委譲）

## Claude Code が自分でやる

- 要件整理・探索・調査（触る箇所マップの作成）
- 実装委譲時のプロンプト作成
- 実装後の検証（diff 目視・lint・test・仕様充足チェック）と軽微な手直し

## 委譲方法

- `/cursor [レビュー指示]` でレビュー依頼（Composer 2.5 + code-reviewer の並行レビュー）
- `/cursor-impl [実装指示]` で実装委譲（Composer 2.5）

## 実装委譲の原則

- Composer が一番こけるのは「どこを直すべきか自力で全部見つける」部分。Claude が先に touchpoint を地図化し、確定仕様・触る箇所・完了条件を明記してから渡す
- 実装後は必ず Claude が検証する（投げっぱなしにしない）
