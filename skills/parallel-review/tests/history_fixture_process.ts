export const runFixtureProcess = async (
  command: string,
  options: {
    args: string[];
    env?: Record<string, string | undefined>;
    [option: string]: unknown;
  },
) => {
  const child = Bun.spawn([
    command,
    ...(command === process.execPath
      ? ["--config=/dev/null", "--no-env-file", "--no-install"]
      : []),
    ...options.args,
  ], {
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return {
    code,
    stdout: new Uint8Array(stdout),
    stderr: new Uint8Array(stderr),
    success: code === 0,
  };
};
