import { describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectImplUsage,
  parseClaudeUsage,
  parseCodexUsage,
  queryClaudeUsage,
} from "../scripts/query_impl_usage.ts";
import { decideRole, parseUsage } from "../scripts/select_impl_role.ts";

describe("implementation usage selection", () => {
  test("chooses the side with more available capacity using the binding window", () => {
    const claude = parseClaudeUsage({
      five_hour: { utilization: 20 },
      seven_day: { utilization: 70 },
    });
    const openai = parseCodexUsage({
      primary: { usedPercent: 10 },
      secondary: { usedPercent: 15 },
    });
    expect(claude).toEqual({ remainingPercent: 30 });
    expect(openai).toEqual({ remainingPercent: 85 });
    expect(decideRole({ claude, openai }).role).toBe("impl.luna");
  });

  test("prefers known capacity over unknown and avoids a known exhausted side", () => {
    expect(
      decideRole({
        claude: { unavailable: "unknown" },
        openai: { remainingPercent: 40 },
      }).role,
    )
      .toBe("impl.luna");
    expect(
      decideRole({
        claude: { remainingPercent: 0 },
        openai: { unavailable: "unknown" },
      }).role,
    )
      .toBe("impl.luna");
    expect(
      decideRole({
        claude: { remainingPercent: 50 },
        openai: { remainingPercent: 0 },
      }).role,
    )
      .toBe("impl.haiku");
  });

  test("ties and both-unknown select fallback; exhausted known sides are rejected", () => {
    expect(
      decideRole({
        claude: { remainingPercent: 50 },
        openai: { remainingPercent: 50 },
      }).reason,
    )
      .toBe("fallback");
    expect(
      decideRole({
        claude: { unavailable: "unknown" },
        openai: { unavailable: "unknown" },
      }).reason,
    )
      .toBe("fallback");
    expect(
      decideRole({
        claude: { remainingPercent: 0 },
        openai: { remainingPercent: 0 },
      }).reason,
    )
      .toBe("exhausted");
  });

  test("Claude fetch uses fixed origin, redirect rejection, and sanitized auth failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "impl-usage-test-"));
    const oldConfig = process.env.PI_CLAUDE_CODE_CONFIG_DIR;
    const secret = "synthetic-secret-token";
    const originalFetch = globalThis.fetch;
    try {
      process.env.PI_CLAUDE_CODE_CONFIG_DIR = directory;
      await writeFile(
        join(directory, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: { accessToken: secret },
        }),
      );
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: (input: URL | RequestInfo, init?: RequestInit) => {
          expect(String(input)).toBe(
            "https://api.anthropic.com/api/oauth/usage",
          );
          expect(init?.redirect).toBe("error");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            `Bearer ${secret}`,
          );
          return Promise.resolve(new Response(secret, { status: 401 }));
        },
      });
      const result = await queryClaudeUsage();
      expect(result).toEqual({ unavailable: "auth" });
      expect(JSON.stringify(result)).not.toContain(secret);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldConfig === undefined) delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      else process.env.PI_CLAUDE_CODE_CONFIG_DIR = oldConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("Claude fetch parses successful subscription windows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "impl-usage-test-"));
    const oldConfig = process.env.PI_CLAUDE_CODE_CONFIG_DIR;
    const secret = "synthetic-success-token";
    const originalFetch = globalThis.fetch;
    try {
      process.env.PI_CLAUDE_CODE_CONFIG_DIR = directory;
      await writeFile(
        join(directory, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: secret } }),
      );
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                five_hour: { utilization: 25 },
                seven_day: { utilization: 70 },
              }),
              { status: 200 },
            ),
          ),
      });
      const result = await queryClaudeUsage();
      expect(result).toEqual({ remainingPercent: 30 });
      expect(JSON.stringify(result)).not.toContain(secret);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldConfig === undefined) delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      else process.env.PI_CLAUDE_CODE_CONFIG_DIR = oldConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("default MCP-only credentials fall back to the Keychain without exposing its token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "impl-default-config-"));
    const home = join(directory, "home");
    const claudeDirectory = join(home, ".claude");
    const binDirectory = join(directory, "bin");
    const oldHome = process.env.HOME;
    const oldPath = process.env.PATH;
    const oldConfig = process.env.PI_CLAUDE_CODE_CONFIG_DIR;
    const oldClaudeConfig = process.env.CLAUDE_CONFIG_DIR;
    const originalFetch = globalThis.fetch;
    const secret = "synthetic-keychain-token";
    const authorization: { value: string | null } = { value: null };
    try {
      await mkdir(claudeDirectory, { recursive: true });
      await mkdir(binDirectory, { recursive: true });
      await writeFile(
        join(claudeDirectory, ".credentials.json"),
        JSON.stringify({ mcpOAuth: {} }),
      );
      const fakeSecurity = join(binDirectory, "security");
      await writeFile(
        fakeSecurity,
        '#!/bin/sh\nprintf \'%s\\n\' \'{"claudeAiOauth":{"accessToken":"synthetic-keychain-token"}}\'\n',
      );
      await chmod(fakeSecurity, 0o755);
      process.env.HOME = home;
      delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      delete process.env.CLAUDE_CONFIG_DIR;
      process.env.PATH = binDirectory;
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: (_input: URL | RequestInfo, init?: RequestInit) => {
          authorization.value = new Headers(init?.headers).get("authorization");
          return Promise.resolve(
            new Response(
              JSON.stringify({
                five_hour: { utilization: 20 },
                seven_day: { utilization: 40 },
              }),
              { status: 200 },
            ),
          );
        },
      });
      const result = await queryClaudeUsage();
      expect(result).toEqual({ remainingPercent: 60 });
      expect(authorization.value).toBe(`Bearer ${secret}`);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(await Bun.file(join(claudeDirectory, ".credentials.json")).text())
        .toBe(JSON.stringify({ mcpOAuth: {} }));
    } finally {
      globalThis.fetch = originalFetch;
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldConfig === undefined) delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      else process.env.PI_CLAUDE_CODE_CONFIG_DIR = oldConfig;
      if (oldClaudeConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = oldClaudeConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("missing custom-config credentials do not use the default Keychain or fetch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "impl-custom-config-"));
    const oldConfig = process.env.PI_CLAUDE_CODE_CONFIG_DIR;
    const oldClaudeConfig = process.env.CLAUDE_CONFIG_DIR;
    const originalFetch = globalThis.fetch;
    const keychain = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("Unexpected Keychain access");
    });
    let called = false;
    try {
      process.env.PI_CLAUDE_CODE_CONFIG_DIR = directory;
      process.env.CLAUDE_CONFIG_DIR = "";
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: () => {
          called = true;
          return Promise.resolve(new Response("{}"));
        },
      });
      const result = await queryClaudeUsage();
      expect(result).toEqual({ unavailable: "auth" });
      expect(called).toBe(false);
      expect(keychain).not.toHaveBeenCalled();
    } finally {
      keychain.mockRestore();
      globalThis.fetch = originalFetch;
      if (oldConfig === undefined) delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      else process.env.PI_CLAUDE_CODE_CONFIG_DIR = oldConfig;
      if (oldClaudeConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = oldClaudeConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("collector preserves Claude usage when the Codex CLI fails safely", async () => {
    const directory = await mkdtemp(join(tmpdir(), "impl-collector-test-"));
    const home = join(directory, "home");
    const config = join(directory, "claude");
    const bin = join(directory, "bin");
    const codexHome = join(directory, "codex-home");
    const originalFetch = globalThis.fetch;
    const oldHome = process.env.HOME;
    const oldPath = process.env.PATH;
    const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
    const oldCodexHome = process.env.CODEX_HOME;
    const oldClaudeConfig = process.env.PI_CLAUDE_CODE_CONFIG_DIR;
    const token = "synthetic-collector-token";
    const stderrCanary = "synthetic-codex-stderr-canary";
    try {
      await Promise.all([
        mkdir(home, { recursive: true }),
        mkdir(config, { recursive: true }),
        mkdir(bin, { recursive: true }),
        mkdir(codexHome, { recursive: true }),
      ]);
      await writeFile(
        join(config, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: token } }),
      );
      const codex = join(bin, "codex");
      await writeFile(
        codex,
        `#!/bin/sh\nprintf '%s\\n' '${stderrCanary}' >&2\nexit 23\n`,
      );
      await chmod(codex, 0o755);
      process.env.HOME = home;
      process.env.PATH = bin;
      process.env.PI_CODING_AGENT_DIR = join(directory, "agent");
      process.env.CODEX_HOME = codexHome;
      process.env.PI_CLAUDE_CODE_CONFIG_DIR = config;
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ five_hour: { utilization: 25 } }),
              { status: 200 },
            ),
          ),
      });
      const result = await collectImplUsage();
      expect(result).toEqual({
        claude: { remainingPercent: 75 },
        openai: { unavailable: "unavailable" },
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain(stderrCanary);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
      if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = oldCodexHome;
      if (oldClaudeConfig === undefined) {
        delete process.env.PI_CLAUDE_CODE_CONFIG_DIR;
      } else process.env.PI_CLAUDE_CODE_CONFIG_DIR = oldClaudeConfig;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("missing, nonfinite, out-of-range, and empty windows remain unknown", () => {
    expect(
      parseClaudeUsage({ five_hour: null, seven_day: { utilization: NaN } }),
    )
      .toEqual({ unavailable: "unknown" });
    expect(parseClaudeUsage({ five_hour: { utilization: 101 } }))
      .toEqual({ unavailable: "unknown" });
    expect(parseCodexUsage({ primary: { usedPercent: Infinity } }))
      .toEqual({ unavailable: "unknown" });
    expect(parseUsage({ claude: { remainingPercent: 101 }, openai: {} }))
      .toBeUndefined();
    expect(parseUsage({ claude: { unavailable: "private-error" }, openai: {} }))
      .toBeUndefined();
  });
});
