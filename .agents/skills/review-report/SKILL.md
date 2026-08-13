---
name: review-report
description: 大規模差分を変更意図単位で二段階レビューし、standalone HTML レビューレポートを生成する。ユーザーが「レビューレポート作って」「レビューレポートを作成して」「レビューレポート生成して」などレビューレポートの作成を明示したとき MUST 使用する。既存の実装レポート（report.json）があれば同じ JSON/HTML にレビュー結果だけを追加する。通常の「レビューして」だけの依頼は /parallel-review にルーティングされ、この skill ではない。
metadata:
  target_agent: Cursor
---

# レビューレポート

大きな差分を **変更意図グループ** 単位でレビューし、human-in-the-loop 可能な
standalone HTML レビューレポートを出す skill。Pi では `/skill:review-report`
で明示呼び出しもできる。

実装レポート（`/implementation-report`）と **同じ `report.json` / `report.html`
ペア** を共有する。既存実装レポートがある場合はレビュー結果だけを merge し、同じ
`reportId` で HTML を再生成する。

## いつ使う

- 差分が file/hunk 順では追いにくい
- plan あり/なし両方の視点が欲しい
- 採用/却下/コメント付き feedback を元セッションへ貼りたい
- ユーザーが「レビューレポート作って」など **レビューレポートの作成** を依頼した
- 既存の実装レポートに **レビュー結果を追加** したい

**使わない**: 通常の「レビューして」だけの依頼 → `/parallel-review` を優先する。

## Preflight（read-only）

secret-safe patch と repository metadata は implementation-report の script
を使う。手順の再掲はしない。

1. **VCS**: リポジトリ root に `.jj` があれば git ではなく jj。
2. **秘密除外**:
   [../implementation-report/scripts/collect_sanitized_patch.sh](../implementation-report/scripts/collect_sanitized_patch.sh)
   で sanitized patch を直接生成する。詳細は
   [../implementation-report/references/preflight.md](../implementation-report/references/preflight.md)。
3. **plan**: ユーザー指定または作業中 plan ファイル。**Stage 1
   には一切渡さない**（main agent も Stage 1 前に plan
   を参照してグループ化しない）。
4. **Hunk（任意）**: live session があれば
   `hunk session comment list --repo . --type user` で人間コメントを import
   可能。group の `initialComment` または top-level `initialComment`
   にマッピングする。Hunk は必須ではない。
5. **ソース編集禁止**: この skill は review のみ。tracked ファイルを変更しない。
6. **既存レポート**: ユーザー指定の `report.json` / レポート dir
   が最優先。存在すれば `reportId`、`repository`、実装フィールド（`overview`,
   group `id/title/intent/files/diffs` 等）を **保持** し、review フィールドだけ
   merge する。
7. **repository metadata**: 新規作成時は
   [../implementation-report/scripts/collect_repository_metadata.ts](../implementation-report/scripts/collect_repository_metadata.ts)
   を Stage 0 **後** に呼ぶ（Stage 1/2 subagent には渡さない）。詳細は
   [../implementation-report/references/repository-metadata.md](../implementation-report/references/repository-metadata.md)。
   merge 時は既存 `repository` を **変更せず保持**。legacy report で
   `repository` が無い場合はそのまま省略可。

## ワークフロー

```text
A. 既存 report.json / レポート dir がある（implementation-only または legacy reviewed）
   1. preflight → collect_sanitized_patch.sh で sanitized patch を生成
   2. 既存 report.json を読み、reportId・`repository`・実装 overview・group id/title/intent/files/diffs を保持
   3. Stage 1 blind + Stage 2 plan-aware（plan あれば）— いずれも sanitized patch のみ（Stage 2 は +plan）。実装 summary / 既存 overview / 既存 group prose / repository metadata は reviewer に渡さない
   4. main agent が reviewer 出力を **既存 implementation group id** にマップし、risk/riskReason/findings と review.overview のみ merge（実装 prose/diffs / `repository` は上書きしない）
   5. review.performed=true、同一 report.json を上書き → render → 同一 report.html を open

B. 既存レポートがない
   1. まず implementation stage（Stage 0 — [../implementation-report/SKILL.md](../implementation-report/SKILL.md) と同手順）で report.json を作成（review.performed=false、VCS 収集成功時は `repository` 必須）
   2. 続けて A の Stage 1/2 + merge を同一 report.json / report.html ペアに対して実行
   3. 1 回の skill 実行で実装 + レビューの両セクションが見える HTML を出す
```

