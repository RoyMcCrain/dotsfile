---
name: cursor
description: Cursor Agent CLIでコードレビューを実行
metadata:
  target_agent: claude
---

# /cursor

Cursor Agent (Composer 2.5) と Sakana Fugu (codex) で並行レビューを実行するスキル。

## コマンド

- `/cursor [指示]` - コードレビュー

## 実行手順

1. ユーザーのレビュー対象・観点を整理
2. 以下を**並行**で実行する:
   - Bashで `cursor-agent -p --trust --mode ask --model composer-2.5 "プロンプト"` を実行（headless / read-only Q&A）
   - Bashで `codex exec -p fugu -m fugu-ultra --skip-git-repo-check "プロンプト" < /dev/null` を実行（headless / Codex yolo）
3. 両方の結果を統合して報告する:
   - 両者が一致する指摘 → 確度が高い
   - 片方のみの指摘 → 補足として報告
   - 矛盾する指摘 → 両方の見解を併記

## モデル

- Cursor: `composer-2.5`（Composer 2.5）。実装特化で速い。変更したい場合は `cursor-agent --list-models` で一覧確認。
- Fugu Ultra: `-p fugu -m fugu-ultra`（`fugu` profile + Sakana Fugu Ultra / reasoning high）を標準で使う。`-p fugu` は `~/.codex/fugu.config.toml` を読み込むための profile 指定。`-m fugu-ultra` で Ultra を明示する。Codex を yolo で動かすため、Codex 側の `-s` は付けない。`--skip-git-repo-check` でリポジトリ外でも動く、`< /dev/null` でstdin待ちブロックを防ぐ。

## 関連スキル

- `/fugu` も同じ cursor + fugu 並行レビューを行う（相互エイリアス）
- 実装まで委譲する場合は `/cursor-impl`（Composer 2.5 に write/shell 込みで実装させる）
