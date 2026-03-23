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
