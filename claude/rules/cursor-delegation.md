# Cursor Agent Delegation Rule

## 基本方針

Cursor Agent は実装委譲専用。**実装は積極的に Composer Fast（role `impl.cursor`）に委譲する（Claude が直接書くより速いため、これをデフォルトにする）**。実装委譲時は Claude が「正確な指示」を作って渡し、実装後の検証は Claude が行う。

モデル ID は直書きせず role で指定する。実体は `~/.pi/agent/model-roles.json` が単一の正（`~/.pi/agent/resolve-model.sh --list`）。Cursor 用 role は `--field cursor ROLE` で解決する。

## Cursor Agent に委譲する

- 実装作業（Composer Fast に write/shell 込みで委譲）

## Claude Code が自分でやる

- 要件整理・探索・調査（触る箇所マップの作成）
- 実装委譲時のプロンプト作成
- 実装後の検証（diff 目視・lint・test・仕様充足チェック）と軽微な手直し
- コードレビュー・バグ・セキュリティの指摘（`parallel-review` 等の Pi レビュー経路）

## 委譲方法

- `/cursor-impl [実装指示]` で実装委譲（role `impl.cursor` → `cursor-agent` を直接起動）

## 実装委譲の原則

- Composer が一番こけるのは「どこを直すべきか自力で全部見つける」部分。Claude が先に touchpoint を地図化し、確定仕様・触る箇所・完了条件を明記してから渡す
- 実装後は必ず Claude が検証する（投げっぱなしにしない）。検証項目に **cccc 複雑度**（変更した cccc 対応ファイル明示・baseline 比較・`UNVERIFIED` / exit 2 非合格・hard ERROR 非受け入れ・必要なら事前合意した変更スコープ内の挙動保持リファクタ）を含める — 詳細は `claude/rules/testing.md` と `cursor-impl` スキル
