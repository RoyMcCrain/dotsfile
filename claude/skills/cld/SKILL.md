---
name: cld
description: サンドボックス環境でcldコマンドを実行する（GCP proxy修正付き）。DB確認、テスト、lint、コード生成など。
metadata:
  target_agent: claude
---

# cld Skill

サンドボックスの `CLOUDSDK_PROXY_TYPE=https` を `http` に修正して `cld` コマンドを実行する。
GCPへのアクセスが必要なコマンド（db query, db connect 等）で必須。

## Usage

- `/cld <subcommand> [args]` - cld コマンドを実行

## サンドボックス対応

GCPアクセスが必要なコマンドには `CLOUDSDK_PROXY_TYPE=http` を付与する。

### GCPアクセスが必要なコマンド
- `db query` - DBクエリ実行
- `db connect` - DB接続
- `db migrate apply` - マイグレーション適用
- `db proxy` - Cloud SQL Proxy起動
- `ssh` - SSH接続

### GCPアクセス不要なコマンド（そのまま実行）
- `go test` / `go lint` / `go generate`
- `ts test` / `ts lint` / `ts build`
- `proto generate` / `proto lint` / `proto fmt`
- `db sql-gen` / `db migrate new` / `db diagram` / `db seed`
- `lint` / `test`
- `dev run` / `dev setup` / `dev restart`

## Execution

GCPアクセスが必要な場合:
```bash
CLOUDSDK_PROXY_TYPE=http cld <subcommand> [args]
```

GCPアクセス不要な場合:
```bash
cld <subcommand> [args]
```

## Examples

```bash
# DB確認
CLOUDSDK_PROXY_TYPE=http cld db query dev "SELECT * FROM users LIMIT 5;"
CLOUDSDK_PROXY_TYPE=http cld db query dev "SELECT id, email FROM users WHERE clerk_metadata <> '{}' LIMIT 10;"
CLOUDSDK_PROXY_TYPE=http cld db query local "SELECT count(*) FROM customers;"

# テスト・lint
cld go test ./go/crm_api/service/...
cld ts lint
cld lint

# コード生成
cld proto generate
cld db sql-gen
cld go generate
```

## 注意事項

- dev/prod の DB クエリは常に read-only で実行される
- `!=` は psql でエスケープされるため、`<>` を使うこと
- ClickHouse には `cld db query clickhouse-dev` / `clickhouse-local` でアクセス可能
