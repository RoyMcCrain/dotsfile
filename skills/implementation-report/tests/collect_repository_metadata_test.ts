import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "bun:test";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyChanges,
  parseGitNameStatus,
  parseJjTemplateStatus,
} from "../scripts/filter_secret_paths.ts";
import {
  collectRepositoryMetadata,
  runCommand,
  uniqueNonSecretPaths,
} from "../scripts/collect_repository_metadata.ts";

const decoder = new TextDecoder();

const run = async (bin: string, args: string[], cwd: string) => {
  const result = await new Promise<{ code: number; stdout: Buffer; stderr: Buffer }>(
    (resolve, reject) => {
      const child = spawn(bin, args, { cwd });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        resolve({ code: code ?? 1, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
      });
    },
  );
  assert.equal(
    result.code,
    0,
    `${bin} ${args.join(" ")}: ${decoder.decode(result.stderr)}`,
  );
  return decoder.decode(result.stdout);
};

const initGitRepo = async (repo: string) => {
  await mkdir(repo, { recursive: true });
  await run("git", ["init", "-q"], repo);
  await run("git", ["config", "user.email", "test@example.com"], repo);
  await run("git", ["config", "user.name", "test"], repo);
  await run("git", ["config", "commit.gpgsign", "false"], repo);
};

const writeAndCommit = async (
  repo: string,
  path: string,
  content: string,
  message: string,
) => {
  const full = join(repo, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content);
  await run("git", ["add", "--", path], repo);
  await run("git", ["commit", "-q", "-m", message], repo);
};

test("runCommand captures output larger than one mebibyte", async () => {
  const root = await mkdtemp(join(tmpdir(), "impl-meta-output-"));
  const script = join(root, "large-output.js");
  try {
    await writeFile(script, 'process.stdout.write("x".repeat(2 * 1024 * 1024));');
    const output = await runCommand(
      process.execPath,
      ["--config=/dev/null", "--no-env-file", "--no-install", "run", script],
      root,
    );
    assert.equal(output.length, 2 * 1024 * 1024);
    assert.equal(output, "x".repeat(2 * 1024 * 1024));
  } finally {
    await rm(root, { recursive: true });
  }
});

test("parseGitNameStatus maps statuses and rename previousPath", () => {
  const changes = parseGitNameStatus([
    "M\tsrc/a.ts",
    "A\tsrc/b.ts",
    "D\tsrc/c.ts",
    "R100\told.ts\tnew.ts",
    "C080\tsrc/a.ts\tsrc/a-copy.ts",
  ].join("\n"));
  assert.deepEqual(changes, [
    { path: "src/a.ts", status: "modified" },
    { path: "src/b.ts", status: "added" },
    { path: "src/c.ts", status: "deleted" },
    { path: "new.ts", status: "renamed", previousPath: "old.ts" },
    { path: "src/a-copy.ts", status: "added", previousPath: "src/a.ts" },
  ]);
});

test("parseGitNameStatus maps NUL-delimited output", () => {
  const changes = parseGitNameStatus(
    [
      "M",
      "src/日本語 file.ts",
      "R100",
      "src/old.ts",
      "src/new.ts",
      "",
    ].join("\0"),
  );
  assert.deepEqual(changes, [
    { path: "src/日本語 file.ts", status: "modified" },
    { path: "src/new.ts", status: "renamed", previousPath: "src/old.ts" },
  ]);
});

test("parseJjTemplateStatus maps statuses and rename previousPath", () => {
  const changes = parseJjTemplateStatus([
    "modified\tsrc/a.ts\tsrc/a.ts",
    "added\t\tsrc/b.ts",
    "removed\tsrc/c.ts\tsrc/c.ts",
    "renamed\told.ts\tnew.ts",
    "copied\tsrc/a.ts\tsrc/a-copy.ts",
  ].join("\n"));
  assert.deepEqual(changes, [
    { path: "src/a.ts", status: "modified" },
    { path: "src/b.ts", status: "added" },
    { path: "src/c.ts", status: "deleted" },
    { path: "new.ts", status: "renamed", previousPath: "old.ts" },
    { path: "src/a-copy.ts", status: "added", previousPath: "src/a.ts" },
  ]);
});

