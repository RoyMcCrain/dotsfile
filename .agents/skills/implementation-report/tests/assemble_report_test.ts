import assert from "node:assert/strict";
import { join } from "node:path";
import { validateReport } from "../../review-report/scripts/render_report.ts";
import { assembleReport } from "../scripts/assemble_report.ts";

const SCRIPT_PATH = join(
  import.meta.dirname!,
  "../scripts/assemble_report.ts",
);

const intent = (overrides: Record<string, unknown> = {}) => ({
  summary: "Rename the auth client and update imports.",
  source: "current user request + plans/001.md",
  requirements: [
    {
      id: "rename-client",
      title: "Rename public auth client",
      description: "Rename the exported client and update call sites.",
      kind: "must",
    },
  ],
  ...overrides,
});

const acceptanceStage0 = (overrides: Record<string, unknown> = {}) => ({
  summary: "Implementation matches the rename requirement.",
  checks: [
    {
      requirementId: "rename-client",
      status: "satisfied",
      explanation: "Export and imports were renamed together.",
      evidence: [
        {
          file: "src/auth.ts",
          location: "L1",
          explanation: "Renamed export.",
        },
      ],
    },
  ],
  extras: [],
  verdict: "pass",
  validations: [{ command: "deno test", status: "passed", summary: "ok" }],
  ...overrides,
});

const stage0 = (overrides: Record<string, unknown> = {}) => ({
  overview: "Rename the auth client and update imports.",
  acceptance: acceptanceStage0(),
  groups: [
    {
      id: "auth-rename",
      title: "Auth rename",
      intent: "Rename the public client.",
      files: ["src/auth.ts"],
      diffs: [
        {
          file: "src/auth.ts",
          location: "L1",
          explanation: "Renames the export.",
        },
      ],
      risk: "high",
      riskReason: "analyzer leak",
      riskScore: 90,
      findings: [
        {
          id: "f-1",
          source: "blind",
          severity: "high",
          title: "leaked",
          problem: "should be dropped",
          evidence: "n/a",
          suggestion: "n/a",
        },
      ],
    },
  ],
  intent: {
    summary: "leaked intent from stage0",
    source: "stage0",
    requirements: [
      {
        id: "wrong",
        title: "wrong",
        description: "wrong",
        kind: "must",
      },
    ],
  },
  ...overrides,
});

const repository = {
  name: "demo",
  trackedFiles: ["src/auth.ts", "README.md"],
  changes: [{ path: "src/auth.ts", status: "modified" }],
};

const assemble = (
  stage0Input: Record<string, unknown> = stage0(),
  options: {
    intent?: Record<string, unknown>;
    validations?: Record<string, unknown>[];
  } = {},
) =>
  assembleReport(stage0Input, {
    intent: options.intent ?? intent(),
    validations: options.validations ?? [
      { command: "deno test", status: "passed", summary: "ok" },
    ],
    repository,
  });

const runCli = async (args: string[]) => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-read", "--allow-write", SCRIPT_PATH, ...args],
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

Deno.test("default title is Implementation acceptance report", () => {
  const report = assembleReport(stage0(), {
    intent: intent(),
    repository,
  });
  assert.equal(report.title, "Implementation acceptance report");
});

Deno.test("preserves separately supplied intent and ignores stage0.intent", () => {
  const supplied = intent({ summary: "Supplied intent summary." });
  const report = assemble(stage0(), { intent: supplied });
  assert.deepEqual(report.intent, supplied);
  assert.notEqual(
    (report.intent as Record<string, unknown>).summary,
    "leaked intent from stage0",
  );
});

Deno.test("ignores leaked analyzer verdict and validations", () => {
  const report = assemble(
    stage0({
      acceptance: acceptanceStage0({
        verdict: "fail",
        validations: [
          { command: "leaked", status: "failed", summary: "should ignore" },
        ],
      }),
    }),
    { validations: [] },
  );
  const acceptance = report.acceptance as Record<string, unknown>;
  assert.equal(acceptance.verdict, "needs-confirmation");
  assert.deepEqual(acceptance.validations, []);
});

Deno.test("verdict pass when all checks satisfied and validations passed", () => {
  const report = assemble(stage0(), {
    validations: [{ command: "deno test", status: "passed", summary: "ok" }],
  });
  assert.equal((report.acceptance as Record<string, unknown>).verdict, "pass");
});

Deno.test("verdict fail when check is missing", () => {
  const report = assemble(stage0({
    acceptance: acceptanceStage0({
      checks: [
        {
          requirementId: "rename-client",
          status: "missing",
          explanation: "Rename not found.",
          evidence: [],
        },
      ],
    }),
  }));
  assert.equal((report.acceptance as Record<string, unknown>).verdict, "fail");
});

