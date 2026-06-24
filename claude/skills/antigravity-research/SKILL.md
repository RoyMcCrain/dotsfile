---
name: antigravity-research
description: Antigravity CLI (agy) で調査・リサーチを実行
metadata:
  target_agent: claude
---

# /antigravity-research

Antigravity CLI (`agy`) で調査・リサーチを実行するスキル。Gemini CLI の後継。

## 使い方

```
/antigravity-research [調査したい内容]
```

## 実行手順

1. ユーザーの調査依頼を整理
2. 以下のコマンドで agy を非対話(headless)で呼び出す：

```bash
agy -p "以下について調査してください: [調査内容]"
```

3. agy の出力を要約してユーザーに報告
4. 必要に応じて`.claude/docs/research/`に結果を保存

## 補足

- `-p` / `--print` で単発プロンプトを非対話実行する（旧 `gemini -p` の代替）
- ハングを避けたい時は `--print-timeout 60s` を付ける
- モデル指定は `--model`（一覧は `agy models`）
- 初回のみ Google OAuth ログインが必要（`agy` を対話起動して認証）
