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

## 注意

- jjはauto-commitなのでgit addは不要
- コミットメッセージは `jj describe -m "message"` で設定
- 不明な点は `/jj` で確認
