---
name: jj-workspace
description: jj workspace を新しく切る/追加する操作。本流の作業を止めずに、調査用・レビュー用・実験用の作業ディレクトリを別の場所に作りたいときに使う。「workspace を切りたい」「workspace を追加」「別ディレクトリで作業したい」「sentry 調査用に切って」「レビュー用に main から1個」のような依頼で発動する。workspace の一覧・削除(forget)・着手済み変更の切り出しもカバーする。Sentry issue URL（sentry.io/...）を貼られたら、CRM では専用 workspace を自動で切って調査し、完了後に削除可否を確認する。
---

# jj workspace Skill

jj の workspace（git worktree 相当）を切る・一覧する・消すための手順。
同じリポジトリを共有しつつ、別ディレクトリで別リビジョンを同時にチェックアウトできる。

jj コマンドは必ず `JJ_EDITOR=true` を付けて実行する（エディタ起動待ちを防ぐ）。

人間がインタラクティブに切るときは `jjw`（fish）を使う。agent は下の `jj workspace add` + セットアップ手順を使う（fish の `jjw` は呼べない想定）。

## 発動時の基本動作（最優先）

**この skill が発動したら、原則として必ず専用 workspace を切る。** 「調べたい／直したい」だけの依頼でも、メインリポジトリ（`default` workspace）で直接作業を始めない。以下を順に行う。

1. **既に変更に着手済みなら、その変更を新 workspace へ切り出す**（「5. 着手済みの変更を新 workspace へ切り出す」）。
2. **workspace 名とパスを決める**: 依頼内容から短い名前を自動生成する（ユーザー指定があればそれを使う）。パスはリポジトリの隣に `<repo>-<用途>` で作る。CRM / Sentry は「6. CRM 固有」の命名に従う。
3. **workspace を切る**: 特別な指定が無ければそのリポの trunk（多くの場合 `-r main@origin`。CRM は必須）から切る。現在の作業の続きなら `-r` 省略（=`@`、`jjw` デフォルトと同じ）。
4. **セットアップを実行**: 「2. 作成直後のセットアップ」を必ず行う。リポ固有の追加手順があれば続けて実行する。
5. **cmux タスク名を同期**（Pi / cmux 経由のセッションのみ）: workspace 名やタスク内容が確定したら、**最終 tool の前に** cmux の `custom_title` / description を同期する。Pi セッション名のライフサイクル同期（旧 run の settle 後）は agent が待たない。
6. **Pi agent: 新 cwd へセッション切替**（下記「Pi agent: セッション cwd の切り替え」）。**`switch_workspace_cwd` はこのセッションで最後に呼ぶ tool**。旧セッションではそれ以降 tool を呼ばない。
7. **その workspace ディレクトリで作業する**（Pi では切替先セッションが自動継続する）。

人間が `jjw` で切った場合は 5–6 を省略し、作成後に `cd` して作業する（従来どおり）。**Pi agent は shell の `cd` では cwd を変えられない** — 必ず下記「Pi agent: セッション cwd の切り替え」の `switch_workspace_cwd` を使う。

迷ったら「まず workspace を切る」。default で直接編集を進めるのは、ユーザーが明示的にそれを求めた場合だけにする。

## 重要な前提

- **trunk の取り方はリポごとに違う。** ローカル `main` が追従しない／conflicted なリポでは `-r main` ではなく `-r main@origin`（またはそのリポの `trunk()`）を使う。
- **untracked ファイルはコピーされない。** `.env*` / `node_modules` / gitignore 済みの設定は新 workspace に無い。セットアップを必ず行う。

## 並行作業の運用ルール

- **1 workspace = 1 タスク = 1 bookmark**。bookmark はリポジトリ全体で共有されるため、同じ bookmark を複数 workspace から動かさない。
- **ポート固定の dev サーバーは同時に1つだけ**（例: CRM の `cld dev run`）。コード編集・ユニットテストは並行可。
- **stale working copy**: 別 workspace から jj 操作をすると他方の `@` が stale になることがある。その workspace 内で `JJ_EDITOR=true jj workspace update-stale` を実行すれば復帰する。
- **使い終わったら即 forget**。空のまま放置すると stale 化して掃除が面倒になる。agent を並行で使う場合は workspace ディレクトリごとに別セッションを開く。

## 1. workspace を切る（追加）

