---
name: add-key
description: Bitwarden に新しい API キー項目を add-key で作成し Keychain と config.fish に登録する。ユーザーが「add-key でキーを追加して」「新しい API キーを Bitwarden/env フォルダに登録して」など add-key による新規追加を明示したときだけ使う。値の同期だけ・雑談・背景イベントでは使わない。
---

# add-key

ユーザー自身の fish シェルで `add-key <item>` を実行するワークフローを案内する。エージェントは **秘密値をチャット・ツール引数・スクリプト・クリップボード・一時ファイルに載せない**。

## いつ発動するか

- 「add-key で ○○ を追加して」
- 「新しい API キーを Bitwarden に登録して fish の config にも載せたい」

次の場合は **add-key を案内しない**:

- 既存項目の更新（Bitwarden 側で編集 → `sync-key`）
- キー管理の一般論・セキュリティ相談のみ
- バックグラウンド通知や曖昧な「鍵を何とかして」

## 実行前に確認すること

1. **item 名**（例: `example-api-key`）— `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`
2. **環境変数名** — item から自動導出（`example-api-key` → `EXAMPLE_API_KEY`）。`sync-key` と同じ規則
3. **Bitwarden フォルダ** — 通常 `$BW_KEY_FOLDER`（既定 `env`）
4. **影響範囲** — `~/.config/fish/config.fish` の `api_key_items` 行、`security` Keychain（サービス名 = item 名）

## エージェントの手順

1. 上記をユーザーと確認
2. **BW アンロック** が必要なら、ユーザーに **既存の fish ターミナル** で `bw-unlock` を実行してもらう（エージェントが unlock や PTY で入力しない）
3. 同じ fish シェルで `add-key <item>` を実行してもらう（`-s` プロンプトはユーザーだけが見える）
4. 成功時は config 追記を jj/git で commit するよう短く促す

## 検証の限界

- 本 skill は **ワークフロー上のガード** 。入力検証・重複確認・Keychain エンコードは `fish/functions/add-key.fish` と `__keychain_command.fish` が行う
- エージェントは `bw get` / `security find -w` / `printenv` で秘密を **確認しない**。必要なら exit status と非秘密の item 名・config 差分だけ見る
- `fish -c 'add-key …'` は **親シェル** の環境を変えない。反映確認はユーザーが実行したシェルで行う

## 部分失敗

- Bitwarden 作成後に **Keychain 反映** が失敗した場合: **add-key を再実行しない**。`sync-key <item>` で Keychain/環境変数を復旧する（`api_key_items` への名前登録はまだのことがある）
- Keychain まで成功したが **config.fish 追記** だけ失敗した場合: **add-key を再実行しない**。メッセージどおり `api_key_items` に item 名を手動追加する

## 秘密が露出した場合

チャットやログに鍵が出たら **再生成・ローテーション** を促し、露出した文字列を **再掲しない**。

## 例（安全な item 名のみ）

```fish
bw-unlock   # 必要ならユーザーが実行
add-key example-api-key
```