Deno.test("verdict fail when check is contradicted", () => {
  const report = assemble(stage0({
    acceptance: acceptanceStage0({
      checks: [
        {
          requirementId: "rename-client",
          status: "contradicted",
          explanation: "Implementation does the opposite.",
          evidence: [
            {
              file: "src/auth.ts",
              explanation: "Old name remains.",
            },
          ],
        },
      ],
    }),
  }));
  assert.equal((report.acceptance as Record<string, unknown>).verdict, "fail");
});

Deno.test("verdict fail when validation failed", () => {
  const report = assemble(stage0(), {
    validations: [{ command: "deno test", status: "failed", summary: "boom" }],
  });
  assert.equal((report.acceptance as Record<string, unknown>).verdict, "fail");
});

Deno.test("verdict needs-confirmation for partial check", () => {
  const report = assemble(stage0({
    acceptance: acceptanceStage0({
      checks: [
        {
          requirementId: "rename-client",
          status: "partial",
          explanation: "Only some call sites updated.",
          evidence: [
            { file: "src/auth.ts", explanation: "Export renamed." },
          ],
        },
      ],
    }),
  }));
  assert.equal(
    (report.acceptance as Record<string, unknown>).verdict,
    "needs-confirmation",
  );
});

Deno.test("verdict needs-confirmation for unverified check", () => {
  const report = assemble(stage0({
    acceptance: acceptanceStage0({
      checks: [
        {
          requirementId: "rename-client",
          status: "unverified",
          explanation: "Could not confirm runtime behavior.",
          evidence: [],
        },
      ],
    }),
  }));
  assert.equal(
    (report.acceptance as Record<string, unknown>).verdict,
    "needs-confirmation",
  );
});

Deno.test("verdict needs-confirmation when extras exist", () => {
  const report = assemble(stage0({
    acceptance: acceptanceStage0({
      extras: [
        {
          title: "Unrequested README tweak",
          explanation: "Updated docs outside scope.",
          files: ["README.md"],
        },
      ],
    }),
  }));
  assert.equal(
    (report.acceptance as Record<string, unknown>).verdict,
    "needs-confirmation",
  );
});

Deno.test("verdict needs-confirmation when validation not-run", () => {
  const report = assemble(stage0(), {
    validations: [{
      command: "deno lint",
      status: "not-run",
      summary: "Skipped in sandbox.",
    }],
  });
  assert.equal(
    (report.acceptance as Record<string, unknown>).verdict,
    "needs-confirmation",
  );
});

Deno.test("forces review.performed=false and drops leaked review fields", () => {
  const report = assemble();
  assert.deepEqual(report.review, { performed: false, overview: "" });
  const group = (report.groups as Record<string, unknown>[])[0];
  assert.equal(group.risk, undefined);
  assert.equal(group.riskReason, undefined);
  assert.equal(group.riskScore, undefined);
  assert.equal(group.findings, undefined);
  assert.equal(group.id, "auth-rename");
  assert.deepEqual(group.files, ["src/auth.ts"]);
});

