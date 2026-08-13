---
name: implementation-report
description: 大規模差分を変更意図単位で実装分析し、standalone HTML 実装レポートを生成する。ユーザーが「実装レポート作って」「実装内容をHTMLにして」「implementation report」など実装レポートの作成を明示したとき MUST 使用する。レビュー指摘は含めない。後段の /review-report が同じ report.json / report.html を更新してレビュー結果を追加する。
metadata:
  target_agent: Cursor
---

# 実装レポート

大きな差分を **変更意図グループ** 単位で実装分析し、human-in-the-loop 可能な
standalone HTML 実装レポートを出す skill。Pi では `/skill:implementation-report`
で明示呼び出しもできる。

## いつ使う

- 差分が file/hunk 順では追いにくい
- レビュー前に「何をどう変えたか」を intent 単位で整理したい
- 後で同じレポートにレビュー結果を載せたい
- ユーザーが「実装レポート作って」「実装内容をHTMLにして」「implementation
  report」など **実装レポートの作成** を依頼した

**使わない**:

- 「レビューレポート作って」「レビューして」→ `/review-report` または
  `/parallel-review`
- レビュー指摘・risk 判定が主目的 → `/review-report`

## Preflight（read-only）

[../review-report/SKILL.md](../review-report/SKILL.md) と同じ secret-safe patch
収集を使う。

1. **VCS**: リポジトリ root に `.jj` があれば git ではなく jj（`jj diff`,
   `jj log` 等）。
2. **秘密除外**: `.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`,
   `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519` 等は patch/subagent/report
   に含めない。
   - 先に **changed path 一覧だけ** 取得し、old/new のどちらかが secret pattern
     なら除外する。
   - **unsanitized full patch を先に生成・保存して後から redact
     してはいけない**（secret 値が temp file に一度でも残るため）。
   - allowed paths だけを VCS diff コマンドに渡し、**sanitized patch
     を直接生成**する。
   - sanitized patch を目視/検索し、secret 値・private key marker
     等がないことを確認してから subagent temp dir へ copy する。
3. **plan**: 実装分析（Stage 0）には **一切渡さない**。main agent も Stage 0
   前に plan を参照してグループ化しない。
4. **Hunk（任意）**: live session があれば
   `hunk session comment list --repo . --type user` で人間コメントを import
   可能。group の `initialComment` または top-level `initialComment`
   にマッピングする。Hunk は必須ではない。
5. **ソース編集禁止**: この skill は read-only。tracked ファイルを変更しない。
6. **repository metadata**: preflight の secret 除外済み changed path 一覧を
   **Stage 0 完了後** に main agent が決定論的収集する（下記）。**Stage 0 /
   implementation-analysis subagent には一切渡さない**（Stage 0 は repository
   metadata を受け取らない）。

## ワークフロー

```text
1. preflight → changed path 一覧取得 → secret path 除外 → allowed paths のみで sanitized patch を直接生成
2. sanitized patch を目視/検索で secret 漏れ確認 → subagent temp dir へ copy
3. Stage 0 implementation-analysis subagent（sanitized diff のみ。revision label / target / commit message / plan / repo instructions / source tree / repository metadata / 既存実装 summary は渡さない）
4. main agent が Stage 0 出力を report contract に沿って整形
5. main agent が Stage 0 **完了後** に repository metadata を決定論的収集 → `groups[].files` から group 所属をマップ → report.json に `repository` を含める
6. report.json 作成（review.performed=false、`repository` 必須（収集成功時））→ render_report.ts → HTML を open
7. （任意・後段）ユーザーが /review-report を同じ report.json / report.html に対して実行 → レビュー結果を merge → 同一 HTML を再生成
```

**禁止**: main agent が plan や実装 summary を知った状態で事前グループ/summary
を作り Stage 0 に渡すこと。Stage 0 は raw sanitized diff から intent grouping
する。

Prompt template:
[../review-report/references/prompts.md](../review-report/references/prompts.md)
の Stage 0。

## Stage 0 — implementation-analysis

- **fresh subagent**。入力は **sanitized diff のみ**。revision
  label、target、commit message、plan（ファイル名・パス・本文）、repo
  instructions、source tree、**repository metadata**、既存実装 summary を prompt
  に含めない。
- **必須**: repo 外の新規 temp directory（例:
  `$TMPDIR/implementation-report-$$`）を使い、subagent 起動前は
  `sanitized.patch` と `prompt.txt` だけ置く。起動後の `result.json` / log は同
  dir に出力してよい。prompt は同 dir の `sanitized.patch` を読む形式（巨大 diff
  を inline しない）。working directory / workspace も temp dir に固定。repo
  source は見せない。
- 出力: **implementation fields のみ** — top-level `overview` と各 group の
  `id`, `title`, `intent`, `files`, `diffs`（+ 任意 `needsImprovement` /
  `improvementReason`）。**risk / riskReason / findings は出力しない**。
