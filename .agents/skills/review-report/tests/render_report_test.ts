import assert from "node:assert/strict";
import { join } from "node:path";
import {
  countPatchStats,
  defaultReportId,
  escapeJsonForScript,
  isSecretPath,
  mergeVerifications,
  normalizeReport,
  parseUnifiedDiff,
  renderHtml,
  sortFindings,
  sortGroups,
  splitPatchLines,
  validateReport,
} from "../scripts/render_report.ts";

const SCRIPT_PATH = join(
  import.meta.dirname!,
  "../scripts/render_report.ts",
);

type GroupOverrides = Record<string, unknown>;
type FindingOverrides = Record<string, unknown>;
type DiffOverrides = Record<string, unknown>;

const minimalGroup = (overrides: GroupOverrides = {}) => ({
  id: "g1",
  title: "Group title",
  intent: "Group intent.",
  risk: "low",
  riskScore: 0,
  riskReason: "Low impact.",
  files: [] as string[],
  diffs: [] as Record<string, unknown>[],
  findings: [] as Record<string, unknown>[],
  ...overrides,
});

const minimalFinding = (overrides: FindingOverrides = {}) => ({
  id: "f-1",
  source: "blind",
  severity: "low",
  title: "Finding title",
  problem: "Problem text.",
  evidence: "Evidence text.",
  suggestion: "Suggestion text.",
  planOnly: false,
  ...overrides,
});

const minimalDiff = (overrides: DiffOverrides = {}) => ({
  file: "src/app.ts",
  location: "L1",
  explanation: "Explains the change.",
  needsImprovement: false,
  ...overrides,
});

const SAMPLE_REPORT = {
  reportId: "test-report",
  title: "Large diff review",
  target: "@",
  initialComment: "Global seed comment",
  plan: { provided: true, label: "plans/001.md" },
  groups: [
    minimalGroup({
      id: "low-group",
      title: "Docs tweak",
      intent: "Fix typo.",
      risk: "low",
      riskScore: 10,
      riskReason: "Comment only.",
      files: ["README.md"],
    }),
    minimalGroup({
      id: "high-group",
      title: "Auth rename",
      intent: "Rename public API.",
      risk: "high",
      riskScore: 90,
      riskReason: "Breaking rename.",
      files: ["src/auth.ts"],
      diffs: [
        minimalDiff({
          file: "src/auth.ts",
          patch: "@@ -1 +1 @@\n-old\n+new",
        }),
      ],
      findings: [
        minimalFinding({
          id: "f-1",
          source: "blind",
          severity: "high",
          title: "Missing call site",
          location: "src/auth.ts:3",
          problem: "One caller left.",
          evidence: "grep shows old name",
          suggestion: "Update caller",
        }),
      ],
    }),
    minimalGroup({
      id: "critical-group",
      title: "Security fix",
      intent: "Close injection hole.",
      risk: "critical",
      riskScore: 50,
      riskReason: "User input path.",
      files: ["src/api.ts"],
    }),
  ],
};

const reportWithoutId = (overrides: Record<string, unknown> = {}) => ({
  title: "Large diff review",
  target: "@",
  groups: [minimalGroup()],
  ...overrides,
});

const runCli = async (args: string[]) => {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      SCRIPT_PATH,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
};

Deno.test("test_valid_sample_passes", () => {
  const errors = validateReport(structuredClone(SAMPLE_REPORT));
  assert.deepEqual(errors, []);
});

Deno.test("test_unknown_risk_is_error", () => {
  const errors = validateReport({
    groups: [minimalGroup({ risk: "extreme" })],
  });
  assert.ok(errors.some((e) => e.includes("risk must be one of")));
});

Deno.test("test_missing_risk_reason_is_error", () => {
  const group = minimalGroup();
  delete (group as Record<string, unknown>).riskReason;
  const errors = validateReport({ groups: [group] });
  assert.ok(errors.some((e) => e.includes("riskReason")));
});

Deno.test("test_duplicate_ids_are_errors", () => {
  const report = {
    groups: [
      minimalGroup({
        id: "dup",
        findings: [minimalFinding({ id: "f-dup" })],
      }),
      minimalGroup({
        id: "dup",
        findings: [minimalFinding({ id: "f-dup", source: "plan-aware" })],
      }),
    ],
  };
  const errors = validateReport(report);
  assert.ok(errors.some((e) => e.includes("duplicate group id")));
  assert.ok(errors.some((e) => e.includes("duplicate finding id")));
});

