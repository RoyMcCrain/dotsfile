import assert from "node:assert/strict";
import { join } from "node:path";
import {
  classifyChanges,
  parseGitNameStatus,
  parseJjTemplateStatus,
} from "../scripts/filter_secret_paths.ts";
import {
  collectRepositoryMetadata,
  uniqueNonSecretPaths,
} from "../scripts/collect_repository_metadata.ts";

const decoder = new TextDecoder();

const run = async (bin: string, args: string[], cwd: string) => {
  const result = await new Deno.Command(bin, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(
    result.success,
    true,
    `${bin} ${args.join(" ")}: ${decoder.decode(result.stderr)}`,
  );
  return decoder.decode(result.stdout);
};

const initGitRepo = async (repo: string) => {
  await Deno.mkdir(repo, { recursive: true });
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
  await Deno.mkdir(join(full, ".."), { recursive: true });
  await Deno.writeTextFile(full, content);
  await run("git", ["add", "--", path], repo);
  await run("git", ["commit", "-q", "-m", message], repo);
};

Deno.test("parseGitNameStatus maps statuses and rename previousPath", () => {
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

Deno.test("parseGitNameStatus maps NUL-delimited output", () => {
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

Deno.test("parseJjTemplateStatus maps statuses and rename previousPath", () => {
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

Deno.test("parseJjTemplateStatus rejects unknown statuses", () => {
  assert.throws(
    () => parseJjTemplateStatus("weird\tsrc/a.ts\tsrc/a.ts\n"),
    /unknown jj status/,
  );
});

Deno.test("classifyChanges drops secret current or previous paths", () => {
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

Deno.test("uniqueNonSecretPaths drops secrets and empties", () => {
  assert.deepEqual(
    uniqueNonSecretPaths(["src/a.ts", ".env", "src/a.ts", "id_ed25519", ""]),
    ["src/a.ts"],
  );
});

Deno.test("collectRepositoryMetadata from a git repo excludes secrets and keeps rename", async () => {
  const repo = await Deno.makeTempDir({ prefix: "impl-meta-git-" });
  try {
    await initGitRepo(repo);
    await writeAndCommit(repo, "src/a.ts", "one\n", "add a");
    await writeAndCommit(repo, "src/old.ts", "old\n", "add old");
    await writeAndCommit(repo, ".env", "SECRET=1\n", "add env");
    await Deno.writeTextFile(join(repo, "src/a.ts"), "two\n");
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
    await Deno.remove(repo, { recursive: true });
  }
});

Deno.test("collectRepositoryMetadata from a jj repo maps statuses", async () => {
  const repo = await Deno.makeTempDir({ prefix: "impl-meta-jj-" });
  try {
    await run("jj", ["git", "init", "--colocate"], repo);
    await Deno.mkdir(join(repo, "src"), { recursive: true });
    await Deno.writeTextFile(join(repo, "src/a.ts"), "one\n");
    await Deno.writeTextFile(join(repo, "src/old.ts"), "old\n");
    await Deno.writeTextFile(join(repo, ".env"), "SECRET=1\n");
    await run("jj", ["describe", "-m", "init"], repo);
    await run("jj", ["new"], repo);
    await Deno.writeTextFile(join(repo, "src/a.ts"), "two\n");
    await Deno.rename(join(repo, "src/old.ts"), join(repo, "src/new.ts"));

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
    await Deno.remove(repo, { recursive: true });
  }
});
