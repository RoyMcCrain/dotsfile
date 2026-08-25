import { assertEquals } from "jsr:@std/assert@1.0";
import cmuxSessionName, {
  drainCmuxSessionNameSyncsForTest,
  syncCmuxSessionName,
} from "../extensions/cmux-session-name.ts";
import {
  fetchCmuxWorkspaceCustomTitle,
  normalizeCustomTitle,
  parseWorkspaceCustomTitle,
  resolveCmuxCliPath,
} from "../lib/cmux-session-name.ts";

const CALLER_ID = "ws-caller";
const OTHER_ID = "ws-other";

const sampleListJson = JSON.stringify({
  workspaces: [
    {
      id: OTHER_ID,
      custom_title: "other task",
      has_custom_title: true,
      title: "other task",
    },
    {
      id: CALLER_ID,
      custom_title: "  jj workspace fix  ",
      has_custom_title: true,
      title: "jj workspace fix",
    },
  ],
});

function listJsonForTitle(title: string): string {
  return JSON.stringify({
    workspaces: [{ id: CALLER_ID, custom_title: title }],
  });
}

Deno.test("parseWorkspaceCustomTitle selects caller workspace by exact id", () => {
  assertEquals(
    parseWorkspaceCustomTitle(sampleListJson, CALLER_ID),
    "jj workspace fix",
  );
});

Deno.test("parseWorkspaceCustomTitle returns trimmed custom_title", () => {
  assertEquals(
    parseWorkspaceCustomTitle(
      JSON.stringify({
        workspaces: [{
          id: CALLER_ID,
          custom_title: "  task name  ",
          title: "ignored",
        }],
      }),
      CALLER_ID,
    ),
    "task name",
  );
});

Deno.test("parseWorkspaceCustomTitle rejects generated title without custom_title", () => {
  assertEquals(
    parseWorkspaceCustomTitle(
      JSON.stringify({
        workspaces: [{
          id: CALLER_ID,
          title: "π - dotsfile",
          has_custom_title: false,
        }],
      }),
      CALLER_ID,
    ),
    undefined,
  );
});

Deno.test("parseWorkspaceCustomTitle rejects malformed or missing data", () => {
  assertEquals(parseWorkspaceCustomTitle("{bad json", CALLER_ID), undefined);
  assertEquals(parseWorkspaceCustomTitle("[]", CALLER_ID), undefined);
  assertEquals(
    parseWorkspaceCustomTitle(sampleListJson, "missing-id"),
    undefined,
  );
  assertEquals(
    parseWorkspaceCustomTitle(
      JSON.stringify({
        workspaces: [{ id: CALLER_ID, custom_title: "   " }],
      }),
      CALLER_ID,
    ),
    undefined,
  );
});

Deno.test("normalizeCustomTitle replaces control characters and collapses whitespace", () => {
  assertEquals(
    normalizeCustomTitle("fix\tbug\nnow"),
    "fix bug now",
  );
  assertEquals(
    normalizeCustomTitle("  hello   world  "),
    "hello world",
  );
  assertEquals(
    normalizeCustomTitle("\u0000\u001f\u007f\u009f"),
    undefined,
  );
});

Deno.test("normalizeCustomTitle limits to 120 Unicode code points", () => {
  const longTitle = "あ".repeat(150);
  const normalized = normalizeCustomTitle(longTitle);
  assertEquals(normalized, "あ".repeat(120));
  assertEquals(Array.from(normalized ?? "").length, 120);
});

Deno.test("parseWorkspaceCustomTitle normalizes control characters and length", () => {
  assertEquals(
    parseWorkspaceCustomTitle(
      listJsonForTitle("task\u0001name\nwith\tspaces"),
      CALLER_ID,
    ),
    "task name with spaces",
  );

  const longTitle = "x".repeat(200);
  assertEquals(
    parseWorkspaceCustomTitle(listJsonForTitle(longTitle), CALLER_ID),
    "x".repeat(120),
  );
});

