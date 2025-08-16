# hop.nvim - 高速カーソル移動

## キーマッピング

| キー | 説明 | モード |
|------|------|--------|
| `s` | 画面内の2文字で位置を指定してジャンプ | Normal/Visual |
| `t` | 方向指定プレフィックス | Normal/Visual |
| `tk` | 左方向へジャンプ | Normal/Visual |
| `tt` | 上方向へジャンプ | Normal/Visual |
| `tn` | 下方向へジャンプ | Normal/Visual |
| `ts` | 右方向へジャンプ | Normal/Visual |
| `tl` | 単語の先頭へジャンプ | Normal/Visual |

## コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `:HopChar1` | 1文字でジャンプ | `:HopChar1` |
| `:HopChar2` | 2文字でジャンプ | `:HopChar2` |
| `:HopWord` | 単語へジャンプ | `:HopWord` |
| `:HopLine` | 行へジャンプ | `:HopLine` |
| `:HopLineStart` | 行頭へジャンプ | `:HopLineStart` |
| `:HopPattern` | パターン検索でジャンプ | `:HopPattern` |
| `:HopAnywhere` | 画面内の任意の場所へジャンプ | `:HopAnywhere` |
| `:HopVertical` | 垂直方向にジャンプ | `:HopVertical` |

## 方向指定オプション

| オプション | 説明 |
|------------|------|
| `AC` | After Cursor - カーソル後方 |
| `BC` | Before Cursor - カーソル前方 |
| `MW` | Multi Windows - 複数ウィンドウ対応 |
| `CurrentLine` | 現在の行のみ |

## 使用例

```vim
" 2文字でジャンプ
s<2文字入力>

" 単語の先頭へジャンプ
tl

" 下方向の単語へジャンプ
tn

" カーソル後方の単語へジャンプ
:HopWordAC

" 現在行内でジャンプ
:HopChar2CurrentLine
```

## カスタマイズ例

```lua
require('hop').setup({
  keys = 'etovxqpdygfblzhckisuran',  -- ジャンプ用のキー
  quit_key = '<ESC>',                 -- キャンセルキー
  jump_on_sole_occurrence = true,     -- 候補が1つの場合自動ジャンプ
  case_insensitive = true,            -- 大文字小文字を区別しない
})
```

## Tips
- `s`で2文字入力すると、画面内の該当箇所にラベルが表示されます
- ラベルのキーを押すとその位置へジャンプします
- `t`系のコマンドは方向を指定してジャンプできるため、より効率的です
- ビジュアルモードでも使用可能で、選択範囲を拡張できます