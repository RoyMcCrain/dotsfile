import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseUtcDate } from "../scripts/week_period.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

const runCli = async (
  args: string[],
  home: string,
): Promise<{ ok: boolean; stderr: string }> => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: {
      ...Deno.env.toObject(),
      HOME: home,
      XDG_DATA_HOME: join(home, "xdg"),
    },
    stderr: "piped",
  }).output();
  return { ok: out.success, stderr: new TextDecoder().decode(out.stderr) };
};

Deno.test("CLI rejects invalid week and impossible dates", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-cli-"));
  assert.throws(() => parseUtcDate("2026-02-30"), /invalid UTC date/);
  const badDay = await runCli(["prepare", "--week", "2026-09-29"], home);
  assert.equal(badDay.ok, false);
  const missingPath = await runCli(["prepare", "--audit-dir"], home);
  assert.equal(missingPath.ok, false);
  const unknown = await runCli(["prepare", "--nope", "x"], home);
  assert.equal(unknown.ok, false);
  await rm(home, { recursive: true, force: true });
});

Deno.test("rejected prepare performs no audit writes", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-cli-nowrite-"));
  const auditDir = join(home, "audit");
  await runCli(
    ["prepare", "--week", "2026-02-30", "--audit-dir", auditDir],
    home,
  );
  await assert.rejects(() => stat(join(auditDir, "weeks")));
  await rm(home, { recursive: true, force: true });
});
