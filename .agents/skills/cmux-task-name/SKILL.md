---
name: cmux-task-name
description: 現在の cmux workspace の名前と説明を、いま取り組んでいるタスクに合わせて自動更新する。新しいタスク・ブランチ・PR に着手したとき、jj bookmark / workspace を切ったとき、あるいはユーザーが「cmux のワークスペース名をタスク名にして」「セッション名を更新して」と言ったときに使う。名前だけでなく説明(set-description)も付ける。
---

# cmux Task Name Sync

いま作業中のタスクが一目で分かるように、**現在の cmux workspace** の名前と説明をタスク内容に同期する。cmux CLI（`cmux`、`CMUX_BUNDLED_CLI_PATH`）の socket 経由で実行する。

## いつ発動するか

- 新しいタスク／ブランチ／PR に着手したとき（`jj bookmark create` / `jj workspace add` の直後を含む）
- ユーザーが名前・説明の更新を明示したとき
- タスクの目的が大きく変わったとき（名前と説明を更新し直す）

cmux 外で動いている（`CMUX_WORKSPACE_ID` が無い）場合は何もしない。

## 対象の決め方

- **常に現在の workspace を対象にする。** `--workspace` を省けば `$CMUX_WORKSPACE_ID`（現在の caller workspace）が対象になる。他 workspace はユーザーが明示したときだけ触る。
- 事前確認: `cmux current-workspace` で選択中の workspace を確認できる。

## 名前と説明の作り方

タスク文脈から次を自動生成する（ユーザー指定があればそれを優先）。

- **名前（title）**: 短く識別できる slug。優先順は
  1. jj bookmark 名の末尾セグメント（`fix/email-builder-custom-block-delete-confirm` → `email-builder-custom-block-delete-confirm`）
  2. jj workspace 名（`crm-<用途>` の `<用途>`、例: `custom-block-delete`）
  3. タスク要約から作った短い slug
  - 目安 40 文字以内。長い prefix（`fix/` `feat/`）は落としてよい。
- **説明（description）**: 原則 **1 行**で簡潔に。`<タスクの一行要約> (PR #<番号>)` の形。
  - 例: `カスタムブロック削除に確認ダイアログを追加 (PR #2988)`
  - PR がまだ無ければ `(PR #...)` は省く。
  - bookmark / jj workspace path など詳細は名前や PR から辿れるので説明には入れない。

## 実行手順

```bash
# 0. cmux 外なら中断（CMUX_WORKSPACE_ID が無い）
[ -n "$CMUX_WORKSPACE_ID" ] || exit 0

# 1. 名前を更新（--workspace 省略で現在の workspace が対象）
cmux rename-workspace "<name>"

# 2. 説明を更新（1 行で簡潔に）
cmux workspace-action --action set-description --description "<一行要約> (PR #<番号>)"

# 3. 確認
cmux current-workspace
cmux workspace list | grep -F "<name>"
```

- 名前を消す: `cmux workspace-action --action clear-name`
- 説明を消す: `cmux workspace-action --action clear-description`
- 任意で色分け: `cmux workspace-action --action set-color --color <Red|Blue|Green|...|#RRGGBB>`（タスク種別で色を固定運用しても良い）

## jj / PR フローとの連携

- `jj-workspace` skill で jj workspace を切ったら、続けてこの skill で cmux workspace 名を `<用途>` に合わせる。
- `cheap-pr` で PR を作ったら、説明に `PR #<番号>` を追記して更新する。

## 注意

- 破壊的操作ではないが、対象を間違えないよう **現在の workspace 以外は明示指定時のみ**。
- socket が使えない（`cmux ping` が失敗する）環境では中断し、その旨を伝える。
- 名前・説明はユーザー可視。秘密情報（トークン等）は入れない。