Deno.test("includes repository and passes validateReport", () => {
  const report = assemble();
  assert.deepEqual(report.repository, repository);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("preserves patch-grounded diagrams", () => {
  const diagrams = [
    {
      id: "auth-flow",
      title: "Authentication flow",
      summary: "Expected rename path vs actual rename path.",
      evidence: ["src/auth.ts:1"],
      mermaid: "flowchart LR\n  subgraph 期待\n    A --> B\n  end",
    },
  ];
  const report = assemble(stage0({ diagrams }), {});
  assert.deepEqual(report.diagrams, diagrams);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("omits repository when requested", () => {
  const report = assembleReport(stage0(), {
    intent: intent(),
    omitRepository: true,
  });
  assert.equal(report.repository, undefined);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("does not copy a leaked stage0 plan", () => {
  const report = assemble(stage0({
    plan: { provided: true, label: "plans/leaked.md" },
  }));
  assert.equal(report.plan, undefined);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("throws when acceptance.checks is missing", () => {
  assert.throws(
    () =>
      assemble(stage0({
        acceptance: {
          summary: "Summary only.",
          extras: [],
        },
      })),
    /stage0\.acceptance\.checks must be an array/,
  );
});

Deno.test("throws when acceptance.checks is not an array", () => {
  assert.throws(
    () =>
      assemble(stage0({
        acceptance: acceptanceStage0({ checks: { bad: true } }),
      })),
    /stage0\.acceptance\.checks must be an array/,
  );
});

Deno.test("throws when acceptance.extras is missing", () => {
  assert.throws(
    () =>
      assemble(stage0({
        acceptance: {
          summary: "Summary only.",
          checks: acceptanceStage0().checks,
        },
      })),
    /stage0\.acceptance\.extras must be an array/,
  );
});

Deno.test("throws when acceptance.extras is not an array", () => {
  assert.throws(
    () =>
      assemble(stage0({
        acceptance: acceptanceStage0({ extras: { bad: true } }),
      })),
    /stage0\.acceptance\.extras must be an array/,
  );
});

Deno.test("verdict needs-confirmation when validations are empty", () => {
  const report = assemble(stage0(), { validations: [] });
  assert.equal(
    (report.acceptance as Record<string, unknown>).verdict,
    "needs-confirmation",
  );
  assert.deepEqual(validateReport(report), []);
});

Deno.test("CLI requires --intent", async () => {
  const dir = await Deno.makeTempDir({ prefix: "assemble-report-no-intent-" });
  try {
    const stage0Path = join(dir, "stage0.json");
    const repositoryPath = join(dir, "repository.json");
    const reportPath = join(dir, "report.json");
    await Deno.writeTextFile(stage0Path, `${JSON.stringify(stage0())}\n`);
    await Deno.writeTextFile(
      repositoryPath,
      `${JSON.stringify(repository)}\n`,
    );

    const assembled = await runCli([
      "--stage0",
      stage0Path,
      "--repository",
      repositoryPath,
      "-o",
      reportPath,
    ]);
    assert.notEqual(assembled.code, 0);
    assert.match(assembled.stderr, /--intent/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("CLI accepts --validation JSON array", async () => {
  const dir = await Deno.makeTempDir({ prefix: "assemble-report-validation-" });
  try {
    const stage0Path = join(dir, "stage0.json");
    const intentPath = join(dir, "intent.json");
    const validationPath = join(dir, "validation.json");
    const repositoryPath = join(dir, "repository.json");
    const reportPath = join(dir, "report.json");
    await Deno.writeTextFile(stage0Path, `${JSON.stringify(stage0())}\n`);
    await Deno.writeTextFile(intentPath, `${JSON.stringify(intent())}\n`);
    await Deno.writeTextFile(
      validationPath,
      `${
        JSON.stringify([{
          command: "deno test",
          status: "passed",
          summary: "all green",
        }])
      }\n`,
    );
    await Deno.writeTextFile(
      repositoryPath,
      `${JSON.stringify(repository)}\n`,
    );

    const assembled = await runCli([
      "--stage0",
      stage0Path,
      "--intent",
      intentPath,
      "--validation",
      validationPath,
      "--repository",
      repositoryPath,
      "-o",
      reportPath,
    ]);
    assert.equal(assembled.code, 0, assembled.stderr);

    const report = JSON.parse(await Deno.readTextFile(reportPath));
    assert.deepEqual(report.acceptance.validations, [{
      command: "deno test",
      status: "passed",
      summary: "all green",
    }]);
    assert.deepEqual(validateReport(report), []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("CLI requires repository or explicit omit", async () => {
  const dir = await Deno.makeTempDir({
    prefix: "assemble-report-missing-repo-",
  });
  try {
    const stage0Path = join(dir, "stage0.json");
    const intentPath = join(dir, "intent.json");
    const reportPath = join(dir, "report.json");
    await Deno.writeTextFile(stage0Path, `${JSON.stringify(stage0())}\n`);
    await Deno.writeTextFile(intentPath, `${JSON.stringify(intent())}\n`);

    const assembled = await runCli([
      "--stage0",
      stage0Path,
      "--intent",
      intentPath,
      "-o",
      reportPath,
    ]);
    assert.notEqual(assembled.code, 0);
    assert.match(assembled.stderr, /--repository or --omit-repository/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("CLI assemble is valid for --validate-only", async () => {
  const dir = await Deno.makeTempDir({ prefix: "assemble-report-" });
  try {
    const stage0Path = join(dir, "stage0.json");
    const intentPath = join(dir, "intent.json");
    const repositoryPath = join(dir, "repository.json");
    const reportPath = join(dir, "report.json");
    await Deno.writeTextFile(stage0Path, `${JSON.stringify(stage0())}\n`);
    await Deno.writeTextFile(intentPath, `${JSON.stringify(intent())}\n`);
    await Deno.writeTextFile(
      repositoryPath,
      `${JSON.stringify(repository)}\n`,
    );

    const assembled = await runCli([
      "--stage0",
      stage0Path,
      "--intent",
      intentPath,
      "--repository",
      repositoryPath,
      "-o",
      reportPath,
    ]);
    assert.equal(assembled.code, 0, assembled.stderr);

    const renderer = join(
      import.meta.dirname!,
      "../../review-report/scripts/render_report.ts",
    );
    const validated = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-read",
        renderer,
        reportPath,
        "--validate-only",
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(validated.code, 0, new TextDecoder().decode(validated.stderr));
    assert.equal(new TextDecoder().decode(validated.stdout).trim(), "valid");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