- 既定 analyzer は role `review.cursor`、timeout 180秒。`review.codex` /
  `review.claude` は fallback。Fugu（`review.fugu`）は quota
  制限があるため明示時だけ使い、自動再試行しない。実モデル ID は
  `~/.pi/agent/model-roles.json` が単一の正。

## Repository metadata（main agent のみ）

Contract:
[../review-report/references/report-format.md](../review-report/references/report-format.md)
の `repository`。

- **収集タイミング**: Stage 0 の隔離出力
  **後**（または入力から完全に切り離す）。subagent / LLM には依頼しない。**Stage
  0 は repository metadata を受け取らない**。
- **収集方法**（path のみ。ファイル内容は読まない。unsanitized patch
  は作らない）:
  - jj: `jj file list` + preflight 済み secret 除外 changed paths /
    `jj diff --summary`
  - git fallback: `git ls-files` + `git diff --name-status`
- **マップ**: `groups[].files` と path を突合し、renderer の Repository Map で
  group 所属を表示。
- **新規レポートでは必須**: VCS metadata 収集が成功したら `repository` を
  **必ず** report.json に含める。通常の新規生成で `repository`
  を省略してはいけない。
- **収集失敗時のみ degraded fallback**: 決定論的収集ができない場合のみ
  `repository` を省略してよい。そのときは **ユーザーへ理由を明示**
  し、Repository Map
  が非表示になることを伝える。**理由を伝えずに黙って省略してはいけない**。
- **renderer 互換**: `repository` フィールド自体は contract 上 optional（legacy
  JSON の render 互換）。省略は legacy / degraded fallback のみを意味する。

## report JSON

Contract:
[../review-report/references/report-format.md](../review-report/references/report-format.md)

実装のみレポートでは次を **必ず** 含める:

- `reportId`: 安定 ID（後段 review / verify で同じ localStorage key を使う）
- `review`: `{ "performed": false, "overview": "" }`
- `overview`: 実装全体の要約
- `groups[]`: 各 group に `id`, `title`, `intent`, `files`, `diffs`。**risk /
  riskReason / findings は省略**
- `repository`: `{ name, trackedFiles, changes[] }`。path/status
  のみ。**内容は含めない**。VCS 収集成功時は **必須**（新規生成）。`reportId`
  生成には含めない。

`report.json` と `report.html` は **同じディレクトリ** に置く（例:
`$TMPDIR/my-report/report.json` + `report.html`）。report artifact は tracked
source を汚さない **`$TMPDIR` 配下** を推奨。

## JSON → HTML

renderer は sibling skill の script を使う:

```bash
deno run --allow-read --allow-write \
  .agents/skills/review-report/scripts/render_report.ts \
  report.json -o report.html

deno run --allow-read \
  .agents/skills/review-report/scripts/render_report.ts \
  report.json --validate-only
```

## Open

ブラウザで standalone HTML を開く（サーバー不要）:

```bash
open report.html          # macOS
xdg-open report.html      # Linux
```

cmux markdown ではなく **HTML ファイル** を直接開く。

## Edge cases

| Case                                   | 扱い                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| diffs ゼロ                             | render 可                                                                                     |
| 秘密ファイル                           | 収集段階で除外                                                                                |
| rename + imports                       | 同一グループ                                                                                  |
| lockfile 大量変更                      | 要約可。実装説明で drift を明示                                                               |
| 既存 report.json がある                | 本 skill は新規実装レポート作成向け。レビュー追加は `/review-report`                          |
| `repository` 省略（legacy / degraded） | 収集失敗など明示した degraded fallback のみ。Repository Map 非表示。他セクションは通常 render |

## 完了条件

- Stage 0 完了
- VCS metadata 収集が成功したら repository metadata を main agent
  が決定論的収集済み（`repository` を report.json に含める）。収集失敗時は理由を
  ユーザーへ明示した degraded fallback のみ許可。subagent 入力には含めていない
- `report.json` が contract
  を満たす（`review.performed: false`、`--validate-only` 成功）
- `report.html` 生成・open 済み
- HTML レイアウト: Summary → Repository Map（`repository` あり時）→
  Implementation Flow（Mermaid）→ Change Groups →（review なし）
- 実装概要・変更グループ・diff snippet が HTML に表示される

## 関連

- `/review-report` — 同じ `report.json` / `report.html`
  にレビュー結果を追加（Stage 1/2）
- `/review-verify` — レビュー後の裏取り（Stage 3）。実装のみレポートでは使わない
- `/parallel-review` — 通常サイズの並行レビュー（「レビューして」など plain
  review 依頼向け）
- `hunk-review` — live Hunk session 操作（任意）
- `/cmux-markdown` — plan 表示（本 skill の HTML レポートとは別）