**禁止**:

- main agent が plan を知った状態で事前グループ/summary を作り Stage 1
  に渡すこと。Stage 1 は raw sanitized diff から intent grouping する。
- blind / plan-aware reviewer に **実装 summary・既存 overview・既存 group
  intent/diffs・repository metadata** を見せること（anchoring 回避）。reviewer
  入力は patch-only（Stage 2 は +plan 本文のみ）。

裏取りの自動化手順は別 skill:
[../review-verify/SKILL.md](../review-verify/SKILL.md)。

## Stage 1 — blind 隔離

- **fresh subagent**。入力は **sanitized diff のみ**。revision
  label、target、commit message、plan（ファイル名・パス・本文）、repo
  instructions、source tree、**repository metadata**、**実装 summary / 既存
  report overview** を prompt に含めない。
- **必須**: repo 外の新規 temp directory（例:
  `$TMPDIR/review-report-blind-$$`）を使い、reviewer 起動前は `sanitized.patch`
  と `prompt.txt` だけ置く。起動後の `result.json` / log は同 dir
  に出力してよい。prompt は同 dir の `sanitized.patch` を読む形式（巨大 diff を
  inline しない）。reviewer の working directory / workspace も temp dir
  に固定。repo source は見せない。
- 出力: report contract に沿った **valid JSON**（少なくとも `groups` array）。各
  group に intent、risk、diff explanation、findings（`source: blind`）。
- 既定 reviewer は role `review.cursor`、timeout 180秒。`review.codex` /
  `review.claude` は fallback。Fugu（`review.fugu`）は quota
  制限があるため明示時だけ使い、自動再試行しない。実モデル ID は
  `~/.pi/agent/model-roles.json` が単一の正。

Prompt template: [references/prompts.md](references/prompts.md)

## Stage 2 — plan-aware

- **別 fresh subagent**。Stage 1 の会話・findings
  は引き継がない（anchoring/忖度回避）。
- blind と **完全に別 temp dir** に
  `sanitized.patch`、`plan-body.md`、`prompt.txt` を置く。prompt は同 dir の
  patch / plan を読む形式。target は final report metadata として main agent
  が後で付けるだけで Stage 2 prompt には含めない。**実装 summary / 既存 overview
  も含めない**。
- 同じ sanitized diff + plan 本文のみ。Stage 1 findings summary は渡さない。
- plan を読まないと出せない指摘は `planOnly: true`（`source: plan-aware`
  のみ）。
- 要件欠落・過剰実装・逸脱・テスト不足を確認。
- Stage 1 と独立しているため、plan がある場合は待たずに並行起動する。timeout
  180秒。

## Stage 3 — 事実の裏取り（任意・HITL 後）

採用/却下/要調査（対応可否）とは直交する **事実確認**。自動化は
**`/review-verify`** に委譲する。

- HTML の「裏取りパケットを生成」→ パケットをコピー
- 対象リポジトリのセッションで「裏取りして」+ パケット貼付（または
  `/review-verify`）
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

### 既存実装レポートがある場合（merge）

- **保持**: `reportId`, `repository`, top-level `overview`（実装）, 各 group の
  `id`, `title`, `intent`, `files`, `diffs`, `initialComment`,
  `needsImprovement` 等の実装フィールド
- **merge のみ**: `review.performed=true`, `review.overview`, 各 group の
  `risk`, `riskScore`, `riskReason`, `findings`
- reviewer が返した group id は **既存 implementation group id へのマップ**
  に使う。title/intent/files/diffs の実装 prose を reviewer 出力で上書きしない
- id が一意に対応づかない場合は main agent が file/hunk
  所属でマップし、対応不能な reviewer-only group は新規 id 追加ではなく findings
  を最も近い既存 group へ寄せる

### 新規（legacy フルレビュー）または reviewer-only 統合

- 両結果を main agent が統合。Stage 1 finding は「plan
  と整合する」という理由だけで削除しない。
- 最終 group risk は security/correctness、blast
  radius、irreversibility、uncertainty、test gaps を考慮し、二レビュアーの
  **高い方** を基本に main agent が決める。`riskScore` は同一 risk の tie-break
  のみ。
- ただし severity/risk は **その指摘固有の実害** で判断し、周辺機能の重大さ（例:
  削除フロー＝不可逆）を機械的に継承しない。既存の緩和策（操作が完走/ロールバック、toast
  等で別経路のフィードバックが残る、ボタン disabled 済み
  等）と到達性・発生頻度を織り込み **過大評価を避ける**。irreversibility 等の
  risk
  要因は指摘の欠陥自体に本当に当てはまる時だけ加点する。二レビュアーの高い方を採る前に、その
  severity が固有実害に見合うか main agent が検算する。
