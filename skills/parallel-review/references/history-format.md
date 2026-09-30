# Parallel-review provenance and adoption history

ローカル専用の実行記録と採用判断スナップショット。リポジトリ外 `${XDG_DATA_HOME:-$HOME/.local/share}/parallel-review/runs/` に保存する（ディレクトリ `0700`、ファイル `0600`）。アップロード・テレメトリなし。

## ディレクトリレイアウト

```text
<run-dir>/
  metadata.json          # 不変: runId, createdAt, repository, revision, level [, levelDecision]
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
# Preflight → Jev/explicit レベル選択 → init（SKILL.md 正本）
# init は --level に **実際に採用した数値**（auto の場合は helper 出力の level）と
# 任意 --level-decision FILE（select_review_level.ts の JSON）を受け付ける。

# 統合完了後（必須）
SNAPSHOT=$(deno run --no-config --allow-read --allow-write "$HISTORY" save \
	--dir "$REVIEW_DIR" --input "$REVIEW_DIR/assessment.json") || exit 1
```

SKILL.md の統合節から `$REVIEW_DIR/assessment.json` を書き、上記 save で永続化する。`save` 時、`metadata.levelDecision.patchSha256` がある場合は `changes.patch` の SHA-256 と一致必須。

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
| `level` | ✓ | JSON number または CLI 文字列リテラル `1` / `2` / `3` / `4` / `5` のみ（`01` 等の coercion 不可） |
| `levelScale` | 新規 run ✓ | `3` または `5`。新規 `init` は `5`。省略時は **legacy 3 段階**（既存履歴） |
| `levelDecision` | 任意（新規 auto/explicit フロー） | `select_review_level.ts` 出力 JSON（schemaVersion 1）。`level` と一致必須。`levelScale: 5` の run のみ |

`level` は `levelScale` を超えてはならない。legacy（`levelScale` 省略）では `level` は 1–3 のみ。`levelScale: 3` も 1–3、`levelScale: 5` は 1–5。

`levelDecision` は **採用した実レベル**（Jev 推奨・明示・L3 フォールバック後の数値）を `level` と共に記録する。`source` は `explicit` / `jev` / `fallback`、`requestedLevel` は明示数値または `auto`。`reason` は固定コード、`patchSha256` は判定対象の生 patch バイト SHA-256。auto で `--context-file` を渡した run のみ任意 **`contextSha256`**（`select_review_level.ts` が正規化・検証済み context を `JSON.stringify` した UTF-8 の SHA-256、小文字 64 hex）。**raw context 本文は metadata に保存しない**（hash は同一 context の識別用。hash だけでは context を復元できない）。legacy レコードは `contextSha256` なしのまま有効。explicit 1..5 では `contextSha256` を付けない。auto は `minConfidence` も必須。Jev 採用時と `low_confidence` fallback 時は検証済み `model` / `suggestedLevel` / `confidence` と任意 `costUsd` を保持する（raw 応答・秘密値は保存しない）。

任意 **`probabilities`**（深さ診断のみ）: キー `"1"`…`"5"` のみ、各値は JSON number で 0..1 の有限値。**5 キーすべて必須**（欠損・未知キー・NaN/文字列は metadata 検証で拒否）。API 側で optional block が malformed のときは **省略**（選択・`confidence` は従来どおり）。`source: jev` または `fallback` かつ `reason: low_confidence` のときだけ保存しうる。`explicit`、HTTP/JSON/schema 等の共通 fallback、`low_confidence` 以外の fallback では **含めない**。`confidence` は分布の集中度、`probabilities` は選択肢ごとの予測値であり、履歴から実測した正答率ではない。legacy レコードはフィールドなしのまま。

**read-only 一覧**（snapshot 不要・未完了 run 含む）:

```bash
deno run --no-config --allow-read --allow-env=HOME,XDG_DATA_HOME \
  "$HOME/.agents/skills/parallel-review/scripts/review_history.ts" decisions
```

任意フラグ: `--runs-dir DIR`（省略時は `${XDG_DATA_HOME:-$HOME/.local/share}/parallel-review/runs`）、`--repository PATH`（metadata の `repository` 文字列と **完全一致**；空文字・空白のみは CLI 拒否）。`--runs-dir` / `--repository` に空や空白のみを渡さない。

stdout は `{ "decisions": [ { runId, createdAt, repository, revision, levelDecision } ], "warnings": [ { runDir, reason } ] }`。存在しない runs ルートは空配列（警告なし）。runs ルート自体、`metadata.json`、または run ディレクトリが symlink の場合は当該 run を列挙せず `warnings` に理由コード（例: `symlink_runs_root`, `symlink_run_dir`, `symlink_metadata`）のみ。無効 metadata / levelDecision も警告のみ（canary や raw ファイル内容は stdout/stderr に出さない）。同一 `runId` が複数 run に現れた場合は先に読んだ 1 件を採用し、残りは `duplicate_run_id`。`review-model-eval` の snapshot 集計とは別契約。

任意のネスト `chunking`（schemaVersion 1 互換）。**省略時は legacy どおり検証しない**（`chunking` キー自体が無い JSON のみ legacy）。

| フィールド | 意味 |
|-----------|------|
| `source` | `jev` / `fallback` / `fixed` |
| `reason` | `jev_ok` / `explicit_level` / 固定 fallback コード（`whole_patch_limit` 等） |
| `choice` | `none` \| `12000` \| `24000` \| `48000`（10進バイト目安）。**`fixed` / `fallback` の実効 `choice` は `none` または `12000` のみ** |
| `minConfidence` | auto 系 `jev` / `fallback` で必須。**存在時は親 `levelDecision.minConfidence` と同一** |
| `confidence` / `suggestedChoice` / `model` | **通常 `jev` 採用時も必須**（`suggestedChoice` は `choice` と一致）。`low_confidence` / `whole_patch_limit` fallback 時も必須 |

**親との対応**: `levelDecision.source === "explicit"` ⇔ `chunking.source === "fixed"`。malformed 共通 envelope（HTTP/JSON/schema 等）では深さ・chunk **両方** fallback。

**`whole_patch_limit`**: `suggestedChoice === "none"`、実効 `choice === "12000"`、`confidence >= minConfidence`（未満なら `low_confidence`）。

深さと chunk の信頼度は独立。新規 `selectReviewLevel` / auto 出力は `chunking` を含む。

既存 run（`levelDecision` なし）は従来どおり。auto と手動を分けた評価集計は今回追加しない。

run 作成後は不変（`runId` / `createdAt` / `repository` / `revision` / `level` / `levelScale` / `levelDecision` を含む metadata 全体）。既存 legacy metadata を save 時に書き換えない。snapshot 間で patch/prompt の SHA-256 も不変。未完了 execution の identity と chunk hash は固定し、出力途中の stdout/stderr hash は変化を許す。完了後は record 全体とファイル hash が不変。

オフライン評価（`review-model-eval`）のモデルグループキーは `backend` + `model` + `level` + **`levelScale`** + `actor.kind`。同じ数値 `level` でも legacy 3 段階と 5 段階は別グループ（例: 旧 L2 と新 L2 は統計を混ぜない）。

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

Jev の auto ルーティング深さの週次監査（独立監査・preflight 承認付き）は [`jev-audit`](../../jev-audit/SKILL.md) を参照。
