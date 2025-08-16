# render-markdown.nvim - Markdown表示拡張

## キーマッピング

| キー | 説明 | モード |
|------|------|--------|
| `<Leader>rm` | Markdownレンダリング切り替え | Normal |

## コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `:RenderMarkdown` | レンダリングを有効化 | `:RenderMarkdown` |
| `:RenderMarkdown enable` | レンダリングを有効化 | `:RenderMarkdown enable` |
| `:RenderMarkdown disable` | レンダリングを無効化 | `:RenderMarkdown disable` |
| `:RenderMarkdown toggle` | レンダリングをトグル | `:RenderMarkdown toggle` |
| `:RenderMarkdown expand` | 現在の見出しを展開 | `:RenderMarkdown expand` |
| `:RenderMarkdown contract` | 現在の見出しを折りたたむ | `:RenderMarkdown contract` |

## 自動レンダリング機能

### 対応要素
- **見出し** - レベルに応じた装飾とアイコン表示
- **コードブロック** - 言語名とシンタックスハイライト
- **テーブル** - 整形された表示
- **リスト** - 階層的なインデントとマーカー
- **リンク** - ハイライトとアイコン表示
- **インラインコード** - 背景色付きハイライト
- **引用** - 左側にバーとアイコン
- **チェックボックス** - タスクリストの視覚化
- **水平線** - 装飾的な区切り線

## 設定オプション

```lua
require('render-markdown').setup({
  enabled = true,           -- デフォルトで有効
  max_file_size = 10.0,    -- 最大ファイルサイズ（MB）
  
  -- 見出しの設定
  heading = {
    enabled = true,
    sign = true,           -- サインカラムにアイコン表示
    icons = { '󰉡 ', '󰉣 ', '󰉥 ', '󰉧 ', '󰉩 ', '󰉫 ' },
  },
  
  -- コードブロックの設定
  code = {
    enabled = true,
    sign = true,
    style = 'full',        -- 'full', 'normal', 'language', 'none'
    position = 'left',     -- 言語名の位置
  },
  
  -- リンクの設定
  link = {
    enabled = true,
    image = '󰥶 ',         -- 画像リンクのアイコン
    email = '󰇮 ',         -- メールリンクのアイコン
    hyperlink = '󰌹 ',     -- 通常リンクのアイコン
  },
  
  -- チェックボックスの設定
  checkbox = {
    enabled = true,
    unchecked = '󰄱 ',     -- 未チェック
    checked = '󰱒 ',       -- チェック済み
  },
  
  -- テーブルの設定
  table = {
    enabled = true,
    style = 'full',        -- 'full', 'normal', 'none'
  },
  
  -- 引用の設定
  quote = {
    enabled = true,
    icon = '▌',           -- 引用の左側マーカー
  },
})
```

## カスタマイズ例

### ファイルタイプ別の設定
```vim
" 特定のファイルタイプで無効化
autocmd FileType gitcommit :RenderMarkdown disable

" 大きなファイルで自動無効化
autocmd BufReadPre *.md if getfsize(expand('%')) > 1000000 | :RenderMarkdown disable | endif
```

### キーマップのカスタマイズ
```lua
-- 見出しナビゲーション
vim.keymap.set('n', ']]', ':RenderMarkdown expand<CR>', { desc = '次の見出しへ' })
vim.keymap.set('n', '[[', ':RenderMarkdown contract<CR>', { desc = '前の見出しへ' })
```

## 使用例

```vim
" Markdownファイルを開く
:e README.md
" 自動的にレンダリングが有効化される

" レンダリングを一時的に無効化（生のMarkdownを編集）
<Leader>rm

" 再度有効化
<Leader>rm

" コマンドで制御
:RenderMarkdown disable
:RenderMarkdown enable
```

## Tips
- Markdownファイル（.md）を開くと自動的にレンダリングが有効になります
- `<Leader>rm`で素早くレンダリングのON/OFFを切り替えられます
- 大きなファイルでは自動的にレンダリングが無効化される場合があります
- レンダリングを無効にすると、生のMarkdownテキストを編集できます
- コードブロック内では通常のシンタックスハイライトが適用されます