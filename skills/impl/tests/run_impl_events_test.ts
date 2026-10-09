import assert from "node:assert/strict";
import { join } from "node:path";
import {
  resolveCodeProvenance,
  runImplEventsHelper,
  type RunMetadata,
} from "../scripts/run_impl_events.ts";

async function scaffoldRun(root: string, piScript: string) {
  const fakePi = join(root, "pi.sh");
  await Deno.writeTextFile(fakePi, piScript);
  await Deno.chmod(fakePi, 0o755);
  const prompt = join(root, "prompt.md");
  const system = join(root, "system.md");
  await Deno.writeTextFile(prompt, "task\n");
  await Deno.writeTextFile(system, "system\n");
  const runs = join(root, "runs");
  await Deno.mkdir(runs);
  return { fakePi, prompt, system, runs };
}

Deno.test("runImplEventsHelper completes with synthetic json pi", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) {
    throw new Error("IMPL_TEST_ROOT is required for impl events tests");
  }
  const root = await Deno.makeTempDir({ dir: base });
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

Deno.test("initial metadata omits elapsedMs and exitCode while running shape", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
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
  for await (const e of Deno.readDir(runs)) {
    if (e.isDirectory) entries.push(e.name);
  }
  assert.equal(entries.length, 1);
  const runDir = join(runs, entries[0]!);
  const meta = JSON.parse(
    await Deno.readTextFile(join(runDir, "metadata.json")),
  ) as RunMetadata;
  assert.equal(meta.executionStatus, "running");
  assert.equal("elapsedMs" in meta, false);
  assert.equal("exitCode" in meta, false);
  assert.equal("finishedAt" in meta, false);
  await Deno.readTextFile(join(runDir, "events.jsonl"));
  await helperPromise;
});

Deno.test("child exit 17 marks metadata failed and preserves exit code", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
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
    (await Array.fromAsync(Deno.readDir(runs)))[0]!.name,
  );
  const meta = JSON.parse(
    await Deno.readTextFile(join(runDir, "metadata.json")),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 17);
  assert.equal(meta.executionStatus, "failed");
});

Deno.test("invalid stream after valid terminal events fails with child exit 0", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
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
    (await Array.fromAsync(Deno.readDir(runs)))[0]!.name,
  );
  const meta = JSON.parse(
    await Deno.readTextFile(join(runDir, "metadata.json")),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 0);
  assert.equal(meta.executionStatus, "failed");
  const eventsBlob = await Deno.readTextFile(join(runDir, "events.jsonl"));
  assert.equal(eventsBlob.includes("not-json"), false);
  assert.equal(eventsBlob.includes("survived"), false);
});

export const IMPL_EVENTS_PRIVACY_CANARY = "CANARY-IMPL-PRIV-7c4e2f91";
const PRIVACY_CANARY = IMPL_EVENTS_PRIVACY_CANARY;

Deno.test("artifacts exclude canaries; final assistant text only on stdout", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
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
  await Deno.writeTextFile(prompt, `prompt-${canary}\n`);
  await Deno.writeTextFile(system, `system-${canary}\n`);
  const stdoutChunks: string[] = [];
  const origWrite = Deno.stdout.write.bind(Deno.stdout);
  Deno.stdout.write = (data: Uint8Array) => {
    stdoutChunks.push(new TextDecoder().decode(data));
    return Promise.resolve(data.length);
  };
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
    Deno.stdout.write = origWrite;
  }
  const stdoutText = stdoutChunks.join("");
  assert.equal(stdoutText, "PUBLIC_OUT\n");
  assert.equal(stdoutText.includes(canary), false);

  const runDir = join(
    runs,
    (await Array.fromAsync(Deno.readDir(runs)))[0]!.name,
  );
  const metaRaw = await Deno.readTextFile(join(runDir, "metadata.json"));
  const eventsRaw = await Deno.readTextFile(join(runDir, "events.jsonl"));
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

Deno.test("trailing invalid utf-8 after settled fails with child exit 0", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
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
    (await Array.fromAsync(Deno.readDir(runs)))[0]!.name,
  );
  const meta = JSON.parse(
    await Deno.readTextFile(join(runDir, "metadata.json")),
  ) as RunMetadata;
  assert.equal(meta.exitCode, 0);
  assert.equal(meta.executionStatus, "failed");
});

Deno.test("resolveCodeProvenance returns unknown when jj and git unavailable", async () => {
  const base = Deno.env.get("IMPL_TEST_ROOT");
  if (!base) throw new Error("IMPL_TEST_ROOT is required");
  const root = await Deno.makeTempDir({ dir: base });
  const path = join(root, "nowhere");
  await Deno.mkdir(path);
  const prevPath = Deno.env.get("PATH") ?? "";
  Deno.env.set("PATH", "/usr/bin:/bin");
  try {
    const prov = await resolveCodeProvenance(path);
    assert.equal(prov.revisionKind, "unknown");
    assert.equal(prov.startRevision, undefined);
  } finally {
    Deno.env.set("PATH", prevPath);
  }
});