Deno.test("test_malformed_types_return_errors_not_crash", () => {
  const report = {
    reportId: 123,
    title: ["bad"],
    plan: "not-object",
    groups: [
      {
        id: ["unhashable"],
        title: 1,
        intent: null,
        risk: "low",
        riskReason: "",
        files: "not-array",
        diffs: {},
        findings: "not-array",
      },
    ],
  };
  const errors = validateReport(report);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes("reportId must be a string")));
  assert.ok(errors.some((e) => e.includes("plan must be an object")));
});

Deno.test("test_nan_risk_score_rejected", () => {
  const errors = validateReport({
    groups: [minimalGroup({ riskScore: NaN })],
  });
  assert.ok(errors.some((e) => e.includes("finite number")));
});

Deno.test("test_bool_risk_score_rejected", () => {
  const errors = validateReport({
    groups: [minimalGroup({ riskScore: true })],
  });
  assert.ok(errors.some((e) => e.includes("riskScore must be numeric")));
});

Deno.test("test_diff_explanation_required_unless_needs_improvement", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({
        diffs: [{ file: "a.ts", needsImprovement: false }],
      }),
    ],
  });
  assert.ok(
    errors.some((e) => e.includes("explanation must be a non-empty string")),
  );
});

Deno.test("test_diff_needs_improvement_requires_reason", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({
        diffs: [{
          file: "a.ts",
          needsImprovement: true,
          improvementReason: "",
        }],
      }),
    ],
  });
  assert.ok(errors.some((e) => e.includes("improvementReason")));
});

Deno.test("test_group_needs_improvement_requires_reason", () => {
  const errors = validateReport({
    groups: [minimalGroup({ needsImprovement: true, improvementReason: "" })],
  });
  assert.ok(errors.some((e) => e.includes("needsImprovement=true requires")));
});

Deno.test("test_finding_required_fields", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({
        findings: [{
          id: "f1",
          source: "blind",
          severity: "low",
          title: "t",
        }],
      }),
    ],
  });
  assert.ok(errors.some((e) => e.includes("missing required field: problem")));
  assert.ok(errors.some((e) => e.includes("missing required field: evidence")));
  assert.ok(
    errors.some((e) => e.includes("missing required field: suggestion")),
  );
});

Deno.test("test_blind_plan_only_rejected", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({
        findings: [minimalFinding({ source: "blind", planOnly: true })],
      }),
    ],
  });
  const planOnlyErrors = errors.filter((e) => e.includes("planOnly=true"));
  assert.equal(planOnlyErrors.length, 1);
});

Deno.test("test_unhashable_risk_source_severity_do_not_crash", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({
        risk: [],
        findings: [minimalFinding({ source: [], severity: {} })],
      }),
    ],
  });
  assert.ok(errors.some((e) => e.includes("risk must be one of")));
  assert.ok(errors.some((e) => e.includes(".source must be one of")));
  assert.ok(errors.some((e) => e.includes(".severity must be one of")));
});

Deno.test("test_plan_required_fields_when_plan_present", () => {
  let errors = validateReport({ plan: {}, groups: [minimalGroup()] });
  assert.ok(
    errors.some((e) => e.includes("plan missing required field: provided")),
  );
  assert.ok(
    errors.some((e) => e.includes("plan missing required field: label")),
  );

  errors = validateReport({
    plan: { provided: "yes", label: 1 },
    groups: [minimalGroup()],
  });
  assert.ok(errors.some((e) => e.includes("plan.provided must be a boolean")));
  assert.ok(errors.some((e) => e.includes("plan.label must be a string")));
});

Deno.test("test_null_diffs_and_findings_rejected", () => {
  const errors = validateReport({
    groups: [minimalGroup({ diffs: null, findings: null })],
  });
  assert.ok(errors.some((e) => e.includes("diffs must be an array")));
  assert.ok(errors.some((e) => e.includes("findings must be an array")));
});

