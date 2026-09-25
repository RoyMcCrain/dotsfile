# Parallel-review provenance and adoption history

ローカル専用の実行記録と採用判断スナップショット。リポジトリ外 `${XDG_DATA_HOME:-$HOME/.local/share}/parallel-review/runs/` に保存する（ディレクトリ `0700`、ファイル `0600`）。アップロード・テレメトリなし。

## ディレクトリレイアウト

```text
<run-dir>/
  metadata.json          # 不変: runId, createdAt, repository, revision, level
  changes.patch          # 共有 benchmark（全 reviewer 同一）
  prompt.md
  reviewers.tsv          # 解決済み reviewer 一覧（1 run 1 回）
  logs/
    <execution-id>.stdout.log
    <execution-id>.stderr.log
  executions/
    <execution-id>.json  # 実行メタデータ（開始前 running → 完了後 exitCode）
  chunks/                # 分割時のみ
    chunk-001.patch
  assessment.json        # 統合エージェントが書く作業用（save 入力）
  snapshots/
    <timestamp>-<uuid>.json  # append-only 採用判断スナップショット
```

## コマンド

```bash
HISTORY="$HOME/.agents/skills/parallel-review/scripts/review_history.ts"
LEVEL="${LEVEL:-2}"
: "${REVISION:?REVISION is required}"

# patch preflight より前
umask 077
REVIEW_DIR=$(deno run --no-config --allow-read --allow-write \
	--allow-env=HOME,XDG_DATA_HOME "$HISTORY" init \
	--repository "$PWD" --revision "$REVISION" --level "$LEVEL") || exit 1

# 統合完了後（必須）
SNAPSHOT=$(deno run --no-config --allow-read --allow-write "$HISTORY" save \
	--dir "$REVIEW_DIR" --input "$REVIEW_DIR/assessment.json") || exit 1
```

SKILL.md の統合節から `$REVIEW_DIR/assessment.json` を書き、上記 save で永続化する。

## execution ID

`<chunk-id>-<reviewer-seq>`。例: `whole-r01`（単一 chunk）、`c001-r03`（chunk 001、3 番目 reviewer）。`[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}`。provider 名だけでは衝突するため、chunk + reviewer 順序で一意化する。

## executions/<id>.json

| フィールド | 必須 | 制約 |
|-----------|------|------|
| `id` | ✓ | safe id（上記 regex） |
| `backend` | ✓ | `pi` または `agy` |
| `model` | ✓ | 解決済みモデル ID（effort 含む完全文字列） |
| `chunk` | ✓ | run dir 相対パス（`changes.patch` または `chunks/...`）。`..` 禁止 |
| `timeout` / `retryTimeout` | ✓ | JSON number の有限正数（秒）。`true` / 文字列 / 配列は不可 |
| `maxAttempts` | ✓ | JSON number の正整数（設定上 2） |
| `status` | ✓ | `pending` → `running` → `completed` |
| `startedAt` | ✓ | ISO-8601 UTC（`YYYY-MM-DDTHH:MM:SS.000Z`） |
| `endedAt` | completed のみ | ISO-8601 UTC。`startedAt` 以上。`pending`/`running` では不可 |
| `exitCode` | completed のみ | JSON number の整数 0–255。`pending`/`running` では不可 |
| `stdoutLog` / `stderrLog` | ✓ | run dir 相対ログパス |

`status=completed` は `endedAt` と `exitCode` の両方が必要。`running`/`pending` は final フィールドを持てない。timeout は `124`。

完了済み execution の record とファイル SHA-256 は後続 snapshot で不変。未完了なら `pending` → `running` → `completed`（`pending` → `completed` も可）へ進める。逆戻りは不可。

中断された run も `running` / 未完了 `exitCode` として残る。未完了であって「指摘なし」ではない。

## metadata.json

| フィールド | 必須 | 制約 |
|-----------|------|------|
| `schemaVersion` | ✓ | 現在 `1` |
| `runId` | ✓ | UUID |
| `createdAt` | ✓ | ミリ秒精度の ISO-8601 UTC（`YYYY-MM-DDTHH:MM:SS.sssZ`） |
| `repository` | ✓ | 非空文字列 |
| `revision` | ✓ | 非空文字列（concrete VCS ターゲット: commit hash または `<baseCommit>..<headCommit>`） |
| `level` | ✓ | JSON number または CLI 文字列リテラル `1` / `2` / `3` のみ |

run 作成後は不変（`runId` / `createdAt` / `repository` / `revision` / `level` を含む metadata 全体）。snapshot 間で patch/prompt の SHA-256 も不変。未完了 execution の identity と chunk hash は固定し、出力途中の stdout/stderr hash は変化を許す。完了後は record 全体とファイル hash が不変。

## assessment.json / snapshot

統合エージェント（または人間）が reviewer 出力を読んで書く。reviewer には渡さない（アンカリング防止）。save 時は **全 execution を exactly once レビュー**する必要がある（空 executions は拒否）。

