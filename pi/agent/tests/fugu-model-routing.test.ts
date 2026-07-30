import { assertEquals } from "jsr:@std/assert@1.0";
import {
  classifyFuguPrompt,
  isValidationBashCommand,
} from "../lib/fugu-model-routing.ts";

Deno.test("precedence 1: explicit base override wins over ultra keywords", () => {
  assertEquals(
    classifyFuguPrompt("fuguでアーキテクチャ設計して").reasonCode,
    "explicit-base",
  );
  assertEquals(
    classifyFuguPrompt("fuguでアーキテクチャ設計して").target,
    "fugu",
  );
  assertEquals(classifyFuguPrompt("fuguを使って熟考して").target, "fugu");
  assertEquals(
    classifyFuguPrompt("ultraを使わない、設計判断して").target,
    "fugu",
  );
  assertEquals(classifyFuguPrompt("fugu-ultra禁止で進めて").target, "fugu");
  assertEquals(
    classifyFuguPrompt("do not use ultra, decide the architecture").target,
    "fugu",
  );
  assertEquals(
    classifyFuguPrompt("use fugu for this migration").target,
    "fugu",
  );
  assertEquals(
    classifyFuguPrompt("don't use ultra for this").target,
    "fugu",
  );
  assertEquals(
    classifyFuguPrompt("without ultra, keep going").target,
    "fugu",
  );
  assertEquals(classifyFuguPrompt("stay on fugu please").target, "fugu");
  assertEquals(
    classifyFuguPrompt("fugu-ultraは使わないで進めて").target,
    "fugu",
  );
  assertEquals(
    classifyFuguPrompt("don't use fugu-ultra for this").target,
    "fugu",
  );
});

Deno.test("precedence 1: negative ultra phrasing routes to ultra, not base", () => {
  assertEquals(
    classifyFuguPrompt("fuguではなくultraで").reasonCode,
    "explicit-ultra",
  );
  assertEquals(classifyFuguPrompt("fuguではなくultraで").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("fuguじゃなくultraで").reasonCode,
    "explicit-ultra",
  );
  assertEquals(classifyFuguPrompt("fuguじゃなくultraで").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("fuguでなくultraで").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("fuguを使ってはいけない。ultraで進めて").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("don't use fugu").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("fuguで進めて").reasonCode, "explicit-base");
  assertEquals(classifyFuguPrompt("fuguで進めて").target, "fugu");
});

Deno.test("precedence 2: PR creation routes to fugu", () => {
  assertEquals(classifyFuguPrompt("PRを作って").reasonCode, "create-pr");
  assertEquals(classifyFuguPrompt("PRを作って").target, "fugu");
  assertEquals(classifyFuguPrompt("create a pull request").target, "fugu");
  assertEquals(classifyFuguPrompt("プルリク出して").target, "fugu");
  assertEquals(classifyFuguPrompt("open a PR for this branch").target, "fugu");
});

Deno.test("precedence 2: PR review/merge requests are NOT create-pr", () => {
  assertEquals(classifyFuguPrompt("PRをレビューして").target, undefined);
  assertEquals(classifyFuguPrompt("review this PR").target, undefined);
  assertEquals(classifyFuguPrompt("PRのコメントに対応して").target, undefined);
  assertEquals(classifyFuguPrompt("merge the PR").target, undefined);
  assertEquals(classifyFuguPrompt("address PR comments").target, undefined);
});

Deno.test("explicit ultra beats the automatic cheap PR route", () => {
  const result = classifyFuguPrompt("create a PR, use fugu-ultra after");
  assertEquals(result.target, "fugu-ultra");
  assertEquals(result.reasonCode, "explicit-ultra");
  assertEquals(
    classifyFuguPrompt("PRを作って、ultraを使って").target,
    "fugu-ultra",
  );
});

Deno.test("precedence 3: explicit ultra / deep-thinking phrases", () => {
  assertEquals(
    classifyFuguPrompt("fugu-ultraで考えて").reasonCode,
    "explicit-ultra",
  );
  assertEquals(classifyFuguPrompt("ultraを使って").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("ultraに切り替えて").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("熟考してから答えて").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("じっくり考えて").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("think hard about this").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("use ultra for this one").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("use fugu-ultra for this").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("switch to ultra please").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("switch to fugu-ultra now").target,
    "fugu-ultra",
  );
});

Deno.test("precedence 3: use fugu does NOT match use fugu-ultra", () => {
  assertEquals(
    classifyFuguPrompt("use fugu-ultra for architecture").reasonCode,
    "explicit-ultra",
  );
  assertEquals(
    classifyFuguPrompt("use fugu-ultra for architecture").target,
    "fugu-ultra",
  );
});

