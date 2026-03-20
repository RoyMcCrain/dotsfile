# Desc Command

ai-commitでコミットメッセージを生成し、jj describeで適用する。
判断や確認はせず、即座に実行すること。

## 手順

1. `ai-commit --message-only` でメッセージを取得
2. 取得したメッセージで `jj describe -m "<message>"` を実行
3. `jj log -r @` で結果を表示
