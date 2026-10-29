import assert from "node:assert/strict";
import { test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import {
  resolveCodeProvenance,
  runImplEventsHelper,
  type RunMetadata,
} from "../scripts/run_impl_events.ts";

async function scaffoldRun(root: string, piScript: string) {
  const fakePi = join(root, "pi.sh");
  await writeFile(fakePi, piScript);
  await chmod(fakePi, 0o755);
  const prompt = join(root, "prompt.md");
  const system = join(root, "system.md");
  await writeFile(prompt, "task\n");
  await writeFile(system, "system\n");
  const runs = join(root, "runs");
  await mkdir(runs);
  return { fakePi, prompt, system, runs };
}

test("runImplEventsHelper completes with synthetic json pi", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) {
    throw new Error("IMPL_TEST_ROOT is required for impl events tests");
  }
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.001}}}}' '{"type":"agent_settled","aborted":false}'
exit 0
`,
  );
  const code = await runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi, "-p", "--mode", "json"],
  });
  assert.equal(code, 0);
});

test("stdout Writable error returns controlled failure", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"ok"}]}}' '{"type":"agent_settled","aborted":false}'
`,
  );
  const originalStdout = process.stdout;
  process.stdout = new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error("closed pipe"));
    },
  }) as typeof process.stdout;
  try {
    assert.equal(await runImplEventsHelper({
      runsRoot: runs,
      role: "impl.default",
      resolvedModel: "provider/model:high",
      promptPath: prompt,
      systemPromptPath: system,
      repositoryPath: root,
      command: [fakePi],
    }), 1);
  } finally {
    process.stdout = originalStdout;
  }
});

test("initial metadata omits elapsedMs and exitCode while running shape", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
sleep 2
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0}}}' '{"type":"agent_settled","aborted":false}'
exit 0
`,
  );
  const helperPromise = runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi, "-p", "--mode", "json"],
  });
  await new Promise((r) => setTimeout(r, 300));
  const entries = [];
  for (const e of await readdir(runs, { withFileTypes: true })) {
    if (e.isDirectory()) entries.push(e.name);
  }
  assert.equal(entries.length, 1);
  const runDir = join(runs, entries[0]!);
  const meta = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  ) as RunMetadata;
  assert.equal(meta.executionStatus, "running");
  assert.equal("elapsedMs" in meta, false);
  assert.equal("exitCode" in meta, false);
  assert.equal("finishedAt" in meta, false);
  await readFile(join(runDir, "events.jsonl"), "utf8");
  await helperPromise;
});

test("child exit 17 marks metadata failed and preserves exit code", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0}}}' '{"type":"agent_settled","aborted":false}'
exit 17
`,
  );
  const code = await runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi, "-p", "--mode", "json"],
  });
  assert.equal(code, 17);
  const runDir = join(
    runs,
    (await readdir(runs))[0]!,
  );
  const meta = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 17);
  assert.equal(meta.executionStatus, "failed");
});

test("SIGTERM child returns and records POSIX status 143", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
kill -TERM $$
`,
  );
  const code = await runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi],
  });
  assert.equal(code, 143);
  const meta = JSON.parse(
    await readFile(join(runs, (await readdir(runs))[0]!, "metadata.json"), "utf8"),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 143);
  assert.equal(meta.executionStatus, "failed");
});

test("invalid stream after valid terminal events fails with child exit 0", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const bigChar = "\u{1F4A9}";
  const repeat = Math.ceil((1_048_577) / bigChar.length) + 1;
  const bigLine = `{"type":"message_update","x":"${bigChar.repeat(repeat)}"}`;
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"survived"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0}}}' '{"type":"agent_settled","aborted":false}' 'not-json' '${
      bigLine.replace(/'/g, "'\\''")
    }'
exit 0
`,
  );
  const code = await runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi, "-p", "--mode", "json"],
  });
  assert.equal(code, 1);
  const runDir = join(
    runs,
    (await readdir(runs))[0]!,
  );
  const meta = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 0);
  assert.equal(meta.executionStatus, "failed");
  const eventsBlob = await readFile(join(runDir, "events.jsonl"), "utf8");
  assert.equal(eventsBlob.includes("not-json"), false);
  assert.equal(eventsBlob.includes("survived"), false);
});

