import assert from "node:assert/strict";
import * as realCrypto from "node:crypto";
import * as realFs from "node:fs";
import * as realFsPromises from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import * as realPath from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const { basename, dirname, join, resolve } = realPath;
const { existsSync, mkdirSync, readFileSync } = realFs;
const { mkdir, mkdtemp, readFile, rm, writeFile } = realFsPromises;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionPath = resolve(
  repoRoot,
  "pi/agent/extensions/repo-memory-local.ts",
);
const extensionSource = stripTypeScriptTypes(
  readFileSync(extensionPath, "utf8"),
);

const memoryPathFor = (repoDir, homeDir) => {
  const base = basename(repoDir) || "repo";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "repo";
  const hash = realCrypto.createHash("sha256").update(repoDir).digest("hex")
    .slice(0, 12);
  return join(
    homeDir,
    ".local",
    "state",
    "pi-repo-memory",
    `${safe}-${hash}`,
    "memory.md",
  );
};

const savedMemoryText = (curated) =>
  curated.endsWith("\n") ? curated : `${curated}\n`;

const defaultCurated = "## general\n- consolidated note\n";

/** @param {string} homeDir @param {{ complete?: Function; unlink?: Function; writeFile?: Function }} [hooks] */
const loadExtension = async (homeDir, hooks = {}) => {
  const context = vm.createContext({ console, process, Buffer });
  const complete = hooks.complete ??
    (() =>
      Promise.resolve({ content: [{ type: "text", text: defaultCurated }] }));
  const unlink = hooks.unlink ?? realFsPromises.unlink.bind(realFsPromises);
  const writeFileHook = hooks.writeFile ??
    realFsPromises.writeFile.bind(realFsPromises);
  const Type = {
    Object: (p) => ({ type: "object", properties: p }),
    Optional: (s) => ({ ...s, optional: true }),
    String: (o) => ({ type: "string", ...o }),
  };
  const linked = {
    "node:crypto": { createHash: realCrypto.createHash },
    "node:fs": { existsSync },
    "node:fs/promises": {
      appendFile: realFsPromises.appendFile.bind(realFsPromises),
      chmod: realFsPromises.chmod.bind(realFsPromises),
      mkdir: realFsPromises.mkdir.bind(realFsPromises),
      readFile: realFsPromises.readFile.bind(realFsPromises),
      writeFile: writeFileHook,
      unlink,
    },
    "node:os": { homedir: () => homeDir },
    "node:path": { basename, join },
    "@earendil-works/pi-ai/compat": { complete },
    typebox: { Type },
  };

  const mod = new vm.SourceTextModule(extensionSource, {
    context,
    identifier: pathToFileURL(extensionPath).href,
  });
  await mod.link(async (specifier) => {
    const exports = linked[specifier];
    if (!exports) throw new Error(`unexpected import: ${specifier}`);
    const names = Object.keys(exports);
    const stub = new vm.SyntheticModule(names, () => {
      for (const name of names) stub.setExport(name, exports[name]);
    }, { context, identifier: specifier });
    await stub.link(() => {});
    await stub.evaluate();
    return stub;
  });
  await mod.evaluate();
  return mod.namespace.default;
};

const wirePi = (extension, repoDir) => {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const pi = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
  };
  extension(pi);
  return {
    tools,
    commands,
    sessionStart: async () => {
      for (const h of handlers.get("session_start") ?? []) {
        await h({}, { cwd: repoDir });
      }
    },
    indexPrompt: async (base = "base") => {
      for (const h of handlers.get("before_agent_start") ?? []) {
        const r = await h({ systemPrompt: base });
        if (r?.systemPrompt) return r.systemPrompt;
      }
      return base;
    },
  };
};

const baseCtx = (overrides = {}) => ({
  hasUI: false,
  model: { id: "test-model" },
  modelRegistry: {
    getApiKeyAndHeaders: () =>
      Promise.resolve({
        ok: true,
        apiKey: "test-key",
        headers: {},
        env: {},
      }),
  },
  ui: { notify() {}, confirm: () => Promise.resolve(true) },
  ...overrides,
});

