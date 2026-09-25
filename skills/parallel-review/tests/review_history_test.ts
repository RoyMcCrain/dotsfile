import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveAssessment } from "../scripts/review_history.ts";

const SCRIPT_PATH = join(import.meta.dirname!, "../scripts/review_history.ts");
const SKILL_PATH = join(import.meta.dirname!, "../SKILL.md");
const REAL_HOME = Deno.env.get("HOME") ?? "";

type ExecutionRecord = {
  id: string;
  backend: string;
  model: string;
  chunk: string;
  timeout: number;
  retryTimeout: number;
  maxAttempts: number;
  status: "pending" | "running" | "completed";
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  stdoutLog: string;
  stderrLog: string;
};

type Assessment = {
  actor: { kind: "agent" | "human"; id: string };
  reviews: Array<{
    executionId: string;
    verdict: "findings" | "no_findings" | "unparsed" | "unavailable";
    findings: Array<Record<string, unknown>>;
  }>;
};

const ISO = "2026-09-25T06:00:00.000Z";
const ISO_END = "2026-09-25T06:05:00.000Z";
const ISO_MS = "2026-09-25T06:00:00.123Z";

const withFixedNow = async (
  iso: string,
  fn: () => Promise<void>,
): Promise<void> => {
  const RealDate = Date;
  const fixedMs = RealDate.parse(iso);
  const MockDate = new Proxy(RealDate, {
    construct(_target, args: unknown[]) {
      return args.length === 0
        ? new RealDate(fixedMs)
        : new RealDate(...(args as ConstructorParameters<typeof Date>));
    },
    apply(_target, _thisArg, args: unknown[]) {
      return args.length === 0
        ? new RealDate(fixedMs)
        : new RealDate(...(args as ConstructorParameters<typeof Date>));
    },
    get(target, prop, receiver) {
      if (prop === "now") return () => fixedMs;
      return Reflect.get(target, prop, receiver);
    },
  });
  globalThis.Date = MockDate as unknown as DateConstructor;
  try {
    await fn();
  } finally {
    globalThis.Date = RealDate;
  }
};

const childEnv = (home: string, xdg: string): Record<string, string> => ({
  HOME: home,
  XDG_DATA_HOME: xdg,
});

const withTempHome = async (
  fn: (home: string, xdg: string) => Promise<void>,
): Promise<void> => {
  const home = await mkdtemp(join(tmpdir(), "pr-home-"));
  const xdg = join(home, "xdg-data");
  await mkdir(xdg, { recursive: true });
  try {
    await fn(home, xdg);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
};

const initRunViaCli = async (
  home: string,
  xdg: string,
  options: { repository: string; revision: string; level: number },
) => {
  const initOut = await runCli([
    "init",
    "--repository",
    options.repository,
    "--revision",
    options.revision,
    "--level",
    String(options.level),
  ], childEnv(home, xdg));
  assert.equal(initOut.code, 0, initOut.stderr);
  const runDir = initOut.stdout.trim();
  const metadata = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  );
  return { runDir, runId: metadata.runId as string, metadata };
};

const writeExecution = async (
  runDir: string,
  record: ExecutionRecord,
): Promise<void> => {
  const dir = join(runDir, "executions");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    { mode: 0o600 },
  );
};

const minimalExecution = (
  overrides: Partial<ExecutionRecord> = {},
): ExecutionRecord => ({
  id: "whole-r01",
  backend: "pi",
  model: "provider/model-a:high",
  chunk: "changes.patch",
  timeout: 600,
  retryTimeout: 600,
  maxAttempts: 2,
  status: "completed",
  startedAt: ISO,
  endedAt: ISO_END,
  exitCode: 0,
  stdoutLog: "logs/whole-r01.stdout.log",
  stderrLog: "logs/whole-r01.stderr.log",
  ...overrides,
});

const setupRunDir = async (
  home: string,
  xdg: string,
  executions: ExecutionRecord[],
) => {
  const { runDir, metadata } = await initRunViaCli(home, xdg, {
    repository: "/tmp/repo",
    revision: "abc123deadbeef",
    level: 2,
  });
  assert.match(runDir, new RegExp(`^${xdg.replaceAll("/", "\\/")}`));
  await writeFile(join(runDir, "changes.patch"), "diff content\n", {
    mode: 0o600,
  });
  await writeFile(join(runDir, "prompt.md"), "review prompt\n", {
    mode: 0o600,
  });
  await mkdir(join(runDir, "logs"), { recursive: true });
  for (const exec of executions) {
    await writeExecution(runDir, exec);
    await writeFile(join(runDir, exec.stdoutLog), "stdout\n", { mode: 0o600 });
    await writeFile(join(runDir, exec.stderrLog), "stderr\n", { mode: 0o600 });
  }
  return { runDir, metadata: metadata as Record<string, unknown> };
};

const minimalAssessment = (
  executionId: string,
  verdict: Assessment["reviews"][number]["verdict"],
  findings: Assessment["reviews"][number]["findings"] = [],
): Assessment => ({
  actor: { kind: "agent", id: "cursor/composer-2.5-fast:default" },
  reviews: [{ executionId, verdict, findings }],
});

const multiAssessment = (
  reviews: Assessment["reviews"],
  actor: Assessment["actor"] = {
    kind: "agent",
    id: "cursor/composer-2.5-fast:default",
  },
): Assessment => ({ actor, reviews });

const runCli = async (
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--allow-read",
      "--allow-write",
      "--allow-env=HOME,XDG_DATA_HOME",
      SCRIPT_PATH,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), ...env },
  });
  const out = await cmd.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
};

const devboxBashEnv = (): Record<string, string> => {
  const devboxBin = join(
    REAL_HOME,
    ".local/share/devbox/global/default/.devbox/nix/profile/default/bin",
  );
  return { PATH: `${devboxBin}:${Deno.env.get("PATH") ?? ""}` };
};

const findBash5 = async (): Promise<string> => {
  const env = { ...Deno.env.toObject(), ...devboxBashEnv() };
  const out = await new Deno.Command("bash", {
    args: ["-c", "echo ${BASH_VERSINFO[0]}"],
    stdout: "piped",
    stderr: "piped",
    env,
  }).output();
  if (out.code !== 0) {
    throw new Error("bash required for SKILL integration test");
  }
  const major = Number(new TextDecoder().decode(out.stdout).trim());
  if (!Number.isFinite(major) || major < 5) {
    throw new Error("bash 5+ required for SKILL integration test");
  }
  return "bash";
};

const extractBashBlock = (markdown: string, marker: string): string => {
  const idx = markdown.indexOf(marker);
  assert.notEqual(idx, -1, `marker not found: ${marker}`);
  const rest = markdown.slice(idx);
  const fenceStart = rest.indexOf("```bash\n");
  assert.notEqual(
    fenceStart,
    -1,
    `opening bash fence not found after: ${marker}`,
  );
  const start = fenceStart + "```bash\n".length;
  const end = rest.indexOf("\n```", start);
  assert.notEqual(end, -1, `closing fence not found after: ${marker}`);
  return rest.slice(start, end);
};

