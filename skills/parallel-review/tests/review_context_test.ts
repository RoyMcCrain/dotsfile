import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hashReviewContext,
  MAX_CONTEXT_NORMALIZED_BYTES,
  MAX_CONTEXT_RAW_BYTES,
  MAX_EVIDENCE_CHARS,
  MAX_EVIDENCE_ENTRIES,
  MAX_FACT_SUMMARY_CHARS,
  readReviewContextFile,
  REVIEW_CONTEXT_SCHEMA_VERSION,
  validateReviewContext,
} from "../scripts/review_context.ts";

const baseUnknown = () => ({
  schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
  intent: "unknown" as const,
  runtime: "unknown" as const,
  impact: "unknown" as const,
  dataAndPermissions: "unknown" as const,
  rollback: "unknown" as const,
  tests: "unknown" as const,
});

const REVIEW_CONTEXT_SCRIPT = join(
  import.meta.dirname!,
  "../scripts/review_context.ts",
);

const errorTextIncludes = (err: unknown, needle: RegExp | string): boolean => {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur != null; depth++) {
    if (cur instanceof Error) {
      parts.push(cur.message, cur.stack ?? "");
      cur = cur.cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  const hay = parts.join("\n");
  return typeof needle === "string" ? hay.includes(needle) : needle.test(hay);
};

const assertErrorChainExcludes = (err: unknown, needle: RegExp | string) => {
  assert.equal(errorTextIncludes(err, needle), false);
};

const padUtf8ToExactBytes = (base: string, target: number): string => {
  const enc = new TextEncoder();
  const padding = target - enc.encode(base).byteLength;
  assert.ok(padding >= 0);
  const s = base + " ".repeat(padding);
  assert.equal(enc.encode(s).byteLength, target);
  return s;
};

Deno.test("validateReviewContext accepts all-unknown template", () => {
  const ctx = validateReviewContext(baseUnknown());
  assert.deepEqual(ctx, baseUnknown());
});

Deno.test("validateReviewContext accepts known fact with evidence", () => {
  const ctx = validateReviewContext({
    ...baseUnknown(),
    intent: {
      summary: "Add routing context for Jev only",
      evidence: ["current user request: enrich review routing state"],
    },
    tests: {
      summary: "deno test for review_context",
      evidence: ["skills/parallel-review/tests/review_context_test.ts:1"],
    },
  });
  assert.equal(ctx.intent !== "unknown" && ctx.intent.summary.length > 0, true);
});

Deno.test("validateReviewContext rejects null array and non-object", () => {
  assert.throws(() => validateReviewContext(null), /must be an object/);
  assert.throws(() => validateReviewContext([]), /must be an object/);
  assert.throws(() => validateReviewContext("x"), /must be an object/);
});

Deno.test("validateReviewContext rejects unknown top-level field without leaking name", () => {
  const CANARY = "pr-secret-field-name-canary-x9k2";
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        [CANARY]: "evil",
      }),
    /unsupported field/,
  );
  try {
    validateReviewContext({ ...baseUnknown(), [CANARY]: "evil" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.doesNotMatch(msg, new RegExp(CANARY));
  }
});

Deno.test("validateReviewContext rejects unknown nested fact keys without leaking", () => {
  const CANARY = "pr-nested-canary-n7";
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: {
          summary: "ok",
          evidence: ["e"],
          [CANARY]: "x",
        },
      }),
    /intent is invalid/,
  );
  try {
    validateReviewContext({
      ...baseUnknown(),
      intent: { summary: "ok", evidence: ["e"], [CANARY]: "x" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.doesNotMatch(msg, new RegExp(CANARY));
  }
});

Deno.test("validateReviewContext rejects bad schemaVersion and missing fields", () => {
  assert.throws(
    () => validateReviewContext({ ...baseUnknown(), schemaVersion: 2 }),
    /unsupported review context schemaVersion/,
  );
  assert.throws(
    () => validateReviewContext({ schemaVersion: 1, intent: "unknown" }),
    /missing required field/,
  );
});

Deno.test("validateReviewContext enforces summary and evidence limits", () => {
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: { summary: "   ", evidence: ["x"] },
      }),
    /intent summary is invalid/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: {
          summary: "x".repeat(MAX_FACT_SUMMARY_CHARS + 1),
          evidence: ["ok"],
        },
      }),
    /intent summary exceeds limit/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: { summary: "ok", evidence: [] },
      }),
    /intent evidence is invalid/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: {
          summary: "ok",
          evidence: Array.from(
            { length: MAX_EVIDENCE_ENTRIES + 1 },
            () => "e",
          ),
        },
      }),
    /intent evidence is invalid/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: {
          summary: "ok",
          evidence: ["e".repeat(MAX_EVIDENCE_CHARS + 1)],
        },
      }),
    /intent evidence exceeds limit/,
  );
  const atLimits = validateReviewContext({
    ...baseUnknown(),
    intent: {
      summary: "s".repeat(MAX_FACT_SUMMARY_CHARS),
      evidence: Array.from(
        { length: MAX_EVIDENCE_ENTRIES },
        () => "e".repeat(MAX_EVIDENCE_CHARS),
      ),
    },
  });
  assert.equal(
    atLimits.intent !== "unknown" && atLimits.intent.summary.length,
    MAX_FACT_SUMMARY_CHARS,
  );
});

