---
name: implementation-report
description: 委任実装の意図適合性を検証し、standalone HTML 受け入れレポートを生成する。ユーザーが「実装レポート作って」「実装内容をHTMLにして」「implementation report」など実装レポートの作成を明示したとき MUST 使用する。レビュー指摘は含めない。後段の /review-report が同じ report.json / report.html を更新してレビュー結果を追加する。
metadata:
  target_agent: Cursor
---

# 実装受け入れレポート

エージェントに委任した実装が **元の依頼意図を満たしたか**
を、コードレビュー前に確認する skill。Pi では `/skill:implementation-report`
で明示呼び出しもできる。

## いつ使う

- レビュー前に「依頼どおり実装できたか」を intent 単位で確認したい
- 委任実装の受け入れ判定（適合 / 要確認 / 不適合）が欲しい
- 後で同じレポートにレビュー結果を載せたい
- ユーザーが「実装レポート作って」「実装内容をHTMLにして」「implementation
  report」など **実装レポートの作成** を依頼した

**使わない**:

- 「レビューレポート作って」「レビューして」→ `/review-report` または
  `/parallel-review`
- レビュー指摘・risk 判定が主目的 → `/review-report`

## ワークフロー

```text
Original user request / approved plan
  → Intent Contract 凍結（diff から要件を推測しない）
  → evidence.md + validation.json 収集
  → Stage 0 適合分析（intent + patch + evidence + validations）
  → assemble（intent 保持 + verdict 決定論的算出）
  → validate / render → HTML open
  → 人間が適合性を確認（ここで停止）
  → 承認後に review-report Stage 1/2
```

```text
1. preflight — collect_sanitized_patch.sh
2. Intent Contract — 依頼文と承認済み plan/spec から intent.json を凍結
   （曖昧なら停止してユーザーに確認。diff から推測しない）
3. evidence.md — main agent が repo を read-only 調査し file:line 根拠を収集
4. validation.json — main agent が **常に作成** する決定論的コマンド結果の JSON 配列。
   実行できない検証は `not-run` エントリと理由を記録する（省略や空配列で pass にならない）
5. Stage 0 — 隔離 analyzer に sanitized.patch / evidence.md /
   validation.json / intent.json（参照のみ）/ prompt.txt を渡す
6. repository metadata — Stage 0 後に決定論的収集
7. assemble — stage0 + intent.json + validation.json + repository → report.json
8. validate / render → HTML open
```

Contract:
[../review-report/references/report-format.md](../review-report/references/report-format.md)

```bash
ROOT="$(pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/implementation-report-XXXXXX")"

skills/implementation-report/scripts/collect_sanitized_patch.sh \
  --repo "$ROOT" --out "$WORK"

# 1. intent.json を依頼文 + 承認 plan から凍結（diff から推測禁止）
# 2. evidence.md を main agent が収集
# 3. validation.json を main agent が常に作成（実行不可時は not-run エントリ）
# 4. Stage 0 → $WORK/stage0.json
#    詳細: references/stage0.md

if deno run --allow-read --allow-write --allow-run \
  skills/implementation-report/scripts/collect_repository_metadata.ts \
  --repo "$ROOT" -o "$WORK/repository.json"; then
  repo_args=(--repository "$WORK/repository.json")
else
  echo "repository metadata collection failed; degraded fallback" >&2
  repo_args=(--omit-repository)
fi

deno run --allow-read --allow-write \
  skills/implementation-report/scripts/assemble_report.ts \
  --stage0 "$WORK/stage0.json" \
  --intent "$WORK/intent.json" \
  --validation "$WORK/validation.json" \
  "${repo_args[@]}" \
  -o "$WORK/report.json"

deno run --allow-read \
  skills/review-report/scripts/render_report.ts \
  "$WORK/report.json" --validate-only

deno run --allow-read --allow-write \
  skills/review-report/scripts/render_report.ts \
  "$WORK/report.json" -o "$WORK/report.html"

if command -v open >/dev/null 2>&1; then
  open "$WORK/report.html"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WORK/report.html"
fi
```

## 必須アーティファクト（Stage 0 入力）

隔離 temp dir に main agent が作成する:

| ファイル          | 内容                                                |
| ----------------- | --------------------------------------------------- |
| `intent.json`     | 依頼文 + 承認 plan から凍結。diff から推測しない    |
| `sanitized.patch` | secret 除外済み patch                               |
| `evidence.md`     | read-only 調査結果（file:line 引用、unknowns 明示） |
| `validation.json` | 決定論的コマンド結果の JSON 配列                    |
| `prompt.txt`      | Stage 0 プロンプト                                  |

analyzer は repo にアクセスせず、コマンドも実行しない。`--input`
で上記データファイルを渡す。

## 受け入れゲート

assemble は **別途供給した intent.json をそのまま保持** し、Stage 0 の
`acceptance.checks/extras/summary` と `validation.json` から verdict
を決定論的に算出する。

- `fail`: check が `missing` / `contradicted`、または validation が `failed`
- `needs-confirmation`: 上記以外で `partial` / `unverified`、extras
  あり、validation `not-run`、**validations が空**
- `pass`: 全 check が `satisfied`（または `non-goal` 相当）かつ validation が
  1件以上 `passed` で `failed` / `not-run` がない

Stage 0 は `intent` / `acceptance.verdict` / `acceptance.validations`
を出力してはならない。

## Redaction（secret 非包含）

以下のアーティファクトと最終レポートに **secret 値や secret-file の内容を
含めない**:

- `intent.json` — 要件本文に credential/token をそのまま貼らない
- `evidence.md` — secret path を引用せず、値も転記しない
- `validation.json` — summary は簡潔に。raw stdout/stderr の sensitive
  出力は含めない
- `prompt.txt` — 上記と同じ方針
- 生成される `report.json` / `report.html` — 同上

secret ファイルは read しない。`collect_sanitized_patch.sh` の secret 除外と
同一 policy を適用する。

## 完了条件

- `intent.json` が依頼元から回収・凍結済み（推測で作っていない）
- Stage 0 完了（5 入力アーティファクト + prompt。repository metadata
  は渡さない）
- `diagrams` は期待 vs 実装フローのみ（最大2件、根拠なければ `[]`）
- VCS 収集成功時は `repository` を含める。失敗時は degraded fallback
- `report.json` が contract
  を満たす（`review.performed: false`、`--validate-only` 成功）
- `report.html` 生成・open 済み
- レポートを提示して停止し、人間の承認前に review-report Stage 1/2 を開始しない
- HTML レイアウト: Summary → **意図適合性** → Repository Map → **期待 vs
  実装フロー**（図あり時）→ Change Groups →（review なし）

## 関連

- `/review-report` — 同じ `report.json` / `report.html` にレビュー結果を追加
- `/review-verify` — レビュー後の裏取り。実装のみレポートでは使わない
- `/parallel-review` — 通常サイズの並行レビュー
- `hunk-review` — live Hunk session 操作（任意）
- `/cmux-markdown` — plan 表示（本 skill の HTML レポートとは別）
