/** Preflight routing target for the Sakana fugu pair. */
export type FuguTarget = "fugu" | "fugu-ultra";

export type FuguRouteReasonCode =
  | "explicit-base"
  | "create-pr"
  | "explicit-ultra"
  | "high-stakes-design"
  | "high-stakes-risk"
  | "high-stakes-adjudication"
  | "struggle-feedback"
  | "none";

export type FuguRouteDecision = {
  target?: FuguTarget;
  reasonCode: FuguRouteReasonCode;
  reason: string;
};

const NO_OVERRIDE: FuguRouteDecision = {
  reasonCode: "none",
  reason: "routine task; default fugu applies",
};

// Negative fugu phrasing is an explicit request for the other model.
const EXPLICIT_NOT_FUGU = new RegExp(
  [
    "fugu\\s*(?:ではなく|でなく|じゃなく).{0,8}ultra",
    "fuguを使っては(?:いけない|ダメ|だめ)",
    "fugu\\s*(?:を|は|も)?\\s*使わない",
    "(?:do not|don't) use fugu\\b(?!-ultra)",
  ].join("|"),
  "iu",
);

// Explicit model requests override every automatic route.
const EXPLICIT_BASE = new RegExp(
  [
    "fugu\\s*で(?!は?なく|じゃなく)",
    "fugu\\s*(?:を|は|も)?\\s*使って(?!は(?:いけない|ダメ|だめ))",
    "ultra\\s*(?:を|は|も)?\\s*(?:使わない|使うな)",
    "fugu-?ultra\\s*(?:を|は|も)?\\s*(?:禁止|使わない|使うな)",
    "(?:do not|don't) use fugu-ultra",
    "do not use ultra",
    "don't use ultra",
    "without ultra",
    "stay on fugu",
    "(?<!do not )(?<!don't )\\buse fugu\\b(?!-ultra)",
  ].join("|"),
  "iu",
);

// PR creation is cheap by default, unless the user explicitly requests ultra.
const CREATE_PR_PATTERNS = [
  /\bPR\b.*(?:だして|出して|出す|作って|作成|作る|open|create)/iu,
  /(?:だして|出して|出す|作って|作成|作る|open|create).*\bPR\b/iu,
  /(?:pull request|プルリク).*(?:だして|出して|出す|作って|作成|作る|open|create)/iu,
  /(?:だして|出して|出す|作って|作成|作る|open|create).*(?:pull request|プルリク)/iu,
];

const NON_CREATE_PR_PATTERN =
  /(?:レビュー|review|コメント|comment|merge|マージ)/iu;

// Explicit ultra / deep-thinking (bare "ultra" alone must NOT match)
const EXPLICIT_ULTRA = new RegExp(
  [
    "fugu\\s*(?:ではなく|でなく|じゃなく).{0,8}ultraで",
    "ultraで(?:$|[、。！？]|進め|考え|やって|お願い)",
    "fugu-ultraで",
    "ultra\\s*(?:を|は|も)?\\s*使って",
    "ultra\\s*(?:に|へ)?\\s*切り替えて",
    "熟考して",
    "じっくり考えて",
    "think hard",
    "\\buse ultra\\b",
    "\\buse fugu-ultra\\b",
    "switch to ultra",
    "switch to fugu-ultra",
  ].join("|"),
  "iu",
);

// Documentation and wording-only changes stay cheap even when they name a risky domain.
const ROUTINE_TEXT_EDIT = new RegExp(
  [
    "(?:README|docs?|documentation|ドキュメント|手順書).{0,24}(?:typo|link|wording|update|fix|更新|修正|直して|書いて)",
    "(?:typo|link|wording|update|fix|更新|修正|直して|書いて).{0,24}(?:README|docs?|documentation|ドキュメント|手順書)",
    "(?:copy|label|wording|text|文言|ラベル).{0,20}(?:update|fix|更新|修正|直して)",
    "(?:update|fix|更新|修正|直して).{0,20}(?:copy|label|wording|text|文言|ラベル)",
    "(?:typo|タイポ|rename|リネーム|変数名|関数名|ファイル名|import順|インポート順|console\\.log|log出力|フォーマット|format|インデント)[^。！？.!?]{0,20}(?:直して|修正|変更|消して|削除|整えて|そろえて|update|fix|remove|clean)",
    "(?:直して|修正|変更|消して|削除|整えて|そろえて|update|fix|remove|clean)[^。！？.!?]{0,20}(?:typo|タイポ|rename|リネーム|変数名|関数名|ファイル名|import順|インポート順|console\\.log|log出力|フォーマット|format|インデント)",
  ].join("|"),
  "iu",
);

