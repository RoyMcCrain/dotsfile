# Review report JSON

`render_report.ts` が受け取る入力 contract。agent が Stage 1/2 を統合したあと、この形で JSON を書き出す。report artifact は `$TMPDIR` 配下推奨。

## Top-level fields

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `reportId` | no | string | localStorage key。欠落時は renderer が reportId 以外の report 内容全体から deterministic hash（SHA-256 先頭16桁）を生成 |
| `title` | no | string | レポート見出し。default: `"Large diff review"` |
| `target` | no | string | レビュー対象 rev/range（例: `@`, `main..feature`） |
| `initialComment` | no | string | 全体コメント初期値（Hunk import 等）。HTML textarea に seed |
| `plan` | no | object | `{ "provided": bool, "label": string }`。plan 不在でも render 可 |
| `groups` | yes | array | 変更意図単位のグループ配列。空配列可 |

## Group fields

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `id` | yes | non-empty string | report 内で unique |
| `title` | yes | non-empty string | グループ見出し |
| `intent` | yes | non-empty string | 変更意図の要約 |
| `risk` | yes | enum | `critical` / `high` / `medium` / `low` |
| `riskScore` | no | number 0..100 | 同一 risk 内の tie-break。bool/NaN は error |
| `riskReason` | yes | non-empty string | risk 判定根拠 |
| `needsImprovement` | no | bool | intent 説明不能時 true |
| `improvementReason` | no | string | `needsImprovement=true` 時は non-empty 必須 |
| `initialComment` | no | string | グループコメント初期値（Hunk import 等） |
| `files` | yes | string[] | 関連ファイルパス（空可）。秘密 path は error |
| `diffs` | yes | array | snippet 配列（空可） |
| `findings` | yes | array | LLM 指摘配列（空可） |

表示順: `critical > high > medium > low`、同 risk は `riskScore` 降順、その後入力順。
各 group 内 findings: `critical > high > medium > low`、その後入力順。

## Diff snippet fields

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `file` | yes | non-empty string | ファイルパス。秘密 path は error |
| `location` | no | string | 行範囲など（例: `L10-L18`） |
| `explanation` | yes* | string | snippet 直上に表示する説明。*`needsImprovement=true` 時は省略可 |
| `patch` | no | string | unified diff 断片。truncate 時は explanation に明示。HTML では折りたたみ可能な行番号付き unified diff として表示し、全文表示/差分のみを切り替え可能 |
| `needsImprovement` | no | bool | true なら「要改善」ラベルで理由表示 |
| `improvementReason` | no | string | `needsImprovement=true` 時は non-empty 必須 |

## Finding fields

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `id` | yes | non-empty string | report 内で unique |
| `source` | yes | enum | `blind` / `plan-aware` / `both` |
| `severity` | yes | enum | `critical` / `high` / `medium` / `low` |
| `title` | yes | non-empty string | 指摘タイトル |
| `problem` | yes | non-empty string | 問題説明 |
| `evidence` | yes | non-empty string | 根拠 |
| `suggestion` | yes | non-empty string | 修正案 |
| `location` | no | string | ファイル:行 |
| `planOnly` | no | bool | true = plan を読まないと出せない指摘。`source=plan-aware` のみ |

human の `採用` / `却下` / `未判定` と group/global コメントは HTML + localStorage のみ。input JSON へ書き戻さない。

## Secret path rejection

validation で拒否: `.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`（path component / suffix ベース）。`monkey.ts` 等は許可。

## Minimal example

```json
{
  "reportId": "dotsfile-abc123",
  "title": "Large diff review",
  "target": "@",
  "initialComment": "Hunk: please verify auth migration",
  "plan": {"provided": true, "label": "plans/001.md"},
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

## Edge cases (agent が JSON 化する前に処理)

- **各 hunk**: 秘密除外を除きちょうど1 intent group に所属。1 file 複数 intent は複数 group 可
- **generated/binary/lockfile**: 機械的に low と決めない。unexpected drift は high になり得る
- **rename + import 追随**: 同一 intent グループ
- **横断変更**: 共通 intent で 1 グループ
- **巨大 diff**: patch を truncate し `explanation` で補う（silent omission 禁止）
- **findings 重複**: root cause + impact + remediation が同じ場合のみ `source: both`。Stage 1 指摘は plan-aware で説明できても自動削除しない
- **risk 決定**: 二レビュアーの高い方を基本。`riskScore` は tie-break のみ

## フィードバック Markdown の出力形式

「フィードバックを生成」は採用済み finding をフラットに連番化し、忖度対策の依頼文を先頭に置く:
- `## 依頼`: 「忖度なしで妥当かどうか精査してください」フレーミング（下流の追従を防ぐ）
- `### N. [重大|警告|注意|情報] title` + `場所 / 変更グループの意図 / 備考 / 指摘 / 根拠 / 改善案`
- `## コメント`: 人間のグループコメント・全体コメント
