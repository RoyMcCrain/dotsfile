# Review report JSON

`render_report.ts` が受け取る入力 contract。agent が Stage 0（実装）および Stage
1/2（レビュー）を統合したあと、この形で JSON を書き出す。report artifact は
`$TMPDIR` 配下推奨。`report.json` と `report.html` は同じディレクトリに置く。

## Report modes（条件付き contract）

| Mode                    | 判定                                                       | 必須フィールド                                                           | 省略可                                                           |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **implementation-only** | `review.performed === false`                               | `overview`, `groups[]`（実装フィールド）, `repository`（VCS 収集成功時） | group の `risk`, `riskReason`, `findings`（reviewed フィールド） |
| **reviewed**            | `review.performed === true` または `review` 欠落（legacy） | 上記 + `review.overview`, group の `risk`, `riskReason`, `findings`      | —                                                                |

- **top-level `groups` は常に共有**。実装とレビューで別配列にしない。
- **`review: { "performed": false, "overview": "" }` を明示** =
  実装のみレポート（`/implementation-report`）。
- **`review` 欠落** = legacy reviewed レポート（後方互換。reviewed として
  render）。
- **reviewed** では `review.performed: true` と `review.overview` を設定し、各
  group に `risk`, `riskReason`, `findings` を enrich
  する。実装フィールド（`intent`, `files`, `diffs` 等）は保持する。
- **`repository` は renderer contract 上 optional**（legacy / degraded fallback
  互換）。**新規生成では VCS 収集成功時に必須**。path/status のみ。subagent
  には渡さない。

## Top-level fields

| Field            | Required | Type   | Meaning                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportId`       | no       | string | localStorage key。欠落時は renderer が実装フィールド（title / target / overview / diagrams / group の id / title / intent / files / diffs 等）だけから deterministic hash（SHA-256 先頭16桁）を生成。**`repository` は含めない**（tree 更新で localStorage がずれない）。review / plan / verifications / risk / findings / review comment の追記でも変化しない |
| `title`          | no       | string | レポート見出し。default: `"Large diff review"`                                                                                                                                                                                                                                                                                                                 |
| `target`         | no       | string | レビュー対象 rev/range（例: `@`, `main..feature`）                                                                                                                                                                                                                                                                                                             |
| `overview`       | no       | string | **実装**全体の概要。欠落時も groups/diffs から自動集計サマリを表示                                                                                                                                                                                                                                                                                             |
| `review`         | no       | object | `{ "performed": bool, "overview": string }`。`performed: false` = 実装のみ。`performed: true` = レビュー完了                                                                                                                                                                                                                                                   |
| `diagrams`       | no       | array  | 追加 Mermaid 図。`{ id?, title?, mermaid }`。Implementation Flow セクションに groups/findings から自動生成した関係図も表示（reviewed 時）                                                                                                                                                                                                                      |
| `verifications`  | no       | array  | Stage 3 裏取り結果。`{ findingId, verdict, summary, evidence }`。finding ごとに最大1件。**review 後のみ**                                                                                                                                                                                                                                                      |
| `initialComment` | no       | string | 全体コメント初期値（Hunk import 等）。HTML textarea に seed                                                                                                                                                                                                                                                                                                    |
| `plan`           | no       | object | `{ "provided": bool, "label": string }`。plan 不在でも render 可                                                                                                                                                                                                                                                                                               |
| `repository`     | no*      | object | リポジトリツリーメタデータ（renderer 互換のため optional）。**新規生成では VCS 収集成功時に必須**。省略は legacy / degraded fallback のみ。ファイル内容は含まない。implementation-analysis / review subagent には渡さない。main agent が Stage 0 完了後に VCS コマンドだけで決定論的収集                                                                       |
| `groups`         | yes      | array  | 変更意図単位のグループ配列。空配列可                                                                                                                                                                                                                                                                                                                           |

## Group fields

| Field               | Required  | Type             | Meaning                                                                        |
| ------------------- | --------- | ---------------- | ------------------------------------------------------------------------------ |
| `id`                | yes       | non-empty string | report 内で unique。**実装 stage で安定化**し、review merge 時も同一 id を使う |
| `title`             | yes       | non-empty string | グループ見出し                                                                 |
| `intent`            | yes       | non-empty string | 変更意図の要約                                                                 |
| `risk`              | reviewed* | enum             | `critical` / `high` / `medium` / `low`。implementation-only では省略可         |
| `riskScore`         | no        | number 0..100    | 同一 risk 内の tie-break。bool/NaN は error                                    |
| `riskReason`        | reviewed* | non-empty string | risk 判定根拠。implementation-only では省略可                                  |
| `needsImprovement`  | no        | bool             | intent 説明不能時 true                                                         |
| `improvementReason` | no        | string           | `needsImprovement=true` 時は non-empty 必須                                    |
| `initialComment`    | no        | string           | グループコメント初期値（Hunk import 等）                                       |
| `files`             | yes       | string[]         | 関連ファイルパス（空可）。秘密 path は error                                   |
| `diffs`             | yes       | array            | snippet 配列（空可）                                                           |
| `findings`          | reviewed* | array            | LLM 指摘配列（空可）。implementation-only では省略可                           |

\* reviewed = `review.performed === true` または `review` 欠落（legacy）

表示順: `critical > high > medium > low`、同 risk は `riskScore`
降順、その後入力順。 各 group 内 findings:
`critical > high > medium > low`、その後入力順。

## Diff snippet fields

| Field               | Required | Type             | Meaning                                                                                                                                             |
| ------------------- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`              | yes      | non-empty string | ファイルパス。秘密 path は error                                                                                                                    |
| `location`          | no       | string           | 行範囲など（例: `L10-L18`）                                                                                                                         |
| `explanation`       | yes*     | string           | snippet 直上に表示する説明。*`needsImprovement=true` 時は省略可                                                                                     |
| `patch`             | no       | string           | unified diff 断片。truncate 時は explanation に明示。HTML では折りたたみ可能な行番号付き unified diff として表示し、全文表示/差分のみを切り替え可能 |
| `needsImprovement`  | no       | bool             | true なら「要改善」ラベルで理由表示                                                                                                                 |
| `improvementReason` | no       | string           | `needsImprovement=true` 時は non-empty 必須                                                                                                         |

