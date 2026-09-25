import type { EvaluationReport, ModelSummary } from "./evaluate_models.ts";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtRate = (
  numerator: number,
  denominator: number,
  rate?: number,
): string => {
  if (denominator === 0 || rate === undefined) return "—";
  return `${(rate * 100).toFixed(1)}% (${numerator}/${denominator})`;
};

const fmtMedian = (value?: number): string =>
  value === undefined ? "—" : `${value.toFixed(1)}s`;

const fmtCounts = (counts: Record<string, number>): string =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(", ") || "0";

const fmtHashShort = (hash: string): string =>
  hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;

const thCells = (headers: string[]): string =>
  `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

const modelIdentity = (s: ModelSummary): string =>
  `${s.backend} / ${s.model} / L${s.level} / ${s.actorKind}`;

export const renderReportHtml = (report: EvaluationReport): string => {
  const warnings = report.warnings.length > 0
    ? `<section><h2>警告</h2><ul>${
      report.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")
    }</ul></section>`
    : "";

  const noData = !report.overview.hasData
    ? `<p class="no-data">評価用の履歴がありません</p>`
    : "";

  const adoptionRows = report.modelSummaries.map((s) =>
    `<tr>
    <td>${escapeHtml(modelIdentity(s))}</td>
    <td>${escapeHtml(s.actorIds.join(", "))}</td>
    <td>${s.runs}</td>
    <td>${s.cases}</td>
    <td>${s.distinctBenchmarks}</td>
    <td>${s.issues.unique}</td>
    <td>${escapeHtml(fmtCounts(s.issues.decisions))}</td>
    <td>${
      fmtRate(s.adoption.numerator, s.adoption.denominator, s.adoption.rate)
    }</td>
    <td>${escapeHtml(fmtCounts(s.issues.verifications))}</td>
    <td>${
      fmtRate(
        s.verificationConfirmation.numerator,
        s.verificationConfirmation.denominator,
        s.verificationConfirmation.rate,
      )
    }</td>
    <td>${
      fmtRate(
        s.verificationCoverage.numerator,
        s.verificationCoverage.denominator,
        s.verificationCoverage.rate,
      )
    }</td>
    <td>${escapeHtml(fmtCounts(s.actions))}</td>
  </tr>`
  ).join("");

  const opsRows = report.modelSummaries.map((s) =>
    `<tr>
    <td>${escapeHtml(modelIdentity(s))}</td>
    <td>${s.runs}</td>
    <td>${s.executions.total}</td>
    <td>${
      fmtRate(
        s.executions.successful,
        s.executions.completed,
        s.executions.successRate,
      )
    }</td>
    <td>${
      fmtRate(
        s.executions.failed,
        s.executions.completed,
        s.executions.failureRate,
      )
    }</td>
    <td>${
      fmtRate(
        s.executions.timeouts,
        s.executions.completed,
        s.executions.timeoutRate,
      )
    }</td>
    <td>${s.executions.unfinished}</td>
    <td>${s.executions.no_findings}</td>
    <td>${s.executions.unparsed}</td>
    <td>${fmtMedian(s.executions.medianElapsedSeconds)}</td>
  </tr>`
  ).join("");

  const caseRows = report.cases.map((c) =>
    `<tr>
    <td>${escapeHtml(c.runId)}</td>
    <td>${escapeHtml(c.backend)}</td>
    <td>${escapeHtml(c.model)}</td>
    <td>L${c.level}</td>
    <td>${escapeHtml(c.actorKind)}/${escapeHtml(c.actorId)}</td>
    <td>${escapeHtml(c.repository)}</td>
    <td>${escapeHtml(c.revision)}</td>
    <td>${escapeHtml(fmtHashShort(c.patchSha256))}</td>
    <td>${escapeHtml(fmtHashShort(c.promptSha256))}</td>
    <td>${escapeHtml(c.coverageKey)}</td>
    <td>${c.completedParsed ? "はい" : "いいえ"}</td>
    <td>${c.comparableForQuality ? "はい" : "いいえ"}</td>
    <td>${c.issueCount}</td>
    <td>${escapeHtml(fmtCounts(c.issues.decisions))}</td>
    <td>${
      fmtRate(c.adoption.numerator, c.adoption.denominator, c.adoption.rate)
    }</td>
    <td>${escapeHtml(fmtCounts(c.issues.verifications))}</td>
    <td>${escapeHtml(fmtCounts(c.issues.actions))}</td>
    <td>${c.executionCount}</td>
  </tr>`
  ).join("");

  const sourceRows = report.sources.map((s) =>
    `<tr>
    <td>${escapeHtml(s.runId)}</td>
    <td>${escapeHtml(s.runDir)}</td>
    <td>${escapeHtml(s.snapshotPath)}</td>
    <td>${escapeHtml(s.snapshotSha256.slice(0, 16))}…</td>
    <td>${escapeHtml(s.savedAt)}</td>
  </tr>`
  ).join("");

  const methodology = report.methodology.notes.map((n) =>
    `<li>${escapeHtml(n)}</li>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>レビューモデル評価レポート</title>
