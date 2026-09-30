import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { isMissingPath } from "../scripts/state_io.ts";
import { defaultPreviousUtcWeek } from "../scripts/week_period.ts";

const SCRIPT = join(
  import.meta.dirname!,
  "../scripts/install_weekly_launchd.sh",
);
const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");
const FIXTURE_RESOLVER = join(
  import.meta.dirname!,
  "fixtures/resolve_mock.sh",
);

const isDarwin = Deno.build.os === "darwin";

const PATCH =
  "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+hello\n";

type LaunchdPlist = {
  ProgramArguments: string[];
  EnvironmentVariables?: Record<string, string>;
};

const runPreview = async (
  env: Record<string, string> = {},
): Promise<{ stdout: string; success: boolean; stderr: string }> => {
  const inherited = { ...Deno.env.toObject() };
  delete inherited.MODEL_RESOLVER;
  const out = await new Deno.Command("bash", {
    args: [SCRIPT],
    env: { ...inherited, ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
    success: out.success,
  };
};

const plistToJson = async (xml: string): Promise<LaunchdPlist> => {
  const dir = await mkdtemp(join(tmpdir(), "jev-plutil-"));
  const path = join(dir, "preview.plist");
  try {
    await writeFile(path, xml);
    const out = await new Deno.Command("plutil", {
      args: ["-convert", "json", "-o", "-", path],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(out.success, true, new TextDecoder().decode(out.stderr));
    return JSON.parse(new TextDecoder().decode(out.stdout)) as LaunchdPlist;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const runPlistProgram = async (
  plist: LaunchdPlist,
): Promise<Deno.CommandOutput> => {
  const args = plist.ProgramArguments;
  assert.ok(args.length >= 2, "expected deno + args");
  const deno = args[0];
  const denoArgs = args.slice(1);
  const baseEnv = plist.EnvironmentVariables ?? {};
  return await new Deno.Command(deno, {
    args: denoArgs,
    clearEnv: true,
    env: baseEnv,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
};

type IsolatedLayout = {
  home: string;
  xdg: string;
  piDir: string;
  jevTmp: string;
  runsDir: string;
};

const layoutIsolatedHome = (home: string): IsolatedLayout => {
  const xdg = join(home, "xdg-isolated");
  return {
    home,
    xdg,
    piDir: join(home, "pi-agent"),
    jevTmp: join(xdg, "parallel-review", "jev-audit", "tmp"),
    runsDir: join(xdg, "parallel-review", "runs"),
  };
};

const seedLaunchdTmpLayout = async (layout: IsolatedLayout): Promise<void> => {
  await mkdir(layout.piDir, { recursive: true, mode: 0o700 });
  await mkdir(layout.jevTmp, { recursive: true, mode: 0o700 });
  await chmod(layout.jevTmp, 0o700);
};

const writeMockPi = async (
  dir: string,
  countFile?: string,
): Promise<string> => {
  const pi = join(dir, "fake_pi.sh");
  const countLine = countFile
    ? 'echo 1 >> "' + countFile.replaceAll('"', '\\"') + '"\n'
    : "";
  await writeFile(
    pi,
    "#!/usr/bin/env bash\n" +
      countLine +
      'echo \'{"minLevel":2,"maxLevel":4,"reason":"ok","concerns":[]}\'\n',
    { mode: 0o700 },
  );
  return pi;
};

const writeRunFixture = async (
  runsDir: string,
  runId: string,
  createdAt: string,
): Promise<void> => {
  const patchSha256 = sha256Bytes(new TextEncoder().encode(PATCH));
  const levelDecision = buildJevDecision({
    level: 3,
    patchSha256,
    minConfidence: 0.7,
    model: "route/mock-jev",
    confidence: 0.95,
  });
  const datePrefix = createdAt.slice(0, 10);
  const runDir = join(runsDir, `${datePrefix}-${runId}`);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(runDir, "metadata.json"),
    `${
      JSON.stringify(
        {
          schemaVersion: 1,
          runId,
          createdAt,
          repository: "/tmp/repo",
          revision: "deadbeef",
          level: 3,
          levelScale: 5,
          levelDecision,
        },
        null,
        2,
      )
    }\n`,
    { mode: 0o600 },
  );
  await writeFile(join(runDir, "changes.patch"), PATCH, { mode: 0o600 });
};

const assertNoSpendArtifacts = async (
  auditBase: string,
  weekRoot: string,
  runId: string,
): Promise<void> => {
  const resultsDir = join(weekRoot, "results");
  let names: string[];
  try {
    names = await readdir(resultsDir);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    names = [];
  }
  assert.equal(names.filter((n) => n.endsWith(".attempt.json")).length, 0);
  assert.equal(names.includes(`${runId}.json`), false);
  const cacheAttempts = join(auditBase, "cache", "attempts");
  let globalAttempts: string[];
  try {
    globalAttempts = (await readdir(cacheAttempts)).filter((n) =>
      n.endsWith(".json")
    );
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    globalAttempts = [];
  }
  assert.equal(globalAttempts.length, 0);
};

const readInvokeCount = async (countFile: string): Promise<number> => {
  try {
    return Number(await readFile(countFile, "utf8"));
  } catch (error) {
    if (isMissingPath(error)) return 0;
    throw error;
  }
};

const seedAuditCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<Record<string, unknown>> => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(out.success, true, new TextDecoder().decode(out.stderr));
  return JSON.parse(new TextDecoder().decode(out.stdout)) as Record<
    string,
    unknown
  >;
};

Deno.test("launchd preview stdout is plist only with scoped permissions", async () => {
  const { stdout, success, stderr } = await runPreview();
  assert.equal(success, true, stderr);
  assert.match(stdout, /^<\?xml/);
  assert.doesNotMatch(stdout.trim(), /\n[^\n]*installed /);
  assert.match(stdout, /Weekday<\/key><integer>1/);
  assert.match(stdout, /Hour<\/key><integer>9/);
  assert.match(stdout, /--allow-read=/);
  assert.match(stdout, /--allow-write=/);
  assert.match(stdout, /--allow-env=.*TMPDIR/);
  assert.match(stdout, /--allow-run=/);
  assert.equal(stdout.includes("-A"), false);
  assert.equal(stdout.includes("OPEN_ROUTER"), false);
  assert.match(stdout, /<key>JEV_AUDIT_BASH<\/key>/);
  assert.match(stdout, /<key>PI_REVIEW_BIN<\/key>/);
  assert.match(stdout, /<key>TMPDIR<\/key>/);
});

Deno.test("launchd preview does not create log or tmp paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-preview-nowrite-"));
  const xdg = join(home, "xdg-isolated");
  const log = join(xdg, "parallel-review", "jev-audit", "launchd.log");
  const tmpBase = join(xdg, "parallel-review", "jev-audit", "tmp");
  try {
    const { success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
    });
    assert.equal(success, true, stderr);
    await assert.rejects(() => stat(log));
    await assert.rejects(() => stat(tmpBase));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("xml_escape preserves special characters in plist paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-xml-"));
  const xdg = join(home, "data&<>\"'dir");
  await mkdir(xdg, { recursive: true });
  try {
    const { stdout, success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
    });
    assert.equal(success, true, stderr);
    if (isDarwin) {
      const parsed = await plistToJson(stdout);
      assert.equal(parsed.EnvironmentVariables?.XDG_DATA_HOME, xdg);
      assert.equal(parsed.EnvironmentVariables?.HOME, home);
      const lintDir = await mkdtemp(join(tmpdir(), "jev-plutil-lint-"));
      const lintPath = join(lintDir, "lint.plist");
      try {
        await writeFile(lintPath, stdout);
        const lint = await new Deno.Command("plutil", {
          args: ["-lint", lintPath],
          stdout: "piped",
          stderr: "piped",
        }).output();
        assert.equal(lint.success, true, new TextDecoder().decode(lint.stderr));
      } finally {
        await rm(lintDir, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview omits MODEL_RESOLVER when unset", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-no-resolver-"));
  const xdg = join(home, "xdg-isolated");
  await mkdir(xdg, { recursive: true });
  try {
    const { stdout, success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
    });
    assert.equal(success, true, stderr);
    if (isDarwin) {
      const parsed = await plistToJson(stdout);
      assert.equal(parsed.EnvironmentVariables?.MODEL_RESOLVER, undefined);
      assert.doesNotMatch(stdout, /<key>MODEL_RESOLVER<\/key>/);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview omits MODEL_RESOLVER when empty", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-empty-resolver-"));
  const xdg = join(home, "xdg-isolated");
  await mkdir(xdg, { recursive: true });
  try {
    const { stdout, success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
      MODEL_RESOLVER: "",
    });
    assert.equal(success, true, stderr);
    if (isDarwin) {
      const parsed = await plistToJson(stdout);
      assert.equal(parsed.EnvironmentVariables?.MODEL_RESOLVER, undefined);
      assert.doesNotMatch(stdout, /<key>MODEL_RESOLVER<\/key>/);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview rejects relative MODEL_RESOLVER override", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-rel-resolver-"));
  const xdg = join(home, "xdg-isolated");
  await mkdir(xdg, { recursive: true });
  try {
    const { success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
      MODEL_RESOLVER: "relative/resolve.sh",
    });
    assert.equal(success, false);
    assert.match(stderr, /MODEL_RESOLVER must resolve to an absolute path/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview rejects missing MODEL_RESOLVER override file", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-miss-resolver-"));
  const xdg = join(home, "xdg-isolated");
  await mkdir(xdg, { recursive: true });
  const missing = join(home, "no-such-resolver.sh");
  try {
    const { success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
      MODEL_RESOLVER: missing,
    });
    assert.equal(success, false);
    assert.match(stderr, /readable regular file/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview xml-escapes MODEL_RESOLVER path in plist", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-resolver-xml-"));
  const xdg = join(home, "xdg-isolated");
  const resolverDir = join(home, "resolver&dir");
  await mkdir(resolverDir, { recursive: true });
  const resolverPath = join(resolverDir, "resolve.sh");
  await writeFile(
    resolverPath,
    "#!/usr/bin/env bash\necho mock/auditor-model\n",
    { mode: 0o600 },
  );
  try {
    const { stdout, success, stderr } = await runPreview({
      HOME: home,
      XDG_DATA_HOME: xdg,
      MODEL_RESOLVER: resolverPath,
    });
    assert.equal(success, true, stderr);
    assert.equal(stderr, "");
    assert.match(stdout, /MODEL_RESOLVER<\/key><string>.*&amp;/);
    if (isDarwin) {
      const parsed = await plistToJson(stdout);
      assert.equal(parsed.EnvironmentVariables?.MODEL_RESOLVER, resolverPath);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("launchd preview rejects comma-containing permission paths", async () => {
  const out = await new Deno.Command("bash", {
    args: [SCRIPT],
    env: {
      ...Deno.env.toObject(),
      HOME: "/tmp/comma,path",
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(out.success, false);
  const err = new TextDecoder().decode(out.stderr);
  assert.match(err, /comma/);
});

Deno.test({
  name: "launchd plist ProgramArguments run audit offline (empty history)",
  ignore: !isDarwin,
  fn: async () => {
    const home = await mkdtemp(join(tmpdir(), "jev-plist-empty-"));
    const layout = layoutIsolatedHome(home);
    await mkdir(layout.runsDir, { recursive: true });
    await seedLaunchdTmpLayout(layout);
    const fakePi = await writeMockPi(home);
    const previewEnv = {
      HOME: layout.home,
      XDG_DATA_HOME: layout.xdg,
      PI_CODING_AGENT_DIR: layout.piDir,
      PI_REVIEW_BIN: fakePi,
      MODEL_RESOLVER: FIXTURE_RESOLVER,
    };
    try {
      const preview = await runPreview(previewEnv);
      assert.equal(preview.success, true, preview.stderr);
      assert.equal(preview.stderr, "");
      const parsed = await plistToJson(preview.stdout);
      assert.deepEqual(
        parsed.ProgramArguments.slice(-2),
        [AUDIT_SCRIPT, "run"],
      );
      assert.equal(parsed.ProgramArguments.includes("-A"), false);

      assert.equal(
        parsed.EnvironmentVariables?.MODEL_RESOLVER,
        FIXTURE_RESOLVER,
      );

      const runOut = await runPlistProgram(parsed);
      assert.equal(
        runOut.success,
        true,
        new TextDecoder().decode(runOut.stderr),
      );
      const body = JSON.parse(new TextDecoder().decode(runOut.stdout)) as {
        command: string;
        counts: { selectedTotal: number };
      };
      assert.equal(body.command, "run");
      assert.equal(body.counts.selectedTotal, 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name:
    "launchd plist ProgramArguments run uses scoped flags after local approve seed",
  ignore: !isDarwin,
  fn: async () => {
    const period = defaultPreviousUtcWeek();
    const createdAt = new Date(
      Date.parse(period.weekStartIso) + 36 * 60 * 60 * 1000,
    ).toISOString();
    const home = await mkdtemp(join(tmpdir(), "jev-plist-run-"));
    const layout = layoutIsolatedHome(home);
    await mkdir(layout.runsDir, { recursive: true });
    await seedLaunchdTmpLayout(layout);
    const countFile = join(home, "invoke.count");
    const fakePi = await writeMockPi(home, countFile);
    const runId = "22222222-2222-4222-8222-222222222222";
    await writeRunFixture(layout.runsDir, runId, createdAt);

    const seedEnv = {
      HOME: layout.home,
      XDG_DATA_HOME: layout.xdg,
      MODEL_RESOLVER: FIXTURE_RESOLVER,
      PI_REVIEW_BIN: fakePi,
      JEV_AUDIT_BASH: "bash",
    };

    try {
      await seedAuditCli(seedEnv, ["prepare"]);
      const inspected = await seedAuditCli(seedEnv, [
        "inspect",
        "--run-id",
        runId,
      ]) as { stagedPath: string };
      await seedAuditCli(seedEnv, [
        "approve",
        "--run-id",
        runId,
        "--approved-input",
        inspected.stagedPath,
      ]);

      const preview = await runPreview({
        HOME: layout.home,
        XDG_DATA_HOME: layout.xdg,
        PI_CODING_AGENT_DIR: layout.piDir,
        PI_REVIEW_BIN: fakePi,
        MODEL_RESOLVER: FIXTURE_RESOLVER,
      });
      assert.equal(preview.success, true, preview.stderr);
      assert.equal(preview.stderr, "");
      const parsed = await plistToJson(preview.stdout);

      assert.equal(
        parsed.EnvironmentVariables?.MODEL_RESOLVER,
        FIXTURE_RESOLVER,
      );

      const runOut = await runPlistProgram(parsed);
      assert.equal(
        runOut.success,
        true,
        new TextDecoder().decode(runOut.stderr),
      );
      const body = JSON.parse(new TextDecoder().decode(runOut.stdout)) as {
        command: string;
        reportJson: string;
        counts: { audited: number; selectedTotal: number };
      };
      assert.equal(body.command, "run");
      assert.equal(body.counts.selectedTotal, 1);
      assert.equal(body.counts.audited, 1);
      const weekRoot = join(
        layout.xdg,
        "parallel-review",
        "jev-audit",
        "weeks",
        period.weekStart,
      );
      const report = JSON.parse(await readFile(body.reportJson, "utf8")) as {
        counts: { audited: number; needsPreflight: number };
        cases: Array<{ status: string; independent?: boolean }>;
      };
      assert.equal(report.counts.audited, 1);
      assert.equal(report.counts.needsPreflight, 0);
      assert.equal(report.cases[0]?.status, "audited");
      assert.equal(report.cases[0]?.independent, true);
      const result = JSON.parse(
        await readFile(join(weekRoot, "results", `${runId}.json`), "utf8"),
      ) as { status: string; independent: boolean };
      assert.equal(result.status, "success");
      assert.equal(result.independent, true);

      const count = Number(await readFile(countFile, "utf8"));
      assert.equal(count, 1);

      const reportBeforeRepeat = JSON.parse(
        await readFile(body.reportJson, "utf8"),
      ) as Record<string, unknown>;
      const { generatedAt: _gen1, ...stableBefore } = reportBeforeRepeat;

      const runAgain = await runPlistProgram(parsed);
      assert.equal(
        runAgain.success,
        true,
        new TextDecoder().decode(runAgain.stderr),
      );
      const countAgain = Number(await readFile(countFile, "utf8"));
      assert.equal(countAgain, 1);
      const bodyAgain = JSON.parse(
        new TextDecoder().decode(runAgain.stdout),
      ) as {
        reportJson: string;
      };
      const reportAfterRepeat = JSON.parse(
        await readFile(bodyAgain.reportJson, "utf8"),
      ) as Record<string, unknown>;
      const { generatedAt: _gen2, ...stableAfter } = reportAfterRepeat;
      assert.deepEqual(stableAfter, stableBefore);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name:
    "launchd plist ProgramArguments run before approve skips model spend (hermetic env)",
  ignore: !isDarwin,
  fn: async () => {
    const period = defaultPreviousUtcWeek();
    const createdAt = new Date(
      Date.parse(period.weekStartIso) + 36 * 60 * 60 * 1000,
    ).toISOString();
    const home = await mkdtemp(join(tmpdir(), "jev-plist-unapproved-"));
    const layout = layoutIsolatedHome(home);
    await mkdir(layout.runsDir, { recursive: true });
    await seedLaunchdTmpLayout(layout);
    const countFile = join(home, "invoke.count");
    const fakePi = await writeMockPi(home, countFile);
    const runId = "33333333-3333-4333-8333-333333333333";
    await writeRunFixture(layout.runsDir, runId, createdAt);

    const seedEnv = {
      HOME: layout.home,
      XDG_DATA_HOME: layout.xdg,
      MODEL_RESOLVER: FIXTURE_RESOLVER,
      PI_REVIEW_BIN: fakePi,
      JEV_AUDIT_BASH: "bash",
    };

    try {
      await seedAuditCli(seedEnv, ["prepare"]);
      const preview = await runPreview({
        HOME: layout.home,
        XDG_DATA_HOME: layout.xdg,
        PI_CODING_AGENT_DIR: layout.piDir,
        PI_REVIEW_BIN: fakePi,
        MODEL_RESOLVER: FIXTURE_RESOLVER,
      });
      assert.equal(preview.success, true, preview.stderr);
      assert.equal(preview.stderr, "");
      const parsed = await plistToJson(preview.stdout);
      const runOut = await runPlistProgram(parsed);
      assert.equal(
        runOut.success,
        true,
        new TextDecoder().decode(runOut.stderr),
      );
      const body = JSON.parse(new TextDecoder().decode(runOut.stdout)) as {
        reportJson: string;
        counts: { needsPreflight: number; audited: number };
      };
      assert.equal(body.counts.needsPreflight, 1);
      assert.equal(body.counts.audited, 0);
      const report = JSON.parse(await readFile(body.reportJson, "utf8")) as {
        cases: Array<{ status: string }>;
      };
      assert.equal(report.cases[0]?.status, "needs_preflight");
      const weekRoot = join(
        layout.xdg,
        "parallel-review",
        "jev-audit",
        "weeks",
        period.weekStart,
      );
      await assertNoSpendArtifacts(
        join(layout.xdg, "parallel-review", "jev-audit"),
        weekRoot,
        runId,
      );
      assert.equal(await readInvokeCount(countFile), 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
});

Deno.test("assertNoSpendArtifacts rejects seeded spend markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-spend-neg-"));
  const auditBase = join(root, "audit");
  const weekRoot = join(auditBase, "weeks", "2020-09-28");
  const resultsDir = join(weekRoot, "results");
  const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  try {
    await mkdir(resultsDir, { recursive: true });
    await writeFile(join(resultsDir, `${runId}.attempt.json`), "{}\n");
    await assert.rejects(() =>
      assertNoSpendArtifacts(auditBase, weekRoot, runId)
    );
    await rm(join(resultsDir, `${runId}.attempt.json`));
    await mkdir(join(auditBase, "cache", "attempts"), { recursive: true });
    await writeFile(
      join(auditBase, "cache", "attempts", "global.json"),
      "{}\n",
    );
    await assert.rejects(() =>
      assertNoSpendArtifacts(auditBase, weekRoot, runId)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

Deno.test("launchd install script references lint and install gate", async () => {
  const text = await readFile(SCRIPT, "utf8");
  assert.match(text, /--install/);
  assert.match(text, /plutil -lint/);
  assert.match(text, /install requires Darwin/);
  assert.doesNotMatch(text, /chmod 700.*\|\| true/);
});

Deno.test("launchd --install fails on non-Darwin", async () => {
  if (isDarwin) return;
  const out = await new Deno.Command("bash", {
    args: [SCRIPT, "--install"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(out.success, false);
  assert.match(new TextDecoder().decode(out.stderr), /Darwin/);
});
