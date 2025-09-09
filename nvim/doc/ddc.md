# ddc.vim - 自動補完

Insert モードで自動的に動作

## キーマッピング

### Insertモード
| キー | 説明 |
|------|------|
| `C-n` / `PageDown` | 次の補完候補を選択 |
| `C-p` / `PageUp` | 前の補完候補を選択 |
| `C-k` | 選択中の候補で確定 |
| `C-e` | 補完をキャンセル |

### Commandlineモード
| キー | 説明 |
|------|------|
| `Tab` / `C-n` | 次の補完候補を選択 |
| `S-Tab` / `C-p` | 前の補完候補を選択 |
| `C-y` | 選択中の候補で確定 |
| `C-e` | 補完をキャンセル |

### Normalモード
| キー | 説明 |
|------|------|
| `:` / `;` | コマンドライン補完を有効化 |

## コマンド

| コマンド | 説明 |
|----------|------|
| `:call ddc#enable()` | ddc.vimを有効化 |
| `:call ddc#disable()` | ddc.vimを無効化 |
| `:call ddc#custom#patch_global()` | グローバル設定を変更 |
| `:call ddc#custom#patch_filetype()` | ファイルタイプ別設定 |
| `:call ddc#enable_cmdline_completion()` | コマンドライン補完を有効化 |
| `:call pum#map#confirm()` | 補完候補を確定 |
| `:call pum#map#cancel()` | 補完をキャンセル |
| `:call pum#map#insert_relative()` | 相対位置の候補を選択 |

## 補完ソース

### 有効なソース
- **LSP** - Language Server Protocol補完（マーク: LSP）
  - 最小文字数: 1文字
  - 強制補完パターン: `.`, `:`, `->`, `<`
  - 最大項目数: 10
- **buffer** - バッファ内の単語補完（マーク: B）
  - 別バッファからも補完
  - 制限: 5MB
- **cmdline** - コマンドライン補完（マーク: CMD）
- **cmdline-history** - コマンド履歴補完（マーク: H）
- **around** - カーソル周辺の単語補完（マーク: A）

## 設定詳細

### マッチャー・ソーター・コンバーター
- **matcher_fuzzy** - ファジーマッチング（camelCase対応）
- **sorter_rank** - ランクベースのソート
- **sorter_lsp_kind** - LSPの種類別ソート（要: ddc-filter-sorter_lsp_kind）
- **converter_remove_overlap** - 重複項目の削除

## 使用例

```vim
" 通常の補完
" Insertモードで文字を入力すると自動的に補完が表示される
" C-nで次の候補、C-pで前の候補、C-kで確定

" コマンドライン補完
" :またはで開始すると自動的に補完が有効化
" Tabで候補選択、C-yで確定

" LSP補完の強制トリガー
" . : -> < の後で自動的に補完が表示される
```