Deno.test("test_secret_path_rejected_monkey_allowed", () => {
  const errorsSecret = validateReport({
    groups: [minimalGroup({ files: ["config/.env.local"] })],
  });
  assert.ok(errorsSecret.some((e) => e.includes("secret path")));

  const errorsOk = validateReport({
    groups: [minimalGroup({ files: ["src/monkey.ts"] })],
  });
  assert.ok(!errorsOk.some((e) => e.includes("monkey.ts")));
  assert.ok(!errorsOk.some((e) => e.includes("secret path")));
});

Deno.test("test_secret_suffix_paths_rejected", () => {
  const errors = validateReport({
    groups: [
      minimalGroup({ diffs: [minimalDiff({ file: "certs/server.pem" })] }),
    ],
  });
  assert.ok(errors.some((e) => e.includes("secret path")));
});

Deno.test("test_risk_order_then_score_then_input_order", () => {
  const sorted = sortGroups(SAMPLE_REPORT.groups);
  assert.deepEqual(
    sorted.map((g) => g.id),
    ["critical-group", "high-group", "low-group"],
  );
});

Deno.test("test_same_risk_sorts_by_risk_score_desc", () => {
  const groups = [
    { id: "a", risk: "high", riskScore: 10 },
    { id: "b", risk: "high", riskScore: 99 },
  ];
  const sorted = sortGroups(groups);
  assert.deepEqual(sorted.map((g) => g.id), ["b", "a"]);
});

Deno.test("test_severity_order_then_input_order", () => {
  const findings = [
    minimalFinding({ id: "low", severity: "low" }),
    minimalFinding({ id: "critical", severity: "critical" }),
    minimalFinding({ id: "high", severity: "high" }),
    minimalFinding({ id: "medium", severity: "medium" }),
  ];
  const sorted = sortFindings(findings);
  assert.deepEqual(
    sorted.map((f) => f.id),
    ["critical", "high", "medium", "low"],
  );
});

Deno.test("test_explicit_report_id_preserved", () => {
  const report = reportWithoutId({ reportId: "custom-id" });
  assert.equal(defaultReportId(report), "custom-id");
});

Deno.test("test_deep_copy_same_id", () => {
  const report = reportWithoutId();
  const copyA = structuredClone(report);
  const copyB = structuredClone(report);
  assert.equal(defaultReportId(copyA), defaultReportId(copyB));
});

Deno.test("test_risk_reason_change_different_id", () => {
  const base = reportWithoutId();
  const changed = structuredClone(base);
  changed.groups[0].riskReason = "Different reason.";
  assert.notEqual(defaultReportId(base), defaultReportId(changed));
});

Deno.test("test_finding_content_change_different_id", () => {
  const base = reportWithoutId({
    groups: [
      minimalGroup({
        findings: [minimalFinding({ problem: "Original problem." })],
      }),
    ],
  });
  const changed = structuredClone(base);
  changed.groups[0].findings[0].problem = "Changed problem.";
  assert.notEqual(defaultReportId(base), defaultReportId(changed));
});

Deno.test("test_findings_sorted_by_severity", () => {
  const normalized = normalizeReport({
    groups: [
      minimalGroup({
        findings: [
          minimalFinding({ id: "a", severity: "low" }),
          minimalFinding({ id: "b", severity: "critical" }),
        ],
      }),
    ],
  });
  assert.deepEqual(
    normalized.groups[0].findings.map((f) => f.id),
    ["b", "a"],
  );
});

Deno.test("test_script_breakout_characters_are_escaped", () => {
  const payload = {
    title: "</script><img src=x onerror=alert(1)>",
    amp: "a&b",
    line: "a\u2028b\u2029c",
  };
  const escaped = escapeJsonForScript(payload);
  assert.ok(!escaped.includes("</script>"));
  assert.ok(escaped.includes("\\u003c/script\\u003e"));
  assert.ok(escaped.includes("\\u0026"));
  const parsed = JSON.parse(escaped);
  assert.equal(parsed.title, payload.title);
});

Deno.test("test_monkey_ts_allowed", () => {
  assert.equal(isSecretPath("src/monkey.ts"), false);
});

Deno.test("test_env_and_key_suffixes", () => {
  assert.equal(isSecretPath(".env"), true);
  assert.equal(isSecretPath("config/.env.local"), true);
  assert.equal(isSecretPath("config/.ENV.LOCAL"), true);
  assert.equal(isSecretPath("secrets/token.key"), true);
  assert.equal(isSecretPath("id_ed25519"), true);
  assert.equal(isSecretPath("ID_RSA"), true);
  assert.equal(isSecretPath("home/.ENVRC"), true);
});

