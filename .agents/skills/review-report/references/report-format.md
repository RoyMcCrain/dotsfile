# Review report JSON

`render_report.ts` が受け取る入力 contract。Stage 0（受け入れ分析）と Stage
1/2（レビュー）の結果を同じ `report.json` に保持する。artifact は `$TMPDIR`
配下推奨で、`report.json` と `report.html` は同じディレクトリに置く。

## Report modes（相互排他）

各レポートは **ちょうど1つの mode** に属する。判定は次の順で行う:

| Mode                           | 判定条件                                                                                   | 必須フィールド                                                                 | 省略可                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **new acceptance-only**        | `intent` と `acceptance` が両方あり、かつ `review.performed === false`                     | `intent`, `acceptance`, `overview`, `groups[]`, `repository`（VCS 収集成功時） | group の `risk`, `riskReason`, `findings`       |
| **new reviewed**               | `intent` と `acceptance` が両方あり、かつ `review.performed === true`                      | 上記 + `review.overview`, group の `risk`, `riskReason`, `findings`            | —                                               |
| **legacy implementation-only** | `intent` と `acceptance` が両方欠落、かつ `review.performed === false`                     | `groups[]`                                                                     | `intent`, `acceptance`, group review フィールド |
| **legacy reviewed**            | `intent` と `acceptance` が両方欠落、かつ `review` 欠落または `review.performed !== false` | 従来の `groups[]` + review フィールド                                          | `intent`, `acceptance`                          |

- `intent` と `acceptance` は **両方あるか、両方ないか**。片方だけは invalid。
- 新規 `/implementation-report` は **new acceptance-only** を生成する。
- **legacy reviewed** は `review` フィールド欠落でも reviewed
  として扱う（互換）。
- top-level `groups` は実装とレビューで共有する。
- reviewed への enrich では `intent`, `acceptance`, `diagrams`, `overview`,
  `repository` と group の実装フィールドを変更せず、review
  フィールドだけ追加する。
- acceptance verdict は自動判定であり、人間の承認状態は JSON に保存しない。
  stored `acceptance.verdict` が checks/validations/extras から導出される値と
  一致しない場合は **validation error**。 review Stage 1/2
  は会話上の明示承認後にだけ開始する。
- `repository` は renderer 互換上 optional。新規生成では VCS 収集成功時に必須。

## Top-level fields

| Field            | Required    | Type   | Meaning                                                                                                                             |
| ---------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `reportId`       | no          | string | 欠落時は下記 algorithm で生成（review enrichment / repository 更新は identity に含めない）                                          |
| `title`          | no          | string | レポート見出し。acceptance assembler default: `"Implementation acceptance report"`。欠落時 renderer fallback: `"Large diff review"` |
| `target`         | no          | string | 対象 rev/range（例: `@`, `main..feature`）。欠落時 renderer は `""`                                                                 |
| `overview`       | no          | string | 実装全体の概要。欠落時も renderer は groups/diffs から集計サマリを表示                                                              |
| `intent`         | conditional | object | 凍結した依頼契約。new acceptance report では必須                                                                                    |
| `acceptance`     | conditional | object | 要件別適合判定、依頼外変更、検証結果、決定論的 verdict                                                                              |
| `review`         | no          | object | `{ "performed": bool, "overview": string }`                                                                                         |
| `diagrams`       | no          | array  | 期待 vs 実装 Mermaid 図。`{ id?, title?, mermaid, summary?, evidence? }`                                                            |
| `verifications`  | no          | array  | Stage 3 の finding 裏取り結果。review 後のみ                                                                                        |
| `initialComment` | no          | string | 全体コメント初期値                                                                                                                  |
| `plan`           | no          | object | `{ "provided": bool, "label": string }`                                                                                             |
| `repository`     | no*         | object | path/status のみの repository metadata。新規生成では収集成功時に必須                                                                |
| `groups`         | yes         | array  | 変更意図単位のグループ配列。空配列可                                                                                                |

