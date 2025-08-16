# vsnip - スニペット

## キーマッピング

| キー | 説明 | モード |
|------|------|--------|
| `Tab` | スニペット展開/次のプレースホルダーへ | Insert/Select |
| `S-Tab` | 前のプレースホルダーへ | Insert/Select |
| `C-j` | ジャンプ（スニペット内での移動） | Insert/Select |

## コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `:VsnipOpen` | 現在のファイルタイプ用のスニペットファイルを開く | `:VsnipOpen` |
| `:VsnipOpenEdit` | スニペットファイルを編集モードで開く | `:VsnipOpenEdit` |
| `:VsnipOpenSplit` | スニペットファイルを分割ウィンドウで開く | `:VsnipOpenSplit` |
| `:VsnipOpenVsplit` | スニペットファイルを垂直分割で開く | `:VsnipOpenVsplit` |

## スニペットファイルの場所

スニペットは以下の場所に保存されます：
- `~/.config/nvim/snippets/` - グローバルスニペット
- `~/.config/nvim/snippets/{filetype}.json` - ファイルタイプ別スニペット

## スニペットの書式

### 基本的なスニペット
```json
{
  "Console Log": {
    "prefix": "log",
    "body": [
      "console.log('$1');",
      "$0"
    ],
    "description": "Log output to console"
  }
}
```

### プレースホルダー
| 記法 | 説明 | 例 |
|------|------|-----|
| `$1`, `$2` | タブストップ（番号順に移動） | `console.log($1)` |
| `${1:default}` | デフォルト値付きプレースホルダー | `${1:value}` |
| `$0` | 最終カーソル位置 | `function() { $0 }` |
| `${1\|one,two,three\|}` | 選択肢付きプレースホルダー | `${1\|get,post,put\|}` |

### 変数
| 変数 | 説明 |
|------|------|
| `$TM_FILENAME` | 現在のファイル名 |
| `$TM_FILENAME_BASE` | 拡張子なしのファイル名 |
| `$TM_DIRECTORY` | 現在のディレクトリ |
| `$TM_FILEPATH` | フルパス |
| `$TM_LINE_INDEX` | 現在の行番号（0ベース） |
| `$TM_LINE_NUMBER` | 現在の行番号（1ベース） |
| `$TM_SELECTED_TEXT` | 選択されたテキスト |
| `$TM_CURRENT_LINE` | 現在の行の内容 |
| `$TM_CURRENT_WORD` | カーソル下の単語 |
| `$CLIPBOARD` | クリップボードの内容 |
| `$CURRENT_YEAR` | 現在の年 |
| `$CURRENT_MONTH` | 現在の月 |
| `$CURRENT_DATE` | 現在の日 |

## 実用的なスニペット例

### JavaScript/TypeScript
```json
{
  "Function": {
    "prefix": "fn",
    "body": [
      "function ${1:name}(${2:params}) {",
      "  $0",
      "}"
    ]
  },
  "Arrow Function": {
    "prefix": "af",
    "body": [
      "const ${1:name} = (${2:params}) => {",
      "  $0",
      "};"
    ]
  },
  "Import": {
    "prefix": "imp",
    "body": "import ${1:module} from '${2:module-name}';"
  },
  "React Component": {
    "prefix": "rfc",
    "body": [
      "import React from 'react';",
      "",
      "const ${1:ComponentName} = () => {",
      "  return (",
      "    <div>",
      "      $0",
      "    </div>",
      "  );",
      "};",
      "",
      "export default ${1:ComponentName};"
    ]
  }
}
```

### Python
```json
{
  "Class": {
    "prefix": "class",
    "body": [
      "class ${1:ClassName}:",
      "    def __init__(self${2:, params}):",
      "        ${0:pass}"
    ]
  },
  "Method": {
    "prefix": "def",
    "body": [
      "def ${1:method_name}(self${2:, params}):",
      "    ${0:pass}"
    ]
  },
  "Main": {
    "prefix": "main",
    "body": [
      "if __name__ == '__main__':",
      "    ${0:pass}"
    ]
  }
}
```

### HTML
```json
{
  "HTML5 Template": {
    "prefix": "html5",
    "body": [
      "<!DOCTYPE html>",
      "<html lang=\"${1:ja}\">",
      "<head>",
      "    <meta charset=\"UTF-8\">",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
      "    <title>${2:Document}</title>",
      "</head>",
      "<body>",
      "    $0",
      "</body>",
      "</html>"
    ]
  }
}
```

## カスタムスニペットの作成

### 1. スニペットファイルを開く
```vim
:VsnipOpen
```

### 2. スニペットを追加
```json
{
  "My Custom Snippet": {
    "prefix": "mysnip",
    "body": [
      "// Custom snippet",
      "// Created by: $USER",
      "// Date: $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE",
      "$0"
    ],
    "description": "My custom snippet"
  }
}
```

### 3. 保存して使用
ファイルを保存後、該当するファイルタイプで`mysnip`と入力して`Tab`キーを押すと展開されます。

## 設定オプション

```lua
-- init.luaまたはvimrcに追加
vim.g.vsnip_snippet_dir = vim.fn.expand('~/.config/nvim/snippets')
vim.g.vsnip_filetypes = {
  javascriptreact = {'javascript'},
  typescriptreact = {'typescript'},
}
```

## Tips

- `Tab`キーでスニペットを展開し、プレースホルダー間を移動できます
- `S-Tab`で前のプレースホルダーに戻れます
- プレースホルダーにデフォルト値を設定すると、すぐに編集を開始できます
- `:VsnipOpen`で現在のファイルタイプ用のスニペットファイルを素早く編集できます
- VSCodeのスニペット形式と互換性があるため、既存のスニペットを流用できます
- 複数のファイルタイプで同じスニペットを使いたい場合は、`vsnip_filetypes`を設定します