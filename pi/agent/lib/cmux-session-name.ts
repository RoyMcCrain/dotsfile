export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
};

export type ExecFn = (
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
) => Promise<ExecResult>;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isControlChar = (char: string): boolean => {
  const code = char.codePointAt(0)!;
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
};

export const normalizeCustomTitle = (title: string): string | undefined => {
  const replaced = Array.from(title)
    .map((char) => (isControlChar(char) ? " " : char))
    .join("");
  const collapsed = replaced.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  const limited = Array.from(collapsed).slice(0, 120).join("");
  return limited || undefined;
};

export const resolveCmuxCliPath = (
  env: Record<string, string | undefined> = process.env,
): string => {
  const bundled = env.CMUX_BUNDLED_CLI_PATH?.trim();
  return bundled || "cmux";
};

export const parseWorkspaceCustomTitle = (
  json: string,
  workspaceId: string,
): string | undefined => {
  const targetId = workspaceId.trim();
  if (!targetId) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;
  const workspaces = parsed.workspaces;
  if (!Array.isArray(workspaces)) return undefined;

  for (const entry of workspaces) {
    if (!isRecord(entry)) continue;
    if (entry.id !== targetId) continue;

    const customTitle = entry.custom_title;
    if (typeof customTitle !== "string") return undefined;

    return normalizeCustomTitle(customTitle);
  }

  return undefined;
};

export type FetchCmuxWorkspaceCustomTitleOptions = {
  workspaceId: string;
  exec: ExecFn;
  cmuxBin?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export const fetchCmuxWorkspaceCustomTitle = async (
  options: FetchCmuxWorkspaceCustomTitleOptions,
): Promise<string | undefined> => {
  const workspaceId = options.workspaceId.trim();
  if (!workspaceId) return undefined;

  const cmuxBin = options.cmuxBin ?? resolveCmuxCliPath(options.env);

  try {
    const result = await options.exec(
      cmuxBin,
      ["workspace", "list", "--json"],
      {
        timeout: options.timeoutMs ?? 5000,
        signal: options.signal,
      },
    );
    if (result.killed || result.code !== 0) return undefined;
    return parseWorkspaceCustomTitle(result.stdout, workspaceId);
  } catch {
    return undefined;
  }
};