Deno.test("resolveCmuxCliPath prefers CMUX_BUNDLED_CLI_PATH", () => {
  assertEquals(
    resolveCmuxCliPath({ CMUX_BUNDLED_CLI_PATH: "/tmp/cmux" }),
    "/tmp/cmux",
  );
  assertEquals(resolveCmuxCliPath({}), "cmux");
});

type Handler = (_event: unknown, _ctx: unknown) => unknown;

function createFakePi(options?: {
  exec?: (
    command: string,
    args: string[],
  ) => Promise<
    { stdout: string; stderr: string; code: number; killed: boolean }
  >;
}) {
  const handlers = new Map<string, Handler[]>();
  let sessionName: string | undefined;
  const execCalls: Array<{ command: string; args: string[] }> = [];

  const exec = options?.exec ?? (() =>
    Promise.resolve({
      stdout: sampleListJson,
      stderr: "",
      code: 0,
      killed: false,
    }));

  const pi = {
    on(type: string, handler: Handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    getSessionName() {
      return sessionName;
    },
    setSessionName(name: string) {
      sessionName = name;
    },
    exec(command: string, args: string[], _options?: unknown) {
      execCalls.push({ command, args });
      return exec(command, args);
    },
  };

  const dispatch = async (type: string) => {
    for (const handler of handlers.get(type) ?? []) {
      await handler({}, {});
    }
  };

  return {
    pi,
    dispatch,
    execCalls,
    getSessionName: () => sessionName,
    setSessionName: (name: string | undefined) => {
      sessionName = name;
    },
  };
}

function withCmuxEnv<T>(
  env: {
    workspaceId?: string;
    bundledCliPath?: string | null;
  },
  fn: () => Promise<T> | T,
): Promise<T> | T {
  const keys = ["CMUX_WORKSPACE_ID", "CMUX_BUNDLED_CLI_PATH"] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, Deno.env.get(key)]),
  ) as Record<(typeof keys)[number], string | undefined>;

  const restore = () => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };

  if (env.workspaceId === undefined) Deno.env.delete("CMUX_WORKSPACE_ID");
  else Deno.env.set("CMUX_WORKSPACE_ID", env.workspaceId);

  if (env.bundledCliPath === null) Deno.env.delete("CMUX_BUNDLED_CLI_PATH");
  else if (env.bundledCliPath !== undefined) {
    Deno.env.set("CMUX_BUNDLED_CLI_PATH", env.bundledCliPath);
  }

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function withCmuxWorkspaceId<T>(
  workspaceId: string | undefined,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return withCmuxEnv({ workspaceId, bundledCliPath: null }, fn);
}

Deno.test("extension sets unnamed session on session_start", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    const fake = createFakePi();
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), "jj workspace fix");
    assertEquals(fake.execCalls, [{
      command: "cmux",
      args: ["workspace", "list", "--json"],
    }]);
  });
});

Deno.test("extension updates auto name on first agent_settled only", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    let callCount = 0;
    const fake = createFakePi({
      exec: () => {
        callCount += 1;
        const title = callCount === 1 ? "old-task" : "new-task";
        return Promise.resolve({
          stdout: listJsonForTitle(title),
          stderr: "",
          code: 0,
          killed: false,
        });
      },
    });
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "old-task");
    assertEquals(fake.execCalls.length, 1);

    await fake.dispatch("agent_settled");
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "new-task");
    assertEquals(fake.execCalls.length, 2);

    await fake.dispatch("agent_settled");
    await fake.dispatch("agent_settled");
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "new-task");
    assertEquals(fake.execCalls.length, 2);
  });
});

Deno.test("extension preserves manual name set before first agent_settled", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    const fake = createFakePi();
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "jj workspace fix");
    assertEquals(fake.execCalls.length, 1);

    fake.setSessionName("manual name");

    await fake.dispatch("agent_settled");
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "manual name");
    assertEquals(fake.execCalls.length, 1);
  });
});

