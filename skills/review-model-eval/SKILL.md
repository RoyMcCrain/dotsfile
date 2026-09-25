---
name: review-model-eval
description: parallel-review の採用履歴からモデル評価レポートをオフライン生成する。「モデル評価」「レビューモデルを比較」「採用実績からモデル評価レポート」の依頼で使う。コード diff レビューや /review-report ではない。
---

# /review-model-eval

`parallel-review` が保存した **snapshot JSON のみ**を読み、モデル別の採用・裏取り・実行統計を集計してローカルレポートを生成する。モデル呼び出し・ネットワーク・ランキング調整は行わない。

## ワークフロー

1. メトリクス定義を読む: [references/metrics.md](references/metrics.md)（データ契約は [../parallel-review/references/history-format.md](../parallel-review/references/history-format.md)）
2. 下記コマンドを実行（履歴が空でも no-data レポートを生成）
3. stdout の JSON で `selectedRuns` / `modelGroups` / `warningCount` と出力パスを確認
4. `model-evaluation.html` と `model-evaluation.json` を読む（レビュアーは spawn しない）

## コマンド

既定パスでの実行（そのまま実行可能）:

```bash
SKILL="$HOME/.agents/skills/review-model-eval/scripts/evaluate_models.ts"

deno run --no-config --allow-read --allow-write --allow-env=HOME,XDG_DATA_HOME \
  "$SKILL"
```

パスを明示する例:

```bash
deno run --no-config --allow-read --allow-write --allow-env=HOME,XDG_DATA_HOME \
  "$SKILL" \
  --runs-dir "$HOME/.local/share/parallel-review/runs" \
  --out "/tmp/model-eval-$(date -u +%F)-manual"
```

- 既定 `--runs-dir`: `parallel-review` の `getRunsBaseDir()`（XDG 対応）
- 既定 `--out`: `<XDG>/parallel-review/reports/<UTC-date>-<uuid>/`
- 出力: `model-evaluation.json` + `model-evaluation.html`（日本語、スタンドアロン、JS/外部アセットなし）
- stdout: `{ htmlPath, jsonPath, selectedRuns, modelGroups, warningCount }`（JSON）
- 既存 `--out` や runs 配下への出力は拒否。履歴ファイルは読み取り専用。
- 履歴が空の場合は honest no-data（偽の run や履歴ディレクトリは作らない）

## 入力

`<runs-dir>/<run-dir>/snapshots/*.json` のみ。raw patch / log は読まない。各 run では invalid snapshot が 1 件でもあれば run 全体を除外し、`savedAt` 最新を 1 件だけ使用（[references/metrics.md](references/metrics.md) 参照）。

検証は `parallel-review/scripts/review_history.ts` の `validateSnapshot` を共用する。

## レポート内容

- 概要（件数・警告）
- モデル別 採用/裏取り表（decision / verification / action 内訳、runs 数、スコアや勝者なし）
- モデル別 実行信頼性表
- run × モデル ケース比較（coverageKey、patch/prompt hash、ケース別採用率）
- 方法論・注意（selection bias、低サンプル、accuracy 非測定など）

履歴が空の場合は「評価用の履歴がありません」と明示し、結論や best model は出さない。

## 共有・安全

- レポートに finding 原文・patch 本文・prompt 本文は含めない（集計と provenance のみ）
- 生成物はローカル private。外部共有は別途ユーザー同意
