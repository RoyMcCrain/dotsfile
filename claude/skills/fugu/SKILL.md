---
name: fugu
description: Sakana Fugu (codex CLI) でコードレビューを実行
metadata:
  target_agent: claude
---

# /fugu

Sakana Fugu (codex) と Cursor Agent (Composer 2.5) で並行レビューを実行するスキル。

## コマンド

- `/fugu [指示]` - コードレビュー

## 実行手順

1. ユーザーのレビュー対象・観点を整理
2. 以下を**並行**で実行する:
   - Bashで `codex exec -p fugu -s read-only --skip-git-repo-check "プロンプト" < /dev/null` を実行（headless / read-only）
   - Bashで `cursor-agent -p --trust --mode ask --model composer-2.5 "プロンプト"` を実行（headless / read-only Q&A）
3. 両方の結果を統合して報告する:
   - 両者が一致する指摘 → 確度が高い
   - 片方のみの指摘 → 補足として報告
   - 矛盾する指摘 → 両方の見解を併記

## サンドボックス（重要）

codex は `-s read-only` で**自前の seatbelt サンドボックス**を張る。macOS は seatbelt のネストを許さないため、Claude の外側サンドボックス内で codex を実行すると `sandbox-exec` が失敗する。

- 恒久対処: `claude/settings.json` の `sandbox.excludedCommands` に `codex` / `cursor-agent` を登録済み。サンドボックスが ON のセッションでも両者は外側サンドボックスの**外**で実行され、自前サンドボックスを張れる。
- それでも失敗する場合のフォールバック: codex / cursor-agent の Bash 呼び出しに `dangerouslyDisableSandbox: true` を付けて外側サンドボックスを外す。安全境界は codex 側の `-s read-only` が担保する。

## モデル

- Fugu: `fugu`（Sakana Fugu 1M / reasoning high）。長考型でレビューの推論精度が高い。さらに深い推論が欲しい場合は `-p fugu-ultra` に切り替える。`-s read-only` で編集させず読み取り専用にする。`--skip-git-repo-check` でリポジトリ外でも動く。`< /dev/null` でstdin待ちブロックを防ぐ。
- Cursor: `composer-2.5`（Composer 2.5）。実装特化で速い。変更したい場合は `cursor-agent --list-models` で一覧確認。

## 関連スキル

- `/cursor` も同じ cursor + fugu 並行レビューを行う（相互エイリアス）
