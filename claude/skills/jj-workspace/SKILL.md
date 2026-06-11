---
name: jj-workspace
description: jj workspace を新しく切る/追加する操作。本流の作業を止めずに、調査用・レビュー用・実験用の作業ディレクトリを別の場所に作りたいときに使う。「workspace を切りたい」「workspace を追加」「別ディレクトリで作業したい」「sentry 調査用に切って」「レビュー用に main から1個」のような依頼で発動する。workspace の一覧・削除(forget)もカバーする。また Sentry の issue URL（sentry.io/...）を貼られたら、専用 workspace を自動で切って調査し、完了後に削除可否を確認するフローも担う。
metadata:
  target_agent: claude
---

# jj workspace Skill

jj の workspace（git worktree 相当）を切る・一覧する・消すための手順。
同じリポジトリを共有しつつ、別ディレクトリで別リビジョンを同時にチェックアウトできる。

jj コマンドは必ず `JJ_EDITOR=true` を付けて実行する（エディタ起動待ちを防ぐ）。

## Sentry 調査フロー（issue URL を貼られたとき）

引数やメッセージに Sentry の issue URL（`sentry.io/...` や issue 番号）が含まれていたら、本流の作業を止めないために**専用 workspace を切ってから調査する**。以下を順に実行する。

1. **workspace 名とパスを決める**: URL から issue 番号を取り出し、`sentry-<番号>` を名前、`crm-sentry-<番号>` をディレクトリにする（例: `.../issues/7523355236/` → 名前 `sentry-7523355236`、パス `/Users/roy/ghq/github.com/zero-color/crm-sentry-7523355236`）。issue 番号ベースにすることで複数調査を同時に走らせても衝突しない。同名 workspace が既にあれば再利用する（`jj workspace list` で確認）。

2. **workspace を切る**: 最新 main から切る。

   ```bash
   JJ_EDITOR=true jj workspace add --name sentry-<番号> -r main@origin /Users/roy/ghq/github.com/zero-color/crm-sentry-<番号>
   ```

3. **調査する**: 切った workspace ディレクトリで作業する。Sentry MCP の `get_sentry_resource`（URL をそのまま渡す）で issue を取得し、エラーメッセージ・culprit・tags（org_id, shop_domain 等）を起点にコードを追う。必要なら DB は `cld db query` で裏取りする。

4. **結果を報告する**: ルートコーズ・影響範囲・対応の選択肢をまとめて報告する。

5. **削除可否を必ず確認する**: 調査が一段落したら、**修正の有無にかかわらず**「この workspace（`sentry-<番号>`）を削除するか・残すか」をユーザーに確認する。
   - 削除する場合は「3. workspace を消す（forget）」の手順を実行する。
   - 修正に入るため残す場合はそのまま作業を続け、作業完了後に改めて削除可否を確認する。

## 重要な前提（このリポジトリ固有）

- `main` bookmark は **意図的に untrack** にしているため、ローカル `main` は古いまま更新されない。
- **最新の main から切るときは `-r main` ではなく `-r main@origin` を使う。** ローカル `main` を指定すると古いコミットに乗る。

## 並行作業の運用ルール

- **1 workspace = 1 タスク = 1 bookmark**。bookmark はリポジトリ全体で共有されるため、同じ bookmark を複数 workspace から動かさない。
- **untracked ファイルはコピーされない**。新 workspace には `.env` 系や `node_modules` が無く、lint / fmt / test が動かない。作成直後に「作成直後のセットアップ」を必ず実行する。
- **`cld dev run` は同時に1つだけ**。ポート（8080/5173/5432 等）が固定のため、dev サーバーや e2e の同時起動は不可。コード編集・ユニットテストは並行可。
- **stale working copy**: 別 workspace から jj 操作をすると他方の `@` が stale になることがある。その workspace 内で `JJ_EDITOR=true jj workspace update-stale` を実行すれば復帰する。
- **使い終わったら即 forget**。空のまま放置すると stale 化して掃除が面倒になる。Claude Code を並行で使う場合は workspace ディレクトリごとに別セッションを開く。

## 1. workspace を切る（追加）

```bash
JJ_EDITOR=true jj workspace add --name <name> -r main@origin <path>
```

- `--name <name>`: workspace 名（省略するとディレクトリ名）。用途を表す短い名前にする（例: `sentry`, `review`, `experiment`）。
- `-r main@origin`: どのリビジョンの上に空コミットを作るか。最新 main から切る場合はこれ。現在の作業の続きなら `-r @`、特定 PR なら `-r <change-id>`。
- `<path>`: 作業ディレクトリ。**リポジトリの隣に `crm-<用途>` で作る規約**。

### 例: sentry 調査用に最新 main から切る

```bash
JJ_EDITOR=true jj workspace add --name sentry -r main@origin /Users/roy/ghq/github.com/zero-color/crm-sentry
```

作成後、その新しいディレクトリに `cd` して作業する。各 workspace は独立した working-copy commit (`@`) を持つので、ビルド成果物や作業中の変更は混ざらない。

### 作成直後のセットアップ（必須）

untracked ファイル（`node_modules` と `.envrc.local`）は新 workspace に存在せず、`lint` / `fmt` / `test` が動かない。workspace を切ったら必ず続けて実行する。

```bash
cd <path>
cp /Users/roy/ghq/github.com/zero-color/crm/.envrc.local .envrc.local
direnv allow
pnpm install --dir typescript
```

- `.envrc` はトラック済みなのでコピー不要。`.envrc.local` はローカルシークレット（LINE / Stripe / Statsig）で untracked のため手動コピーが必要。無くても `cld dev run` は起動するが、LINE 送信・Stripe・Statsig を触る機能が動かない。

## 2. workspace を一覧する

```bash
JJ_EDITOR=true jj workspace list
```

## 3. workspace を消す（forget）

不要になったら、まず作業ディレクトリを削除し、メインのリポジトリ側で forget する。

```bash
# 作業ディレクトリを削除
rm -rf /Users/roy/ghq/github.com/zero-color/crm-sentry
# メインリポジトリ側で workspace を忘れさせる
JJ_EDITOR=true jj workspace forget sentry
```

forget しただけだと空コミットが宙に浮くことがある。気になる場合は `jj abandon <change-id>` で捨てる。

## 注意

- workspace 内での bookmark / push 運用は通常の jj ワークフローと同じ（`/jj` skill 参照）。
- `.claude/skills/` や `.agents/skills/` を含むパスへの jj 操作はサンドボックスでブロックされるため、その場合はユーザーに別ターミナルでの実行を依頼する。