Deno.test("precedence 3: bare ultra mention does NOT force escalation", () => {
  assertEquals(classifyFuguPrompt("ultra").target, undefined);
  assertEquals(classifyFuguPrompt("the ultra setting").target, undefined);
  assertEquals(classifyFuguPrompt("fugu-ultra is expensive").target, undefined);
});

Deno.test("precedence 4: high-stakes design (JA/EN)", () => {
  assertEquals(
    classifyFuguPrompt("API設計を決めたい").reasonCode,
    "high-stakes-design",
  );
  assertEquals(classifyFuguPrompt("システム設計の方針").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("データモデル設計をレビュー").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("技術選定を手伝って").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("トレードオフを整理して").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("breaking change を避けたい").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("design the system architecture").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("compare trade-offs for dependency selection").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("large refactor strategy").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("choose a library for caching").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("pick a framework for the API").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("select a dependency for auth").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("technology selection for payments").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("architecture decision for caching").target,
    "fugu-ultra",
  );
});

Deno.test("precedence 4: high-stakes risk (JA/EN)", () => {
  assertEquals(
    classifyFuguPrompt("本番デプロイ前に確認").reasonCode,
    "high-stakes-risk",
  );
  assertEquals(
    classifyFuguPrompt("マイグレーションを設計して").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("スキーマ変更の影響").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("認可モデルを見直したい").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("billing webhook の設計").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("production incident triage").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("race condition in auth flow").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("schema migration plan").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("review the authorization model").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("本番設定を変更して").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("update production config").target,
    "fugu-ultra",
  );
});

Deno.test("precedence 4: adjudication and struggle feedback", () => {
  assertEquals(
    classifyFuguPrompt("最終判断して").reasonCode,
    "high-stakes-adjudication",
  );
  assertEquals(
    classifyFuguPrompt("レビュー指摘が割れている").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("conflicting review findings").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("根本原因を特定して").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("まだ直っていない").reasonCode,
    "struggle-feedback",
  );
  assertEquals(classifyFuguPrompt("同じエラーが出る").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("still broken after your fix").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("same error again").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("not fixed yet").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("that didn't work, try again").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("did not work, please try again").target,
    "fugu-ultra",
  );
});

Deno.test("routine tasks: no override (false-positive guards)", () => {
  assertEquals(
    classifyFuguPrompt("この関数をリファクタして").target,
    undefined,
  );
  assertEquals(classifyFuguPrompt("テストを追加して").target, undefined);
  assertEquals(classifyFuguPrompt("lint を直して").target, undefined);
  assertEquals(classifyFuguPrompt("README を更新").target, undefined);
  assertEquals(classifyFuguPrompt("fix the typo").target, undefined);
  assertEquals(classifyFuguPrompt("方式").target, undefined);
  assertEquals(classifyFuguPrompt("design").target, undefined);
  assertEquals(classifyFuguPrompt("schema").target, undefined);
  assertEquals(classifyFuguPrompt("architecture").target, undefined);
  assertEquals(
    classifyFuguPrompt("update the schema file path").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("the secretary will schedule the meeting").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("neutral model mention only").target,
    undefined,
  );
});

Deno.test("literal skill invocation does not escalate from skill-name alone", () => {
  assertEquals(
    classifyFuguPrompt("/skill:parallel-review この PR をレビューして").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("/skill:cursor-impl implement the login form").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("/skill:foo routine request").target,
    undefined,
  );
});

Deno.test("routine release/deploy docs do not escalate without production action", () => {
  assertEquals(classifyFuguPrompt("update release notes").target, undefined);
  assertEquals(
    classifyFuguPrompt("deployment docs を更新して").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("認証READMEのtypoを直して").target,
    undefined,
  );
  assertEquals(classifyFuguPrompt("update security docs").target, undefined);
  assertEquals(
    classifyFuguPrompt("billing documentationを更新").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("write the release changelog").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("deploy to production tonight").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("rollback production now").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("production incident triage").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("should we release to production?").target,
    "fugu-ultra",
  );
});

Deno.test("mundane decide and parallel-work prompts do not escalate", () => {
  assertEquals(classifyFuguPrompt("decide a variable name").target, undefined);
  assertEquals(classifyFuguPrompt("変数名を決めて").target, undefined);
  assertEquals(classifyFuguPrompt("これを判断して").target, undefined);
  assertEquals(classifyFuguPrompt("並行して調べて").target, undefined);
  assertEquals(classifyFuguPrompt("並行処理を設計して").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("設計方針を判断して").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("choose between architecture options").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("方針を決めて").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("最終判断して").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("decide on the migration approach").target,
    "fugu-ultra",
  );
});

