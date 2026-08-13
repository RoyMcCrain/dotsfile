import assert from "node:assert/strict";
import { join } from "node:path";
import { validateReport } from "../../review-report/scripts/render_report.ts";
import { assembleReport } from "../scripts/assemble_report.ts";

const SCRIPT_PATH = join(
  import.meta.dirname!,
  "../scripts/assemble_report.ts",
);

const stage0 = (overrides: Record<string, unknown> = {}) => ({
  overview: "Rename the auth client and update imports.",
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
  ...overrides,
});

const repository = {
  name: "demo",
  trackedFiles: ["src/auth.ts", "README.md"],
  changes: [{ path: "src/auth.ts", status: "modified" }],
};

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

Deno.test("forces review.performed=false and drops leaked review fields", () => {
  const report = assembleReport(stage0(), { repository });
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
  const report = assembleReport(stage0(), { repository });
  assert.deepEqual(report.repository, repository);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("omits repository when requested", () => {
  const report = assembleReport(stage0(), { omitRepository: true });
  assert.equal(report.repository, undefined);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("does not copy a leaked stage0 plan", () => {
  const report = assembleReport(
    stage0({
      plan: { provided: true, label: "plans/leaked.md" },
    }),
    { repository },
  );
  assert.equal(report.plan, undefined);
  assert.deepEqual(validateReport(report), []);
});

Deno.test("CLI requires repository or explicit omit", async () => {
  const dir = await Deno.makeTempDir({
    prefix: "assemble-report-missing-repo-",
  });
  try {
    const stage0Path = join(dir, "stage0.json");
    const reportPath = join(dir, "report.json");
    await Deno.writeTextFile(stage0Path, `${JSON.stringify(stage0())}\n`);

    const assembled = await runCli([
      "--stage0",
      stage0Path,
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
