# ddu.vim - ファジーファインダー

プレフィックス: `k` → `[ddu]`

## キーマッピング

### ファインダー起動
| キー | 説明 | 検索対象 |
|------|------|----------|
| `[ddu]g` | Grep検索 | ファイル内容を正規表現で検索 |
| `[ddu]k` | ファイル検索 | ファイル名でファジー検索 |
| `[ddu]b` | バッファ検索 | 開いているバッファから検索 |
| `[ddu]m` | 履歴検索 | 最近開いたファイルから検索（MRU） |
| `[ddu]r` | レジスタ検索 | レジスタの内容を検索 |
| `[ddu]w` | カーソル下の単語で検索 | 現在の単語でGrep |
| `[ddu]d` | Git diff ファイル | 変更されたファイルを表示 |

### ddu内での操作
| キー | 説明 | モード |
|------|------|--------|
| `Enter` | 選択して開く | Normal |
| `v` | 垂直分割で開く | Normal |
| `s` | 水平分割で開く | Normal |
| `i` | フィルタモードへ | Normal |
| `p` | プレビュー表示切り替え | Normal |
| `Esc` | キャンセル | Normal |
| `Space` | アイテムを選択/選択解除 | Normal |
| `*` | すべてを選択 | Normal |

### フィルタモードでの操作
| キー | 説明 | モード |
|------|------|--------|
| `Enter` | フィルタを確定して閉じる | Insert/Normal |
| `Esc` | フィルタウィンドウを閉じる | Normal |

## コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `:call ddu#start()` | dduを起動（デフォルト設定） | `:call ddu#start({})` |
| `:call ddu#start({sources})` | 特定のソースでdduを起動 | `:call ddu#start(#{sources: [#{name: "buffer"}]})` |
| `:call ddu#ui#do_action()` | UIアクションを実行 | `:call ddu#ui#do_action("quit")` |
| `:call ddu#custom#patch_global()` | グローバル設定を変更 | - |
| `:call ddu#custom#patch_local()` | ローカル設定を変更 | - |

## ソース一覧

| ソース名 | 説明 | パラメータ |
|----------|------|-----------|
| `file_rec` | ファイル検索（再帰的） | `ignoredDirectories`: 無視するディレクトリ |
| `buffer` | 開いているバッファ | - |
| `register` | レジスタ内容 | - |
| `mr` | MRU（最近使ったファイル） | - |
| `rg` | ripgrepによる検索 | `input`: 検索文字列, `args`: 追加引数 |
| `git_diff` | Gitの変更ファイル（カスタム） | - |

## UIアクション

| アクション | 説明 |
|------------|------|
| `itemAction` | アイテムに対するアクション実行 |
| `open` | ファイルを開く |
| `openFilterWindow` | フィルタウィンドウを開く |
| `closeFilterWindow` | フィルタウィンドウを閉じる |
| `togglePreview` | プレビューの表示/非表示切り替え |
| `quit` | dduを終了 |

## 設定詳細

### UI設定 (ff)
- **winWidth**: ウィンドウ幅（画面の90%）
- **startFilter**: 起動時にフィルタモードを開始
- **split**: `floating` - フローティングウィンドウ
- **floatingBorder**: `rounded` - 角丸ボーダー
- **previewFloating**: プレビューもフローティング表示

### Grep検索の特殊設定
- ripgrepを使用（`--json`オプション付き）
- 起動時はフィルタモードオフ
- インタラクティブな検索入力ウィンドウ

## 使用例

```vim
" ファイル検索
[ddu]k

" カーソル下の単語でGrep検索
[ddu]w

" バッファ一覧から選択
[ddu]b

" Git差分ファイルを表示
[ddu]d

" カスタムソースでddu起動
:call ddu#start(#{
  \ sources: [#{
  \   name: "rg",
  \   params: #{input: "TODO"}
  \ }]
  \})
```

## Tips
- Grep検索（`[ddu]g`）では検索ワード入力用のフローティングウィンドウが表示されます
- Git diff（`[ddu]d`）では変更タイプが表示されます：
  - `●` = staged
  - `M` = modified
  - `+` = added
  - `-` = deleted
  - `R` = renamed