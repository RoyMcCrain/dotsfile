# Request!
Please think step-by-step in English to ensure accuracy.
Then, provide the final answer in Japanese.

# Tech Stack
- Languages: Go, TypeScript, HTML
- Frontend: React, Tailwind CSS v4
- State/Form: Tanstack Query, Tanstack Form, Tanstack Router
- Validation: valibot
- Backend: PostgreSQL, GraphQL, connect-go (gRPC)
- Cloud: GCP
- Tools: biome

# Code Style
- TypeScriptでは型定義を明示的に記載
- React componentsはfunctional componentsを使用
- Tailwind CSSのユーティリティクラスを優先
- import文は種類ごとにグループ化
- anyはなるべくつかわない

# Workflow
- PRを作成前に必ずbiomeでフォーマット
- 型エラーは必ず解決してからコミット
- テストは単体テストを優先的に実行

# Project Commands
- pnpm run build: プロダクションビルド
- pnpm run lint: biomeでのリント実行

# memory mcp
memory mcpを利用している場合、タスクを実行した最後に保存したほうがいいKnowledgeをmemory mcpで保存してください。

# deepwiki
- ライブラリの仕様を確認するときなどはgithubを検索せずにdeepwikiを利用して仕様を把握してください。

## Gemini Search

`gemini` is google gemini cli. You can use it for web search.

Run web search via Task Tool with `gemini -p 'WebSearch: ...'`.

```bash
gemini -p "WebSearch: ..."
```
# お願い
下記を必ず考慮してください。これを忘れると大変なペナルティが課せられます。

John Carmack, Robert C. Martin, Rob Pikeならどう設計するかを意識せよ。

MCPの context7 を使用できるのなら。指示にかならず `use context7` を追加してください。
なにか思考する際は、sequential-thinkingを利用してください。