const checkBashBlock = async (bash5: string, script: string): Promise<void> => {
  const path = join(tmpdir(), `pr-bash-${crypto.randomUUID()}.sh`);
  const env = { ...Deno.env.toObject(), ...devboxBashEnv() };
  const wrapped = `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`;
  await writeFile(path, wrapped, { mode: 0o755 });
  try {
    const syntax = await new Deno.Command(bash5, {
      args: ["-n", path],
      stdout: "piped",
      stderr: "piped",
      env,
    }).output();
    assert.equal(syntax.code, 0, new TextDecoder().decode(syntax.stderr));

    const shellcheck = await new Deno.Command("shellcheck", {
      args: ["-x", path],
      stdout: "piped",
      stderr: "piped",
      env,
    }).output();
    assert.equal(
      shellcheck.code,
      0,
      new TextDecoder().decode(shellcheck.stderr),
    );

    const shfmt = await new Deno.Command("shfmt", {
      args: ["-d", path],
      stdout: "piped",
      stderr: "piped",
      env,
    }).output();
    assert.equal(shfmt.code, 0, new TextDecoder().decode(shfmt.stdout));
  } finally {
    await rm(path, { force: true });
  }
};

Deno.test("init creates private run dir with metadata context", async () => {
  await withTempHome(async (home, xdg) => {
    const runsBase = join(xdg, "parallel-review", "runs");

    const first = await initRunViaCli(home, xdg, {
      repository: "/Users/roy/project",
      revision: "abc123",
      level: 1,
    });
    const second = await initRunViaCli(home, xdg, {
      repository: "/Users/roy/project",
      revision: "abc123",
      level: 1,
    });

    assert.notEqual(first.runDir, second.runDir);
    assert.notEqual(first.runId, second.runId);
    assert.match(
      first.runDir,
      new RegExp(`^${runsBase.replaceAll("/", "\\/")}/`),
    );
    assert.match(first.runDir, /\/\d{4}-\d{2}-\d{2}-[0-9a-f-]+$/);

    const stat = await Deno.stat(first.runDir);
    assert.equal(stat.mode! & 0o777, 0o700);

    const metaRaw = await readFile(join(first.runDir, "metadata.json"), "utf8");
    const meta = JSON.parse(metaRaw);
    assert.equal(meta.schemaVersion, 1);
    assert.equal(meta.runId, first.runId);
    assert.equal(meta.repository, "/Users/roy/project");
    assert.equal(meta.revision, "abc123");
    assert.equal(meta.level, 1);
    assert.match(
      meta.createdAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    const metaStat = await Deno.stat(join(first.runDir, "metadata.json"));
    assert.equal(metaStat.mode! & 0o777, 0o600);
  });
});

Deno.test("init rejects invalid level and relative XDG_DATA_HOME", async () => {
  await withTempHome(async (home, xdg) => {
    for (const level of [0, 4]) {
      const out = await runCli([
        "init",
        "--repository",
        "/tmp/r",
        "--revision",
        "x",
        "--level",
        String(level),
      ], childEnv(home, xdg));
      assert.notEqual(out.code, 0);
      assert.match(out.stderr, /level must be 1, 2, or 3/);
    }
    const noRepo = await runCli([
      "init",
      "--repository",
      " ",
      "--revision",
      "x",
      "--level",
      "2",
    ], childEnv(home, xdg));
    assert.notEqual(noRepo.code, 0);
    assert.match(noRepo.stderr, /repository is required/);

    const noRev = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      " ",
      "--level",
      "2",
    ], childEnv(home, xdg));
    assert.notEqual(noRev.code, 0);
    assert.match(noRev.stderr, /revision is required/);
  });

  const home = await mkdtemp(join(tmpdir(), "pr-rel-xdg-"));
  try {
    const out = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      "x",
      "--level",
      "2",
    ], { HOME: home, XDG_DATA_HOME: "relative/path" });
    assert.notEqual(out.code, 0);
    assert.match(out.stderr, /XDG_DATA_HOME must be absolute/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("init treats empty XDG_DATA_HOME as absent", async () => {
  const home = await mkdtemp(join(tmpdir(), "pr-empty-xdg-"));
  try {
    const out = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      "rev",
      "--level",
      "2",
    ], { HOME: home, XDG_DATA_HOME: "" });
    assert.equal(out.code, 0, out.stderr);
    assert.match(
      out.stdout.trim(),
      new RegExp(`${home.replaceAll("/", "\\/")}/.local/share/`),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

const runInitWithFixedDate = async (
  home: string,
  xdg: string,
  fixedIso: string,
): Promise<{ runDir: string; createdAt: string }> => {
  const scriptPath = join(tmpdir(), `pr-init-date-${crypto.randomUUID()}.ts`);
  await writeFile(
    scriptPath,
    `const RealDate = Date;
const fixedMs = RealDate.parse(${JSON.stringify(fixedIso)});
globalThis.Date = new Proxy(RealDate, {
  construct(_target, args) {
    return args.length === 0 ? new RealDate(fixedMs) : new RealDate(...args);
  },
  apply(_target, _thisArg, args) {
    return args.length === 0 ? new RealDate(fixedMs) : new RealDate(...args);
  },
  get(target, prop, receiver) {
    if (prop === "now") return () => fixedMs;
    return Reflect.get(target, prop, receiver);
  },
}) as DateConstructor;
const { initRun } = await import(${JSON.stringify(SCRIPT_PATH)});
const { runDir, metadata } = await initRun({
  repository: "/tmp/repo",
  revision: "abc123",
  level: 2,
});
console.log(JSON.stringify({ runDir, createdAt: metadata.createdAt }));
`,
    { mode: 0o600 },
  );
  try {
    const out = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--allow-read",
        "--allow-write",
        "--allow-env=HOME,XDG_DATA_HOME",
        scriptPath,
      ],
      stdout: "piped",
      stderr: "piped",
      env: { ...Deno.env.toObject(), ...childEnv(home, xdg) },
    }).output();
    assert.equal(out.code, 0, new TextDecoder().decode(out.stderr));
    const parsed = JSON.parse(new TextDecoder().decode(out.stdout).trim()) as {
      runDir: string;
      createdAt: string;
    };
    return parsed;
  } finally {
    await rm(scriptPath, { force: true });
  }
};

