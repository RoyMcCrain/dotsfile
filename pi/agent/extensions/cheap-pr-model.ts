import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

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

const isCheapModel = (model: ExtensionContext["model"]) =>
  model?.provider === CHEAP_PROVIDER && model.id === CHEAP_MODEL;

export default function cheapPrModel(pi: ExtensionAPI) {
  let restoreModel: NonNullable<ExtensionContext["model"]> | undefined;

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    if (!isCreatePrRequest(event.text)) return;

    const currentModel = ctx.model;
    if (!currentModel || isCheapModel(currentModel)) return;

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
    if (switched) {
      restoreModel = currentModel;
    }

    if (ctx.hasUI) {
      const level = switched ? "info" : "warning";
      const message = switched
        ? `PR作成のため安価モデルに切替: ${CHEAP_PROVIDER}/${CHEAP_MODEL}`
        : `PR作成用モデルに切替できませんでした: ${CHEAP_PROVIDER}/${CHEAP_MODEL}`;
      ctx.ui.notify(message, level);
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const model = restoreModel;
    restoreModel = undefined;
    if (!model || !isCheapModel(ctx.model)) return;

    const restored = await pi.setModel(model);
    if (ctx.hasUI) {
      const level = restored ? "info" : "warning";
      const message = restored
        ? `PR作成後にモデルを復元: ${model.provider}/${model.id}`
        : `PR作成前のモデルに復元できませんでした: ${model.provider}/${model.id}`;
      ctx.ui.notify(message, level);
    }
  });
}