Deno.test("test_env_local_uppercase_rejected_in_validation", () => {
  const errors = validateReport({
    groups: [minimalGroup({ files: ["config/.ENV.LOCAL"] })],
  });
  assert.ok(errors.some((e) => e.includes("secret path")));
});

Deno.test("test_html_contains_required_ui_labels", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  for (
    const label of [
      "採用",
      "要調査",
      "却下",
      "未判定",
      "フィードバックを生成",
      "クリップボードにコピー",
      "レビューフィードバック",
      "忖度なしで妥当かどうか精査",
      "意図: ",
      "指摘",
      "根拠",
      "改善案",
      "場所",
      "finding-location",
      "概要",
      "overview-heading",
      "変更グループ",
      "裏取りパケットを生成",
      "パケットをコピー",
      "review-verify",
      "verification-request",
      "事実:確認",
      "accepted-investigate-pending",
      "採用された指摘と人間コメントを、元の作業セッション",
      "aria-live",
      "copy-status",
      "plan-only",
      "要改善",
      "スコア:",
      "リスク根拠:",
    ]
  ) {
    assert.ok(html.includes(label), `missing label: ${label}`);
  }
});

Deno.test("test_html_typography_and_heading_styles", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));

  assert.ok(html.includes('"Hiragino Sans"'));
  assert.ok(html.includes('"Yu Gothic"'));
  assert.ok(html.includes("text-rendering: optimizeLegibility"));
  assert.ok(html.includes("font-size: 16px"));
  assert.ok(html.includes("line-height: 1.7"));
  assert.ok(html.includes("letter-spacing: 0.015em"));

  assert.ok(html.includes("clamp(1.6rem, 3vw, 1.9rem)"));
  assert.match(html, /h1\s*\{[^}]*font-weight:\s*700/);
  assert.match(html, /h1\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(html, /h1\s*\{[^}]*border-left:\s*3px solid var\(--accent\)/);
  assert.match(html, /h1\s*\{[^}]*line-height:\s*1\.3/);

  assert.match(
    html,
    /\.group-header h2\s*\{[^}]*font-size:\s*1\.15rem/,
  );
  assert.match(
    html,
    /\.group-header h2\s*\{[^}]*overflow-wrap:\s*anywhere/,
  );

  assert.match(
    html,
    /footer h2\s*\{[^}]*border-left:\s*3px solid var\(--accent\)/,
  );
  assert.match(html, /footer h2:first-of-type\s*\{\s*margin-top:\s*0/);

  assert.match(
    html,
    /\.intent, \.files, \.risk-reason\s*\{[^}]*line-height:\s*1\.75/,
  );
  // 意図 / リスク根拠 / 関連ファイルのラベルは block でラベル→本文を改行する
  assert.match(
    html,
    /\.intent strong, \.files strong, \.risk-reason strong\s*\{[^}]*display:\s*block/,
  );
  assert.match(html, /\.explanation\s*\{[^}]*line-height:\s*1\.65/);
  assert.match(html, /\.finding\s*\{[^}]*line-height:\s*1\.65/);
  assert.match(html, /\.finding-head\s*\{[^}]*margin-bottom:\s*0\.4rem/);
  assert.match(html, /\.finding-title\s*\{[^}]*font-weight:\s*700/);
  assert.match(
    html,
    /\.finding-location strong,\s*\.finding-field strong\s*\{[^}]*display:\s*block/,
  );
  assert.match(html, /\.finding-location code\s*\{[^}]*font-family:\s*ui-monospace/);
  assert.match(html, /\.overview\s*\{[^}]*margin-top:\s*1rem/);
  assert.match(
    html,
    /textarea, \.feedback-output\s*\{[^}]*line-height:\s*1\.65/,
  );
  assert.match(
    html,
    /textarea, \.feedback-output\s*\{[^}]*letter-spacing:\s*0\.01em/,
  );

  assert.match(html, /\.diff-table\s*\{[^}]*font-size:\s*0\.82rem/);
  assert.match(html, /\.diff-table\s*\{[^}]*line-height:\s*1\.55/);
  assert.match(html, /\.diff-table\s*\{[^}]*letter-spacing:\s*0/);
  assert.match(html, /\.diff-file\s*\{[^}]*letter-spacing:\s*0/);
  assert.match(html, /\.diff-stats\s*\{[^}]*letter-spacing:\s*0/);
  assert.match(html, /\.files code\s*\{[^}]*letter-spacing:\s*0/);

  assert.ok(html.includes("@media (max-width: 640px)"));
});