### reportId algorithm

`reportId` 欠落時、renderer/assembler は次で生成する:

1. `title`, `target`, `overview`, `intent`, `acceptance`, `diagrams`, groups
   の実装フィールド（group
   id/title/intent/needsImprovement/improvementReason/files/diffs）
   だけを取り出す
2. キーをソートした **stable deterministic serialization**（`stableStringify`）
3. SHA-256 digest の **先頭16 hex 文字**
4. `review-report-${digest}` 形式

**含めない**: `repository`, review enrichment（`review`, `risk`, `findings`,
`verifications` 等）。

## Intent fields

| Field          | Required | Type             | Meaning                                                |
| -------------- | -------- | ---------------- | ------------------------------------------------------ |
| `summary`      | yes      | non-empty string | 依頼目的の要約。diff から逆算しない                    |
| `source`       | yes      | non-empty string | `current user request + plans/001.md` などの出典ラベル |
| `requirements` | yes      | non-empty array  | 凍結した要件一覧                                       |

各 requirement:

| Field         | Required | Type             | Meaning                            |
| ------------- | -------- | ---------------- | ---------------------------------- |
| `id`          | yes      | non-empty string | report 内で unique な安定 ID       |
| `title`       | yes      | non-empty string | 要件名                             |
| `description` | yes      | non-empty string | 判定可能な要件本文                 |
| `kind`        | yes      | enum             | `must` / `constraint` / `non-goal` |

## Acceptance fields

| Field         | Required | Type             | Meaning                                |
| ------------- | -------- | ---------------- | -------------------------------------- |
| `verdict`     | yes      | enum             | `pass` / `needs-confirmation` / `fail` |
| `summary`     | yes      | non-empty string | 適合性の全体所見                       |
| `checks`      | yes      | array            | intent requirement ごとに exactly 1件  |
| `extras`      | yes      | array            | 依頼外変更。空可                       |
| `validations` | yes      | array            | main agent が実行した決定論的検証結果  |

`validation.json` は main agent が **常に作成** する。実行できない検証は
`not-run` エントリと理由を記録する。`validations: []` は unvalidated 扱いで
`pass` にならない。

verdict は renderer/assembler が同じ規則で検算する（precedence 順）:

1. `fail`: check に valid な `missing` / `contradicted`、または validation に
   valid な `failed`
2. `needs-confirmation`: malformed/unknown check または validation
   要素/status、valid な `partial` / `unverified`、extras あり、valid な
   `not-run`、**validations が空**
3. `pass`: それ以外（全 check satisfied 相当かつ validation が 1件以上 passed）

stored `acceptance.verdict` が導出値と一致しない場合は validation error。

### Acceptance check fields

| Field           | Required | Type             | Meaning                                                                                  |
| --------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `requirementId` | yes      | string           | 既存 requirement ID。重複・未知 ID は error                                              |
| `status`        | yes      | enum             | `satisfied` / `partial` / `missing` / `contradicted` / `unverified`                      |
| `explanation`   | yes      | non-empty string | 判定理由                                                                                 |
| `evidence`      | yes      | array            | `file`, optional `location`, `explanation`。`missing` / `unverified` は空可、他は1件以上 |

`non-goal` requirement の判定:

- 実装していない（diff/evidence に該当変更なし）→ `satisfied`
- 実装している（依頼外に該当機能を追加/変更）→ `contradicted`

### Extra fields

`extras[]` は `title`, `explanation`, `files[]`。秘密 path は error。

### Validation fields

| Field     | Required | Type             | Meaning                                |
| --------- | -------- | ---------------- | -------------------------------------- |
| `command` | yes      | non-empty string | 実行した、または実行予定だったコマンド |
| `status`  | yes      | enum             | `passed` / `failed` / `not-run`        |
| `summary` | yes      | non-empty string | 簡潔な結果。巨大ログは含めない         |