const review = (pi, ctx = baseCtx()) =>
  pi.tools.get("review_memory").execute("", {}, undefined, undefined, ctx);

const reviewWithUi = async (pi, uiCtx) => {
  const notifications = [];
  const ctx = uiCtx({
    ui: {
      notify: (message, level = "info") =>
        notifications.push({ message, level }),
    },
  });
  const result = await review(pi, ctx);
  return { result, notifications };
};

/** @param {{ memory?: string; backup?: string; hooks?: object; failMemoryWrite?: boolean }} [opts] */
const setup = async (opts = {}) => {
  const root = await mkdtemp(join(tmpdir(), "pi-repo-mem-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(repo, ".git"), { recursive: true });

  const memoryPath = memoryPathFor(repo, home);
  if (opts.memory !== undefined || opts.backup !== undefined) {
    await mkdir(dirname(memoryPath), { recursive: true });
    if (opts.memory !== undefined) {
      await writeFile(memoryPath, opts.memory, "utf8");
    }
    if (opts.backup !== undefined) {
      await writeFile(`${memoryPath}.bak`, opts.backup, "utf8");
    }
  }

  const hooks = { ...opts.hooks };
  if (opts.failMemoryWrite) {
    hooks.writeFile = (path, data, options) =>
      String(path) === memoryPath
        ? Promise.reject(new Error("mock memory write failed"))
        : realFsPromises.writeFile(path, data, options);
  }

  const pi = wirePi(await loadExtension(home, hooks), repo);
  await pi.sessionStart();

  const notifications = [];
  const uiCtx = (extra = {}) => {
    const { ui: extraUi, ...rest } = extra;
    return baseCtx({
      hasUI: true,
      ui: {
        notify: (message, level = "info") =>
          notifications.push({ message, level }),
        confirm: () => Promise.resolve(true),
        ...extraUi,
      },
      ...rest,
    });
  };

  return { root, memoryPath, pi, notifications, uiCtx };
};

test("review_memory success removes backup, updates memory and index", async (t) => {
  const original =
    "- 2020-01-01T00:00:00.000Z [t] first note\n- 2020-01-01T00:00:00.000Z [t] second note\n";
  const curated = "## general\n- consolidated note\n";
  const { root, memoryPath, pi } = await setup({
    memory: original,
    hooks: {
      complete: () =>
        Promise.resolve({ content: [{ type: "text", text: curated }] }),
    },
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.match(await pi.indexPrompt(), /2 notes saved/);
  const text = (await review(pi)).content[0].text;
  assert.match(text, /2 → 1 notes/);
  assert.match(text, /Temporary \.bak backup removed after successful save\./);
  assert.doesNotMatch(text, /backup was kept|Failed/i);
  assert.equal(await readFile(memoryPath, "utf8"), savedMemoryText(curated));
  assert.equal(existsSync(`${memoryPath}.bak`), false);
  assert.match(await pi.indexPrompt(), /1 notes saved/);
});

test("repo-memory-review command success removes backup after confirm", async (t) => {
  const { root, memoryPath, pi, notifications, uiCtx } = await setup({
    memory: "- first note\n- second note\n",
    hooks: {
      complete: () =>
        Promise.resolve({
          content: [{ type: "text", text: "## general\n- one note\n" }],
        }),
    },
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.match(await pi.indexPrompt(), /2 notes saved/);
  await pi.commands.get("repo-memory-review").handler("", uiCtx());
  assert.equal(await readFile(memoryPath, "utf8"), "## general\n- one note\n");
  assert.equal(existsSync(`${memoryPath}.bak`), false);
  assert.match(await pi.indexPrompt(), /1 notes saved/);
  assert.ok(
    notifications.some(({ message, level }) =>
      level === "info" &&
      /2 → 1 notes/.test(message) &&
      /temporary \.bak removed/i.test(message)
    ),
  );
  assert.ok(
    notifications.some(({ message }) => /Reviewing repo memory/.test(message)),
  );
});

const runConsolidation = async (pi, via, { uiCtx }) => {
  if (via === "tool") {
    return { kind: "tool", result: await review(pi) };
  }
  const notifications = [];
  const ctx = uiCtx({
    ui: {
      notify: (message, level = "info") =>
        notifications.push({ message, level }),
    },
  });
  await pi.commands.get("repo-memory-review").handler("", ctx);
  return { kind: "command", notifications };
};

for (const via of ["tool", "command"]) {
  test(`${via}: save failure keeps backup bytes and leaves memory and index unchanged`, async (t) => {
    const original = "- 2020-01-01T00:00:00.000Z note one\n";
    const { root, memoryPath, pi, uiCtx } = await setup({
      memory: original,
      failMemoryWrite: true,
      hooks: {
        complete: () =>
          Promise.resolve({
            content: [{ type: "text", text: "## general\n- consolidated\n" }],
          }),
      },
    });
    t.after(() => rm(root, { recursive: true, force: true }));

    const indexBefore = await pi.indexPrompt();
    const outcome = await runConsolidation(pi, via, { uiCtx });

    if (via === "tool") {
      assert.match(
        outcome.result.content[0].text,
        /Failed to apply consolidated memory: .*mock memory write failed/,
      );
      assert.doesNotMatch(
        outcome.result.content[0].text,
        /removed after successful save/i,
      );
    } else {
      assert.ok(
        outcome.notifications.some(({ message, level }) =>
          level === "error" &&
          /Failed to review repo memory: .*mock memory write failed/.test(
            message,
          )
        ),
      );
      assert.ok(
        !outcome.notifications.some(({ message }) =>
          /temporary \.bak removed/i.test(message)
        ),
      );
    }

    assert.equal(await readFile(memoryPath, "utf8"), original);
    assert.equal(await readFile(`${memoryPath}.bak`, "utf8"), original);
    assert.equal(await pi.indexPrompt(), indexBefore);
  });
}

test("no-output and cancellation leave memory and preexisting backup unchanged", async (t) => {
  const original = "- 2020-01-01T00:00:00.000Z keep me\n";
  const sentinel = "PREEXISTING_BACKUP_SENTINEL\n";
  const { root, memoryPath, pi } = await setup({
    memory: original,
    backup: sentinel,
    hooks: { complete: () => Promise.resolve({ content: [] }) },
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.match(
    (await review(pi)).content[0].text,
    /Consolidation produced no output; memory left unchanged\./,
  );
  assert.equal(await readFile(memoryPath, "utf8"), original);
  assert.equal(await readFile(`${memoryPath}.bak`, "utf8"), sentinel);

  const cancel = await setup({
    memory: original,
    backup: sentinel,
    hooks: {
      complete: () =>
        Promise.resolve({
          content: [{ type: "text", text: "## general\n- new\n" }],
        }),
    },
  });
  t.after(() => rm(cancel.root, { recursive: true, force: true }));

  await cancel.pi.commands.get("repo-memory-review").handler(
    "",
    cancel.uiCtx({ ui: { confirm: () => Promise.resolve(false) } }),
  );
  assert.equal(await readFile(cancel.memoryPath, "utf8"), original);
  assert.equal(await readFile(`${cancel.memoryPath}.bak`, "utf8"), sentinel);
});

for (
  const [label, ctxPatch, expected] of [
    ["empty memory", {}, /No repo memory to consolidate\./],
    [
      "no model",
      { model: undefined },
      /No model selected; cannot consolidate repo memory\./,
    ],
    [
      "no auth",
      {
        modelRegistry: {
          getApiKeyAndHeaders: () =>
            Promise.resolve({ ok: false, error: "missing key" }),
        },
      },
      /Cannot consolidate repo memory: missing key/,
    ],
  ]
) {
  test(`review_memory skips consolidation when ${label}`, async (t) => {
    const { root, memoryPath, pi } = await setup({
      memory: label === "empty memory" ? undefined : "- 2020-01-01 note\n",
    });
    t.after(() => rm(root, { recursive: true, force: true }));
    assert.match(
      (await review(pi, baseCtx(ctxPatch))).content[0].text,
      expected,
    );
    assert.equal(existsSync(`${memoryPath}.bak`), false);
  });
}

const bakUnlinkHook = (mode, realUnlink) => async (path) => {
  if (!String(path).endsWith(".bak")) return realUnlink(path);
  if (mode === "fail") {
    return Promise.reject(new Error("mock unlink failed"));
  }
  await realUnlink(path);
  const err = new Error("ENOENT: no such file");
  err.code = "ENOENT";
  throw err;
};

test("review_memory with UI warns when backup cleanup fails", async (t) => {
  const original = "- first note\n- second note\n";
  const curated = "## general\n- consolidated\n";
  const realUnlink = realFsPromises.unlink.bind(realFsPromises);
  const { root, memoryPath, pi, uiCtx } = await setup({
    memory: original,
    hooks: {
      complete: () =>
        Promise.resolve({ content: [{ type: "text", text: curated }] }),
      unlink: bakUnlinkHook("fail", realUnlink),
    },
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const { result, notifications } = await reviewWithUi(pi, uiCtx);
  assert.equal(await readFile(memoryPath, "utf8"), savedMemoryText(curated));
  assert.equal(await readFile(`${memoryPath}.bak`, "utf8"), original);
  assert.match(result.content[0].text, /2 → 1 notes/);
  assert.match(
    result.content[0].text,
    /Temporary \.bak backup could not be removed: .*mock unlink failed/,
  );
  assert.ok(
    notifications.some(({ message, level }) =>
      level === "warning" &&
      /2 → 1 notes/.test(message) &&
      /Temporary \.bak backup could not be removed: .*mock unlink failed/
        .test(message)
    ),
  );
  assert.ok(
    !notifications.some(({ message, level }) =>
      level === "error" || /temporary \.bak removed/i.test(message)
    ),
  );
});

for (
  const [via, cleanupMode] of [
    ["tool", "fail"],
    ["command", "fail"],
    ["tool", "enoent"],
    ["command", "enoent"],
  ]
) {
  test(`${via}: backup cleanup ${cleanupMode} saves memory and updates index`, async (t) => {
    const original = "- first note\n- second note\n";
    const curated = "## general\n- consolidated\n";
    const realUnlink = realFsPromises.unlink.bind(realFsPromises);
    const { root, memoryPath, pi, uiCtx } = await setup({
      memory: original,
      hooks: {
        complete: () =>
          Promise.resolve({ content: [{ type: "text", text: curated }] }),
        unlink: bakUnlinkHook(cleanupMode, realUnlink),
      },
    });
    t.after(() => rm(root, { recursive: true, force: true }));

    const outcome = await runConsolidation(pi, via, { uiCtx });
    assert.equal(await readFile(memoryPath, "utf8"), savedMemoryText(curated));
    assert.match(await pi.indexPrompt(), /1 notes saved/);

    if (cleanupMode === "fail") {
      assert.equal(await readFile(`${memoryPath}.bak`, "utf8"), original);
      assert.equal(existsSync(`${memoryPath}.bak`), true);
      if (via === "tool") {
        const text = outcome.result.content[0].text;
        assert.match(text, /2 → 1 notes/);
        assert.match(
          text,
          /Temporary \.bak backup could not be removed: .*mock unlink failed/,
        );
        assert.doesNotMatch(text, /^Failed to apply/i);
        assert.doesNotMatch(text, /removed after successful save/i);
      } else {
        assert.ok(
          outcome.notifications.some(({ message, level }) =>
            level === "warning" &&
            /2 → 1 notes/.test(message) &&
            /Temporary \.bak backup could not be removed: .*mock unlink failed/
              .test(message)
          ),
        );
        assert.ok(
          !outcome.notifications.some(({ message, level }) =>
            level === "error" || /temporary \.bak removed/i.test(message)
          ),
        );
      }
    } else {
      assert.equal(existsSync(`${memoryPath}.bak`), false);
      if (via === "tool") {
        const text = outcome.result.content[0].text;
        assert.match(
          text,
          /Temporary \.bak backup removed after successful save\./,
        );
        assert.doesNotMatch(text, /could not be removed/i);
      } else {
        assert.ok(
          outcome.notifications.some(({ message, level }) =>
            level === "info" &&
            /2 → 1 notes/.test(message) &&
            /temporary \.bak removed/i.test(message)
          ),
        );
      }
    }
  });
}