Deno.test("hashReviewContext stable under object key reordering", () => {
  const a = validateReviewContext({
    schemaVersion: 1,
    tests: "unknown",
    intent: {
      summary: "same",
      evidence: ["a"],
    },
    runtime: "unknown",
    impact: "unknown",
    dataAndPermissions: "unknown",
    rollback: "unknown",
  });
  const b = validateReviewContext({
    rollback: "unknown",
    schemaVersion: 1,
    dataAndPermissions: "unknown",
    impact: "unknown",
    runtime: "unknown",
    tests: "unknown",
    intent: {
      evidence: ["a"],
      summary: "same",
    },
  });
  assert.equal(hashReviewContext(a), hashReviewContext(b));
  const c = validateReviewContext({
    ...baseUnknown(),
    intent: {
      summary: "different",
      evidence: ["a"],
    },
  });
  assert.notEqual(hashReviewContext(a), hashReviewContext(c));
});

Deno.test("readReviewContextFile rejects invalid UTF-8 without leaking marker bytes", async () => {
  const MARKER = "prUtf8MarkerX7";
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-utf8-"));
  const path = join(dir, "bad-utf8.json");
  const valid = validateReviewContext({
    ...baseUnknown(),
    intent: {
      summary: `routing ${MARKER} hint`,
      evidence: ["skills/parallel-review/tests/review_context_test.ts:1"],
    },
  });
  const json = JSON.stringify(valid);
  const markerIndex = json.indexOf(MARKER);
  assert.ok(markerIndex > 0);
  const bytes = new TextEncoder().encode(json);
  bytes[markerIndex - 1] = 0xff;
  await writeFile(path, bytes);
  try {
    const nonFatal = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    assert.ok(nonFatal.includes(MARKER));
    assert.doesNotThrow(() => validateReviewContext(JSON.parse(nonFatal)));
    await assert.rejects(
      () => readReviewContextFile(path),
      (e) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /valid UTF-8/);
        assertErrorChainExcludes(e, MARKER);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("readReviewContextFile rejects invalid JSON without leaking body prefix", async () => {
  const TOKEN = "Zq9x".repeat(16);
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-json-"));
  const path = join(dir, "bad.json");
  const body = TOKEN;
  await writeFile(path, body);
  try {
    assert.throws(() => JSON.parse(body), /Zq9x/);
    await assert.rejects(
      () => readReviewContextFile(path),
      (e) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /valid JSON/);
        assertErrorChainExcludes(e, TOKEN);
        assertErrorChainExcludes(e, /Zq9x/);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("readReviewContextFile rejects empty file and accepts UTF-8 BOM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-edge-"));
  const emptyPath = join(dir, "empty.json");
  const bomPath = join(dir, "bom.json");
  const bomBody = "\uFEFF" + JSON.stringify(baseUnknown());
  await writeFile(emptyPath, "");
  await writeFile(bomPath, bomBody);
  try {
    await assert.rejects(
      () => readReviewContextFile(emptyPath),
      /valid JSON/,
    );
    const ctx = await readReviewContextFile(bomPath);
    assert.deepEqual(ctx, baseUnknown());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("readReviewContextFile rejects directory and modest oversize regular file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-reject-"));
  const oversizePath = join(dir, "oversize.json");
  const modestOver = "x".repeat(MAX_CONTEXT_RAW_BYTES + 512);
  await writeFile(oversizePath, modestOver);
  try {
    await assert.rejects(
      () => readReviewContextFile(dir),
      /regular file/,
    );
    await assert.rejects(
      () => readReviewContextFile(oversizePath),
      /exceeds size limit/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test({
  name: "readReviewContextFile rejects FIFO without blocking (POSIX)",
  ignore: Deno.build.os === "windows",
  fn: async () => {
    const dir = await mkdtemp(join(tmpdir(), "pr-ctx-fifo-"));
    const fifoPath = join(dir, "ctx.fifo");
    const mkfifo = new Deno.Command("mkfifo", { args: [fifoPath] });
    const mkStatus = await mkfifo.output();
    assert.equal(mkStatus.success, true);
    const childPath = join(dir, "fifo_child.ts");
    const childSource = `
import { readReviewContextFile } from ${JSON.stringify(REVIEW_CONTEXT_SCRIPT)};
try {
  await readReviewContextFile(${JSON.stringify(fifoPath)});
  Deno.exit(2);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/regular file/.test(msg)) Deno.exit(0);
  console.error(msg);
  Deno.exit(3);
}
`;
    await writeFile(childPath, childSource);
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-prompt",
        "--allow-read=" + fifoPath,
        "--allow-read=" + REVIEW_CONTEXT_SCRIPT,
        "--allow-read=" + childPath,
        childPath,
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const proc = child.spawn();
    const timeoutMs = 5000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
    }, timeoutMs);
    try {
      const status = await proc.status;
      clearTimeout(timer);
      assert.equal(timedOut, false, "FIFO read must finish within 5s");
      assert.equal(status.success, true);
      assert.equal(status.code, 0);
    } finally {
      clearTimeout(timer);
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      await proc.status.catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
    }
  },
});

Deno.test("readReviewContextFile raw 16KiB UTF-8 boundary with multibyte and trailing space", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-size-"));
  const pathOk = join(dir, "exact.json");
  const pathOver = join(dir, "over.json");
  const inner = "🙂".repeat(200);
  const jsonCore = JSON.stringify({
    ...baseUnknown(),
    intent: {
      summary: `multibyte ${inner.slice(0, 40)}`,
      evidence: ["skills/parallel-review/scripts/review_context.ts:1"],
    },
  });
  const exact = padUtf8ToExactBytes(jsonCore, MAX_CONTEXT_RAW_BYTES);
  const over = padUtf8ToExactBytes(jsonCore, MAX_CONTEXT_RAW_BYTES + 1);
  await writeFile(pathOk, exact);
  await writeFile(pathOver, over);
  try {
    assert.equal(
      new TextEncoder().encode(exact).byteLength,
      MAX_CONTEXT_RAW_BYTES,
    );
    assert.equal(
      new TextEncoder().encode(over).byteLength,
      MAX_CONTEXT_RAW_BYTES + 1,
    );
    const ctx = await readReviewContextFile(pathOk);
    assert.equal(
      ctx.intent !== "unknown" && ctx.intent.summary.includes("🙂"),
      true,
    );
    await assert.rejects(
      () => readReviewContextFile(pathOver),
      /exceeds size limit/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("validateReviewContext rejects invalid fact shapes", () => {
  assert.throws(
    () => validateReviewContext({ ...baseUnknown(), intent: 42 }),
    /intent is invalid/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: { summary: "ok", evidence: "not-an-array" },
      }),
    /intent evidence is invalid/,
  );
  assert.throws(
    () =>
      validateReviewContext({
        ...baseUnknown(),
        intent: { summary: "ok", evidence: ["   "] },
      }),
    /intent evidence is invalid/,
  );
});

Deno.test("validateReviewContext normalized 16KiB UTF-8 boundary", () => {
  const enc = new TextEncoder();
  const jaOne = "\u3042";
  const jaOneBytes = enc.encode(jaOne).byteLength;
  const tinyFact = { summary: jaOne, evidence: ["e"] };
  const tiny = validateReviewContext({
    ...baseUnknown(),
    intent: tinyFact,
    runtime: tinyFact,
    impact: tinyFact,
    dataAndPermissions: tinyFact,
    rollback: tinyFact,
    tests: tinyFact,
  });
  const framing = enc.encode(JSON.stringify(tiny)).byteLength - 6 * jaOneBytes;
  const baseLen = Math.floor(
    (MAX_CONTEXT_NORMALIZED_BYTES - framing) / (6 * jaOneBytes),
  );
  assert.ok(baseLen >= 1 && baseLen <= MAX_FACT_SUMMARY_CHARS);

  const mkFact = (summary: string) => ({ summary, evidence: ["e"] as const });
  const repeatJa = (n: number) => jaOne.repeat(n);
  const summaries = Array.from({ length: 6 }, () => repeatJa(baseLen));

  const buildFromSummaries = (sums: string[]) =>
    validateReviewContext({
      schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
      intent: mkFact(sums[0]!),
      runtime: mkFact(sums[1]!),
      impact: mkFact(sums[2]!),
      dataAndPermissions: mkFact(sums[3]!),
      rollback: mkFact(sums[4]!),
      tests: mkFact(sums[5]!),
    });

  const beforePad = buildFromSummaries(summaries);
  const remaining = MAX_CONTEXT_NORMALIZED_BYTES -
    enc.encode(JSON.stringify(beforePad)).byteLength;
  assert.ok(remaining >= 0 && remaining <= 17);

  summaries[0] = repeatJa(baseLen) + "x".repeat(remaining);
  assert.ok(summaries[0]!.length <= MAX_FACT_SUMMARY_CHARS);

  const exact = buildFromSummaries(summaries);
  assert.equal(
    enc.encode(JSON.stringify(exact)).byteLength,
    MAX_CONTEXT_NORMALIZED_BYTES,
  );

  summaries[0] = summaries[0]! + "y";
  assert.throws(() => buildFromSummaries(summaries), /exceeds size limit/);
});