Deno.test("init and save preserve millisecond precision in ISO UTC timestamps", async () => {
  await withTempHome(async (home, xdg) => {
    const fixedInit = await runInitWithFixedDate(home, xdg, ISO_MS);
    assert.equal(fixedInit.createdAt, ISO_MS);

    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const meta = JSON.parse(
      await readFile(join(runDir, "metadata.json"), "utf8"),
    );
    assert.match(
      meta.createdAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    await withFixedNow(ISO_MS, async () => {
      const saved = await saveAssessment({
        runDir,
        assessment: minimalAssessment("whole-r01", "no_findings"),
      });
      const snapshot = JSON.parse(await readFile(saved.snapshotPath, "utf8"));
      assert.equal(snapshot.savedAt, ISO_MS);
    });
  });
});

Deno.test("pending execution progresses to running and completed; regression rejected", async () => {
  await withTempHome(async (home, xdg) => {
    let exec = minimalExecution({
      status: "pending",
      endedAt: undefined,
      exitCode: undefined,
    });
    const { runDir } = await setupRunDir(home, xdg, [exec]);

    await saveAssessment({
      runDir,
      assessment: minimalAssessment("whole-r01", "unavailable"),
    });

    exec = { ...exec, status: "running" };
    await writeExecution(runDir, exec);
    const runningSave = await saveAssessment({
      runDir,
      assessment: minimalAssessment("whole-r01", "unavailable"),
    });

    await writeExecution(runDir, { ...exec, status: "pending" });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "unavailable"),
        }),
      /status regressed/,
    );

    exec = {
      ...exec,
      status: "completed",
      endedAt: ISO_END,
      exitCode: 0,
    };
    await writeExecution(runDir, exec);
    const completedSave = await saveAssessment({
      runDir,
      assessment: minimalAssessment("whole-r01", "no_findings"),
    });

    const first = JSON.parse(
      await readFile(runningSave.snapshotPath, "utf8"),
    );
    const last = JSON.parse(
      await readFile(completedSave.snapshotPath, "utf8"),
    );
    for (const field of ["backend", "model", "chunk", "startedAt"] as const) {
      assert.equal(first.executions[0][field], last.executions[0][field]);
    }
    assert.equal(last.executions[0].status, "completed");

    const snapDir = join(runDir, "snapshots");
    const snapPaths = [];
    for await (const entry of Deno.readDir(snapDir)) {
      snapPaths.push(join(snapDir, entry.name));
    }
    snapPaths.sort();
    const jqLatest = await new Deno.Command("jq", {
      args: [
        "-nr",
        "[inputs | {path: input_filename, savedAt}] | max_by(.savedAt) | .path",
        ...snapPaths,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(jqLatest.code, 0, new TextDecoder().decode(jqLatest.stderr));
    assert.equal(
      new TextDecoder().decode(jqLatest.stdout).trim(),
      completedSave.snapshotPath,
    );

    const jqAgg = await new Deno.Command("jq", {
      args: [
        "-r",
        `.executions as $execs |
[.reviews[] | . as $r |
  ($execs[] | select(.id == $r.executionId)) as $e |
  {model: $e.model, issueKeys: [$r.findings[].issueKey] | unique}]
| group_by(.model)[] |
{model: .[0].model, distinct_issues: (map(.issueKeys[]) | unique | length)}`,
        completedSave.snapshotPath,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(jqAgg.code, 0, new TextDecoder().decode(jqAgg.stderr));
    const agg = JSON.parse(new TextDecoder().decode(jqAgg.stdout));
    assert.equal(agg.model, "provider/model-a:high");
    assert.equal(agg.distinct_issues, 0);
  });
});

Deno.test("save preserves patch/model hashes and accepted/rejected findings", async () => {
  await withTempHome(async (home, xdg) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir(home, xdg, [exec]);
    const assessment = minimalAssessment("whole-r01", "findings", [
      {
        id: "f1",
        issueKey: "issue-auth",
        severity: "high",
        location: "src/auth.ts:42",
        original: "Missing null check on token",
        decision: "accepted",
        reason: "Confirmed by reading source",
        verification: "confirmed",
        evidence: "token can be undefined at line 42",
        action: "unknown",
      },
      {
        id: "f2",
        issueKey: "issue-nit",
        severity: "low",
        location: "src/util.ts:1",
        original: "Naming could be clearer",
        decision: "rejected",
        reason: "Style-only, out of scope",
        verification: "not_checked",
        action: "unknown",
      },
    ]);

    const { snapshotPath } = await saveAssessment({ runDir, assessment });
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.actor.id, "cursor/composer-2.5-fast:default");
    assert.equal(snapshot.executions.length, 1);
    assert.equal(snapshot.executions[0].model, "provider/model-a:high");
    assert.match(snapshot.files.patch.sha256, /^[a-f0-9]{64}$/);
    assert.match(snapshot.files.prompt.sha256, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.reviews.length, 1);
    assert.equal(snapshot.reviews[0].findings.length, 2);
    assert.equal(snapshot.reviews[0].findings[0].issueKey, "issue-auth");
    assert.equal(snapshot.reviews[0].findings[1].decision, "rejected");
  });
});

Deno.test("save enforces verdict rules for exit codes", async () => {
  await withTempHome(async (home, xdg) => {
    const ok = minimalExecution({ id: "whole-r01", exitCode: 0 });
    const fail = minimalExecution({
      id: "whole-r02",
      model: "provider/model-b:high",
      exitCode: 124,
      stdoutLog: "logs/whole-r02.stdout.log",
      stderrLog: "logs/whole-r02.stderr.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [ok, fail]);
    await writeFile(join(runDir, fail.stdoutLog), "partial\n", { mode: 0o600 });
    await writeFile(join(runDir, fail.stderrLog), "timeout\n", { mode: 0o600 });

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: multiAssessment([
            { executionId: "whole-r01", verdict: "no_findings", findings: [] },
            { executionId: "whole-r02", verdict: "no_findings", findings: [] },
          ]),
        }),
      /whole-r02.*unavailable/,
    );

    const saved = await saveAssessment({
      runDir,
      assessment: multiAssessment([
        { executionId: "whole-r01", verdict: "no_findings", findings: [] },
        { executionId: "whole-r02", verdict: "unavailable", findings: [] },
      ]),
    });
    const snapshot = JSON.parse(await readFile(saved.snapshotPath, "utf8"));
    assert.equal(snapshot.reviews[1].verdict, "unavailable");
  });
});

Deno.test("save rejects missing duplicate and unknown execution IDs", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const base = minimalAssessment("whole-r01", "no_findings");

    await assert.rejects(
      () => saveAssessment({ runDir, assessment: { ...base, reviews: [] } }),
      /missing execution review: whole-r01/,
    );
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            ...base,
            reviews: [
              {
                executionId: "whole-r01",
                verdict: "no_findings",
                findings: [],
              },
              {
                executionId: "whole-r01",
                verdict: "no_findings",
                findings: [],
              },
            ],
          },
        }),
      /duplicate execution review: whole-r01/,
    );
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            ...base,
            reviews: [{
              executionId: "unknown-r99",
              verdict: "unavailable",
              findings: [],
            }],
          },
        }),
      /unknown execution review: unknown-r99/,
    );
  });
});

Deno.test("save rejects duplicate finding ids and findings on non-findings verdict", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const finding = {
      id: "f1",
      issueKey: "k1",
      severity: "low",
      location: "a.ts:1",
      original: "issue",
      decision: "pending",
    };

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings", [finding]),
        }),
      /findings must be empty for verdict no_findings/,
    );

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "findings", [
            finding,
            { ...finding },
          ]),
        }),
      /duplicate finding id within whole-r01: f1/,
    );
  });
});

