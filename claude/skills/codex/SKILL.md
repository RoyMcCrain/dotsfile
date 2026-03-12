---
name: codex
description: Codex CLIでコード実装を実行
metadata:
  target_agent: claude
---

# /codex

Codex CLIを使ったコード実装のスキル。

## コマンド

- `/codex [指示]` - コード実装

## 実装

非インタラクティブ実行には `codex exec` サブコマンドを使う。

```bash
# 実装（ファイル書き込み可）
codex exec --full-auto "[指示]"

# レビュー・調査（読み取りのみ）
codex exec -s read-only "[指示]"
```

### 主要オプション

| オプション | 説明 |
|-----------|------|
| `--full-auto` | 自動承認 + workspace-write サンドボックス |
| `-s read-only` | 読み取り専用サンドボックス |
| `-s workspace-write` | ワークスペース書き込み可 |
| `-c 'key=value'` | config override（例: `-c 'approval_policy="on-failure"'`） |
| `-m MODEL` | モデル指定 |

## 実行手順

1. ユーザーの依頼内容を整理
2. 関連するコードやドキュメントを収集
3. 上記コマンドでCodexを呼び出す（タイムアウトは300秒推奨）
4. Codexの出力を要約してユーザーに報告