Deno.test("extension preserves manual name set during first-settled lookup", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    let resolveStartup: (value: {
      stdout: string;
      stderr: string;
      code: number;
      killed: boolean;
    }) => void = () => {};
    let resolveSettled: (value: {
      stdout: string;
      stderr: string;
      code: number;
      killed: boolean;
    }) => void = () => {};

    let callCount = 0;
    const fake = createFakePi({
      exec: () => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveStartup = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveSettled = resolve;
        });
      },
    });
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    resolveStartup({
      stdout: listJsonForTitle("old-task"),
      stderr: "",
      code: 0,
      killed: false,
    });
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "old-task");

    const settledDispatch = fake.dispatch("agent_settled");
    await Promise.resolve();
    assertEquals(fake.execCalls.length, 2);
    assertEquals(fake.getSessionName(), "old-task");

    fake.setSessionName("manual during settled lookup");
    resolveSettled({
      stdout: listJsonForTitle("new-task"),
      stderr: "",
      code: 0,
      killed: false,
    });
    await settledDispatch;
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), "manual during settled lookup");
  });
});

Deno.test("extension performs at most two lookups across lifecycle", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    const fake = createFakePi({
      exec: () =>
        Promise.resolve({
          stdout: JSON.stringify({ workspaces: [] }),
          stderr: "",
          code: 0,
          killed: false,
        }),
    });
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await fake.dispatch("agent_settled");
    await fake.dispatch("agent_settled");
    await fake.dispatch("agent_settled");
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.execCalls.length, 2);
  });
});

Deno.test("extension serializes startup and first-settled lookups", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let callCount = 0;

    let releaseStartup!: () => void;
    let releaseSettled!: () => void;
    const startupGate = new Promise<void>((resolve) => {
      releaseStartup = resolve;
    });
    const settledGate = new Promise<void>((resolve) => {
      releaseSettled = resolve;
    });

    const fake = createFakePi({
      exec: () => {
        callCount += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        const current = callCount;
        return (current === 1 ? startupGate : settledGate).then(() => {
          concurrent -= 1;
          const title = current === 1 ? "startup-task" : "settled-task";
          return {
            stdout: listJsonForTitle(title),
            stderr: "",
            code: 0,
            killed: false,
          };
        });
      },
    });
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await fake.dispatch("agent_settled");
    assertEquals(maxConcurrent, 1);
    assertEquals(fake.execCalls.length, 1);

    releaseStartup();
    releaseSettled();
    await drainCmuxSessionNameSyncsForTest(fake.pi);
    assertEquals(fake.getSessionName(), "settled-task");
    assertEquals(fake.execCalls.length, 2);
    assertEquals(maxConcurrent, 1);
  });
});

Deno.test("extension preserves existing manual Pi session name", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    const fake = createFakePi();
    fake.setSessionName("manual name");
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), "manual name");
    assertEquals(fake.execCalls.length, 0);
  });
});

Deno.test("extension re-checks session name after async lookup", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    let resolveExec: (value: {
      stdout: string;
      stderr: string;
      code: number;
      killed: boolean;
    }) => void = () => {};
    const execPromise = new Promise<{
      stdout: string;
      stderr: string;
      code: number;
      killed: boolean;
    }>((resolve) => {
      resolveExec = resolve;
    });

    const fake = createFakePi({
      exec: () => execPromise,
    });
    cmuxSessionName(fake.pi as never);

    const pending = fake.dispatch("session_start");
    assertEquals(fake.getSessionName(), undefined);

    fake.setSessionName("manual during lookup");
    resolveExec({
      stdout: sampleListJson,
      stderr: "",
      code: 0,
      killed: false,
    });
    await pending;
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), "manual during lookup");
  });
});

Deno.test("no CMUX_WORKSPACE_ID means no lookup or rename", async () => {
  await withCmuxWorkspaceId(undefined, async () => {
    const fake = createFakePi();
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), undefined);
    assertEquals(fake.execCalls.length, 0);
  });
});