Deno.test("save rejects path traversal and symlink escapes on log reads", async () => {
  await withTempHome(async (home, xdg) => {
    const exec = minimalExecution({
      stdoutLog: "../outside.stdout.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [exec]);
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /path escapes run dir|must be run-relative/,
    );

    const exec2 = minimalExecution({
      id: "whole-r02",
      stdoutLog: "logs/link.stdout.log",
    });
    const { runDir: runDir2 } = await setupRunDir(home, xdg, [exec2]);
    const outside = join(xdg, "outside-secret.log");
    await writeFile(outside, "secret", { mode: 0o600 });
    const linkPath = join(runDir2, "logs/link.stdout.log");
    await rm(linkPath);
    await symlink(outside, linkPath);
    await assert.rejects(
      () =>
        saveAssessment({
          runDir: runDir2,
          assessment: minimalAssessment("whole-r02", "no_findings"),
        }),
      /path escapes run dir|not a regular file/,
    );
  });
});

Deno.test("save rejects symlink escapes for metadata execution and snapshot JSON reads", async () => {
  await withTempHome(async (home, xdg) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir(home, xdg, [exec]);
    const outsideMeta = join(home, "outside-metadata.json");
    await writeFile(
      outsideMeta,
      JSON.stringify({
        schemaVersion: 1,
        runId: "evil",
        createdAt: ISO,
        repository: "/tmp/repo",
        revision: "abc123deadbeef",
        level: 2,
      }),
      { mode: 0o600 },
    );
    const metaPath = join(runDir, "metadata.json");
    await rm(metaPath);
    await symlink(outsideMeta, metaPath);
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /path escapes run dir/,
    );

    const { runDir: runDir2 } = await setupRunDir(home, xdg, [exec]);
    const outsideExec = join(home, "outside-exec.json");
    await writeFile(outsideExec, JSON.stringify(exec), { mode: 0o600 });
    const execPath = join(runDir2, "executions/whole-r01.json");
    await rm(execPath);
    await symlink(outsideExec, execPath);
    await assert.rejects(
      () =>
        saveAssessment({
          runDir: runDir2,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /path escapes run dir/,
    );

    const { runDir: runDir3 } = await setupRunDir(home, xdg, [exec]);
    await saveAssessment({
      runDir: runDir3,
      assessment: minimalAssessment("whole-r01", "no_findings"),
    });
    const snapshotsDir = join(runDir3, "snapshots");
    const snapshotName = (await Array.fromAsync(Deno.readDir(snapshotsDir)))[0]
      .name;
    const outsideSnapshot = join(home, "outside-snapshot.json");
    await writeFile(
      outsideSnapshot,
      await readFile(join(snapshotsDir, snapshotName)),
      { mode: 0o600 },
    );
    const snapshotPath = join(snapshotsDir, snapshotName);
    await rm(snapshotPath);
    await symlink(outsideSnapshot, snapshotPath);
    await assert.rejects(
      () =>
        saveAssessment({
          runDir: runDir3,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /path escapes run dir/,
    );
  });
});

Deno.test("save preserves prior snapshot and rejects identity tampering", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const finding = {
      id: "f1",
      issueKey: "issue-1",
      severity: "medium",
      location: "a.ts:1",
      original: "original text",
      decision: "accepted",
      reason: "looks valid",
      verification: "confirmed",
      evidence: "checked code",
      action: "unknown",
    };
    const assessment = minimalAssessment("whole-r01", "findings", [finding]);

    const first = await saveAssessment({ runDir, assessment });
    const second = await saveAssessment({
      runDir,
      assessment: {
        ...assessment,
        reviews: [{
          ...assessment.reviews[0],
          findings: [{
            ...finding,
            decision: "rejected",
            reason: "human override",
          }],
        }],
      },
    });

    assert.notEqual(first.snapshotPath, second.snapshotPath);
    const snapshotsDir = join(runDir, "snapshots");
    const entries = [];
    for await (const entry of Deno.readDir(snapshotsDir)) {
      entries.push(entry.name);
    }
    assert.equal(entries.length, 2);

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            ...assessment,
            reviews: [{
              ...assessment.reviews[0],
              findings: [{ ...finding, original: "tampered text" }],
            }],
          },
        }),
      /immutable finding original changed/,
    );

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            ...assessment,
            reviews: [{
              executionId: "whole-r01",
              verdict: "no_findings",
              findings: [],
            }],
          },
        }),
      /prior finding removed/,
    );

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            ...assessment,
            reviews: [{
              ...assessment.reviews[0],
              findings: [{ ...finding, issueKey: "issue-2" }],
            }],
          },
        }),
      /immutable finding issueKey changed/,
    );

    const tamperedExec = minimalExecution({ model: "provider/model-c:high" });
    await writeExecution(runDir, tamperedExec);
    await assert.rejects(
      () => saveAssessment({ runDir, assessment }),
      /completed execution whole-r01 changed/,
    );
  });
});

Deno.test("save rejects tampering completed no_findings execution", async () => {
  await withTempHome(async (home, xdg) => {
    const execA = minimalExecution({ id: "whole-r01" });
    const execB = minimalExecution({
      id: "whole-r02",
      model: "provider/model-b:high",
      stdoutLog: "logs/whole-r02.stdout.log",
      stderrLog: "logs/whole-r02.stderr.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [execA, execB]);

    await saveAssessment({
      runDir,
      assessment: multiAssessment([
        { executionId: "whole-r01", verdict: "no_findings", findings: [] },
        { executionId: "whole-r02", verdict: "no_findings", findings: [] },
      ]),
    });

    await writeExecution(runDir, {
      ...execA,
      exitCode: 124,
      endedAt: "2026-09-25T06:10:00.000Z",
    });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: multiAssessment([
            { executionId: "whole-r01", verdict: "unavailable", findings: [] },
            { executionId: "whole-r02", verdict: "no_findings", findings: [] },
          ]),
        }),
      /completed execution whole-r01 changed/,
    );
  });
});

Deno.test("save rejects removed execution after prior snapshot", async () => {
  await withTempHome(async (home, xdg) => {
    const execA = minimalExecution({ id: "whole-r01" });
    const execB = minimalExecution({
      id: "whole-r02",
      model: "provider/model-b:high",
      stdoutLog: "logs/whole-r02.stdout.log",
      stderrLog: "logs/whole-r02.stderr.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [execA, execB]);

    await saveAssessment({
      runDir,
      assessment: multiAssessment([
        { executionId: "whole-r01", verdict: "no_findings", findings: [] },
        { executionId: "whole-r02", verdict: "no_findings", findings: [] },
      ]),
    });

    await rm(join(runDir, "executions/whole-r02.json"));
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: multiAssessment([
            { executionId: "whole-r01", verdict: "no_findings", findings: [] },
          ]),
        }),
      /prior execution removed: whole-r02/,
    );
  });
});

Deno.test("save rejects metadata level and revision changes across snapshots", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    await saveAssessment({
      runDir,
      assessment: minimalAssessment("whole-r01", "no_findings"),
    });

    const metaPath = join(runDir, "metadata.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    meta.level = 3;
    await writeFile(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /metadata changed across snapshots/,
    );

    meta.level = 2;
    meta.revision = "deadbeef999999";
    await writeFile(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /metadata changed across snapshots/,
    );
  });
});

Deno.test("save requires evidence for confirmed/contradicted and fixed action", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const baseFinding = {
      id: "f1",
      issueKey: "k1",
      severity: "high" as const,
      location: "a.ts:1",
      original: "issue",
      decision: "accepted" as const,
      reason: "because",
    };

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "findings", [{
            ...baseFinding,
            verification: "confirmed",
          }]),
        }),
      /evidence is required/,
    );

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "findings", [{
            ...baseFinding,
            verification: "not_checked",
            action: "fixed",
          }]),
        }),
      /actionEvidence is required/,
    );
  });
});

Deno.test("save rejects malformed execution and assessment fields", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);

    await writeExecution(runDir, {
      ...minimalExecution(),
      backend: "unknown" as "pi",
    });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /backend is invalid/,
    );

    await writeExecution(runDir, {
      ...minimalExecution(),
      status: "running",
      endedAt: undefined,
      exitCode: undefined,
    });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /requires verdict unavailable/,
    );

    await writeExecution(runDir, minimalExecution());
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            actor: { kind: "agent", id: "test" },
            reviews: [{
              executionId: "whole-r01",
              verdict: "not-a-verdict",
              findings: [],
            }],
          },
        }),
      /verdict.*invalid/,
    );

    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: {
            actor: { kind: "agent", id: "test" },
            reviews: [{
              executionId: "whole-r01",
              verdict: "findings",
              findings: [{
                id: "f1",
                issueKey: "k1",
                severity: "critical",
                location: "a.ts:1",
                original: "x",
                decision: "accepted",
                reason: "y",
              }],
            }],
          },
        }),
      /severity is invalid/,
    );
  });
});

