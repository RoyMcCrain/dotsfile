# /codex-review

Codex CLIでコードレビューを実行するスキル。

## 使い方

```
/codex-review [ファイルパスまたは説明]
```

## 実行手順

1. 対象ファイルまたはdiffを特定
2. 以下のコマンドでCodexを呼び出す：

```bash
codex --approval-mode full-auto "以下のコードをレビューしてください。バグ、セキュリティ問題、改善点を指摘してください: [対象]"
```

3. Codexの出力を要約してユーザーに報告
