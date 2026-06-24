---
name: antigravity-research
description: |
  Antigravity CLI (agy) 単独で横断調査・推論・トレンド要約を行う（agy のみ、一次ソースの裏取りなし）。横断的な理解の概要が欲しい時に使う。agy 単独はハルシネーション（もっともらしい誤り）を素通しするので、結論に使う事実は確証扱いしないこと。裏取り・複数ソース・技術判断が要るなら代わりに `/cross-research`、URL本文取得は firecrawl skill を使う。
metadata:
  target_agent: claude
---

# /antigravity-research

Antigravity CLI (`agy`) **単独**で調査・リサーチを実行するスキル。Gemini CLI の後継。
横断的な要約向け。**裏取りが要るなら `/cross-research`** を使う。

## 使い方

```
/antigravity-research [調査したい内容]
```

## 実行手順

1. ユーザーの調査依頼を整理
2. 以下のコマンドで agy を非対話(headless)で呼び出す：

```bash
agy --print-timeout 120s -p "以下について調査してください: [調査内容]"
```

3. agy の出力を要約してユーザーに報告（**agy 単独の事実は確証扱いしない**。重要なら `/cross-research` で裏取り）
4. 必要に応じて`.claude/docs/research/`に結果を保存

## 補足

- `-p` / `--print` で単発プロンプトを非対話実行する（旧 `gemini -p` の代替）
- timeout は既定 `--print-timeout 120s`（cross-research と統一。ハング防止）
- モデル指定は `--model`（一覧は `agy models`）
- 初回のみ Google OAuth ログインが必要（`agy` を対話起動して認証）
