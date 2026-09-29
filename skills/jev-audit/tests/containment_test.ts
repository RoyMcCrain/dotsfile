import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

const runCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<{ ok: boolean; stderr: string }> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return {
    ok: out.success,
    stderr: new TextDecoder().decode(out.stderr),
  };
};

Deno.test("rejects audit-dir under default runs without creating history paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-contain-"));
  const xdg = join(home, ".local", "share");
  const badAudit = join(xdg, "parallel-review", "runs", "should-not-create");
  const runsRoot = join(xdg, "parallel-review", "runs");
  const result = await runCli(
    { HOME: home, XDG_DATA_HOME: xdg },
    ["prepare", "--audit-dir", badAudit, "--week", "2026-09-21"],
  );
  assert.equal(result.ok, false);
  assert.match(result.stderr, /must not live under runs/);
  await assert.rejects(() => stat(badAudit));
  await assert.rejects(() => stat(join(runsRoot, "should-not-create")));
  await rm(home, { recursive: true, force: true });
});

Deno.test("rejects audit-dir equal to explicit runs-dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-contain-eq-"));
  const runs = join(root, "runs");
  const result = await runCli(
    { HOME: root, XDG_DATA_HOME: join(root, "xdg") },
    [
      "prepare",
      "--runs-dir",
      runs,
      "--audit-dir",
      runs,
      "--week",
      "2026-09-21",
    ],
  );
  assert.equal(result.ok, false);
  assert.match(result.stderr, /must not live under runs/);
  await rm(root, { recursive: true, force: true });
});