Deno.test("save rejects malformed numeric and enum coercion inputs", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await setupRunDir(home, xdg, [minimalExecution()]);
    const unavailable = minimalAssessment("whole-r01", "unavailable");
    const execCases: Array<
      { label: string; exec: Partial<ExecutionRecord>; error: RegExp }
    > = [
      {
        label: "timeout:true",
        exec: { timeout: true as unknown as number },
        error: /execution\.timeout must be a finite positive number/,
      },
      {
        label: "exitCode:string",
        exec: { exitCode: "0" as unknown as number },
        error: /execution\.exitCode must be an integer from 0 to 255/,
      },
      {
        label: "exitCode:negative",
        exec: { exitCode: -1 },
        error: /execution\.exitCode must be an integer from 0 to 255/,
      },
      {
        label: "exitCode:fraction",
        exec: { exitCode: 1.5 },
        error: /execution\.exitCode must be an integer from 0 to 255/,
      },
      {
        label: "exitCode:out-of-range",
        exec: { exitCode: 999 },
        error: /execution\.exitCode must be an integer from 0 to 255/,
      },
      {
        label: "maxAttempts:[2]",
        exec: { maxAttempts: [2] as unknown as number },
        error: /execution\.maxAttempts must be a positive integer/,
      },
      {
        label: "non-ISO startedAt",
        exec: { startedAt: "2026-09-25 06:00:00" },
        error: /execution\.startedAt must be an ISO-8601 UTC timestamp/,
      },
      {
        label: "endedAt before startedAt",
        exec: { endedAt: "2026-09-25T05:00:00.000Z" },
        error: /endedAt must be >= startedAt/,
      },
      {
        label: "status invalid",
        exec: { status: "finished" as ExecutionRecord["status"] },
        error: /execution\.status is invalid/,
      },
    ];

    for (const { label, exec, error } of execCases) {
      await writeExecution(runDir, { ...minimalExecution(), ...exec });
      await assert.rejects(
        () => saveAssessment({ runDir, assessment: unavailable }),
        error,
        label,
      );
    }

    const assessmentCases: Array<
      { label: string; assessment: Assessment; error: RegExp }
    > = [
      {
        label: "actor.kind invalid",
        assessment: {
          actor: { kind: "bot" as "agent", id: "test" },
          reviews: [{
            executionId: "whole-r01",
            verdict: "no_findings",
            findings: [],
          }],
        },
        error: /assessment\.actor\.kind is invalid/,
      },
      {
        label: "decision invalid",
        assessment: minimalAssessment("whole-r01", "findings", [{
          id: "f1",
          issueKey: "k1",
          severity: "high",
          location: "a.ts:1",
          original: "x",
          decision: "maybe",
          reason: "y",
        }]),
        error: /decision is invalid/,
      },
      {
        label: "verification invalid",
        assessment: minimalAssessment("whole-r01", "findings", [{
          id: "f1",
          issueKey: "k1",
          severity: "high",
          location: "a.ts:1",
          original: "x",
          decision: "accepted",
          reason: "y",
          verification: "guess",
          evidence: "proof",
        }]),
        error: /verification is invalid/,
      },
      {
        label: "action invalid",
        assessment: minimalAssessment("whole-r01", "findings", [{
          id: "f1",
          issueKey: "k1",
          severity: "high",
          location: "a.ts:1",
          original: "x",
          decision: "accepted",
          reason: "y",
          action: "patched",
          actionEvidence: "done",
        }]),
        error: /action is invalid/,
      },
    ];

    await writeExecution(runDir, minimalExecution());
    for (const { label, assessment, error } of assessmentCases) {
      await writeExecution(runDir, minimalExecution());
      await assert.rejects(
        () => saveAssessment({ runDir, assessment }),
        error,
        label,
      );
    }
  });
});

Deno.test("save rejects empty executions", async () => {
  await withTempHome(async (home, xdg) => {
    const { runDir } = await initRunViaCli(home, xdg, {
      repository: "/tmp/r",
      revision: "abc",
      level: 2,
    });
    await writeFile(join(runDir, "changes.patch"), "patch\n", { mode: 0o600 });
    await writeFile(join(runDir, "prompt.md"), "prompt\n", { mode: 0o600 });
    await assert.rejects(
      () =>
        saveAssessment({
          runDir,
          assessment: minimalAssessment("whole-r01", "no_findings"),
        }),
      /no executions recorded/,
    );
  });
});

