# Push Command

現在のリビジョンのbookmarkを特定してpushする。判断や確認はせず、即座に実行すること。

## 手順

1. `jj log -r @ --no-graph -T 'bookmarks'` でbookmarkを取得（`*`や`?`は除去、`@`含むものは除外）
2. なければ `jj log -r @- --no-graph -T 'bookmarks'` で親を確認
3. mainの場合はエラー終了
4. 実行:

```bash
jj bookmark set <bookmark> -r @
jj git push --bookmark <bookmark>
jj log -r @
```