<style>
body { font-family: system-ui, sans-serif; margin: 1rem 2rem; line-height: 1.5; }
h1, h2 { margin-top: 1.5rem; }
.no-data { font-size: 1.1rem; color: #666; }
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; min-width: 40rem; }
th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; font-size: 0.85rem; }
th { background: #f5f5f5; }
.meta { color: #555; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>レビューモデル評価レポート</h1>
<p class="meta">生成: ${escapeHtml(report.generatedAt)} / 入力: ${
    escapeHtml(report.inputDirectory)
  }</p>

<section>
<h2>概要</h2>
<p>選択 run: ${report.overview.selectedRuns} / モデルグループ: ${report.overview.modelGroups} / 警告: ${report.overview.warningCount}</p>
<p>除外 run ディレクトリ: ${report.excluded.runDirs} / 除外 snapshot: ${report.excluded.snapshots}</p>
${noData}
</section>

${warnings}

<section>
<h2>モデル別 採用・裏取り</h2>
<div class="table-wrap">
<table>
<thead>${
    thCells([
      "モデル (backend/model/level/actor)",
      "actor IDs",
      "runs",
      "cases",
      "distinct benchmarks",
      "unique issues",
      "decisions (acc/rej/def/pend/conf)",
      "採用率",
      "verifications",
      "裏取り済み指摘の確認率",
      "裏取り coverage",
      "actions (fixed/not_fixed/unknown/conflict)",
    ])
  }</thead>
<tbody>${adoptionRows || `<tr><td colspan="12">—</td></tr>`}</tbody>
</table>
</div>
</section>

<section>
<h2>モデル別 実行信頼性</h2>
<div class="table-wrap">
<table>
<thead>${
    thCells([
      "モデル",
      "runs",
      "executions",
      "成功率 (completed 分母)",
      "失敗率",
      "timeout 率",
      "未完了",
      "no_findings",
      "unparsed",
      "成功実行 median 秒",
    ])
  }</thead>
<tbody>${opsRows || `<tr><td colspan="10">—</td></tr>`}</tbody>
</table>
</div>
</section>

<section>
<h2>ケース比較</h2>
<div class="table-wrap">
<table>
<thead>${
    thCells([
      "runId",
      "backend",
      "model",
      "level",
      "actor",
      "repository",
      "revision",
      "patch sha256",
      "prompt sha256",
      "coverageKey",
      "completedParsed",
      "comparable",
      "issues",
      "decisions",
      "採用率",
      "verifications",
      "actions",
      "executions",
    ])
  }</thead>
<tbody>${caseRows || `<tr><td colspan="18">—</td></tr>`}</tbody>
</table>
</div>
</section>

<section>
<h2>入力ソース</h2>
<div class="table-wrap">
<table>
<thead>${
    thCells(["runId", "runDir", "snapshotPath", "sha256", "savedAt"])
  }</thead>
<tbody>${sourceRows || `<tr><td colspan="5">—</td></tr>`}</tbody>
</table>
</div>
</section>

<section>
<h2>方法論・注意</h2>
<ul>${methodology}</ul>
</section>
</body>
</html>
`;
};
