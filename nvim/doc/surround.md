# vim-surround - 囲み文字操作

## キーマッピング

凡例: `[e]` = 既存の囲み文字, `[d]` = 目的の囲み文字

| キー | 説明 | 例 |
|------|------|-----|
| `ds[e]` | 囲みを削除 | `ds"` → "hello" → hello |
| `cs[e][d]` | 囲みを変更 | `cs"'` → "hello" → 'hello' |
| `ys[motion][d]` | 囲みを追加 | `ysiw"` → hello → "hello" |
| `yss[d]` | 行全体を囲む | `yss{` → hello → { hello } |
| `S[d]` | Visual選択を囲む | 選択して`S"` → 選択部分を"で囲む |

## 囲み文字の種類

### 基本的な囲み文字
| 文字 | 説明 | 結果 |
|------|------|------|
| `"` | ダブルクォート | "text" |
| `'` | シングルクォート | 'text' |
| `` ` `` | バッククォート | \`text\` |
| `(` `)` or `b` | 括弧（スペースなし） | (text) |
| `{` `}` or `B` | 中括弧（スペースあり） | { text } |
| `[` `]` | 角括弧 | [text] |
| `<` `>` | 山括弧 | <text> |

### 特殊な囲み文字
| 文字 | 説明 | 結果 |
|------|------|------|
| `t` | HTMLタグ | `<tag>text</tag>` |
| `w` | 単語 | 単語境界まで |
| `W` | WORD | 空白区切りの単語 |
| `s` | 文 | 文の終わりまで |
| `p` | 段落 | 段落全体 |

## コマンド

vim-surroundはキーマッピングベースのプラグインで、専用のコマンドはありませんが、以下の操作が可能です：

### 削除操作 (ds)
```vim
" ダブルクォートを削除
ds"

" 括弧を削除
ds(

" HTMLタグを削除
dst
```

### 変更操作 (cs)
```vim
" ダブルクォートをシングルクォートに変更
cs"'

" 括弧を中括弧に変更（スペース付き）
cs({

" HTMLタグを別のタグに変更
cst<div>
```

### 追加操作 (ys)
```vim
" カーソル下の単語をダブルクォートで囲む
ysiw"

" 次の3単語を括弧で囲む
ys3w(

" 行末までを角括弧で囲む
ys$]

" 段落全体を引用符で囲む
ysap'
```

### 行全体操作 (yss)
```vim
" 現在の行全体を中括弧で囲む
yss{

" 現在の行をHTMLタグで囲む
yss<div>
```

### Visual選択操作 (S)
```vim
" Visual選択した範囲を括弧で囲む
viwS(

" Visual Line選択した範囲をタグで囲む
VS<section>

" Visual Block選択した範囲を引用符で囲む
<C-v>S"
```

## 高度な使用例

### HTMLタグの操作
```vim
" <div>hello</div> を <p>hello</p> に変更
cst<p>

" hello を <span>hello</span> で囲む
ysiw<span>

" タグを削除
dst
```

### 関数呼び出しの作成
```vim
" hello を print("hello") に変更
ysiw"
ysa")
viwcprint
```

### 複数の囲みを組み合わせる
```vim
" hello を ["hello"] に変更
ysiw"
ysa"]
```

### インデント付き囲み
```vim
" 選択範囲を中括弧で囲み、インデント
V<選択>S{
=i{
```

## カスタマイズ

### 独自の囲み文字を定義
```vim
" vimrcに追加
let g:surround_{char2nr('q')} = "「\r」"  " ysiwq で「」で囲む
let g:surround_{char2nr('Q')} = "『\r』"  " ysiwQ で『』で囲む
```

### ファイルタイプ別の設定
```vim
" Rubyファイルでの設定
autocmd FileType ruby let b:surround_{char2nr('#')} = "#{\r}"
autocmd FileType ruby let b:surround_{char2nr('|')} = "|\r|"

" Markdownファイルでの設定
autocmd FileType markdown let b:surround_{char2nr('*')} = "*\r*"
autocmd FileType markdown let b:surround_{char2nr('_')} = "_\r_"
```

## Tips

- 括弧系の囲み文字は、開き括弧`(`と閉じ括弧`)`で動作が異なります
  - `(`または`)`：スペースなしで囲む
  - `{`：スペース付きで囲む
  - `}`：スペースなしで囲む
- `t`を使うとHTMLタグを指定できます（タグ名の入力プロンプトが表示）
- `.`（ドット）で直前の操作を繰り返せます
- Visual選択してから`S`を使うと、選択範囲全体を囲めます
- `ds`や`cs`の後に`t`を指定すると、HTMLタグ全体を対象にできます