Deno.test("save combined snapshot covers all chunk executions with issueKey overlap", async () => {
  await withTempHome(async (home, xdg) => {
    const whole = minimalExecution({
      id: "whole-r01",
      model: "provider/model-a:high",
      chunk: "changes.patch",
    });
    const c001 = minimalExecution({
      id: "c001-r01",
      model: "provider/model-a:high",
      chunk: "chunks/chunk-001.patch",
      stdoutLog: "logs/c001-r01.stdout.log",
      stderrLog: "logs/c001-r01.stderr.log",
    });
    const c002 = minimalExecution({
      id: "c002-r02",
      model: "provider/model-b:high",
      chunk: "chunks/chunk-002.patch",
      stdoutLog: "logs/c002-r02.stdout.log",
      stderrLog: "logs/c002-r02.stderr.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [whole, c001, c002]);
    await mkdir(join(runDir, "chunks"), { recursive: true });
    await writeFile(join(runDir, "chunks/chunk-001.patch"), "chunk1\n", {
      mode: 0o600,
    });
    await writeFile(join(runDir, "chunks/chunk-002.patch"), "chunk2\n", {
      mode: 0o600,
    });

    const overlapKey = "shared-null-check";
    const { snapshotPath } = await saveAssessment({
      runDir,
      assessment: multiAssessment([
        {
          executionId: "whole-r01",
          verdict: "findings",
          findings: [{
            id: "f-whole",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "accepted",
            reason: "confirmed in whole review",
            verification: "confirmed",
            evidence: "token can be undefined",
            action: "unknown",
          }],
        },
        {
          executionId: "c001-r01",
          verdict: "findings",
          findings: [{
            id: "f-c001",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "accepted",
            reason: "same issue in chunk 001",
            verification: "confirmed",
            evidence: "same line flagged",
            action: "unknown",
          }],
        },
        {
          executionId: "c002-r02",
          verdict: "findings",
          findings: [{
            id: "f-c002",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "pending",
          }],
        },
      ]),
    });

    const humanFollowUp = await saveAssessment({
      runDir,
      assessment: multiAssessment([
        {
          executionId: "whole-r01",
          verdict: "findings",
          findings: [{
            id: "f-whole",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "accepted",
            reason: "confirmed in whole review",
            verification: "confirmed",
            evidence: "token can be undefined",
            action: "fixed",
            actionEvidence: "added guard in commit abc123",
          }],
        },
        {
          executionId: "c001-r01",
          verdict: "findings",
          findings: [{
            id: "f-c001",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "accepted",
            reason: "same issue in chunk 001",
            verification: "confirmed",
            evidence: "same line flagged",
            action: "unknown",
          }],
        },
        {
          executionId: "c002-r02",
          verdict: "findings",
          findings: [{
            id: "f-c002",
            issueKey: overlapKey,
            severity: "high",
            location: "src/auth.ts:42",
            original: "Missing null check on token",
            decision: "accepted",
            reason: "human confirmed overlap",
            verification: "confirmed",
            evidence: "same issueKey across models/chunks",
            action: "fixed",
            actionEvidence: "fixed once for all chunks",
          }],
        },
      ], { kind: "human", id: "roy/manual-review" }),
    });

    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(snapshot.executions.length, 3);
    assert.equal(snapshot.reviews.length, 3);
    const issueKeys = snapshot.reviews.flatMap((r: Assessment["reviews"][0]) =>
      r.findings.map((f) => f.issueKey)
    );
    assert.equal(new Set(issueKeys).size, 1);
    assert.equal(issueKeys[0], overlapKey);

    const latest = JSON.parse(
      await readFile(humanFollowUp.snapshotPath, "utf8"),
    );
    const fixed = latest.reviews.flatMap((r: Assessment["reviews"][0]) =>
      r.findings.filter((f) => f.action === "fixed")
    );
    assert.equal(fixed.length, 2);
    assert.equal(fixed[0].original, "Missing null check on token");
    assert.equal(latest.actor.kind, "human");
  });
});

Deno.test("CLI rejects unknown duplicate and positional args", async () => {
  await withTempHome(async (home, xdg) => {
    const unknown = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      "abc",
      "--level",
      "2",
      "--extra",
      "x",
    ], childEnv(home, xdg));
    assert.notEqual(unknown.code, 0);
    assert.match(unknown.stderr, /unknown flag: --extra/);

    const dup = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--repository",
      "/tmp/r2",
      "--revision",
      "abc",
      "--level",
      "2",
    ], childEnv(home, xdg));
    assert.notEqual(dup.code, 0);
    assert.match(dup.stderr, /duplicate flag/);

    const positional = await runCli([
      "init",
      "garbage",
      "--repository",
      "/tmp/r",
      "--revision",
      "abc",
      "--level",
      "2",
    ], childEnv(home, xdg));
    assert.notEqual(positional.code, 0);
    assert.match(positional.stderr, /unexpected argument/);

    const badLevel = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      "abc",
      "--level",
      "nope",
    ], childEnv(home, xdg));
    assert.notEqual(badLevel.code, 0);
    assert.match(badLevel.stderr, /level must be 1, 2, or 3/);

    const coercedLevel = await runCli([
      "init",
      "--repository",
      "/tmp/r",
      "--revision",
      "abc",
      "--level",
      "01",
    ], childEnv(home, xdg));
    assert.notEqual(coercedLevel.code, 0);
    assert.match(coercedLevel.stderr, /level must be 1, 2, or 3/);
  });
});

Deno.test("CLI init and save smoke", async () => {
  await withTempHome(async (home, xdg) => {
    const initOut = await runCli([
      "init",
      "--repository",
      "/tmp/repo",
      "--revision",
      "deadbeef",
      "--level",
      "3",
    ], childEnv(home, xdg));
    assert.equal(initOut.code, 0, initOut.stderr);
    const runDir = initOut.stdout.trim();
    assert.match(runDir, new RegExp(`^${xdg.replaceAll("/", "\\/")}`));

    await writeFile(join(runDir, "changes.patch"), "patch\n", { mode: 0o600 });
    await writeFile(join(runDir, "prompt.md"), "prompt\n", { mode: 0o600 });
    await mkdir(join(runDir, "logs"), { recursive: true });
    await mkdir(join(runDir, "executions"), { recursive: true });
    const exec = minimalExecution();
    await writeFile(
      join(runDir, "executions/whole-r01.json"),
      JSON.stringify(exec),
      { mode: 0o600 },
    );
    await writeFile(join(runDir, exec.stdoutLog), "out\n", { mode: 0o600 });
    await writeFile(join(runDir, exec.stderrLog), "err\n", { mode: 0o600 });

    const assessmentPath = join(runDir, "assessment.json");
    await writeFile(
      assessmentPath,
      JSON.stringify(minimalAssessment("whole-r01", "no_findings")),
      { mode: 0o600 },
    );

    const saveOut = await runCli([
      "save",
      "--dir",
      runDir,
      "--input",
      assessmentPath,
    ], childEnv(home, xdg));
    assert.equal(saveOut.code, 0, saveOut.stderr);
    const snapshotPath = saveOut.stdout.trim();
    assert.match(snapshotPath, /snapshots\/\d{8}T\d{6}Z-[0-9a-f-]+\.json$/);
  });
});

Deno.test("SKILL bash blocks pass bash -n shellcheck and shfmt", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  const bash5 = await findBash5();
  const blocks = [
    extractBashBlock(skill, "## 実行記録（provenance）"),
    extractBashBlock(skill, "## Preflight（1回だけ）"),
    extractBashBlock(skill, "## 並行実行（chunk ごと）"),
    extractBashBlock(skill, "## 大きい patch（分割レビュー）"),
    extractBashBlock(skill, "### 採用判断の保存（必須）"),
  ];
  for (const block of blocks) {
    await checkBashBlock(bash5, block);
  }
});

