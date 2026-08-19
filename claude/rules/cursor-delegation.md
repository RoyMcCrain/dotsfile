# Cursor Agent Delegation Rule

## 基本方針

Cursor Agent はレビューと実装委譲に使う。**実装は積極的に Composer Fast（role `impl.cursor`）に委譲する（Claude が直接書くより速いため、これをデフォルトにする）**。レビューは Grok via Cursor（role `review.cursor`）をデフォルトにする。実装委譲時は Claude が「正確な指示」を作って渡し、実装後の検証は Claude が行う。

モデル ID は直書きせず role で指定する。実体は `~/.pi/agent/model-roles.json` が単一の正（`~/.pi/agent/resolve-model.sh --list`）。Cursor 用 role は `--field cursor ROLE` で解決する。

## Cursor Agent に委譲する

- コードレビュー・バグ・セキュリティの指摘
- 実装作業（Composer Fast に write/shell 込みで委譲）

## Claude Code が自分でやる

- 要件整理・探索・調査（触る箇所マップの作成）
- 実装委譲時のプロンプト作成
- 実装後の検証（diff 目視・lint・test・仕様充足チェック）と軽微な手直し

## 委譲方法

- `/cursor-review [レビュー指示]` で Cursor 単体レビュー依頼（role `review.cursor`）。「レビューして」だけの依頼は `/parallel-review`（reviewLevels の3段階：1=簡単 / 2=標準・既定 / 3=deep。現在使用中の provider と同じ reviewer は除外）を優先する。Fugu 単体を明示したい場合は `/fugu-review`
- `/cursor-impl [実装指示]` で実装委譲（role `impl.cursor` → `cursor-agent` を直接起動）

## 実装委譲の原則

- Composer が一番こけるのは「どこを直すべきか自力で全部見つける」部分。Claude が先に touchpoint を地図化し、確定仕様・触る箇所・完了条件を明記してから渡す
- 実装後は必ず Claude が検証する（投げっぱなしにしない）