Deno.test("test_html_escapes_title", () => {
  const report = structuredClone(SAMPLE_REPORT);
  report.title = "<script>alert(1)</script>";
  const html = renderHtml(report);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

Deno.test("test_placeholder_collision_safety", () => {
  const report = structuredClone(SAMPLE_REPORT);
  report.title = "Report __REPORT_JSON__ title";
  const html = renderHtml(report);
  assert.ok(html.includes("<title>Report __REPORT_JSON__ title</title>"));
  const marker = '"groups":';
  assert.ok(html.includes(marker));
  const titlePart = html.split(marker, 1)[0];
  assert.ok(titlePart.includes("__REPORT_JSON__"));
  assert.ok(!html.includes("__TITLE__"));
});

Deno.test("test_initial_comment_state_seeding_present", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("createInitialState"));
  assert.ok(html.includes("Object.create(null)"));
  assert.ok(html.includes("hasOwnProperty"));
  assert.ok(
    html.includes("groupComment.value = state.groupComments[group.id] || ''"),
  );
  assert.ok(!html.includes("else if (typeof group.initialComment"));
});

Deno.test("test_finding_cards_map_not_css_selector", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("findingCards"));
  assert.ok(!html.includes("data-finding-id=\"' + findingId"));
});

Deno.test("test_fallback_copy_try_catch", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("function fallbackCopy(text)"));
  assert.ok(html.includes("} catch (_) {"));
  assert.ok(html.includes("return false;"));
});

Deno.test("test_copy_regenerates_from_current_state", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("const text = generateFeedbackMarkdown()"));
});

Deno.test("test_empty_groups_and_findings_render", () => {
  const report = {
    groups: [
      minimalGroup({
        id: "empty",
        diffs: [],
        findings: [],
      }),
    ],
  };
  const errors = validateReport(report);
  const html = renderHtml(report);
  assert.deepEqual(errors, []);
  assert.ok(html.includes("フィードバックを生成"));
});

Deno.test("test_request_framing_is_anti_sycophancy", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(
    html.includes("忖度なしで妥当かどうか精査してください"),
  );
  assert.ok(html.includes("「要調査」は実装せず"));
  assert.ok(html.includes("## 要調査"));
  assert.ok(!html.includes("妥当なものを修正してください"));
});

Deno.test("test_investigate_decision_present", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("investigate: '要調査'"));
  assert.ok(html.includes("'accepted', 'investigate', 'rejected', 'pending'"));
  assert.ok(html.includes("accepted-investigate-pending"));
});

Deno.test("test_severity_labels_present", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("SEVERITY_LABELS"));
  for (const label of ["[重大]", "[警告]", "[注意]", "[情報]"]) {
    assert.ok(html.includes(label));
  }
});

Deno.test("test_feedback_field_labels_present", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("変更グループの意図:"));
  assert.ok(html.includes("場所:"));
  assert.ok(html.includes("改善案:"));
});

Deno.test("test_overview_section_renders_from_groups", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes('id="overview"'));
  assert.ok(html.includes("function renderOverview()"));
  assert.ok(html.includes("formatCountChips"));
  assert.ok(html.includes("overview-groups"));
  assert.ok(!html.includes("場所: ' + finding.location"));
  assert.ok(html.includes("finding-location"));
});

Deno.test("test_mermaid_diagram_support_present", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("buildOverviewMermaid"));
  assert.ok(html.includes("renderMermaidDiagrams"));
  assert.ok(html.includes("cdn.jsdelivr.net/npm/mermaid@11.6.0"));
  assert.ok(html.includes("securityLevel: 'strict'"));
  assert.ok(html.includes("theme: 'default'"));
  assert.ok(html.includes("変更グループと指摘の関係"));
  assert.ok(html.includes("diagram-fallback"));
});