Deno.test("SKILL bash loop integration with fake resolver and runner", async () => {
  await withTempHome(async (home, xdg) => {
    const work = await mkdtemp(join(tmpdir(), "pr-work-"));
    const bin = join(work, "bin");
    await mkdir(bin, { recursive: true });

    const fakeResolver = join(bin, "resolve-model.sh");
    await writeFile(
      fakeResolver,
      "#!/usr/bin/env bash\n" +
        'printf \'%s\\n\' "pi\tprovider/model-a:high\t10\t10" "agy\tprovider/model-b:high\t10\t10"\n',
      { mode: 0o755 },
    );

    const fakeRunner = join(bin, "run_pi_review.sh");
    await writeFile(
      fakeRunner,
      `#!/usr/bin/env bash
set -euo pipefail
model=""
input=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) model="$2"; shift 2 ;;
    --input) input="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$model" in
  provider/model-a:high) echo "review-a-$(basename "$input")"; exit 0 ;;
  provider/model-b:high) echo "review-b-$(basename "$input") timed out" >&2; exit 124 ;;
  *) echo "unknown model $model" >&2; exit 9 ;;
esac
`,
      { mode: 0o755 },
    );

    const fakeAgy = join(bin, "run_antigravity_review.sh");
    await symlink(fakeRunner, fakeAgy);

    const initOut = await runCli([
      "init",
      "--repository",
      work,
      "--revision",
      "deadbeef1234",
      "--level",
      "2",
    ], childEnv(home, xdg));
    assert.equal(initOut.code, 0, initOut.stderr);
    const reviewDir = initOut.stdout.trim();

    await writeFile(join(reviewDir, "changes.patch"), "whole patch\n", {
      mode: 0o600,
    });
    await writeFile(join(reviewDir, "prompt.md"), "prompt\n", { mode: 0o600 });
    await mkdir(join(reviewDir, "chunks"), { recursive: true });
    await writeFile(join(reviewDir, "chunks/chunk-001.patch"), "chunk1\n", {
      mode: 0o600,
    });
    await writeFile(join(reviewDir, "chunks/chunk-002.patch"), "chunk2\n", {
      mode: 0o600,
    });

    const resolverOut = await new Deno.Command(fakeResolver, {
      args: ["--review-level", "2"],
      stdout: "piped",
    }).output();
    assert.equal(resolverOut.code, 0);
    const reviewers = new TextDecoder().decode(resolverOut.stdout).trim();
    assert.match(reviewers, /provider\/model-a:high/);
    await writeFile(join(reviewDir, "reviewers.tsv"), `${reviewers}\n`, {
      mode: 0o600,
    });

    const skill = await readFile(SKILL_PATH, "utf8");
    const loopSnippet = extractBashBlock(
      skill,
      "## 並行実行（chunk ごと）",
    ).replace(
      'PI_RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_pi_review.sh"',
      "",
    ).replace(
      'AGY_RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_antigravity_review.sh"',
      "",
    );

    const bash5 = await findBash5();
    const bashEnv = { ...Deno.env.toObject(), ...devboxBashEnv() };

    const runChunk = async (chunkId: string, chunkFile: string) => {
      const script = `#!/usr/bin/env bash
set -euo pipefail
REVIEW_DIR=${JSON.stringify(reviewDir)}
PI_RUNNER=${JSON.stringify(fakeRunner)}
AGY_RUNNER=${JSON.stringify(fakeAgy)}
CHUNK_ID=${JSON.stringify(chunkId)}
CHUNK_FILE=${JSON.stringify(chunkFile)}
${loopSnippet}
`;
      const scriptPath = join(work, `run-${chunkId}.sh`);
      await writeFile(scriptPath, script, { mode: 0o755 });

      const syntax = await new Deno.Command(bash5, {
        args: ["-n", scriptPath],
        stdout: "piped",
        stderr: "piped",
        env: bashEnv,
      }).output();
      assert.equal(syntax.code, 0, new TextDecoder().decode(syntax.stderr));

      const run = await new Deno.Command(bash5, {
        args: [scriptPath],
        stdout: "piped",
        stderr: "piped",
        env: bashEnv,
      }).output();
      return {
        code: run.code,
        stderr: new TextDecoder().decode(run.stderr),
      };
    };

    const wholeRun = await runChunk("whole", "changes.patch");
    assert.equal(wholeRun.code, 0, wholeRun.stderr);

    const c001Run = await runChunk("c001", "chunks/chunk-001.patch");
    assert.equal(c001Run.code, 0, c001Run.stderr);

    const c002Run = await runChunk("c002", "chunks/chunk-002.patch");
    assert.equal(c002Run.code, 0, c002Run.stderr);

    for (
      const execId of [
        "whole-r01",
        "whole-r02",
        "c001-r01",
        "c001-r02",
        "c002-r01",
        "c002-r02",
      ]
    ) {
      const meta = JSON.parse(
        await readFile(join(reviewDir, "executions", `${execId}.json`), "utf8"),
      );
      assert.equal(meta.status, "completed");
      assert.equal(typeof meta.exitCode, "number");
      assert.match(
        meta.startedAt,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      assert.match(
        meta.endedAt,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    }

    const wholeFail = JSON.parse(
      await readFile(join(reviewDir, "executions/whole-r02.json"), "utf8"),
    );
    assert.equal(wholeFail.exitCode, 124);
    assert.equal(wholeFail.model, "provider/model-b:high");

    const wholeStdout = await readFile(
      join(reviewDir, "logs/whole-r01.stdout.log"),
      "utf8",
    );
    const c001Stdout = await readFile(
      join(reviewDir, "logs/c001-r01.stdout.log"),
      "utf8",
    );
    assert.notEqual(wholeStdout, c001Stdout);

    const assessment = multiAssessment([
      { executionId: "whole-r01", verdict: "no_findings", findings: [] },
      { executionId: "whole-r02", verdict: "unavailable", findings: [] },
      { executionId: "c001-r01", verdict: "no_findings", findings: [] },
      { executionId: "c001-r02", verdict: "unavailable", findings: [] },
      { executionId: "c002-r01", verdict: "no_findings", findings: [] },
      { executionId: "c002-r02", verdict: "unavailable", findings: [] },
    ]);
    const saved = await saveAssessment({ runDir: reviewDir, assessment });
    const snapshot = JSON.parse(await readFile(saved.snapshotPath, "utf8"));
    assert.equal(snapshot.executions.length, 6);
    assert.equal(snapshot.reviews.length, 6);
    const unavailable = snapshot.reviews.filter(
      (r: Assessment["reviews"][0]) => r.verdict === "unavailable",
    );
    assert.equal(unavailable.length, 3);

    const refuseScript = `#!/usr/bin/env bash
set -euo pipefail
REVIEW_DIR=${JSON.stringify(reviewDir)}
PI_RUNNER=${JSON.stringify(fakeRunner)}
AGY_RUNNER=${JSON.stringify(fakeAgy)}
CHUNK_ID=whole
CHUNK_FILE=changes.patch
${loopSnippet}
`;
    const refusePath = join(work, "refuse-rerun.sh");
    await writeFile(refusePath, refuseScript, { mode: 0o755 });
    const refuse = await new Deno.Command(bash5, {
      args: [refusePath],
      stdout: "piped",
      stderr: "piped",
      env: bashEnv,
    }).output();
    assert.notEqual(refuse.code, 0);
    assert.match(
      new TextDecoder().decode(refuse.stderr),
      /execution ID already exists: whole-r01/,
    );
    assert.equal(
      await readFile(join(reviewDir, "logs/whole-r01.stdout.log"), "utf8"),
      wholeStdout,
    );

    const boundaryChunk = "a".repeat(124);
    const boundaryRun = await runChunk(boundaryChunk, "changes.patch");
    assert.equal(boundaryRun.code, 0, boundaryRun.stderr);
    assert.ok(
      await Deno.stat(
        join(reviewDir, "executions", `${boundaryChunk}-r01.json`),
      ),
    );

    const tooLongChunk = "a".repeat(125);
    const tooLongRun = await runChunk(tooLongChunk, "changes.patch");
    assert.notEqual(tooLongRun.code, 0);
    assert.match(tooLongRun.stderr, /execution ID too long/);
    assert.doesNotMatch(tooLongRun.stderr, /review-a-/);
    assert.equal(
      await Deno.stat(join(reviewDir, "executions", `${tooLongChunk}-r01.json`))
        .then(() => true)
        .catch(() => false),
      false,
    );
    assert.equal(
      await Deno.stat(join(reviewDir, "logs", `${tooLongChunk}-r01.stdout.log`))
        .then(() => true)
        .catch(() => false),
      false,
    );

    const manyReviewers = Array.from(
      { length: 100 },
      (_, i) => `pi\tprovider/model-${i}:high\t10\t10`,
    ).join("\n");
    await writeFile(
      join(reviewDir, "reviewers-many.tsv"),
      `${manyReviewers}\n`,
      {
        mode: 0o600,
      },
    );
    const manyChunk = "b".repeat(125);
    const manyScript = `#!/usr/bin/env bash
set -euo pipefail
REVIEW_DIR=${JSON.stringify(reviewDir)}
CHUNK_ID=${JSON.stringify(manyChunk)}
mapfile -t reviewers <"$REVIEW_DIR/reviewers-many.tsv"
max_exec_id="\${CHUNK_ID}-r$(printf '%02d' "\${#reviewers[@]}")"
if ((\${#max_exec_id} > 128)); then
  echo "execution ID too long (max 128 chars): $max_exec_id" >&2
  exit 1
fi
echo "unexpected spawn path" >&2
exit 9
`;
    const manyPath = join(work, "many-reviewers.sh");
    await writeFile(manyPath, manyScript, { mode: 0o755 });
    const manyRun = await new Deno.Command(bash5, {
      args: [manyPath],
      stdout: "piped",
      stderr: "piped",
      env: bashEnv,
    }).output();
    assert.notEqual(manyRun.code, 0);
    assert.match(
      new TextDecoder().decode(manyRun.stderr),
      /execution ID too long/,
    );
    assert.doesNotMatch(
      new TextDecoder().decode(manyRun.stderr),
      /review-a-/,
    );

    await rm(work, { recursive: true, force: true });
  });
});

Deno.test("extractBashBlock rejects missing marker opening and closing fences", () => {
  const skill = "# heading\n\n```bash\necho ok\n```\n";
  assert.throws(
    () => extractBashBlock(skill, "## missing"),
    /marker not found/,
  );
  assert.throws(
    () => extractBashBlock("# no fence\n## heading\n", "## heading"),
    /opening bash fence not found/,
  );
  assert.throws(
    () => extractBashBlock("## heading\n```bash\necho no close", "## heading"),
    /closing fence not found/,
  );
  assert.equal(extractBashBlock(skill, "# heading"), "echo ok");
});

const listSnapshotDirEntries = async (snapDir: string): Promise<string[]> => {
  const names: string[] = [];
  for await (const entry of Deno.readDir(snapDir)) {
    names.push(entry.name);
  }
  return names.sort();
};

const acceptedFindingFixture = {
  id: "f1",
  issueKey: "issue-stable",
  severity: "medium" as const,
  location: "src/auth.ts:42",
  original: "immutable finding body",
  decision: "accepted" as const,
  reason: "initial accepted reason",
  verification: "not_checked" as const,
};

const runSaveUnderFileLimit = async (
  home: string,
  xdg: string,
  runDir: string,
  assessmentPath: string,
  options: { ignoreSigxfsz: boolean },
): Promise<{ code: number; stderr: string }> => {
  const bash5 = await findBash5();
  const bashEnv = { ...Deno.env.toObject(), ...devboxBashEnv() };
  const failScript = join(tmpdir(), `pr-ulimit-${crypto.randomUUID()}.sh`);
  const sigTrap = options.ignoreSigxfsz ? "trap '' SIGXFSZ" : "";
  await writeFile(
    failScript,
    `#!/usr/bin/env bash
set -euo pipefail
ulimit -c 0
ulimit -f 8
${sigTrap}
exec ${
      JSON.stringify(Deno.execPath())
    } run --no-config --allow-read --allow-write --allow-env=HOME,XDG_DATA_HOME ${
      JSON.stringify(SCRIPT_PATH)
    } save --dir ${JSON.stringify(runDir)} --input ${
      JSON.stringify(assessmentPath)
    }
`,
    { mode: 0o755 },
  );
  try {
    const failed = await new Deno.Command(bash5, {
      args: [failScript],
      stdout: "piped",
      stderr: "piped",
      env: { ...bashEnv, ...childEnv(home, xdg) },
    }).output();
    return {
      code: failed.code,
      stderr: new TextDecoder().decode(failed.stderr),
    };
  } finally {
    await rm(failScript, { force: true });
  }
};

Deno.test("save publishes snapshots atomically when write is interrupted", async () => {
  await withTempHome(async (home, xdg) => {
    const execA = minimalExecution({ id: "whole-r01" });
    const execB = minimalExecution({
      id: "whole-r02",
      model: "provider/model-b:high",
      exitCode: 124,
      endedAt: "2026-09-25T06:02:00.000Z",
      stdoutLog: "logs/whole-r02.stdout.log",
      stderrLog: "logs/whole-r02.stderr.log",
    });
    const { runDir } = await setupRunDir(home, xdg, [execA, execB]);
    await writeFile(join(runDir, execB.stdoutLog), "partial\n", {
      mode: 0o600,
    });
    await writeFile(join(runDir, execB.stderrLog), "timeout\n", {
      mode: 0o600,
    });
    const first = await saveAssessment({
      runDir,
      assessment: multiAssessment([
        {
          executionId: "whole-r01",
          verdict: "findings",
          findings: [acceptedFindingFixture],
        },
        { executionId: "whole-r02", verdict: "unavailable", findings: [] },
      ]),
    });
    const firstBytes = await readFile(first.snapshotPath);
    const snapDir = join(runDir, "snapshots");
    const snapStat = await Deno.stat(snapDir);
    assert.equal(snapStat.mode! & 0o777, 0o700);
    const firstFileStat = await Deno.stat(first.snapshotPath);
    assert.equal(firstFileStat.mode! & 0o777, 0o600);

    const enlargedAssessment = multiAssessment([
      {
        executionId: "whole-r01",
        verdict: "findings",
        findings: [{
          ...acceptedFindingFixture,
          reason: `${acceptedFindingFixture.reason}${"x".repeat(65536)}`,
        }],
      },
      { executionId: "whole-r02", verdict: "unavailable", findings: [] },
    ]);
    const assessmentPath = join(runDir, "large-assessment.json");
    await writeFile(
      assessmentPath,
      JSON.stringify(enlargedAssessment),
      { mode: 0o600 },
    );

    const interrupted = await runSaveUnderFileLimit(
      home,
      xdg,
      runDir,
      assessmentPath,
      { ignoreSigxfsz: false },
    );
    assert.notEqual(interrupted.code, 0);

    const afterInterrupt = await listSnapshotDirEntries(snapDir);
    const jsonAfterInterrupt = afterInterrupt.filter((n) =>
      n.endsWith(".json")
    );
    assert.equal(jsonAfterInterrupt.length, 1);
    assert.equal(
      new TextDecoder().decode(await readFile(first.snapshotPath)),
      new TextDecoder().decode(firstBytes),
    );

    const cleaned = await runSaveUnderFileLimit(
      home,
      xdg,
      runDir,
      assessmentPath,
      { ignoreSigxfsz: true },
    );
    assert.notEqual(cleaned.code, 0);
    assert.match(
      cleaned.stderr,
      /EFBIG|file too large/i,
    );
    const afterCleanup = await listSnapshotDirEntries(snapDir);
    assert.equal(
      afterCleanup.filter((n) => n.endsWith(".json")).length,
      1,
    );
    assert.deepEqual(
      afterCleanup.filter((n) => !n.endsWith(".json")).sort(),
      afterInterrupt.filter((n) => !n.endsWith(".json")).sort(),
      "a caught write failure must not leave a new temp file",
    );

    const second = await saveAssessment({
      runDir,
      assessment: multiAssessment([
        {
          executionId: "whole-r01",
          verdict: "findings",
          findings: [{
            ...acceptedFindingFixture,
            reason: "follow-up accepted reason",
          }],
        },
        { executionId: "whole-r02", verdict: "unavailable", findings: [] },
      ]),
    });
    assert.notEqual(second.snapshotPath, first.snapshotPath);
    assert.equal(
      new TextDecoder().decode(await readFile(first.snapshotPath)),
      new TextDecoder().decode(firstBytes),
    );
    const secondStat = await Deno.stat(second.snapshotPath);
    assert.equal(secondStat.mode! & 0o777, 0o600);
  });
});
