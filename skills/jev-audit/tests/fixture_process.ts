export const runFixtureProcess = async (
  args: string[],
  env: Record<string, string | undefined> = process.env,
  options: { cwd?: string } = {},
) => {
  const child = Bun.spawn([
    process.execPath,
    "--config=/dev/null",
    "--no-env-file",
    "--no-install",
    ...args,
  ], {
    env,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, success: code === 0, stdout: new TextEncoder().encode(stdout), stderr: new TextEncoder().encode(stderr), stdoutText: stdout, stderrText: stderr };
};
