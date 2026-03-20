# Commit Command

`ai-commit` スクリプトを実行して、LM Studioでコミットメッセージを自動生成する。

## 手順

```bash
ai-commit
```

$ARGUMENTS に `--think` や `-t` が含まれる場合は大きいモデルで分析する:

```bash
ai-commit --think
```

## 備考

- `ai-commit` が変更の分類、分割提案、メッセージ生成を全て行う
- LM Studioが起動している必要がある（port 1234）
- 対話的に確認→実行される
