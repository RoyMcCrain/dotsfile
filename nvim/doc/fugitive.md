# vim-fugitive - Git操作

プレフィックス: `<Leader>g` → `[git]`

## キーマッピング

| キー | 説明 | コマンド |
|------|------|----------|
| `[git]s` | Gitステータス表示・ステージング | `:Git` |
| `[git]c` | コミット | `:Git commit` |
| `[git]p` | プッシュ | `:Git push` |
| `[git]l` | ログ表示 | `:Git log` |
| `[git]d` | 差分表示 | `:Gdiff` |
| `[git]a` | ファイルを追加 | `:Git add` |
| `[git]m` | マージ | `:Git merge` |
| `[git]b` | 現在行のblame表示 | `:Git blame` |

## コマンド

### 基本コマンド
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:Git` | Gitステータス表示（インタラクティブ） | `:Git` |
| `:Git {command}` | 任意のGitコマンドを実行 | `:Git status` |
| `:Git add %` | 現在のファイルをステージング | `:Git add %` |
| `:Git commit` | コミット（エディタでメッセージ編集） | `:Git commit` |
| `:Git push` | リモートへプッシュ | `:Git push origin main` |
| `:Git pull` | リモートからプル | `:Git pull` |
| `:Git fetch` | リモートから取得 | `:Git fetch` |

### 差分・履歴
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:Gdiff` / `:Gdiffsplit` | 現在のファイルの差分を表示 | `:Gdiff` |
| `:Gvdiffsplit` | 垂直分割で差分表示 | `:Gvdiffsplit` |
| `:Git blame` | blame情報を表示 | `:Git blame` |
| `:Gclog` | コミットログを表示（quickfix） | `:Gclog` |
| `:0Gclog` | 現在のファイルのログ | `:0Gclog` |
| `:Gllog` | ログを表示（location list） | `:Gllog` |

### ブランチ操作
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:Git branch` | ブランチ一覧表示 | `:Git branch` |
| `:Git checkout {branch}` | ブランチ切り替え | `:Git checkout develop` |
| `:Git checkout -b {branch}` | 新規ブランチ作成＆切り替え | `:Git checkout -b feature/new` |
| `:Git merge {branch}` | ブランチをマージ | `:Git merge main` |
| `:Git rebase {branch}` | リベース | `:Git rebase main` |

### ファイル操作
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:Gwrite` | ファイルを保存＆ステージング | `:Gwrite` |
| `:Gread` | インデックスからファイルを復元 | `:Gread` |
| `:Gremove` | ファイルを削除＆ステージング | `:Gremove` |
| `:Gmove {path}` | ファイルを移動/リネーム | `:Gmove new_name.txt` |
| `:Grename {name}` | ファイルをリネーム | `:Grename new_name.txt` |

### GitHub統合
| コマンド | 説明 | 例 |
|----------|------|-----|
| `:GBrowse` | GitHubでファイルを開く | `:GBrowse` |
| `:GBrowse!` | URLをクリップボードにコピー | `:GBrowse!` |

## Gitステータスウィンドウ操作

`:Git`コマンドで開くステータスウィンドウ内での操作：

| キー | 説明 |
|------|------|
| `-` | ファイルのステージング/アンステージング切り替え |
| `s` | ファイルをステージング |
| `u` | ファイルをアンステージング |
| `X` | ファイルの変更を破棄 |
| `=` | インライン差分の表示/非表示 |
| `Enter` | ファイルを開く |
| `o` | 水平分割で開く |
| `gO` | 垂直分割で開く |
| `O` | 新規タブで開く |
| `cc` | コミット |
| `ca` | コミット --amend |
| `cw` | コミットメッセージを書き換え |
| `cvc` | コミット --verbose |
| `cva` | コミット --verbose --amend |
| `cf` | fixupコミット作成 |
| `cs` | squashコミット作成 |
| `cA` | コミット --edit --amend |
| `czz` | stash |
| `czw` | stash --keep-index |
| `czA` | stash apply |
| `czP` | stash pop |
| `dv` | 垂直分割で差分表示 |
| `ds` | 水平分割で差分表示 |
| `dp` | 差分をプレビュー |
| `dd` | 差分表示 |
| `dq` | 差分ウィンドウを閉じる |
| `g?` | ヘルプ表示 |

## 使用例

```vim
" Gitステータスを確認して変更をステージング
:Git
" ステータスウィンドウで - キーで選択的にステージング

" 現在のファイルの差分を確認
:Gdiff

" コミット
:Git commit -m "feat: add new feature"

" 現在のファイルの履歴を確認
:0Gclog

" ブランチを作成して切り替え
:Git checkout -b feature/new-feature

" GitHubでファイルを開く
:GBrowse
```

## Tips
- `:Git`で開くステータスウィンドウはインタラクティブで、`-`キーで簡単にステージング/アンステージングできます
- `:Gdiff`で差分表示中は、`]c`/`[c`で変更箇所間を移動できます
- `:GBrowse`はvim-rhubarb プラグインが必要です（GitHub統合用）
- `:Git`コマンドは任意のGitコマンドを実行できるため、通常のGit操作が全て可能です