```bash
# agent: trunk から切る
JJ_EDITOR=true jj workspace add --name <name> -r <trunk> <path>
# <trunk> 例: main@origin / trunk()

# 現在の @ から切る（-r 省略。jjw 引数なしと同じ）
JJ_EDITOR=true jj workspace add --name <name> <path>

# 人間向けラッパ（.env* の symlink と direnv allow までやる）
jjw --name <name> -r <trunk> <path>
jjw
```

- `--name <name>`: workspace 名（省略するとディレクトリ名）。用途を表す短い名前にする（例: `review`, `experiment`）。
- `-r <rev>`: どのリビジョンの上に空コミットを作るか。省略時は `@`（`jjw` と同じ）。trunk から切るならそのリポの trunk。
- `<path>`: 作業ディレクトリ。**リポジトリの隣に `<repo>-<用途>`**（CRM は `crm-<用途>`）。

作成後、人間はその新しいディレクトリに `cd` して作業する。Pi agent は shell の `cd` ではなく、次節のセッション切り替えを使う。各 workspace は独立した working-copy commit (`@`) を持つので、ビルド成果物や作業中の変更は混ざらない。

## Pi agent: セッション cwd の切り替え

Pi 上で workspace を切った agent は、shell の `cd` では Pi の cwd を変えられない。**セットアップと cmux `custom_title`/description 同期がすべて終わったら、最後の tool として 1 回だけ `switch_workspace_cwd` を destination パスで呼ぶ。**

- **順序**: `jj workspace add` → セットアップ（`.env*` symlink / direnv / リポ固有）→ cmux `custom_title`/description 同期 → **`switch_workspace_cwd(path)`**（最終 tool）
- **この tool の後に旧セッションで他の tool を呼ばない。** 拡張は persisted session であることを確認したうえで destination を extension-local に保持し、`terminate: true` で現在の agent run を止める。旧 run が `agent_settled` したあと idle になった時点で、内部コマンド `/workspace-cd-continue <encoded-path>` を `expandPromptTemplates: true` で dispatch する（follow-up キューではない）。そのコマンドがセッションを fork/switch し、切替先セッションで短い継続メッセージにより元タスクを自動再開する。Pi セッション名の同期は旧 run settle 後に起きるため、最終 tool 前に待たない。
- **手動切替**（ユーザー向け）: `/workspace-cd <path>` — 同じ fork/switch だが自動継続はしない。
- **人間の `jjw` フローは変更なし**（fish で切って `cd` するだけ）。

## 2. 作成直後のセットアップ（必須・汎用）

`jjw` を使った場合は次の symlink / direnv まで済んでいる。agent は `jj workspace add` の直後に同等を行う。

```bash
src=$(JJ_EDITOR=true jj root -R <default-repo-path>)   # 元リポ
dest=<path>                                             # 新 workspace

# .env* を元リポから同じ相対パスで symlink（jjw と同じ）
fd -H -I -t f '^\.env' "$src" -E .git -E .jj -E node_modules \
  | while read -r env_file; do
      rel="${env_file#"$src"/}"
      mkdir -p "$dest/$(dirname "$rel")"
      ln -sfn "$env_file" "$dest/$rel"
    done

# direnv
if [ -f "$dest/.envrc" ]; then direnv allow "$dest"; fi
```

- `.env*`（`.env`, `.envrc`, `.envrc.local` など）は **copy ではなく symlink**。`jjw` と揃える。
- **tracked な `.envrc` も symlink で上書きする。** workspace 側で `.envrc` を編集すると default 側の実体が変わる（共有が意図）。リポごとに分けたい場合は symlink しない。
- `node_modules` やビルド成果物はリポごとに別途用意する（CRM は「6. CRM 固有」）。

## 3. workspace を一覧する

```bash
JJ_EDITOR=true jj workspace list
```

## 4. workspace を消す（forget）

不要になったら、まず作業ディレクトリを削除し、元リポ側で forget する。

```bash
rm -rf <path>
JJ_EDITOR=true jj workspace forget <name>
```

forget しただけだと空コミットが宙に浮くことがある。不要なら `jj abandon <change-id>` で捨てる。

## 5. 着手済みの変更を新 workspace へ切り出す

`default` で先に編集を始めてしまった場合、変更を捨てずに専用 workspace へ移す。