## Finding fields

| Field        | Required | Type             | Meaning                                                        |
| ------------ | -------- | ---------------- | -------------------------------------------------------------- |
| `id`         | yes      | non-empty string | report 内で unique                                             |
| `source`     | yes      | enum             | `blind` / `plan-aware` / `both`                                |
| `severity`   | yes      | enum             | `critical` / `high` / `medium` / `low`                         |
| `title`      | yes      | non-empty string | 指摘タイトル                                                   |
| `problem`    | yes      | non-empty string | 問題説明                                                       |
| `evidence`   | yes      | non-empty string | 根拠                                                           |
| `suggestion` | yes      | non-empty string | 修正案                                                         |
| `location`   | no       | string           | ファイル:行                                                    |
| `planOnly`   | no       | bool             | true = plan を読まないと出せない指摘。`source=plan-aware` のみ |

human の `採用` / `要調査` / `却下` / `未判定` と group/global コメントは HTML +
localStorage のみ。input JSON へ書き戻さない。

## Verification fields（Stage 3）

| Field       | Required | Type             | Meaning                                                   |
| ----------- | -------- | ---------------- | --------------------------------------------------------- |
| `findingId` | yes      | string           | 既存 finding `id`                                         |
| `verdict`   | yes      | enum             | `confirmed` / `contradicted` / `partial` / `inconclusive` |
| `summary`   | yes      | non-empty string | 1〜2文の結論                                              |
| `evidence`  | yes      | non-empty string | 確認に使ったファイル:行・コマンド・観察                   |

同一 `findingId` の重複は error。未知の `findingId` も error。

## Repository metadata

optional top-level `repository`（renderer contract）。path/status のみで
**ファイル内容は含めない**。main agent の orchestration
で決定論的収集（LLM/subagent 不使用）。Stage 0 / Stage 1 / Stage 2
の入力には含めない（**Stage 0 は repository metadata を受け取らない**）。

