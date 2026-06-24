# Antigravity Delegation Rule

## 重要: WebSearch禁止

ClaudeのWebSearchツールは使用禁止。Web検索が必要な場合は必ず Antigravity CLI (`agy`) に委譲する。

> Gemini CLI は 2026-06-18 に個人/無料枠のリクエスト処理を停止し、Antigravity CLI に統合された。委譲先は `agy` に移行済み。

## agy に委譲すべきケース

- Web検索が必要な調査（WebSearchの代わり）
- ライブラリドキュメント・最新トレンドの調査
- 大規模なコンテキストが必要な調査
- ドキュメントの比較・要約
- 複数ソースからの情報収集

## 委譲方法

- `/antigravity-research` でリサーチ依頼
- 直接呼ぶ場合は `agy -p "..."`（非対話）
- 結果は `.claude/docs/research/` に保存

## MCP

agy は MCP 無しで運用する（旧 Gemini の Context7 は廃止）。ライブラリドキュメント調査も agy の Web 検索能力で代替する。
