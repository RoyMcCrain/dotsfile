# VCS Rule

## jujutsu (jj) 優先

`.jj` ディレクトリが存在する場合は `git` ではなく `jj` コマンドを使用する。

```bash
# 確認
[ -d .jj ] && echo "use jj" || echo "use git"
```

## ドキュメント参照

jjコマンドの詳細は `/jj` スキルを使用して確認する。

```
/jj [質問]
```

## コマンド対応表

| git | jj |
|-----|-----|
| git status | jj status |
| git diff | jj diff |
| git log | jj log |
| git add + commit | jj describe -m "message" |
| git push | jj git push |
| git pull | jj git fetch |
| git branch | jj bookmark |
| git checkout | jj edit / jj new |

## 環境変数

jjコマンド実行時は必ず `JJ_EDITOR=true` を設定する。エディタ起動による編集待ちタイムアウトを防ぐ。

```bash
JJ_EDITOR=true jj describe -m "message"
JJ_EDITOR=true jj split
```

## 注意

- jjはauto-commitなのでgit addは不要
- コミットメッセージは `jj describe -m "message"` で設定
- 不明な点は `/jj` で確認

## 安全ルール

- bookmarkの新規作成時、ユーザーから名前の指定があればその名前を使う。指定がなければ変更内容から適切な名前を自動生成して作成する（確認不要）
- 作業前に `jj status` / `jj log -r @` で現在のリビジョンを確認する
- 複数bookmarkにまたがる作業では、どの変更がどのbookmarkに属するか確認してから操作する

## PR運用ワークフロー

PRは「1 bookmark = 1 PR」。1つのPRに複数のコミットを積みたい場合でも bookmark は分けない。

### 原則

- **bookmarkを分ける = PR を分ける**（リモートブランチが増えるため）
- **コミットを分ける = リビジョン(change)を分ける**（同じbookmark上で完結）
- **既存リビジョンの書き換え = force-push** が必要になる
- 追記のみなら fast-forward push で済む（force不要）

### 方式A: `jj new` で積み上げる（force-push不要）

修正を新しいリビジョンとして追加していく方式。リモートは fast-forward なので force 不要。

```bash
# 現在のbookmark先頭から新リビジョンを切る
jj new
# ファイル編集
JJ_EDITOR=true jj describe -m "fix: 説明文の誤字を修正"
# bookmark を先頭(@)へ移動
jj bookmark move <bookmark-name> --to @
jj git push
```

### 方式B: `jj split` で分割する（force-push必要）

作業中の1リビジョンを意味単位に分割してからpushする方式。historyは綺麗だが既存リビジョンを書き換えるため force-push になる。

```bash
# 作業中の @ を対話的に分割
JJ_EDITOR=true jj split
# 必要に応じて describe で各リビジョンのメッセージを設定
JJ_EDITOR=true jj describe -r <change-id> -m "..."
jj bookmark move <bookmark-name> --to @
jj git push  # 既存change書き換えのためforce-with-lease相当
```

### 使い分け

- **push済みのリビジョン**: 必ず方式A (`jj new` で積み上げ)。force-push禁止
- **未push（ローカルのみ）**: 方式B (`jj split` で分割) OK。整理してから初push