export const IMPL_EVENTS_PRIVACY_CANARY = "CANARY-IMPL-PRIV-7c4e2f91";
const PRIVACY_CANARY = IMPL_EVENTS_PRIVACY_CANARY;

test("artifacts exclude canaries; final assistant text only on stdout", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const canary = PRIVACY_CANARY;
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
set -uo pipefail
printf '%s\\n' '{"type":"message_start","message":{"role":"user","content":"${canary}"}}' \
  '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"PUBLIC_OUT"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0},"thinking":"${canary}","errorMessage":"${canary}"}}' \
  '{"type":"tool_execution_end","toolName":"write","isError":false,"args":{"secret":"${canary}"},"result":"${canary}"}' \
  '{"type":"message_error","error":"${canary}","stopReason":"error","toolName":"${canary}"}' \
  '{"type":"custom_telemetry","note":"${canary}"}' \
  '{"type":"agent_settled","aborted":false}' >&1
printf '%s\\n' "stderr-${canary}" >&2
exit 0
`,
  );
  await writeFile(prompt, `prompt-${canary}\n`);
  await writeFile(system, `system-${canary}\n`);
  const stdoutChunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((data: Uint8Array, callback?: (error?: Error | null) => void) => {
    stdoutChunks.push(new TextDecoder().decode(data));
    callback?.();
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await runImplEventsHelper({
      runsRoot: runs,
      role: "impl.default",
      resolvedModel: "provider/model:high",
      promptPath: prompt,
      systemPromptPath: system,
      repositoryPath: root,
      command: [fakePi, "-p", "--mode", "json"],
    });
    assert.equal(code, 0);
  } finally {
    process.stdout.write = origWrite;
  }
  const stdoutText = stdoutChunks.join("");
  assert.equal(stdoutText, "PUBLIC_OUT\n");
  assert.equal(stdoutText.includes(canary), false);

  const runDir = join(
    runs,
    (await readdir(runs))[0]!,
  );
  const metaRaw = await readFile(join(runDir, "metadata.json"), "utf8");
  const eventsRaw = await readFile(join(runDir, "events.jsonl"), "utf8");
  for (const blob of [metaRaw, eventsRaw]) {
    assert.equal(blob.includes(canary), false);
    assert.equal(blob.includes("PUBLIC_OUT"), false);
    assert.equal(blob.includes("prompt-"), false);
    assert.equal(blob.includes("system-"), false);
    assert.equal(blob.includes("stderr-"), false);
  }
  const meta = JSON.parse(metaRaw) as RunMetadata;
  assert.equal(meta.role, "impl.default");
  assert.equal(meta.resolvedModel, "provider/model:high");
  assert.equal(meta.codeProvenance.repositoryPath, root);
  assert.equal(meta.executionStatus, "completed");
  assert.equal(typeof meta.promptSha256, "string");
});

test("trailing invalid utf-8 after settled fails with child exit 0", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const { fakePi, prompt, system, runs } = await scaffoldRun(
    root,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"ok"}],"usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0}}}' '{"type":"agent_settled","aborted":false}'
printf '\\xff\\xfe'
exit 0
`,
  );
  const code = await runImplEventsHelper({
    runsRoot: runs,
    role: "impl.default",
    resolvedModel: "provider/model:high",
    promptPath: prompt,
    systemPromptPath: system,
    repositoryPath: root,
    command: [fakePi, "-p", "--mode", "json"],
  });
  assert.equal(code, 1);
  const runDir = join(
    runs,
    (await readdir(runs))[0]!,
  );
  const meta = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 0);
  assert.equal(meta.executionStatus, "failed");
});

test("resolveCodeProvenance returns unknown when jj and git unavailable", async () => {
  const base = process.env.IMPL_TEST_ROOT;
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await mkdtemp(join(base, "test-"));
  const path = join(root, "nowhere");
  await mkdir(path);
  const prevPath = process.env.PATH ?? "";
  process.env.PATH = "/usr/bin:/bin";
  try {
    const prov = await resolveCodeProvenance(path);
    assert.equal(prov.revisionKind, "unknown");
    assert.equal(prov.startRevision, undefined);
  } finally {
    process.env.PATH = prevPath;
  }
});
