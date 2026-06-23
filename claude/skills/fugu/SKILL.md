---
name: fugu
description: Sakana Fugu (codex CLI) でコードレビューを実行
metadata:
  target_agent: claude
---

# /fugu

Sakana FuguとClaude自身で並行レビューを実行するスキル。

## コマンド

- `/fugu [指示]` - コードレビュー

## 実行手順

1. ユーザーのレビュー対象・観点を整理
2. 以下を**並行**で実行する:
   - Bashで `codex exec -p fugu -s read-only --skip-git-repo-check "プロンプト" < /dev/null` を実行（headless / read-only）
   - Agentツールで `code-reviewer` サブエージェントを起動し、同じ観点でレビュー
3. 両方の結果を統合して報告する:
   - 両者が一致する指摘 → 確度が高い
   - 片方のみの指摘 → 補足として報告
   - 矛盾する指摘 → 両方の見解を併記

## モデル

`fugu`（Sakana Fugu 1M / reasoning high）。長考型でレビューの推論精度が高い。
さらに深い推論が欲しい場合は `-p fugu-ultra` に切り替える。
`-s read-only` で編集させず読み取り専用にする。`--skip-git-repo-check` でリポジトリ外でも動く。
`< /dev/null` でstdin待ちブロックを防ぐ。

## 関連スキル

- 同じ並行レビューをCursor Agentで行う場合は `/cursor`
