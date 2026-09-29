import type { AuditReport } from "./report.ts";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtComparison = (value: string | undefined): string =>
  value ? escapeHtml(value) : "—";

const fmtNum = (n: number | undefined): string =>
  n === undefined ? "—" : escapeHtml(String(n));

const fmtRate = (n: number | undefined): string =>
  n === undefined ? "—" : escapeHtml(`${(n * 100).toFixed(1)}%`);

export const renderAuditReportHtml = (report: AuditReport): string => {
  const randomStratum = report.strata.find((s) => s.stratum === "random");

  const renderCaseRow = (c: AuditReport["cases"][number]) => {
    const concerns = c.auditor?.concerns?.length
      ? c.auditor.concerns.map((x) => escapeHtml(x)).join("; ")
      : "—";
    const auditorReason = c.auditor?.reason
      ? escapeHtml(c.auditor.reason)
      : "—";
    return `<tr>
      <td>${escapeHtml(c.runId)}</td>
      <td>${escapeHtml(c.stratum)}</td>
      <td>${escapeHtml(c.status)}</td>
      <td>L${c.effectiveLevel}</td>
      <td>${
      c.suggestedLevel === undefined ? "N/A" : `L${c.suggestedLevel}`
    }</td>
      <td>${
      c.auditor ? `L${c.auditor.minLevel}–L${c.auditor.maxLevel}` : "—"
    }</td>
      <td>${fmtComparison(c.comparison?.effectiveVsAuditor)}</td>
      <td>${fmtComparison(c.comparison?.suggestedVsAuditor)}</td>
      <td>${escapeHtml(c.jevReason)}</td>
      <td>${c.confidence === undefined ? "—" : fmtNum(c.confidence)}</td>
      <td>${escapeHtml(c.source)}</td>
      <td>${auditorReason}</td>
      <td>${concerns}</td>
      <td>${c.holdReason ? escapeHtml(c.holdReason) : "—"}</td>
      <td>${c.failureReason ? escapeHtml(c.failureReason) : "—"}</td>
      <td>${
      c.nonIndependentLabel ? escapeHtml(c.nonIndependentLabel) : "—"
    }</td>
      <td>${
      c.recordedAuditorModel ? escapeHtml(c.recordedAuditorModel) : "—"
    }</td>
      <td>${c.contextImperfect ? "文脈不完全" : "—"}</td>
    </tr>`;
  };

  const randomRows = report.cases.filter((c) => c.stratum === "random").map(
    renderCaseRow,
  ).join("");
  const riskRows = report.cases.filter((c) => c.stratum === "risk").map(
    renderCaseRow,
  ).join("");

  const strataRows = report.strata.map((s) =>
    `<tr>
      <td>${escapeHtml(s.stratum)}</td>
      <td>${s.selected}</td>
      <td>${s.audited}</td>
      <td>${s.independentAudited}</td>
      <td>${s.held}</td>
      <td>${s.unavailable}</td>
      <td>${s.cacheExcluded}</td>
      <td>${s.comparableEffective}</td>
      <td>${s.effectiveDisagreement}</td>
      <td>${fmtRate(s.effectiveDisagreementRate)}</td>
      <td>${s.comparableSuggested}</td>
      <td>${s.suggestedDisagreement}</td>
      <td>${fmtRate(s.suggestedDisagreementRate)}</td>
    </tr>`
  ).join("");

  const wowEffective = report.weekOverWeek?.effectiveDisagreementRateDelta;
  const wowSuggested = report.weekOverWeek?.suggestedDisagreementRateDelta;
  const wow = report.weekOverWeek?.available
    ? `<p>前週比（random / percentage points） effective: ${
      wowEffective === undefined ? "—" : fmtNum(wowEffective)
    } / suggested: ${
      wowSuggested === undefined ? "—" : fmtNum(wowSuggested)
    }</p>`
    : `<p>前週比: 利用不可（${
      escapeHtml(report.weekOverWeek?.reason ?? "no_data")
    }）</p>`;

  const cacheBlock = report.cacheSummary
    ? `<p>キャッシュ再利用: ${report.cacheSummary.count} — ${
      escapeHtml(report.cacheSummary.note)
    }</p>`
    : "";

  const historyWarnings = report.counts.historyWarningCodes?.length
    ? `<p>履歴警告: ${
      report.counts.historyWarningCodes.map((c) => escapeHtml(c)).join(", ")
    }</p>`
    : "";

  const caveats = `<ul>${
    report.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join("")
  }</ul>`;

  const lowSample = (randomStratum?.comparableEffective ?? 0) < 3
    ? `<p class="warn">random 層の独立監査可能件数が少なく（n=${
      randomStratum?.comparableEffective ?? 0
    }）、率の解釈には注意してください。</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>Jev ルーティング深度監査</title>
<style>
body{font-family:system-ui,sans-serif;margin:1.5rem;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #ccc;padding:.35rem .5rem;text-align:left;font-size:.85rem}
h1{font-size:1.25rem}
.warn{color:#8a4b00}
</style>
</head>
<body>
<h1>Jev ルーティング深度監査（週次）</h1>
<p>期間（UTC）: ${escapeHtml(report.period.weekStart)} 〜 ${
    escapeHtml(report.period.weekEnd)
  }（半開区間）</p>
<p>記録監査モデル: ${
    report.auditor.mixedAuditors
      ? "混在（週次比較不可）"
      : escapeHtml(report.auditor.recordedModels[0] ?? "独立監査なし")
  }（role: ${escapeHtml(report.auditor.role)}）</p>
<p>promptHash: ${escapeHtml(report.auditor.promptHash)}</p>
<p>コスト: ${
    escapeHtml(report.counts.costUsd)
  } / attemptedCalls: ${report.counts.attemptedCalls} / cacheHits: ${report.counts.cacheHits}</p>
${cacheBlock}
${historyWarnings}
<section><h2>サマリー</h2>
<p>選択 ${report.counts.selectedTotal} / 監査済 ${report.counts.audited} / preflight ${report.counts.needsPreflight} / 承認済未送信 ${report.counts.approvedPending} / held ${report.counts.held} / 利用不可 ${report.counts.unavailable}</p>
${lowSample}
${wow}
</section>
<section><h2>層別（random / risk 混在なし）</h2>
<table><thead><tr>
<th>層</th><th>選択</th><th>監査済</th><th>独立監査</th><th>held</th><th>不可</th><th>cache除外</th>
<th>effective n</th><th>effective 不一致</th><th>effective 率</th>
<th>suggested n</th><th>suggested 不一致</th><th>suggested 率</th>
</tr></thead><tbody>${strataRows}</tbody></table>
</section>
<section><h2>ケース（random）</h2>
<table><thead><tr>
<th>runId</th><th>層</th><th>状態</th><th>effective</th><th>suggested</th>
<th>監査レンジ</th><th>effective vs 監査</th><th>suggested vs 監査</th>
<th>Jev reason</th><th>confidence</th><th>source</th><th>監査 reason</th><th>concerns</th>
<th>hold</th><th>failure</th><th>cache/非独立</th><th>記録モデル</th><th>文脈</th>
</tr></thead><tbody>${
    randomRows || `<tr><td colspan="18">該当なし</td></tr>`
  }</tbody></table>
</section>
<section><h2>ケース（risk）</h2>
<table><thead><tr>
<th>runId</th><th>層</th><th>状態</th><th>effective</th><th>suggested</th>
<th>監査レンジ</th><th>effective vs 監査</th><th>suggested vs 監査</th>
<th>Jev reason</th><th>confidence</th><th>source</th><th>監査 reason</th><th>concerns</th>
<th>hold</th><th>failure</th><th>cache/非独立</th><th>記録モデル</th><th>文脈</th>
</tr></thead><tbody>${
    riskRows || `<tr><td colspan="18">該当なし</td></tr>`
  }</tbody></table>
</section>
<section><h2>注意</h2>${caveats}</section>
</body>
</html>`;
};