Deno.test("cmux execution failure is silent and does not rename", async () => {
  await withCmuxWorkspaceId(CALLER_ID, async () => {
    const fake = createFakePi({
      exec: () =>
        Promise.resolve({
          stdout: "",
          stderr: "boom",
          code: 1,
          killed: false,
        }),
    });
    cmuxSessionName(fake.pi as never);

    await fake.dispatch("session_start");
    await drainCmuxSessionNameSyncsForTest(fake.pi);

    assertEquals(fake.getSessionName(), undefined);
  });
});

Deno.test("fetchCmuxWorkspaceCustomTitle uses bundled cmux path", async () => {
  const execCalls: Array<{ command: string; args: string[] }> = [];
  const name = await fetchCmuxWorkspaceCustomTitle({
    workspaceId: CALLER_ID,
    env: { CMUX_BUNDLED_CLI_PATH: "/Applications/cmux.app/cmux" },
    exec: (command, args) => {
      execCalls.push({ command, args });
      return Promise.resolve({
        stdout: sampleListJson,
        stderr: "",
        code: 0,
        killed: false,
      });
    },
  });

  assertEquals(name, "jj workspace fix");
  assertEquals(execCalls, [{
    command: "/Applications/cmux.app/cmux",
    args: ["workspace", "list", "--json"],
  }]);
});

Deno.test("syncCmuxSessionName skips lookup when session already named manually", async () => {
  let execCalled = false;
  await syncCmuxSessionName({
    getSessionName: () => "existing",
    setSessionName: () => {},
    exec: () => {
      execCalled = true;
      return Promise.resolve({
        stdout: "",
        stderr: "",
        code: 0,
        killed: false,
      });
    },
    env: { CMUX_WORKSPACE_ID: CALLER_ID },
  });

  assertEquals(execCalled, false);
});

Deno.test("syncCmuxSessionName updates when current name equals autoName", async () => {
  let setCalls = 0;
  const result = await syncCmuxSessionName({
    getSessionName: () => "old-task",
    setSessionName: (name) => {
      setCalls += 1;
      assertEquals(name, "new-task");
    },
    exec: () =>
      Promise.resolve({
        stdout: listJsonForTitle("new-task"),
        stderr: "",
        code: 0,
        killed: false,
      }),
    env: { CMUX_WORKSPACE_ID: CALLER_ID },
    autoName: "old-task",
  });

  assertEquals(result, "new-task");
  assertEquals(setCalls, 1);
});

Deno.test("syncCmuxSessionName avoids duplicate setSessionName for unchanged name", async () => {
  let setCalls = 0;
  const result = await syncCmuxSessionName({
    getSessionName: () => "same-task",
    setSessionName: () => {
      setCalls += 1;
    },
    exec: () =>
      Promise.resolve({
        stdout: listJsonForTitle("same-task"),
        stderr: "",
        code: 0,
        killed: false,
      }),
    env: { CMUX_WORKSPACE_ID: CALLER_ID },
    autoName: "same-task",
  });

  assertEquals(result, "same-task");
  assertEquals(setCalls, 0);
});

Deno.test("syncCmuxSessionName preserves manual name after async lookup", async () => {
  let resolveExec: (value: {
    stdout: string;
    stderr: string;
    code: number;
    killed: boolean;
  }) => void = () => {};
  const execPromise = new Promise<{
    stdout: string;
    stderr: string;
    code: number;
    killed: boolean;
  }>((resolve) => {
    resolveExec = resolve;
  });

  let sessionName = "old-task";
  const pending = syncCmuxSessionName({
    getSessionName: () => sessionName,
    setSessionName: (name) => {
      sessionName = name;
    },
    exec: () => execPromise,
    env: { CMUX_WORKSPACE_ID: CALLER_ID },
    autoName: "old-task",
  });

  sessionName = "manual override";
  resolveExec({
    stdout: listJsonForTitle("new-task"),
    stderr: "",
    code: 0,
    killed: false,
  });

  const result = await pending;
  assertEquals(result, "old-task");
  assertEquals(sessionName, "manual override");
});
