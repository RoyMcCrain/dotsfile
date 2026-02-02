# /gemini-research

Gemini CLIで調査・リサーチを実行するスキル。

## 使い方

```
/gemini-research [調査したい内容]
```

## 実行手順

1. ユーザーの調査依頼を整理
2. 以下のコマンドでGeminiを呼び出す：

```bash
gemini -p "以下について調査してください: [調査内容]"
```

3. Geminiの出力を要約してユーザーに報告
4. 必要に応じて`.claude/docs/research/`に結果を保存