// 4a. High-stakes design / architecture (avoid bare 方式, design, schema, architecture)
const HIGH_STAKES_DESIGN = new RegExp(
  [
    "(?:アーキテクチャ|システム|API|データモデル).{0,8}設計",
    "設計(?:判断|方針|決定|を決)",
    "(?:architecture|system|API|data model)\\s+design",
    "(?:architecture|architectural)\\s+(?:decision|choice|review|change|pattern)",
    "(?:decide|design|review|change|choose|pick|select).{0,20}\\barchitecture\\b",
    "design\\s+(?:decision|the\\s+system|choices)",
    "トレードオフ",
    "\\btrade-?offs?\\b",
    "技術選定",
    "ライブラリ選定",
    "依存.{0,4}選定",
    "technology\\s+selection",
    "dependency\\s+selection",
    "(?:choose|pick|select)\\s+(?:a\\s+)?(?:library|framework|dependency|technology)",
    "breaking\\s+change",
    "backward\\s+compat",
    "後方互換",
    "大規模.{0,6}リファクタ",
    "リファクタ.{0,4}方針",
    "refactor\\s+strategy",
    "large\\s+refactor",
  ].join("|"),
  "iu",
);

// 4b. High-risk operational areas
const RISK_DOMAIN =
  "(?:認証|認可|権限|\\bauth(?:z|entication)?\\b|\\bauthorization\\b|セキュリティ|" +
  "\\bsecurity\\b|\\bsecrets?\\b|課金|決済|\\bbilling\\b|\\bpayment\\b|" +
  "マイグレーション|\\bmigration\\b|スキーマ|\\bschema\\b|" +
  "並行処理|並列処理|並行制御|\\bconcurrency\\b)";
const RISK_VERB =
  "(?:設計|変更|実装|見直|導入|移行|バイパス|強化|監査|ローテーション|" +
  "design|implement|change|modify|migrat|rotate|bypass|harden|audit|review|introduc)";

const HIGH_STAKES_RISK = new RegExp(
  [
    `${RISK_DOMAIN}[^。！？]{0,16}${RISK_VERB}`,
    `${RISK_VERB}[^.!?]{0,16}${RISK_DOMAIN}`,
    "スキーマ変更",
    "schema\\s+(?:change|migration)",
    "データ削除",
    "data\\s+(?:deletion|integrity)",
    "競合状態",
    "デッドロック",
    "race\\s+condition",
    "deadlock",
    "本番(?:障害|インシデント|デプロイ|リリース|ロールバック)",
    "\\bproduction\\s+(?:incident|deploy(?:ment)?|release|rollback)\\b",
    "\\b(?:incident|deploy(?:ment)?|release|rollback)\\s+(?:to\\s+)?production\\b",
    "\\bproduction\\b.*\\b(?:incident|deploy(?:ment)?|release|rollback)\\b",
    "\\b(?:incident|deploy(?:ment)?|release|rollback)\\b.*\\bproduction\\b",
    "本番(?:環境|データ|設定|DB|データベース).{0,12}(?:変更|更新|削除|操作|修正|切替|適用)",
    "(?:変更|更新|削除|操作|修正|切替|適用).{0,12}本番(?:環境|データ|設定|DB|データベース)",
    "(?:change|update|delete|modify|rotate|migrate).{0,24}\\bproduction\\s+(?:config|data|database|environment|secrets?)\\b",
    "\\bproduction\\s+(?:config|data|database|environment|secrets?)\\b.{0,24}(?:change|update|delete|modify|rotate|migrate)",
  ].join("|"),
  "iu",
);

// 4c. Final adjudication / conflicting constraints
const HIGH_STAKES_ADJUDICATION = new RegExp(
  [
    "最終判断",
    "方針を決めて",
    "(?:重要|設計|方針|採用|可否).{0,6}(?:判断|決定)して",
    "(?:判断|決定)して.{0,6}(?:方針|設計|採用|可否)",
    "\\bdecide\\s+(?:between|on|whether)\\b",
    "\\bdecide\\s+(?:the\\s+)?(?:architecture|approach|strategy|design|trade-?offs?)\\b",
    "choose\\s+between\\s+\\w+\\s+options",
    "比較検討",
    "どちらがいい",
    "どっちがいい",
    "レビュー.{0,6}(?:割れ|食い違|衝突|分かれ)",
    "指摘.{0,6}(?:割れ|食い違|分かれ)",
    "conflicting\\s+(?:review|constraints?|findings?)",
    "root\\s+cause",
    "根本原因",
    "(?:繰り返|再発|断続).{0,6}(?:失敗|エラー)",
    "(?:intermittent|repeated)\\s+(?:failures?|errors?)",
  ].join("|"),
  "iu",
);

