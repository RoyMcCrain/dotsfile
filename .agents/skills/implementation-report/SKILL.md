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

## ワークフロー

```text
1. preflight — [scripts/collect_sanitized_patch.sh](scripts/collect_sanitized_patch.sh)
   詳細: [references/preflight.md](references/preflight.md)
2. Stage 0 — sanitized.patch だけを隔離 subagent に渡す
   詳細: [references/stage0.md](references/stage0.md)
3. repository metadata — Stage 0 の後に main agent が決定論的収集
   [scripts/collect_repository_metadata.ts](scripts/collect_repository_metadata.ts)
   詳細: [references/repository-metadata.md](references/repository-metadata.md)
4. assemble — Stage 0 JSON + repository → report.json
   [scripts/assemble_report.ts](scripts/assemble_report.ts)
5. validate / render — review-report の renderer を使う
6. HTML を open
```

**禁止**: main agent が plan や実装 summary を知った状態で事前グループ/summary
を作り Stage 0 に渡すこと。Stage 0 は raw sanitized diff から intent grouping
する。

Contract:
[../review-report/references/report-format.md](../review-report/references/report-format.md)

```bash
ROOT="$(pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/implementation-report-XXXXXX")"

.agents/skills/implementation-report/scripts/collect_sanitized_patch.sh \
  --repo "$ROOT" --out "$WORK"

# Stage 0: $WORK/sanitized.patch だけを隔離 subagent に渡す → $WORK/stage0.json

# repository metadata 収集の成否で assemble の引数を切り替える。
# 失敗時は理由をユーザーへ出し、--omit-repository で degraded fallback。
if deno run --allow-read --allow-write --allow-run \
  .agents/skills/implementation-report/scripts/collect_repository_metadata.ts \
  --repo "$ROOT" -o "$WORK/repository.json"; then
  repo_args=(--repository "$WORK/repository.json")
else
  echo "repository metadata collection failed; degraded fallback" >&2
  repo_args=(--omit-repository)
fi

deno run --allow-read --allow-write \
  .agents/skills/implementation-report/scripts/assemble_report.ts \
  --stage0 "$WORK/stage0.json" \
  "${repo_args[@]}" \
  -o "$WORK/report.json"

deno run --allow-read \
  .agents/skills/review-report/scripts/render_report.ts \
  "$WORK/report.json" --validate-only

deno run --allow-read --allow-write \
  .agents/skills/review-report/scripts/render_report.ts \
  "$WORK/report.json" -o "$WORK/report.html"

if command -v open >/dev/null 2>&1; then
  open "$WORK/report.html"          # macOS
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WORK/report.html"      # Linux
fi
```

## 完了条件

- Stage 0 完了（sanitized.patch のみ。repository metadata は渡していない）
- VCS 収集成功時は `repository` を report.json に含める。失敗時は理由を明示した
  degraded fallback のみ
- `report.json` が contract を満たす（`review.performed: false`、
  `--validate-only` 成功）
- `report.html` 生成・open 済み
- HTML レイアウト: Summary → Repository Map（`repository` あり時）→
  Implementation Flow（Mermaid）→ Change Groups →（review なし）

## 関連

- `/review-report` — 同じ `report.json` / `report.html` にレビュー結果を追加
- `/review-verify` — レビュー後の裏取り。実装のみレポートでは使わない
- `/parallel-review` — 通常サイズの並行レビュー
- `hunk-review` — live Hunk session 操作（任意）
- `/cmux-markdown` — plan 表示（本 skill の HTML レポートとは別）
