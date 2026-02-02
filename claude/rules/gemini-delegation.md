# Gemini Delegation Rule

## 重要: WebSearch・Context7禁止

ClaudeのWebSearchツールとContext7プラグインは使用禁止。これらが必要な場合は必ずGeminiに委譲する。

## Geminiに委譲すべきケース

- Web検索が必要な調査（WebSearchの代わり）
- ライブラリドキュメント検索（Context7の代わり）
- 大規模なコンテキストが必要な調査
- 最新のトレンド・ライブラリ情報
- ドキュメントの比較・要約
- 複数ソースからの情報収集

## 委譲方法

- `/gemini-research` でリサーチ依頼
- 結果は `.claude/docs/research/` に保存

## Gemini側のMCP

GeminiにはContext7 MCPサーバーが設定されている。ライブラリドキュメントの検索はGemini経由で実行される。
