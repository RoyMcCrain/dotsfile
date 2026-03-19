---
name: codex
description: Codex CLIでコードレビューを実行
metadata:
  target_agent: claude
---

# /codex

Codex CLIを使ったコードレビューのスキル。

## コマンド

- `/codex [指示]` - コードレビュー

## 実行

読み取り専用モードでレビューを実行する。

```bash
codex exec -s read-only "[レビュー指示]"
```

### 主要オプション

| オプション | 説明 |
|-----------|------|
| `-s read-only` | 読み取り専用サンドボックス |
| `-m MODEL` | モデル指定 |

## 実行手順

1. ユーザーのレビュー対象・観点を整理
2. 関連するコードのパスを特定
3. `codex exec -s read-only` でレビューを実行（タイムアウトは300秒推奨）
4. Codexの指摘を要約してユーザーに報告
