import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(
  import.meta.dirname!,
  "../scripts/install_weekly_launchd.sh",
);

const isDarwin = Deno.build.os === "darwin";

type Tooling = {
  binDir: string;
  launchctlLog: string;
  deno: string;
  jq: string;
  bash: string;
};

const writeMockLaunchctl = async (binDir: string, logPath: string) => {
  await writeFile(
    join(binDir, "launchctl"),
    "#!/usr/bin/env bash\n" +
      'printf "%s\\n" "$*" >> "' +
      logPath.replaceAll('"', '\\"') +
      '"\n' +
      "exit 0\n",
    { mode: 0o700 },
  );
};

const seedMinimalTools = async (root: string): Promise<Tooling> => {
  const binDir = join(root, "bin");
  await mkdir(binDir, { recursive: true });
  const launchctlLog = join(root, "launchctl.log");
  await writeMockLaunchctl(binDir, launchctlLog);

  const deno = Deno.execPath();
  await symlink(deno, join(binDir, "deno"));

  const which = await new Deno.Command("bash", {
    args: [
      "-c",
      'command -v jq || exit 1; found=""; IFS=: read -r -a dirs <<< "$PATH"; ' +
      'for dir in "${dirs[@]}"; do [[ -z "$dir" ]] && continue; c="$dir/bash"; ' +
      '[[ -x "$c" ]] || continue; m=$("$c" -c "echo \\${BASH_VERSINFO[0]}") 2>/dev/null || continue; ' +
      'if ((m >= 5)); then found="$c"; break; fi; done; [[ -n "$found" ]] || exit 1; echo "$found"',
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(which.success, true, new TextDecoder().decode(which.stderr));
  const lines = new TextDecoder().decode(which.stdout).trim().split("\n");
  const jq = lines[0];
  const bash = lines[1];
  assert.ok(jq && bash, "need jq and Bash 5+ for install tests");
  await symlink(jq, join(binDir, "jq"));
  await symlink(bash, join(binDir, "bash"));

  return { binDir, launchctlLog, deno, jq, bash };
};

const writeFakePi = async (path: string, executable = true) => {
  await writeFile(
    path,
    '#!/usr/bin/env bash\necho \'{"minLevel":2,"maxLevel":4}\'\n',
    { mode: executable ? 0o700 : 0o600 },
  );
};

const layoutPaths = (home: string, xdg: string) => {
  const jevAudit = join(xdg, "parallel-review", "jev-audit");
  return {
    home,
    xdg,
    jevAudit,
    jevTmp: join(jevAudit, "tmp"),
    log: join(jevAudit, "launchd.log"),
    launchAgents: join(home, "Library", "LaunchAgents"),
    plist: join(
      home,
      "Library",
      "LaunchAgents",
      "com.roymc.jev-audit.weekly.plist",
    ),
  };
};

const runInstall = async (
  env: Record<string, string>,
  tooling: Tooling,
): Promise<{ success: boolean; stderr: string; stdout: string }> => {
  assert.ok(env.HOME, "install tests must use synthetic HOME");
  assert.ok(
    env.XDG_DATA_HOME,
    "install tests must use synthetic XDG_DATA_HOME",
  );
  const out = await new Deno.Command("bash", {
    args: [SCRIPT, "--install"],
    env: {
      ...Deno.env.toObject(),
      PATH: `${tooling.binDir}:${Deno.env.get("PATH") ?? ""}`,
      JEV_AUDIT_BASH: tooling.bash,
      ...env,
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    success: out.success,
    stderr: new TextDecoder().decode(out.stderr),
    stdout: new TextDecoder().decode(out.stdout),
  };
};

const runPreview = async (
  env: Record<string, string>,
): Promise<{ success: boolean; stderr: string }> => {
  const out = await new Deno.Command("bash", {
    args: [SCRIPT],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    success: out.success,
    stderr: new TextDecoder().decode(out.stderr),
  };
};

Deno.test({
  name: "install rejects dangling log symlink without creating target",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-log-dangle-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const missingTarget = join(root, "missing.log");
    try {
      await mkdir(paths.jevAudit, { recursive: true });
      await symlink(missingTarget, paths.log);
      const fakePi = join(root, "pi.sh");
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /symlink|log/i);
      await assert.rejects(() => stat(missingTarget));
      await assert.rejects(() => stat(paths.plist));
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install rejects log symlink to existing file without mutating victim",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-log-victim-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const victim = join(root, "victim.log");
    const secret = "secret\n";
    await writeFile(victim, secret, { mode: 0o644 });
    const before = await stat(victim);
    try {
      await mkdir(paths.jevAudit, { recursive: true });
      await symlink(victim, paths.log);
      const fakePi = join(root, "pi.sh");
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /symlink|log/i);
      const after = await stat(victim);
      assert.equal(after.mode, before.mode);
      assert.equal(after.size, before.size);
      assert.equal(await readFile(victim, "utf8"), secret);
      await assert.rejects(() => stat(paths.plist));
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install rejects dangling tmp symlink without creating target",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-tmp-dangle-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const missingTmp = join(root, "missing-tmp-dir");
    try {
      await mkdir(paths.jevAudit, { recursive: true });
      await symlink(missingTmp, paths.jevTmp);
      const fakePi = join(root, "pi.sh");
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /symlink|tmp/i);
      await assert.rejects(() => stat(missingTmp));
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install rejects tmp symlink without chmod on outside target",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-tmp-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const outside = join(root, "outside-tmp");
    await mkdir(outside, { recursive: true, mode: 0o755 });
    const before = (await stat(outside)).mode & 0o777;
    try {
      await mkdir(paths.jevAudit, { recursive: true });
      await symlink(outside, paths.jevTmp);
      const fakePi = join(root, "pi.sh");
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /symlink|tmp/i);
      const after = (await stat(outside)).mode & 0o777;
      assert.equal(after, before);
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test("preview rejects relative explicit XDG_DATA_HOME", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-rel-xdg-"));
  try {
    const result = await runPreview({
      HOME: home,
      XDG_DATA_HOME: "relative/xdg",
    });
    assert.equal(result.success, false);
    assert.match(result.stderr, /absolute|XDG_DATA_HOME/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("preview rejects comma in resolved CONFIG_P allow-read path", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-config-comma-"));
  const home = join(root, "home");
  const commaConfig = join(root, "comma,config-root");
  try {
    await mkdir(home, { recursive: true });
    await mkdir(commaConfig, { recursive: true });
    await symlink(commaConfig, join(home, ".config"));
    const result = await runPreview({ HOME: home });
    assert.equal(result.success, false);
    assert.match(result.stderr, /comma/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

Deno.test({
  name: "install rejects missing PI_REVIEW_BIN without launchctl",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-pi-miss-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    try {
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: join(root, "no-such-pi"),
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /PI_REVIEW|pi|executable/i);
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install rejects non-executable PI_REVIEW_BIN without launchctl",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-pi-nox-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const fakePi = join(root, "pi-not-exec.sh");
    try {
      await writeFakePi(fakePi, false);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /PI_REVIEW|executable/i);
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install succeeds with fake tools and logs launchctl only in fixture",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-ok-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const fakePi = join(root, "pi.sh");
    try {
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, true, result.stderr + result.stdout);
      assert.match(result.stdout, /installed/);
      const plistStat = await stat(paths.plist);
      assert.equal(plistStat.isFile(), true);
      const logMode = (await stat(paths.log)).mode & 0o777;
      assert.equal(logMode, 0o600);
      const tmpMode = (await lstat(paths.jevTmp)).mode & 0o777;
      assert.equal(tmpMode, 0o700);
      const launchLog = await readFile(tooling.launchctlLog, "utf8");
      assert.match(launchLog, /bootstrap/);
      assert.ok(launchLog.includes(paths.plist));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "install rejects symlink ancestor under jev-audit tree",
  ignore: !isDarwin,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-inst-ancestor-"));
    const tooling = await seedMinimalTools(root);
    const home = join(root, "home");
    const xdg = join(home, "xdg");
    const paths = layoutPaths(home, xdg);
    const outside = join(root, "outside-audit");
    try {
      await mkdir(join(xdg, "parallel-review"), { recursive: true });
      await mkdir(outside, { recursive: true });
      await symlink(outside, paths.jevAudit);
      const fakePi = join(root, "pi.sh");
      await writeFakePi(fakePi);
      const result = await runInstall(
        {
          HOME: home,
          XDG_DATA_HOME: xdg,
          PI_REVIEW_BIN: fakePi,
        },
        tooling,
      );
      assert.equal(result.success, false, result.stderr);
      assert.match(result.stderr, /symlink/i);
      await assert.rejects(() => readFile(tooling.launchctlLog));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});