// 4d. User feedback that fugu is struggling
const STRUGGLE_FEEDBACK = new RegExp(
  [
    "まだ直っていない",
    "同じエラー",
    "また失敗",
    "2回失敗",
    "still\\s+broken",
    "same\\s+error",
    "failed\\s+again",
    "not\\s+fixed",
    "didn't\\s+work",
    "did not work",
    "(?:また|再度|もう一度)[^。！？]{0,12}(?:失敗|エラー|直らない|直っていない|うまくいかない|通らない)",
    "(?:失敗|エラー|直らない|直っていない|通らない|うまくいかない)[^。！？]{0,12}(?:もう一度|再度|やり直)",
    "(?:try\\s+again|retry)[^.!?]{0,20}(?:error|fail|broken|still|not\\s+work)",
    "(?:error|fail|broken|still|not\\s+work)[^.!?]{0,20}(?:try\\s+again|retry)",
  ].join("|"),
  "iu",
);

const isCreatePrRequest = (text: string) => {
  if (NON_CREATE_PR_PATTERN.test(text)) return false;
  return CREATE_PR_PATTERNS.some((pattern) => pattern.test(text));
};

/** Deterministic preflight classifier for fugu vs fugu-ultra routing. */
export const classifyFuguPrompt = (text: string): FuguRouteDecision => {
  const trimmed = text.trim();
  if (!trimmed) return NO_OVERRIDE;

  if (EXPLICIT_BASE.test(trimmed)) {
    return {
      target: "fugu",
      reasonCode: "explicit-base",
      reason: "explicit fugu / no-ultra override",
    };
  }

  if (EXPLICIT_NOT_FUGU.test(trimmed) || EXPLICIT_ULTRA.test(trimmed)) {
    return {
      target: "fugu-ultra",
      reasonCode: "explicit-ultra",
      reason: "explicit ultra / deep-thinking request",
    };
  }

  if (isCreatePrRequest(trimmed)) {
    return {
      target: "fugu",
      reasonCode: "create-pr",
      reason: "PR creation request",
    };
  }

  if (
    ROUTINE_TEXT_EDIT.test(trimmed) &&
    !HIGH_STAKES_DESIGN.test(trimmed) &&
    !HIGH_STAKES_RISK.test(trimmed) &&
    !HIGH_STAKES_ADJUDICATION.test(trimmed) &&
    !STRUGGLE_FEEDBACK.test(trimmed)
  ) {
    return NO_OVERRIDE;
  }

  if (HIGH_STAKES_DESIGN.test(trimmed)) {
    return {
      target: "fugu-ultra",
      reasonCode: "high-stakes-design",
      reason: "architecture / design / trade-off decision",
    };
  }

  if (HIGH_STAKES_RISK.test(trimmed)) {
    return {
      target: "fugu-ultra",
      reasonCode: "high-stakes-risk",
      reason: "high-risk operational area",
    };
  }

  if (HIGH_STAKES_ADJUDICATION.test(trimmed)) {
    return {
      target: "fugu-ultra",
      reasonCode: "high-stakes-adjudication",
      reason: "final adjudication or conflicting constraints",
    };
  }

  if (STRUGGLE_FEEDBACK.test(trimmed)) {
    return {
      target: "fugu-ultra",
      reasonCode: "struggle-feedback",
      reason: "user reports unresolved / repeated failure",
    };
  }

  return NO_OVERRIDE;
};

/** Recognize validation-style bash commands for in-run struggle monitoring. */
export const isValidationBashCommand = (command: string) => {
  const cmd = command.trim();
  if (!cmd) return false;

  const validation =
    "(?:npm|pnpm|yarn|bun|deno|cargo|go|make|swift|xcodebuild)\\s+" +
    "(?:(?:run|task)\\s+)?(?:test|lint|typecheck|check|build)\\b";
  const direct =
    "(?:lint|typecheck|check|build|pytest|vitest|jest|tsc|mypy)\\b";
  const afterSeparator = new RegExp(
    `(?:^|&&|\\|\\||;|\\n)\\s*(?:${validation}|${direct})`,
    "iu",
  );

  return afterSeparator.test(cmd);
};

export const STRUGGLE_MONITOR_TOOLS = new Set(["edit", "write", "bash"]);
export const STRUGGLE_THRESHOLD = 2;
