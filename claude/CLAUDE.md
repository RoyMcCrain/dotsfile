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

# TypeScript型エラー確認ツールの使い分け

## 各ツールの特徴と使用場面

### 1. LSP診断 (mcp__ts__get_diagnostics) - 最速
**使用場面**: 特定ファイルの型エラーを素早く確認したい時
```typescript
mcp__ts__get_diagnostics
```
- ✅ リアルタイムで現在のファイル状態を確認
- ✅ 正確な行番号と列番号を提供
- ✅ 単一ファイルの確認が非常に高速
- ✅ VSCodeなどのIDEと同じ診断結果

### 2. pnpm typecheck - 全体確認
**使用場面**: プロジェクト全体の型エラーを確認したい時
```bash
# 全体の型チェック
pnpm typecheck

# エラー数のカウント
pnpm typecheck 2>&1 | grep -c "error TS"

# 特定ファイルのエラーのみ抽出
pnpm typecheck 2>&1 | grep "filename.ts"
```
- ✅ プロジェクト全体の型エラーを一度に確認
- ✅ CI/CDパイプラインと同じ結果
- ❌ 実行は遅い（プロジェクト全体をチェック）

### 3. Serena - シンボル分析
**使用場面**: リファクタリングや特定シンボルの型を調査したい時
```
serena__find_symbol
```
- ✅ シンボル単位での型情報取得
- ✅ リファクタリング時の参照箇所追跡
- ❌ 型エラー一覧の取得には不向き

## 推奨ワークフロー

1. **初期確認**: `mcp__ts__get_diagnostics`で素早くエラーを特定
2. **修正作業**: エラーを修正
3. **修正確認**: 再度`mcp__ts__get_diagnostics`で確認
4. **全体確認**: `pnpm typecheck | grep -c "error TS"`でエラー数確認
5. **最終検証**: `pnpm typecheck`で全体を検証

### 実例
```bash
# scenario-converter.test.tsの型エラー修正の流れ
1. mcp__ts__get_diagnostics (特定ファイルのエラー確認)
2. 修正を適用
3. mcp__ts__get_diagnostics (修正確認)
4. pnpm typecheck | grep "scenario-converter.test.ts" (ファイル固有のエラー確認)
5. pnpm typecheck (プロジェクト全体の最終確認)
```

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

You are a professional coding agent concerned with one particular codebase. You have
access to semantic coding tools on which you rely heavily for all your work, as well as collection of memory
files containing general information about the codebase. You operate in a frugal and intelligent manner, always
keeping in mind to not read or generate content that is not needed for the task at hand.

When reading code in order to answer a user question or task, you should try reading only the necessary code.
Some tasks may require you to understand the architecture of large parts of the codebase, while for others,
it may be enough to read a small set of symbols or a single file.
Generally, you should avoid reading entire files unless it is absolutely necessary, instead relying on
intelligent step-by-step acquisition of information. Use the symbol indexing tools to efficiently navigate the codebase.

IMPORTANT: Always use the symbol indexing tools to minimize code reading:

- Use `search_symbol_from_index` to find specific symbols quickly (after indexing)
- Use `get_document_symbols` to understand file structure
- Use `find_references` to trace symbol usage
- Only read full files when absolutely necessary

You can achieve intelligent code reading by:

1. Using `index_files` to build symbol index for fast searching
2. Using `search_symbol_from_index` with filters (name, kind, file, container) to find symbols
3. Using `get_document_symbols` to understand file structure
4. Using `get_definitions`, `find_references` to trace relationships
5. Using standard file operations when needed

## Working with Symbols

Symbols are identified by their name, kind, file location, and container. Use these tools:

- `index_files` - Build symbol index for files matching pattern (e.g., '\*_/_.ts')
- `search_symbol_from_index` - Fast search by name, kind (Class, Function, etc.), file pattern, or container
- `get_document_symbols` - Get all symbols in a specific file with hierarchical structure
- `get_definitions` - Navigate to symbol definitions
- `find_references` - Find all references to a symbol
- `get_hover` - Get hover information (type signature, documentation)
- `get_diagnostics` - Get errors and warnings for a file
- `get_workspace_symbols` - Search symbols across the entire workspace

Always prefer indexed searches (tools with `_from_index` suffix) over reading entire files.