```bash
cd <default-repo-path>
JJ_EDITOR=true jj describe -m "<変更内容の説明>"
JJ_EDITOR=true jj bookmark create <bookmark-name> -r @

# default を trunk 上の空コミットへ戻す（リポに合わせて main@origin や trunk()）
JJ_EDITOR=true jj new <trunk>

# bookmark を指して新 workspace を作る
JJ_EDITOR=true jj workspace add --name <name> -r <bookmark-name> <path>
# 続けて「2. 作成直後のセットアップ」
# 人間なら: jjw --name <name> -r <bookmark-name> <path>

cd <path>
JJ_EDITOR=true jj edit <bookmark-name>
JJ_EDITOR=true jj status   # 変更が載っていること・default が clean なことを確認
```

切り出し後、リポ固有の追加セットアップがあれば実行する。

## 6. CRM 固有

対象: `/Users/roy/ghq/github.com/zero-color/crm` およびその workspace。
trunk は **`main@origin`**（`trunk()` も同じ）。ローカル `main` は untrack のため使わない。

### 前提

- `main` bookmark は **意図的に untrack**。ローカル `main` は古いまま／conflicted になり得る。
- **最新 main から切るときは必ず `-r main@origin`。**
- パス規約: リポジトリ隣に `crm-<用途>`。
- `cld dev run` は同時に1つだけ（ポート 8080/5173/5432 等が固定）。

### 追加セットアップ（汎用セットアップの後に必須）

```bash
CRM=/Users/roy/ghq/github.com/zero-color/crm
dest=<path>   # 例: $CRM の隣の crm-<用途>

JJ_EDITOR=true jj workspace add --name <name> -r main@origin "$dest"
src=$(JJ_EDITOR=true jj root -R "$CRM")
fd -H -I -t f '^\.env' "$src" -E .git -E .jj -E node_modules \
  | while read -r env_file; do
      rel="${env_file#"$src"/}"
      mkdir -p "$dest/$(dirname "$rel")"
      ln -sfn "$env_file" "$dest/$rel"
    done
[ -f "$dest/.envrc" ] && direnv allow "$dest"

cd "$dest"
cp "$CRM/devbox.json" devbox.json
pnpm install --dir typescript
cd typescript && pnpm --filter @crm/connect build && cd ..
```

- `devbox.json` は gitignore 済み。必要なら `devbox install` でツールチェーンを揃える。
- 新規 workspace には `@crm/connect` の `dist/` が無く、Vite / vitest が `Failed to resolve entry for package "@crm/connect"` で落ちる。
- `.envrc.local` は汎用セットアップの `.env*` symlink で賄える。無くても `cld dev run` は起動するが、LINE / Stripe / Statsig 周りは動かない。
- 人間なら切るところだけ `jjw --name <name> -r main@origin "$dest"` に置き換え可（その後の `cp` / `pnpm` は同じ）。

### Sentry 調査フロー

引数やメッセージに Sentry の issue URL（`sentry.io/...` や issue 番号）が含まれていたら、専用 workspace を切ってから調査する。

1. **名前とパス**: issue 番号から `sentry-<番号>` / `crm-sentry-<番号>`（例: `.../issues/7523355236/` → 名前 `sentry-7523355236`、パス `/Users/roy/ghq/github.com/zero-color/crm-sentry-7523355236`）。同名があれば再利用（`jj workspace list`）。
2. **切る + セットアップ**: 上の「追加セットアップ」ブロックを `<name>=sentry-<番号>` / `dest=.../crm-sentry-<番号>` で実行する。
3. **調査する**: 切った workspace で作業する。Sentry 情報の取り方は agent による。
   - Claude: Sentry MCP（URL をそのまま渡す）
   - Codex 等: `mcp-delegate` 経由で Claude に委譲（Sentry MCP の owner が Claude の場合）
   - エラーメッセージ・culprit・tags（org_id, shop_domain 等）を起点にコードを追う。必要なら `cld db query` で裏取り。
4. **結果を報告する**: ルートコーズ・影響範囲・対応の選択肢。
5. **削除可否を必ず確認する**: 調査一段落後、修正の有無にかかわらず「この workspace（`sentry-<番号>`）を削除するか・残すか」を聞く。削除なら「4. workspace を消す」。残して修正する場合は完了後に再確認。

## 注意

- workspace 内での bookmark / push 運用は通常の jj ワークフローと同じ（`jj` skill 参照）。
- `.claude/skills/`、`skills/`、`.codex/skills/` を含むパスへの jj 操作はサンドボックスでブロックされることがある。その場合はユーザーに別ターミナルでの実行を依頼する。
