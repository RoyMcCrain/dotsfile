---
name: review-report
description: 大規模差分を変更意図単位で二段階レビューし、standalone HTML レビューレポートを生成する。ユーザーが「レビューレポート作って」「レビューレポートを作成して」「レビューレポート生成して」などレビューレポートの作成を明示したとき MUST 使用する。通常の「レビューして」だけの依頼は /parallel-review にルーティングされ、この skill ではない。
metadata:
  target_agent: Cursor
---

# レビューレポート

大きな差分を **変更意図グループ** 単位でレビューし、human-in-the-loop 可能な standalone HTML レビューレポートを出す skill。Pi では `/skill:review-report` で明示呼び出しもできる。

## いつ使う

- 差分が file/hunk 順では追いにくい
- plan あり/なし両方の視点が欲しい
- 採用/却下/コメント付き feedback を元セッションへ貼りたい
- ユーザーが「レビューレポート作って」など **レビューレポートの作成** を依頼した

**使わない**: 通常の「レビューして」だけの依頼 → `/parallel-review` を優先する。

## Preflight（read-only）

1. **VCS**: リポジトリ root に `.jj` があれば git ではなく jj（`jj diff`, `jj log` 等）。
2. **秘密除外**: `.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519` 等は patch/subagent/report に含めない。
   - 先に **changed path 一覧だけ** 取得し、old/new のどちらかが secret pattern なら除外する。
   - **unsanitized full patch を先に生成・保存して後から redact してはいけない**（secret 値が temp file に一度でも残るため）。
   - allowed paths だけを VCS diff コマンドに渡し、**sanitized patch を直接生成**する。
   - sanitized patch を目視/検索し、secret 値・private key marker 等がないことを確認してから subagent temp dir へ copy する。
3. **plan**: ユーザー指定または作業中 plan ファイル。**Stage 1 には一切渡さない**（main agent も Stage 1 前に plan を参照してグループ化しない）。
4. **Hunk（任意）**: live session があれば `hunk session comment list --repo . --type user` で人間コメントを import 可能。group の `initialComment` または top-level `initialComment` にマッピングする。Hunk は必須ではない。
5. **ソース編集禁止**: この skill は review のみ。tracked ファイルを変更しない。

## ワークフロー

```text
1. preflight → changed path 一覧取得 → secret path 除外 → allowed paths のみで sanitized patch を直接生成
2. sanitized patch を目視/検索で secret 漏れ確認 → subagent temp dir へ copy
3. Stage 1 blind subagent（sanitized diff のみ。revision label / target / commit message / plan / repo instructions / source tree は渡さない。Stage 1 自身が intent grouping。**reviewer は既定で cursor または fugu に委譲**）
4. Stage 2 plan-aware subagent（同 sanitized diff + plan 本文のみ。fresh invocation、Stage 1 findings は渡さない）
5. main agent が grouping / findings 統合（provenance 保持）
6. report JSON 作成 → render_report.ts → HTML を open
7. 人間が HTML で採用/要調査/却下/コメント
8. （任意）HTML で裏取りパケット生成 → **`/review-verify`**（パケット貼付でも可）→ merge → HTML 再生成
9. フィードバックを clipboard コピー（裏取り結果があれば併記）
```

**禁止**: main agent が plan を知った状態で事前グループ/summary を作り Stage 1 に渡すこと。Stage 1 は raw sanitized diff から intent grouping する。

裏取りの自動化手順は別 skill: [../review-verify/SKILL.md](../review-verify/SKILL.md)。

## Stage 1 — blind 隔離

- **fresh subagent**。入力は **sanitized diff のみ**。revision label、target、commit message、plan（ファイル名・パス・本文）、repo instructions、source tree を prompt に含めない。
- **必須**: repo 外の新規 temp directory（例: `$TMPDIR/review-report-blind-$$`）に `sanitized.patch` と `prompt.txt` だけ置く。prompt は同 dir の `sanitized.patch` を読む形式（巨大 diff を inline しない）。reviewer の working directory / workspace も temp dir に固定。repo source は見せない。
- 出力: report contract に沿った **valid JSON**（少なくとも `groups` array）。各 group に intent、risk、diff explanation、findings（`source: blind`）。

Prompt template: [references/prompts.md](references/prompts.md)

## Stage 2 — plan-aware