Deno.test("precedence: explicit base beats create-pr and high-stakes", () => {
  const result = classifyFuguPrompt("fuguで PRを作って");
  assertEquals(result.target, "fugu");
  assertEquals(result.reasonCode, "explicit-base");
});

Deno.test("precedence: create-pr beats high-stakes when not review", () => {
  const result = classifyFuguPrompt("PRを作って、認証も含めて");
  assertEquals(result.target, "fugu");
  assertEquals(result.reasonCode, "create-pr");
});

Deno.test("isValidationBashCommand recognizes validation commands only", () => {
  assertEquals(
    isValidationBashCommand("deno test pi/agent/tests/foo.test.ts"),
    true,
  );
  assertEquals(isValidationBashCommand("npm run lint"), true);
  assertEquals(isValidationBashCommand("pnpm test"), true);
  assertEquals(isValidationBashCommand("cargo build"), true);
  assertEquals(isValidationBashCommand("go test ./..."), true);
  assertEquals(isValidationBashCommand("swift test"), true);
  assertEquals(isValidationBashCommand("cd app && deno task test"), true);
  assertEquals(isValidationBashCommand("pytest -q"), true);
  assertEquals(isValidationBashCommand("ls -la"), false);
  assertEquals(isValidationBashCommand("git status"), false);
  assertEquals(isValidationBashCommand("echo hello"), false);
  assertEquals(isValidationBashCommand("echo npm test"), false);
  assertEquals(isValidationBashCommand("test -f package.json"), false);
});

Deno.test("struggle feedback: no false positives on casual retry phrasing", () => {
  assertEquals(classifyFuguPrompt("さっきのやつやり直して").target, undefined);
  assertEquals(
    classifyFuguPrompt("try again with the other file").target,
    undefined,
  );
});

Deno.test("struggle feedback: fires on failure context", () => {
  assertEquals(classifyFuguPrompt("また失敗した").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("まだ直っていない").target, "fugu-ultra");
});

Deno.test("high-stakes risk: routine edits do not escalate", () => {
  assertEquals(
    classifyFuguPrompt("src/auth/login.ts のimport順を直して").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("security.tsのconsole.logを消して").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("migrationファイルのファイル名を直して").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("権限まわりの変数名を短くして").target,
    undefined,
  );
  assertEquals(classifyFuguPrompt("決済まわりのtypo").target, undefined);
});

Deno.test("high-stakes risk: fires on domain + verb proximity", () => {
  assertEquals(classifyFuguPrompt("認証フローを設計して").target, "fugu-ultra");
  assertEquals(
    classifyFuguPrompt("スキーマ変更をレビュー").target,
    "fugu-ultra",
  );
  assertEquals(classifyFuguPrompt("課金の実装を見直して").target, "fugu-ultra");
});

Deno.test("explicit phrasing: particle and whitespace variants", () => {
  assertEquals(
    classifyFuguPrompt("ultra は使わないで、設計判断して").target,
    "fugu",
  );
  assertEquals(classifyFuguPrompt("fuguは使わないで").target, "fugu-ultra");
  assertEquals(classifyFuguPrompt("fugu で進めて").target, "fugu");
});

Deno.test("create-pr: migration PR request stays on fugu", () => {
  assertEquals(
    classifyFuguPrompt("マイグレーションのPRを出して").target,
    "fugu",
  );
});

Deno.test("re-review: compound chore + risky change still escalates", () => {
  assertEquals(
    classifyFuguPrompt("認証を変更して、typoも直して").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("import順を直して。認可モデルも見直して").target,
    "fugu-ultra",
  );
});

Deno.test("re-review: english domain words respect word boundaries", () => {
  assertEquals(classifyFuguPrompt("change the author name").target, undefined);
  assertEquals(
    classifyFuguPrompt("review the authority matrix copy").target,
    undefined,
  );
  assertEquals(
    classifyFuguPrompt("change authentication flow").target,
    "fugu-ultra",
  );
});

Deno.test("re-review: struggle feedback matches reverse word order", () => {
  assertEquals(
    classifyFuguPrompt("エラーが出たからやり直して").target,
    "fugu-ultra",
  );
  assertEquals(
    classifyFuguPrompt("the error is still there, try again").target,
    "fugu-ultra",
  );
});

Deno.test("re-review: explicit 'fugu ではなく ultra で' escalates", () => {
  assertEquals(
    classifyFuguPrompt("fugu ではなく ultra で進めて").target,
    "fugu-ultra",
  );
});
