# Push Command

`jj-push` を実行して、現在のリビジョンを指定bookmarkにpushする。

## 手順

$ARGUMENTS がある場合はbookmark名として渡す:

```bash
jj-push $ARGUMENTS
```

$ARGUMENTS がない場合:

```bash
jj-push
```

## 備考

- `jj-push` がbookmark検出、セット、pushを全て行う
- mainへのpushはブロックされる
- bookmarkが見つからない場合は対話的に確認される
