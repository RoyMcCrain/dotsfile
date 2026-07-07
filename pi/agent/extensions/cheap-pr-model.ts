import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CHEAP_PROVIDER = "sakana-ai-console";
const CHEAP_MODEL = "fugu";

const CREATE_PR_PATTERNS = [
  /\bPR\b.*(?:だして|出して|出す|作って|作成|作る|open|create)/iu,
  /(?:だして|出して|出す|作って|作成|作る|open|create).*\bPR\b/iu,
  /(?:pull request|プルリク).*(?:だして|出して|出す|作って|作成|作る|open|create)/iu,
  /(?:だして|出して|出す|作って|作成|作る|open|create).*(?:pull request|プルリク)/iu,
];

const NON_CREATE_PR_PATTERN =
  /(?:レビュー|review|確認|見て|コメント|comment|address|対応|merge|マージ)/iu;

const isCreatePrRequest = (text: string) => {
  if (NON_CREATE_PR_PATTERN.test(text)) return false;

  return CREATE_PR_PATTERNS.some((pattern) => pattern.test(text));
};

export default function cheapPrModel(pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    if (!isCreatePrRequest(event.text)) return;
    if (ctx.model.provider === CHEAP_PROVIDER && ctx.model.id === CHEAP_MODEL) {
      return;
    }

    const model = ctx.modelRegistry.find(CHEAP_PROVIDER, CHEAP_MODEL);
    if (!model) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Cheap PR model not found: ${CHEAP_PROVIDER}/${CHEAP_MODEL}`,
          "warning",
        );
      }
      return;
    }

    const switched = await pi.setModel(model);
    if (ctx.hasUI) {
      const level = switched ? "info" : "warning";
      const message = switched
        ? `PR作成のため安価モデルに切替: ${CHEAP_PROVIDER}/${CHEAP_MODEL}`
        : `PR作成用モデルに切替できませんでした: ${CHEAP_PROVIDER}/${CHEAP_MODEL}`;
      ctx.ui.notify(message, level);
    }
  });
}