- **別 fresh subagent**。Stage 1 の会話・findings は引き継がない（anchoring/忖度回避）。
- blind と **完全に別 temp dir** に `sanitized.patch`、`plan-body.md`、`prompt.txt` を置く。prompt は同 dir の patch / plan を読む形式。target は final report metadata として main agent が後で付けるだけで Stage 2 prompt には含めない。
- 同じ sanitized diff + plan 本文のみ。Stage 1 findings summary は渡さない。
- plan を読まないと出せない指摘は `planOnly: true`（`source: plan-aware` のみ）。
- 要件欠落・過剰実装・逸脱・テスト不足を確認。

## Stage 3 — 事実の裏取り（任意・HITL 後）

採用/却下/要調査（対応可否）とは直交する **事実確認**。自動化は **`/review-verify`** に委譲する。

- HTML の「裏取りパケットを生成」→ パケットをコピー
- 対象リポジトリのセッションで「裏取りして」+ パケット貼付（または `/review-verify`）
- skill が verification → merge → HTML 再生成まで実行

手動で行う場合のみ:

```bash
deno run --allow-read --allow-write \
  .agents/skills/review-report/scripts/merge_verifications.ts \
  report.json verification.json -o report.json

deno run --allow-read --allow-write \
  .agents/skills/review-report/scripts/render_report.ts \
  report.json -o report.html
```

Prompt 雛形: [references/prompts.md](references/prompts.md) の Stage 3。

## 統合ルール（Stage 2 完了後、main agent）

- 両結果を main agent が統合。Stage 1 finding は「plan と整合する」という理由だけで削除しない。
- 最終 group risk は security/correctness、blast radius、irreversibility、uncertainty、test gaps を考慮し、二レビュアーの **高い方** を基本に main agent が決める。`riskScore` は同一 risk の tie-break のみ。
- グループ表示順: `critical > high > medium > low` → `riskScore` 降順 → 入力順。
- 各 changed hunk は（秘密除外を除き）**ちょうど1つの intent group** に所属。1 file に複数 intent があれば複数 group の `files` に出てよい。diff は論理/因果順で並べる。
- 重複 finding は root cause + impact + remediation が同じ場合だけ merge して `source: both`。単に同じ file だから merge しない。
- group intent を説明できなければ `needsImprovement: true` + `improvementReason`。diff explanation を説明できなければ diff も同様。
- lockfile/generated/binary を機械的に low と決めない。機械的 churn は要約するが、unexpected dependency/source/integrity/generator drift は high になり得る。省略・truncate は明示し、silent omission 禁止。

## JSON → HTML

Contract: [references/report-format.md](references/report-format.md)

```bash
deno run --allow-read --allow-write \
  .agents/skills/review-report/scripts/render_report.ts \
  report.json -o report.html

deno run --allow-read \
  .agents/skills/review-report/scripts/render_report.ts \
  report.json --validate-only
```

report artifact（JSON/HTML）は tracked source を汚さない **`$TMPDIR` 配下** に置くことを推奨。

Renderer は risk 安定ソート、findings severity ソート、`</script>` breakout 防止、localStorage（`reportId`）で human decisions/comments を復元。概要には Mermaid（CDN）で変更グループ↔指摘の関係図を自動描画し、任意の `diagrams[]` も追加表示する。`verifications[]` があれば finding に事実バッジを表示し、フィードバック Markdown にも併記する。ライトモード固定。

## Open

ブラウザで standalone HTML を開く（サーバー不要）:

```bash
open report.html          # macOS
xdg-open report.html      # Linux
```

cmux markdown ではなく **HTML ファイル** を直接開く。

## Edge cases

| Case | 扱い |
|------|------|
| plan 不在 | `plan.provided: false` で render 可。plan-only findings は Stage 2 を省略 |
| findings/diffs ゼロ | render 可 |
| 秘密ファイル | 収集段階で除外 |
| rename + imports | 同一グループ |
| lockfile 大量変更 | 要約可。unexpected drift は high になり得る |
| file:// clipboard | textarea + `execCommand('copy')` fallback 済み |

## 完了条件

- Stage 1/2 完了（plan なしなら Stage 2 スキップ可）
- `report.json` が contract を満たす（`--validate-only` 成功）
- HTML 生成・open 済み
- ユーザーが feedback を生成/コピーできる

## 関連

- `/parallel-review` — 通常サイズの並行レビュー（「レビューして」など plain review 依頼向け）
- `/review-verify` — 裏取りパケットの事実確認自動化（Stage 3）
- `hunk-review` — live Hunk session 操作（任意）
- `/cmux-markdown` — plan 表示（本 skill の HTML レポートとは別）
