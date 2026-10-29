export const runFixtureProcess = async (
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
) => {
  const child = Bun.spawn([
    command,
    ...(command === process.execPath
      ? ["--config=/dev/null", "--no-env-file", "--no-install"]
      : []),
    ...args,
  ], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
};