Deno.test("test_light_mode_only", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  assert.ok(html.includes("color-scheme: light;"));
  assert.ok(!html.includes("prefers-color-scheme: dark"));
  assert.ok(!html.includes("color-scheme: light dark"));
});

Deno.test("test_custom_diagrams_validated_and_embedded", () => {
  const report = {
    ...structuredClone(SAMPLE_REPORT),
    diagrams: [
      {
        id: "flow",
        title: "想定フロー",
        mermaid: "flowchart LR\n  A --> B",
      },
    ],
  };
  assert.deepEqual(validateReport(report), []);
  const html = renderHtml(report);
  assert.ok(html.includes("想定フロー"));
  assert.ok(html.includes("flowchart LR"));
});

Deno.test("test_diagrams_require_mermaid", () => {
  const errors = validateReport({
    ...structuredClone(SAMPLE_REPORT),
    diagrams: [{ title: "missing mermaid" }],
  });
  assert.ok(errors.some((e) => e.includes("mermaid")));
});

Deno.test("test_verifications_validated_and_rendered", () => {
  const report = {
    ...structuredClone(SAMPLE_REPORT),
    verifications: [
      {
        findingId: "f-1",
        verdict: "confirmed",
        summary: "Caller still uses old name.",
        evidence: "src/auth.ts:3 still references oldAuthClient.",
      },
    ],
  };
  assert.deepEqual(validateReport(report), []);
  const html = renderHtml(report);
  assert.ok(html.includes("事実:確認"));
  assert.ok(html.includes("Caller still uses old name."));
  assert.ok(html.includes("裏取り:"));
});

Deno.test("test_verification_unknown_finding_rejected", () => {
  const errors = validateReport({
    ...structuredClone(SAMPLE_REPORT),
    verifications: [
      {
        findingId: "missing",
        verdict: "confirmed",
        summary: "x",
        evidence: "y",
      },
    ],
  });
  assert.ok(errors.some((e) => e.includes("unknown finding")));
});

Deno.test("test_merge_verifications_overrides_by_finding_id", () => {
  const report = {
    ...structuredClone(SAMPLE_REPORT),
    verifications: [
      {
        findingId: "f-1",
        verdict: "inconclusive",
        summary: "old",
        evidence: "old evidence",
      },
    ],
  };
  const merged = mergeVerifications(report, {
    verifications: [
      {
        findingId: "f-1",
        verdict: "contradicted",
        summary: "new",
        evidence: "new evidence",
      },
    ],
  });
  assert.deepEqual(validateReport(merged), []);
  assert.equal((merged.verifications as Record<string, unknown>[]).length, 1);
  assert.equal(
    (merged.verifications as Record<string, unknown>[])[0].verdict,
    "contradicted",
  );
});

Deno.test("test_overview_text_field_is_optional", () => {
  const withOverview: Record<string, unknown> = {
    ...structuredClone(SAMPLE_REPORT),
    overview: "認証リネームの独立検証結果。",
  };
  assert.deepEqual(validateReport(withOverview), []);
  const html = renderHtml(withOverview);
  assert.ok(html.includes("認証リネームの独立検証結果。"));
});