**新規生成**: VCS metadata 収集成功時は `repository`
を必ず含める。**収集失敗時のみ** `repository` 省略可（degraded
fallback）。その場合はユーザーへ理由を明示し、Repository Map
非表示になることを伝える。

収集（unsanitized patch を作らない）:

- jj: `jj file list` + secret 除外済み changed paths / `jj diff --summary`
- git fallback: `git ls-files` + `git diff --name-status`

`groups[].files` と path を突合し、renderer の Repository Map で group
所属を表示。review merge 時は `repository` を **変更せず保持**。

### Repository fields

| Field          | Required | Type             | Meaning                                                  |
| -------------- | -------- | ---------------- | -------------------------------------------------------- |
| `name`         | yes*     | non-empty string | リポジトリ名                                             |
| `trackedFiles` | yes*     | string[]         | tracked path 一覧（unique、non-empty、secret path 除外） |
| `changes`      | yes*     | array            | 変更 path 一覧（secret 除外済み allowed paths 由来）     |

\* `repository` オブジェクトが存在する場合は必須。

### Change entry fields

| Field          | Required | Type             | Meaning                                      |
| -------------- | -------- | ---------------- | -------------------------------------------- |
| `path`         | yes      | non-empty string | 変更 path（unique、secret path 除外）        |
| `status`       | yes      | enum             | `added` / `modified` / `deleted` / `renamed` |
| `previousPath` | renamed* | non-empty string | `status: renamed` 時必須。secret path 除外   |

\* renamed 時必須。`deleted` の path は `trackedFiles` に無くてよい。

### Validation

- `repository` 省略 = legacy / degraded fallback（Repository Map 非表示、他は
  render 可）
- `repository` あり → `name`, `trackedFiles`, `changes` 必須
- 全 path: non-empty、unique、Secret path rejection と同一 policy
- `status: renamed` → `previousPath` 必須

Renderer レイアウト: Summary → Repository Map（HTML tree）→ Implementation
Flow（Mermaid）→ Change Groups → Review Results。

## Secret path rejection

validation で拒否: `.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`,
`*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`（path component / suffix
ベース）。`monkey.ts` 等は許可。

## Implementation-only minimal example

```json
{
  "reportId": "dotsfile-impl-abc123",
  "title": "Large diff implementation",
  "target": "@",
  "overview": "Auth client rename と import 追随を中心に、公開 API と呼び出し側を一括移行。",
  "review": {
    "performed": false,
    "overview": ""
  },
  "plan": { "provided": true, "label": "plans/001.md" },
  "repository": {
    "name": "dotsfile",
    "trackedFiles": ["src/auth-client.ts", "src/app.ts", "src/util.ts"],
    "changes": [
      { "path": "src/auth-client.ts", "status": "modified" },
      { "path": "src/app.ts", "status": "modified" }
    ]
  },
  "groups": [
    {
      "id": "rename-auth-client",
      "title": "Auth client rename and import migration",
      "intent": "Public name and all call sites are migrated together.",
      "needsImprovement": false,
      "files": ["src/auth-client.ts", "src/app.ts"],
      "diffs": [
        {
          "file": "src/app.ts",
          "location": "L10-L18",
          "explanation": "Updates the import and call site for the rename.",
          "patch": "@@ ...",
          "needsImprovement": false
        }
      ]
    }
  ]
}
```

## Reviewed example（同一 reportId・同一 groups に review enrich）

