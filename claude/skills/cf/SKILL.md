---
name: cf
description: Cloudflare CLI (cf) のコマンド/スキーマを引くアシスタント。Cloudflareアカウント・DNS・Workers・D1・R2・KV・Durable Objects等のリソース操作、CLIコマンド検索、APIスキーマ確認に使う。
metadata:
  target_agent: claude
---

# cf Skill

Cloudflareの新CLI `cf`（旧Wrangler後継、tech preview）の薄いラッパー。
コマンド一覧やスキーマは `cf` 自身が配布しているので、このスキルは「どこを引くか」だけを示す。

## Discovery

```bash
cf agent-context --list      # 全プロダクト一覧（dns, d1, r2, kv, workers, ...）
cf agent-context <product>   # プロダクト別コマンド一覧（Read/Create/Update/Delete）
cf schema --list             # APIスキーマ一覧
cf schema <command path>     # 特定コマンドのrequest/responseスキーマ
cf tools                     # MCPツール定義
```

ユーザーの質問に対応するプロダクトを推測したら、まず `cf agent-context <product>` を読んでからコマンドを組み立てる。

## 規約

- 出力はデフォルトJSON。サイズ削減には `--fields id,name,status`、ストリーミングには `--ndjson`
- 破壊的操作（create/update/delete）は **必ず先に `--dry-run`** で検証
- 複雑なpayloadは `--body '{...}'`
- 認証: `CLOUDFLARE_API_TOKEN` env var 推奨。代替で `cf auth login`、確認は `cf auth whoami`

## Context解決の優先順位

1. CLIフラグ (`--account-id`, `--zone`)
2. 環境変数 (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`)
3. プロジェクト設定 (cwdから遡る `.cfrc`)
4. ユーザー設定 (`~/.config/cf/config.json`)

繰り返しID指定を避けたい時:
```bash
cf context set account-id <id>
cf context set zone example.com --project
```

## エラー時

- 非0 exit codeはエラー、詳細はstderr
- 401 → `cf auth whoami` で認証確認
- コマンド名不明 → `cf <subcommand> --help` または `cf agent-context <product>`

## 注意

- `cf` はtech preview。コマンドは順次追加中（現状: accounts / dns / zones / registrar / auth / context / schema / agent-context / completions / tools）
- 既存Wrangler機能（workers dev / deploy など）はまだ未移行の可能性あり。なければWrangler側を使う
