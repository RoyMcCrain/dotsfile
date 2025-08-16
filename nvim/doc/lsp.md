# nvim-lsp - Language Server Protocol

## キーマッピング

### 基本キー
| キー | 説明 | モード |
|------|------|--------|
| `H` | カーソル下のシンボルの型情報を表示（ホバー） | Normal |

### LSPプレフィックス: `l` → `[LSP]`
| キー | 説明 | 機能 |
|------|------|------|
| `[LSP]a` | コードアクション（修正候補）| 利用可能なアクションを表示 |
| `[LSP]D` | 定義へジャンプ | 関数やクラスの定義元へ |
| `[LSP]T` | 型定義へジャンプ | 型の定義元へ |
| `[LSP]r` | 参照箇所一覧 | シンボルが使用されている箇所を表示 |
| `[LSP]R` | リネーム | プロジェクト全体でシンボル名を変更 |
| `[LSP]w` | ワークスペースシンボル検索 | プロジェクト全体から検索 |
| `[LSP]I` | 実装へジャンプ | インターフェースの実装先へ |
| `[LSP]d` | ドキュメントシンボル | 現在のファイル内のシンボル一覧 |
| `[LSP]l` | 診断情報一覧 | エラー・警告の一覧表示 |
| `[LSP]k` | 前の診断へ | 前のエラー・警告へ移動 |
| `[LSP]s` | 次の診断へ | 次のエラー・警告へ移動 |

## コマンド

### 基本コマンド
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:LspInfo` | LSPサーバー情報表示 | `:LspInfo` |
| `:LspStart` | LSPサーバーを起動 | `:LspStart` |
| `:LspStop` | LSPサーバーを停止 | `:LspStop` |
| `:LspRestart` | LSPサーバーを再起動 | `:LspRestart` |
| `:LspLog` | LSPログを表示 | `:LspLog` |

### ナビゲーション
| コマンド | 説明 |
|----------|------|
| `:lua vim.lsp.buf.definition()` | 定義へジャンプ |
| `:lua vim.lsp.buf.declaration()` | 宣言へジャンプ |
| `:lua vim.lsp.buf.implementation()` | 実装へジャンプ |
| `:lua vim.lsp.buf.type_definition()` | 型定義へジャンプ |
| `:lua vim.lsp.buf.references()` | 参照一覧表示 |

### コードアクション
| コマンド | 説明 |
|----------|------|
| `:lua vim.lsp.buf.hover()` | ホバー情報表示 |
| `:lua vim.lsp.buf.signature_help()` | シグネチャヘルプ |
| `:lua vim.lsp.buf.rename()` | シンボルのリネーム |
| `:lua vim.lsp.buf.code_action()` | コードアクション表示 |
| `:lua vim.lsp.buf.format()` | フォーマット |

### 診断
| コマンド | 説明 |
|----------|------|
| `:lua vim.diagnostic.open_float()` | フローティングウィンドウで診断表示 |
| `:lua vim.diagnostic.goto_prev()` | 前の診断へ |
| `:lua vim.diagnostic.goto_next()` | 次の診断へ |
| `:lua vim.diagnostic.setloclist()` | 診断をlocation listに設定 |
| `:lua vim.diagnostic.setqflist()` | 診断をquickfix listに設定 |

### ワークスペース
| コマンド | 説明 |
|----------|------|
| `:lua vim.lsp.buf.add_workspace_folder()` | ワークスペースフォルダを追加 |
| `:lua vim.lsp.buf.remove_workspace_folder()` | ワークスペースフォルダを削除 |
| `:lua vim.lsp.buf.list_workspace_folders()` | ワークスペースフォルダ一覧 |
| `:lua vim.lsp.buf.workspace_symbol()` | ワークスペースシンボル検索 |

## サポートされているLSPサーバー

| 言語 | LSPサーバー | 説明 |
|------|--------------|------|
| TypeScript/JavaScript | tsserver | TypeScript Language Server |
| Python | pyright | Python用高速サーバー |
| Go | gopls | Go公式サーバー |
| Rust | rust-analyzer | Rust公式サーバー |
| Lua | lua_ls | Lua Language Server |
| HTML/CSS | html, cssls | Web開発用 |
| JSON | jsonls | JSON用 |
| YAML | yamlls | YAML用 |
| Tailwind CSS | tailwindcss | Tailwind CSS IntelliSense |
| GraphQL | graphql | GraphQL Language Server |

## 使用例

```vim
" カーソル下のシンボルの情報を表示
H

" 定義へジャンプ
[LSP]D

" リネーム
[LSP]R
<新しい名前を入力>

" コードアクションを適用
[LSP]a
<アクションを選択>

" エラー一覧を表示
[LSP]l
```

## Tips
- `H`キーはホバー情報を素早く確認するのに便利です
- `[LSP]a`のコードアクションは自動修正やリファクタリングに使えます
- 診断情報はリアルタイムで更新されます
- プロジェクトに適したLSPサーバーが自動的に起動します