```json
{
  "reportId": "dotsfile-impl-abc123",
  "title": "Large diff review",
  "target": "@",
  "overview": "Auth client rename と import 追随を中心に、公開 API と呼び出し側を一括移行。",
  "review": {
    "performed": true,
    "overview": "Auth client rename と plan 上のテスト要件を中心に検証。"
  },
  "diagrams": [
    {
      "id": "auth-flow",
      "title": "想定コールフロー",
      "mermaid": "flowchart LR\\n  A[Caller] --> B[auth-client]\\n  B --> C[API]"
    }
  ],
  "initialComment": "Hunk: please verify auth migration",
  "plan": { "provided": true, "label": "plans/001.md" },
  "repository": {
    "name": "dotsfile",
    "trackedFiles": [
      "src/auth-client.ts",
      "src/app.ts",
      "tests/auth-client.test.ts"
    ],
    "changes": [
      {
        "path": "src/auth-client.ts",
        "status": "renamed",
        "previousPath": "src/old-auth.ts"
      },
      { "path": "src/app.ts", "status": "modified" }
    ]
  },
  "groups": [
    {
      "id": "rename-auth-client",
      "title": "Auth client rename and import migration",
      "intent": "Public name and all call sites are migrated together.",
      "risk": "high",
      "riskScore": 82,
      "riskReason": "Cross-package API rename with blast radius across callers.",
      "needsImprovement": false,
      "files": ["src/auth-client.ts", "src/app.ts"],
      "initialComment": "src/app.ts:16 — check dynamic import",
      "diffs": [
        {
          "file": "src/app.ts",
          "location": "L10-L18",
          "explanation": "Updates the import and call site for the rename.",
          "patch": "@@ ...",
          "needsImprovement": false
        }
      ],
      "findings": [
        {
          "id": "f-1",
          "source": "blind",
          "severity": "high",
          "title": "Old runtime lookup remains",
          "location": "src/app.ts:16",
          "problem": "Dynamic lookup still references the old export name.",
          "evidence": "String literal oldAuthClient in runtime resolver.",
          "suggestion": "Rename runtime lookup key to match new export.",
          "planOnly": false
        },
        {
          "id": "f-2",
          "source": "plan-aware",
          "severity": "medium",
          "title": "Plan test gap",
          "location": "tests/auth-client.test.ts",
          "problem": "Plan requires migration test but none added.",
          "evidence": "Plan section 3.2 lists required integration test.",
          "suggestion": "Add integration test covering renamed export.",
          "planOnly": true
        }
      ]
    }
  ]
}
```

## Migration note

- **legacy reviewed レポート**（`review` フィールドなし）は引き続き reviewed
  として render する。新規作成では `review.performed: true` を明示すること。
- **実装 → レビュー** の 2 段階では **同じ `reportId` と同じ `report.json` /
  `report.html` パス** を使う。review merge は実装フィールドと `repository`
  を上書きせず、review フィールドだけ追加する。
- `repository` の tree 更新は `reportId` を変えない（localStorage 維持）。
- implementation-only から reviewed へ進む際、group `id` は Stage 0
  で確定した値を維持する（reviewer 出力は id マップにのみ使う）。

## Edge cases (agent が JSON 化する前に処理)

- **各 hunk**: 秘密除外を除きちょうど1 intent group に所属。1 file 複数 intent
  は複数 group 可
- **generated/binary/lockfile**: 機械的に low と決めない。unexpected drift は
  high になり得る
- **rename + import 追随**: 同一 intent グループ
- **横断変更**: 共通 intent で 1 グループ
- **巨大 diff**: patch を truncate し `explanation` で補う（silent omission
  禁止）
- **findings 重複**: root cause + impact + remediation が同じ場合のみ
  `source: both`。Stage 1 指摘は plan-aware で説明できても自動削除しない
- **risk 決定**: 二レビュアーの高い方を基本。`riskScore` は tie-break のみ

## フィードバック Markdown の出力形式

「フィードバックを生成」は採用済み finding
をフラットに連番化し、忖度対策の依頼文を先頭に置く:

- `## 依頼`:
  「忖度なしで妥当かどうか精査してください」フレーミング（下流の追従を防ぐ）
- `## 指摘`: 採用済みのみ（実装対象）
- `## 要調査`: 要調査指定（実装せず調査のみ）
- `### N. [重大|警告|注意|情報] title` +
  `場所 / 変更グループの意図 / 備考 / 裏取り / 指摘 / 根拠 / 改善案`
- `## コメント`: 人間のグループコメント・全体コメント

「裏取りパケットを生成」は別
JSON（`packetType: verification-request`）を出す。採用状態は含めず、Stage 3
に渡す。既定スコープは `採用 + 要調査 + 未判定`。