test("parseJjTemplateStatus rejects unknown statuses", () => {
  assert.throws(
    () => parseJjTemplateStatus("weird\tsrc/a.ts\tsrc/a.ts\n"),
    /unknown jj status/,
  );
});

test("classifyChanges drops secret current or previous paths", () => {
  const { allowed, excluded } = classifyChanges([
    { path: "src/app.ts", status: "modified" },
    { path: ".env", status: "modified" },
    {
      path: "published-key.txt",
      status: "renamed",
      previousPath: "id_ed25519",
    },
    { path: ".env.local", status: "renamed", previousPath: "readme.txt" },
  ]);
  assert.deepEqual(allowed, [{ path: "src/app.ts", status: "modified" }]);
  assert.equal(excluded.length, 3);
});

test("uniqueNonSecretPaths drops secrets and empties", () => {
  assert.deepEqual(
    uniqueNonSecretPaths(["src/a.ts", ".env", "src/a.ts", "id_ed25519", ""]),
    ["src/a.ts"],
  );
});

test("collectRepositoryMetadata from a git repo excludes secrets and keeps rename", async () => {
  const repo = await mkdtemp(join(tmpdir(), "impl-meta-git-"))
  try {
    await initGitRepo(repo);
    await writeAndCommit(repo, "src/a.ts", "one\n", "add a");
    await writeAndCommit(repo, "src/old.ts", "old\n", "add old");
    await writeAndCommit(repo, ".env", "SECRET=1\n", "add env");
    await writeFile(join(repo, "src/a.ts"), "two\n");
    await run("git", ["mv", "src/old.ts", "src/new.ts"], repo);

    const metadata = await collectRepositoryMetadata(repo);
    assert.equal(metadata.name, repo.split("/").pop());
    assert.ok(metadata.trackedFiles.includes("src/a.ts"));
    assert.ok(metadata.trackedFiles.includes("src/new.ts"));
    assert.ok(!metadata.trackedFiles.includes(".env"));
    assert.ok(!metadata.trackedFiles.includes("src/old.ts"));

    const byPath = Object.fromEntries(
      metadata.changes.map((change) => [change.path, change]),
    );
    assert.equal(byPath["src/a.ts"]?.status, "modified");
    assert.equal(byPath["src/new.ts"]?.status, "renamed");
    assert.equal(byPath["src/new.ts"]?.previousPath, "src/old.ts");
    assert.equal(byPath[".env"], undefined);
  } finally {
    await rm(repo, { recursive: true });
  }
});

test("collectRepositoryMetadata from a jj repo maps statuses", async () => {
  const repo = await mkdtemp(join(tmpdir(), "impl-meta-jj-"))
  try {
    await run("jj", ["git", "init", "--colocate"], repo);
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "src/a.ts"), "one\n");
    await writeFile(join(repo, "src/old.ts"), "old\n");
    await writeFile(join(repo, ".env"), "SECRET=1\n");
    await run("jj", ["describe", "-m", "init"], repo);
    await run("jj", ["new"], repo);
    await writeFile(join(repo, "src/a.ts"), "two\n");
    await rename(join(repo, "src/old.ts"), join(repo, "src/new.ts"));

    const metadata = await collectRepositoryMetadata(repo);
    assert.ok(metadata.trackedFiles.includes("src/a.ts"));
    assert.ok(!metadata.trackedFiles.includes(".env"));
    const byPath = Object.fromEntries(
      metadata.changes.map((change) => [change.path, change]),
    );
    assert.equal(byPath["src/a.ts"]?.status, "modified");
    assert.equal(byPath["src/new.ts"]?.status, "renamed");
    assert.equal(byPath["src/new.ts"]?.previousPath, "src/old.ts");
    assert.equal(byPath[".env"], undefined);
  } finally {
    await rm(repo, { recursive: true });
  }
});
