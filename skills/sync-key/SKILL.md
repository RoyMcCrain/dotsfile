---
name: sync-key
description: Bitwarden の既存 API キー項目を sync-key で macOS Keychain と fish 環境変数に反映する。ユーザーが「sync-key で ○○ を同期して」「Keychain に載せ直して」など named item の sync-key を明示したときだけ使う。新規作成・一括同期・曖昧な依頼では使わない。
---

# sync-key

ユーザー自身の fish シェルで `sync-key <item> [ENV_VAR]` を実行するワークフローを案内する。エージェントは **秘密値を要求・転記・検証出力しない**。

## いつ発動するか

- 「sync-key で firecrawl-api-key を同期して」
- 「Bitwarden から ○○ を Keychain に反映して」

次の場合は **sync-key を案内しない**:

- 新規キー作成（`add-key`）
- 全項目の一括 sync・上書き・削除（明示がない限り）
- 環境変数の話だけで sync 依頼がない相談

## 実行前に確認すること

1. **item 名**（Bitwarden の Login 項目名）
2. **ENV_VAR** — 省略時は item から導出（`my-api-key` → `MY_API_KEY`）。上書きする場合は `^[A-Z_][A-Z0-9_]*$` かつ予約名（`PATH` 等）不可
3. **対象は依頼された item のみ**（バッチ禁止）

## エージェントの手順

1. item / ENV_VAR を確認
2. 必要ならユーザーに **既存 fish** で `bw-unlock` → `sync-key <item>` を実行してもらう
3. 成功は **コマンドの終了コード** とユーザー報告で判断。`bw get password` や `security find -w` でエージェントが中身を見ない

## 検証の限界

- 実際の検証は `fish/functions/sync-key.fish` が行う（空・改行・制御文字・Keychain `security -i` エンコード等）
- `fish -c 'sync-key …'` は **親シェル**（Cursor エージェント含む）の環境を更新しない。`sync-key` の **ENV_VAR 上書き**（第2引数）も **そのコマンドを実行した fish プロセス内だけ** に効く。`config.fish` 起動時の item→ENV 名の導出は別設定で変えない限り従来どおり。子 shell を新規に起動しても **すでに動いているエージェント／IDE プロセス** の環境は直らないので、反映確認は **ユーザーが実行した fish** で `set -q VAR` 等を行い、エージェント側は **ツール再起動** で更新後の環境を引き継ぐ必要がある

## 失敗時

- 失敗前に設定されていた環境変数は **上書きしない**（関数側で fail-closed）
- 秘密らしき stderr は関数側で抑え、エージェントも生値を再掲しない
- **sync-key は Keychain キャッシュと fish 環境変数の反映のみ**。`config.fish` の `api_key_items` への名前登録は行わない（新規 item 名の登録は add-key 側、または手動編集）

## 秘密が露出した場合

ローテーションを促し、露出文字列は **再現しない**。

## 例

```fish
bw-unlock   # 必要なら
sync-key example-api-key
sync-key example-api-key CUSTOM_API_KEY
```
