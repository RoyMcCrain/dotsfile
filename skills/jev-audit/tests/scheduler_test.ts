import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
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
  const out = await new Deno.Command("bash", {
    args: [SCRIPT],
    env: { ...Deno.env.toObject(), ...env },
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
  envOverrides: Record<string, string> = {},
): Promise<Deno.CommandOutput> => {
  const args = plist.ProgramArguments;
  assert.ok(args.length >= 2, "expected deno + args");
  const deno = args[0];
  const denoArgs = args.slice(1);
  const baseEnv = plist.EnvironmentVariables ?? {};
  return await new Deno.Command(deno, {
    args: denoArgs,
    env: { ...Deno.env.toObject(), ...baseEnv, ...envOverrides },
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
      const parsed = await plistToJson(preview.stdout);
      assert.deepEqual(
        parsed.ProgramArguments.slice(-2),
        [AUDIT_SCRIPT, "run"],
      );
      assert.equal(parsed.ProgramArguments.includes("-A"), false);

      const runOut = await runPlistProgram(parsed, {
        MODEL_RESOLVER: FIXTURE_RESOLVER,
      });
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
      const parsed = await plistToJson(preview.stdout);

      const runOut = await runPlistProgram(parsed, {
        MODEL_RESOLVER: FIXTURE_RESOLVER,
      });
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
      const report = JSON.parse(await readFile(body.reportJson, "utf8")) as {
        counts: { audited: number };
      };
      assert.equal(report.counts.audited, 1);

      const count = Number(await readFile(countFile, "utf8"));
      assert.equal(count, 1);

      const runAgain = await runPlistProgram(parsed, {
        MODEL_RESOLVER: FIXTURE_RESOLVER,
      });
      assert.equal(
        runAgain.success,
        true,
        new TextDecoder().decode(runAgain.stderr),
      );
      const countAgain = Number(await readFile(countFile, "utf8"));
      assert.equal(countAgain, 1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
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