- グループ表示順: `critical > high > medium > low` → `riskScore` 降順 → 入力順。
- 各 changed hunk は（秘密除外を除き）**ちょうど1つの intent group** に所属。1
  file に複数 intent があれば複数 group の `files` に出てよい。diff
  は論理/因果順で並べる。
- 重複 finding は root cause + impact + remediation が同じ場合だけ merge して
  `source: both`。単に同じ file だから merge しない。
- group intent を説明できなければ `needsImprovement: true` +
  `improvementReason`。diff explanation を説明できなければ diff も同様。
- lockfile/generated/binary を機械的に low と決めない。機械的 churn
  は要約するが、unexpected dependency/source/integrity/generator drift は high
  になり得る。省略・truncate は明示し、silent omission 禁止。

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

report artifact（JSON/HTML）は tracked source を汚さない **`$TMPDIR` 配下**
に置くことを推奨。`report.json` と `report.html` は **同じディレクトリ**
に置く。

Renderer レイアウト: **Summary → Repository Map → Implementation
Flow（Mermaid）→ Change Groups → Review Results**。Repository Map は
`repository` の HTML ツリー（group 所属・change status）。`repository` 欠落は
legacy / degraded fallback のみ（Map 非表示、他は通常 render）。Mermaid
はプロセス/関係図（既存 CDN runtime / fallback 維持）。diff
は折りたたみ詳細。`repository` 欠落 legacy は Map 非表示で他は通常 render。

その他: risk 安定ソート、findings severity ソート、`</script>` breakout
防止、localStorage（`reportId`）で human decisions/comments
を復元。Implementation Flow はレポート生成段階を、Review Results
は変更グループ↔指摘の関係を Mermaid で描画し、任意の `diagrams[]`
も追加表示。`verifications[]` があれば finding
に事実バッジを表示し、フィードバック Markdown にも併記。`repository` は
`reportId` 生成に含めない。ライトモード固定。

## Open

ブラウザで standalone HTML を開く（サーバー不要）:

```bash
open report.html          # macOS
xdg-open report.html      # Linux
```

cmux markdown ではなく **HTML ファイル** を直接開く。

## Edge cases

| Case                                   | 扱い                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 既存 implementation-only report        | 実装フィールド保持、review merge のみ                                                                    |
| `review` フィールド欠落（legacy）      | reviewed として扱う（renderer 互換）                                                                     |
| plan 不在                              | `plan.provided: false` で render 可。plan-only findings は Stage 2 を省略                                |
| findings/diffs ゼロ                    | render 可                                                                                                |
| 秘密ファイル                           | 収集段階で除外                                                                                           |
| rename + imports                       | 同一グループ                                                                                             |
| lockfile 大量変更                      | 要約可。unexpected drift は high になり得る                                                              |
| file:// clipboard                      | textarea + `execCommand('copy')` fallback 済み                                                           |
| `repository` 省略（legacy / degraded） | legacy report または収集失敗時の明示 degraded fallback。Repository Map 非表示。他セクションは通常 render |

## 完了条件

- 既存レポートがなければ Stage 0（implementation）+ Stage 1/2 完了（plan
  なしなら Stage 2 スキップ可）
- 既存レポートがあれば Stage 1/2 完了 + merge 成功
- `report.json` が contract を満たす（reviewed なら
  `review.performed: true`、`--validate-only` 成功）
- HTML 生成・open 済み
- HTML レイアウト: Summary → Repository Map（`repository` あり時）→
  Implementation Flow（Mermaid）→ Change Groups → Review Results
- **実装セクションとレビューセクションの両方** が HTML に表示される（reviewed
  レポート）
- merge 後も `repository` が保持されている（付与済みの場合）
- ユーザーが feedback を生成/コピーできる

## 関連

- `/implementation-report` —
  実装のみレポート（review.performed=false）。後段で本 skill が同じ JSON/HTML
  を更新
- `/parallel-review` — 通常サイズの並行レビュー（「レビューして」など plain
  review 依頼向け）
- `/review-verify` — 裏取りパケットの事実確認自動化（Stage
  3）。**レビュー完了後のみ**
- `hunk-review` — live Hunk session 操作（任意）
- `/cmux-markdown` — plan 表示（本 skill の HTML レポートとは別）