Deno.test("test_validate_only_success", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const path = join(tmp, "report.json");
    await Deno.writeTextFile(path, JSON.stringify(SAMPLE_REPORT));
    const result = await runCli([path, "--validate-only"]);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("valid"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("test_invalid_input_returns_nonzero", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const path = join(tmp, "bad.json");
    await Deno.writeTextFile(
      path,
      JSON.stringify({ groups: [minimalGroup({ risk: "unknown" })] }),
    );
    const result = await runCli([path, "--validate-only"]);
    assert.notEqual(result.code, 0);
    assert.ok(!result.stderr.includes("Traceback"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("test_missing_file_no_traceback", async () => {
  const result = await runCli(["/nonexistent/report.json", "--validate-only"]);
  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes("file not found"));
  assert.ok(!result.stderr.includes("Traceback"));
});

Deno.test("test_malformed_json_no_traceback", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const path = join(tmp, "bad.json");
    await Deno.writeTextFile(path, "{not json");
    const result = await runCli([path, "--validate-only"]);
    assert.notEqual(result.code, 0);
    assert.ok(result.stderr.includes("invalid JSON"));
    assert.ok(!result.stderr.includes("Traceback"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("test_parse_unified_diff_standard_hunk", () => {
  const patch = [
    "diff --git a/src/app.ts b/src/app.ts",
    "index abc..def 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,3 +1,4 @@",
    " context",
    "-old",
    "+new",
    "+added",
  ].join("\n");
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines[0].kind, "meta");
  assert.equal(lines[3].kind, "meta");
  assert.equal(lines[4].kind, "hunk");
  assert.equal(lines[5].kind, "context");
  assert.equal(lines[5].oldNum, 1);
  assert.equal(lines[5].newNum, 1);
  assert.equal(lines[6].kind, "del");
  assert.equal(lines[6].oldNum, 2);
  assert.equal(lines[6].newNum, null);
  assert.equal(lines[7].kind, "add");
  assert.equal(lines[7].oldNum, null);
  assert.equal(lines[7].newNum, 2);
  assert.equal(lines[8].kind, "add");
  assert.equal(lines[8].newNum, 3);
});

Deno.test("test_parse_unified_diff_omitted_counts_and_zero", () => {
  const patch = "@@ -1 +1 @@\n-old\n+new\n@@ -5,0 +6,2 @@\n+one\n+two";
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines[0].kind, "hunk");
  assert.equal(lines[1].oldNum, 1);
  assert.equal(lines[1].newNum, null);
  assert.equal(lines[2].oldNum, null);
  assert.equal(lines[2].newNum, 1);
  assert.equal(lines[3].kind, "hunk");
  assert.equal(lines[4].oldNum, null);
  assert.equal(lines[4].newNum, 6);
  assert.equal(lines[5].oldNum, null);
  assert.equal(lines[5].newNum, 7);
});

Deno.test("test_parse_unified_diff_crlf_trailing_newline_empty", () => {
  assert.deepEqual(splitPatchLines(""), []);
  assert.deepEqual(splitPatchLines("a\r\nb\r\nc\n"), ["a", "b", "c"]);
  assert.deepEqual(splitPatchLines("line\n"), ["line"]);
  const lines = parseUnifiedDiff("@@ -1 +1 @@\n-old\r\n+new\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1].kind, "del");
  assert.equal(lines[2].kind, "add");
});

Deno.test("test_parse_unified_diff_malformed_hunk_and_no_newline", () => {
  const patch = [
    "@@ truncated hunk",
    "+still add",
    "-still del",
    " still context",
    "\\ No newline at end of file",
  ].join("\n");
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines[0].kind, "hunk");
  assert.equal(lines[1].kind, "add");
  assert.equal(lines[1].oldNum, null);
  assert.equal(lines[1].newNum, null);
  assert.equal(lines[2].kind, "del");
  assert.equal(lines[3].kind, "context");
  assert.equal(lines[4].kind, "meta");
});

Deno.test("test_parse_unified_diff_file_headers_not_changes", () => {
  const patch = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new";
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines[0].kind, "meta");
  assert.equal(lines[1].kind, "meta");
  assert.equal(lines[2].kind, "hunk");
  assert.equal(lines[3].kind, "del");
  assert.equal(lines[4].kind, "add");
  const stats = countPatchStats(lines);
  assert.equal(stats.additions, 1);
  assert.equal(stats.deletions, 1);
});

Deno.test("test_parse_unified_diff_file_headers_after_completed_hunk_are_meta", () => {
  const patch = [
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "--- a/next",
    "+++ b/next",
  ].join("\n");
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines.length, 5);
  assert.equal(lines[3].kind, "meta");
  assert.equal(lines[3].text, "--- a/next");
  assert.equal(lines[3].oldNum, null);
  assert.equal(lines[4].kind, "meta");
  assert.equal(lines[4].text, "+++ b/next");
  assert.equal(lines[4].newNum, null);
  const stats = countPatchStats(lines);
  assert.equal(stats.additions, 1);
  assert.equal(stats.deletions, 1);
});

Deno.test("test_parse_unified_diff_zero_and_one_sided_hunk_line_numbering", () => {
  const deletionOnly = parseUnifiedDiff("@@ -4,2 +4,0 @@\n-one\n-two");
  assert.equal(deletionOnly[0].kind, "hunk");
  assert.equal(deletionOnly[1].kind, "del");
  assert.equal(deletionOnly[1].oldNum, 4);
  assert.equal(deletionOnly[1].newNum, null);
  assert.equal(deletionOnly[2].kind, "del");
  assert.equal(deletionOnly[2].oldNum, 5);
  assert.equal(deletionOnly[2].newNum, null);

  const additionOnly = parseUnifiedDiff("@@ -10,0 +10,2 @@\n+alpha\n+beta");
  assert.equal(additionOnly[1].kind, "add");
  assert.equal(additionOnly[1].oldNum, null);
  assert.equal(additionOnly[1].newNum, 10);
  assert.equal(additionOnly[2].kind, "add");
  assert.equal(additionOnly[2].oldNum, null);
  assert.equal(additionOnly[2].newNum, 11);

  const emptyHunk = parseUnifiedDiff(
    "@@ -1,0 +1,0 @@\n--- a/after\n+++ b/after",
  );
  assert.equal(emptyHunk[0].kind, "hunk");
  assert.equal(emptyHunk[1].kind, "meta");
  assert.equal(emptyHunk[2].kind, "meta");
});

Deno.test("test_parse_unified_diff_inconsistent_overrun_degrades_to_blank_numbers", () => {
  const patch = [
    "@@ -1,1 +1,2 @@",
    "-only-old",
    "-extra-del",
    "+first-add",
    "+second-add",
    "+third-add",
  ].join("\n");
  const lines = parseUnifiedDiff(patch);
  assert.equal(lines[1].kind, "del");
  assert.equal(lines[1].oldNum, 1);
  assert.equal(lines[2].kind, "del");
  assert.equal(lines[2].oldNum, null);
  assert.equal(lines[2].newNum, null);
  assert.equal(lines[3].kind, "add");
  assert.equal(lines[3].oldNum, null);
  assert.equal(lines[3].newNum, null);
  assert.equal(lines[4].kind, "add");
  assert.equal(lines[4].newNum, null);
  assert.equal(lines[5].kind, "add");
  assert.equal(lines[5].newNum, null);
});

Deno.test("test_html_diff_stats_always_show_both_counts_for_nonempty_patch", () => {
  const report = {
    groups: [
      minimalGroup({
        diffs: [
          minimalDiff({
            file: "meta-only.ts",
            patch: "--- a/meta-only.ts\n+++ b/meta-only.ts\n",
          }),
          minimalDiff({
            file: "deletions.ts",
            patch: "@@ -1,3 +1,0 @@\n-a\n-b\n-c",
          }),
        ],
      }),
    ],
  };
  const html = renderHtml(report);
  assert.ok(html.includes("'+' + stats.additions"));
  assert.ok(html.includes("'-' + stats.deletions"));
  assert.ok(!html.includes("stats.additions > 0"));
  assert.ok(!html.includes("stats.deletions > 0"));
  assert.ok(!html.includes("stats.additions > 0 || stats.deletions > 0"));
});

Deno.test("test_html_diff_view_labels_and_no_raw_patch_pre", () => {
  const html = renderHtml(structuredClone(SAMPLE_REPORT));
  for (
    const label of [
      "diff-card",
      "diff-summary",
      "diff-table",
      "diff-viewport",
      "diff-mode-btn",
      "全文表示",
      "差分のみ",
      "aria-pressed",
      "renderDiffCard",
      "parseUnifiedDiff",
      "setDiffMode",
      "diff-row-add",
      "diff-row-del",
      "diff-row-hunk",
      "diff-row-context",
      "diff-row-meta",
      "パッチなし",
    ]
  ) {
    assert.ok(html.includes(label), "missing diff label: " + label);
  }
  assert.ok(!html.includes('<pre class="patch"'));
  assert.ok(!html.includes("pre', 'patch"));
});

Deno.test("test_html_diff_empty_patch_renders_card", () => {
  const report = {
    groups: [
      minimalGroup({
        diffs: [
          minimalDiff({ patch: undefined }),
          minimalDiff({ file: "empty.ts", patch: "" }),
        ],
      }),
    ],
  };
  const html = renderHtml(report);
  assert.ok(html.includes("パッチなし"));
  assert.ok(html.includes("empty.ts"));
});