```json
{
  "actor": { "kind": "agent", "id": "provider/caller-model:effort" },
  "reviews": [
    {
      "executionId": "whole-r01",
      "verdict": "findings",
      "findings": [
        {
          "id": "f1",
          "issueKey": "auth-null-token",
          "severity": "high",
          "location": "src/auth.ts:42",
          "original": "Missing null check on token",
          "decision": "accepted",
          "reason": "Confirmed in source",
          "verification": "confirmed",
          "evidence": "token can be undefined at line 42",
          "action": "unknown"
        }
      ]
    },
    {
      "executionId": "whole-r02",
      "verdict": "unavailable",
      "findings": []
    }
  ]
}
```

`actor.id` は `provider/caller-model:effort` 形式を推奨（hardcoded catalog model 名を仮定しない）。

### actor

| フィールド | 必須 | 値 |
|-----------|------|-----|
| `kind` | ✓ | `agent` または `human` |
| `id` | ✓ | safe id |

### verdict

| verdict | 条件 |
|---------|------|
| `no_findings` | runner 成功（`exitCode === 0`）かつ prose を「重大な問題なし」と安全に解釈。正規化 finding 0 件 |
| `findings` | runner 成功かつ 1 件以上の指摘を正規化 |
| `unparsed` | runner 成功だが prose を安全に正規化できない |
| `unavailable` | `pending` / `running` / 非 zero `exitCode` |

`no_findings` は **成功した execution で finding が 0 件**という意味。runner 失敗・中断と混同しない。`unparsed` は「指摘なし」と数えない。

### findings フィールド

| フィールド | 必須 | 制約 |
|-----------|------|------|
| `id` | ✓ | safe id。execution 内で一意 |
| `issueKey` | ✓ | safe id。chunk/model を跨いだ同一 issue の安定キー。**不変** |
| `severity` | ✓ | `high` / `medium` / `low`。**不変** |
| `location` | ✓ | 非空（例: `src/auth.ts:42`）。**不変** |
| `original` | ✓ | reviewer 原文。**不変** |
| `decision` | ✓ | `accepted` / `rejected` / `deferred` / `pending` |
| `reason` | decision ≠ `pending` で必須 | 非空 |
| `verification` | 任意 | `confirmed` / `contradicted` / `inconclusive` / `not_checked` |
| `evidence` | `confirmed`/`contradicted` で必須 | 非空 |
| `action` | 任意 | `fixed` / `not_fixed` / `unknown` |
| `actionEvidence` | `action=fixed` で必須 | 非空 |

**不変 identity**: 一度 snapshot に現れた finding は削除不可。`original` / `issueKey` / `severity` / `location` / execution/finding ID は変更不可。後続 snapshot では `decision` / `reason` / `verification` / `evidence` / `action` / `actionEvidence` / `actor` の更新のみ。新規 finding の追加（例: 後から unparsed を正規化）は可。

拒否・延期・ pending の finding もすべて残す。同一 `issueKey` で attribution を保ち、重複を新 issue として捨てない。

## 評価時の注意

- **accepted ≠ 正しさ**。採用判断と verification は独立。
- **unverified ≠ false**。`not_checked` は「未検証」。
- **no_findings = runner 成功 + 0 finding**。timeout / 失敗 / 中断は `unavailable`。
- モデル比較は `model` + `level` + patch/prompt の SHA-256 でグループ化。catalog 変更後も snapshot 内 hash で再現可能。
- **agent vs human**: `actor.kind` で区別。人間承認を捏造しない。
- **retry**: `maxAttempts=2` は設定上限のみ。stdout/stderr に混在する attempt は分離不可。
- **snapshot 選択**: 1 run あたりミリ秒精度の `savedAt` が最新の snapshot を 1 回だけ使う（ファイル名だけでは同一秒内の順序が保証されない）。同一 run への save は順次実行し、同時書き込みしない。過去 snapshot を追加 review として二重カウントしない。
- 自動削除・モデルランキング調整は行わない。

## jq 例: モデル別 execution / 指摘数

execution 件数と distinct issueKey を数える。同一 model+issueKey が複数 chunk に現れても 1 issue として数える。

```bash
SNAPSHOT=$(jq -nr '[inputs | {path: input_filename, savedAt}] | max_by(.savedAt) | .path' "$RUN_DIR"/snapshots/*.json)

jq -r '
  .executions as $execs |
  [.reviews[] | . as $r |
    ($execs[] | select(.id == $r.executionId)) as $e |
    {model: $e.model, verdict: $r.verdict,
     issueKeys: [$r.findings[].issueKey] | unique,
     acceptedKeys: [$r.findings[] | select(.decision == "accepted") | .issueKey] | unique}
  ] | group_by(.model)[] |
  {model: .[0].model,
   executions: length,
   distinct_issues: (map(.issueKeys[]) | unique | length),
   accepted_issues: (map(.acceptedKeys[]) | unique | length)}
' "$SNAPSHOT"
```

これは採用件数の集計であり、accuracy / recall の主張ではない。

HTML / JSON のモデル評価レポートは [`review-model-eval`](../../review-model-eval/SKILL.md)（`/skill:review-model-eval`）で生成できる。