### Diagram fields

`diagrams[]` は期待と実装の差を追うための図。`mermaid` は必須、`id`, `title`,
`summary`, `evidence: string[]` は optional。actual node/edge は patch または
`evidence.md` に根拠を持たせる。レポート生成フロー、変更ファイル一覧、推測した
未変更アーキテクチャは描かない。

- **new acceptance report**（`intent` + `acceptance` あり）: 最大 **2件**
- **legacy report**（`intent` / `acceptance` 欠落）: 件数制限なし（互換）

`diagrams[].evidence[]` は `file:line` 形式の string 配列（例:
`src/app.ts:10`）。path 部分は Secret path rejection と同一 policy（`.env:1`,
`secrets/token.txt:20`, `key.pem:L3` 等は拒否）。

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

\* reviewed = `review.performed === true` または `review` 欠落（legacy
reviewed）

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

Renderer レイアウト: Summary → 意図適合性（`intent` / `acceptance` あり時）→
Repository Map（HTML tree）→ 期待 vs 実装フロー（`diagrams` あり時）→ Change
Groups → Review Results。

Renderer は `title` / `overview` 欠落時に legacy fallback
（`"Large diff review"` / 空文字）を適用する。

## Secret path rejection

validation で拒否: `.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`,
`*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`（path component / suffix
ベース）。`monkey.ts` 等は許可。`diagrams[].evidence[]` の `file:line` 参照も
path 部分を正規化して同一 policy を適用する。

## Implementation-only minimal example

```json
{
  "reportId": "dotsfile-impl-abc123",
  "title": "Implementation acceptance report",
  "target": "@",
  "overview": "Auth client rename と import 追随を中心に、公開 API と呼び出し側を一括移行。",
  "intent": {
    "summary": "公開 Auth client を rename し、全 call site を移行する。",
    "source": "current user request + plans/001.md",
    "requirements": [
      {
        "id": "rename-auth-client",
        "title": "公開名と call site の移行",
        "description": "export と全 call site を新名称へ揃える。",
        "kind": "must"
      }
    ]
  },
  "acceptance": {
    "verdict": "pass",
    "summary": "公開名と call site は同時に移行され、検証も成功した。",
    "checks": [
      {
        "requirementId": "rename-auth-client",
        "status": "satisfied",
        "explanation": "export と利用側が同じ変更グループで更新されている。",
        "evidence": [
          {
            "file": "src/app.ts",
            "location": "L10-L18",
            "explanation": "新しい export 名を import している。"
          }
        ]
      }
    ],
    "extras": [],
    "validations": [
      {
        "command": "deno test -A tests",
        "status": "passed",
        "summary": "関連テスト成功。"
      }
    ]
  },
  "diagrams": [
    {
      "id": "auth-rename-flow",
      "title": "期待 vs 実装フロー",
      "summary": "公開名の変更から call site 移行までを比較。",
      "evidence": ["src/auth-client.ts:1", "src/app.ts:10"],
      "mermaid": "flowchart LR\n  subgraph 期待\n    E1[REQ rename] --> E2[全 call site 移行]\n  end\n  subgraph 実装\n    A1[src/auth-client.ts:1] --> A2[src/app.ts:10]\n  end"
    }
  ],
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

## Reviewed legacy example

以下は `intent` / `acceptance` 導入前の **legacy reviewed** 互換例。新規
acceptance report を review へ enrich する場合は、上の `intent`, `acceptance`,
`diagrams` と同一 `reportId` をそのまま保持し、review フィールドだけを追加する。

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
  `report.html` パス** を使う。review merge は `intent`, `acceptance`,
  `diagrams`, `overview`, group 実装フィールド、`repository`
  を上書きせず、review フィールドだけ追加する。
- `intent`, `acceptance`, `diagrams` は `reportId` identity に含む。review
  enrichment と `repository` 更新は `reportId` を変えない（localStorage 維持）。
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
