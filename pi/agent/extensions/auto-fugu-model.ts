/**
 * fugu を常用しつつ、要所だけ自動で fugu-ultra に切り替える統合ルーター。
 *
 * why: 常時 fugu-ultra は週次クォータを食う。preflight 分類 + 同一 run 内の
 *   苦戦検知 + モデル自身の escalate ツールで、安価な fugu を維持しつつ
 *   高リスク判断だけ ultra に昇格させ、ターン終了で復元する。
 */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  classifyFuguPrompt,
  type FuguRouteDecision,
  type FuguTarget,
  isValidationBashCommand,
  STRUGGLE_MONITOR_TOOLS,
  STRUGGLE_THRESHOLD,
} from "../lib/fugu-model-routing.ts";

const PROVIDER = "sakana-ai-console";
const BASE_MODEL = "fugu";
const ULTRA_MODEL = "fugu-ultra";

const AUTO_CONTINUE_PREFIX = "(自動継続)";
const MODEL_ROUTER_READY_EVENT = "auto-fugu:ready";
const MODEL_ROUTER_PING_EVENT = "auto-fugu:ping";
const MODEL_SETTLED_EVENT = "auto-fugu:model-settled";

type AutomaticModelIdentity = {
  provider: string;
  id: string;
};

const isBaseModel = (model: ExtensionContext["model"]) =>
  model?.provider === PROVIDER && model.id === BASE_MODEL;

const isUltraModel = (model: ExtensionContext["model"]) =>
  model?.provider === PROVIDER && model.id === ULTRA_MODEL;

const isFuguPair = (model: ExtensionContext["model"]) =>
  isBaseModel(model) || isUltraModel(model);

const sameModel = (
  a: ExtensionContext["model"],
  b: ExtensionContext["model"],
) => a?.provider === b?.provider && a?.id === b?.id;

const sameModelIdentity = (
  a: AutomaticModelIdentity | undefined,
  b: AutomaticModelIdentity | undefined,
) =>
  a !== undefined && b !== undefined &&
  a.provider === b.provider && a.id === b.id;

const modelIdentity = (
  model: NonNullable<ExtensionContext["model"]>,
): AutomaticModelIdentity => ({
  provider: model.provider,
  id: model.id,
});

const isTargetInScope = (ctx: ExtensionContext, target: FuguTarget) => {
  if (ctx.scopedModels.length === 0) return true;
  return ctx.scopedModels.some(
    (scoped) =>
      scoped.model.provider === PROVIDER && scoped.model.id === target,
  );
};

export default function autoFuguModel(pi: ExtensionAPI) {
  let enabled = true;
  /** Model identity expected from an in-flight automatic setModel. */
  let expectedAutomaticModel: AutomaticModelIdentity | undefined;
  /** Original fugu-pair model before the first automatic route in this run. */
  let restoreModel: NonNullable<ExtensionContext["model"]> | undefined;
  /** Active temporary route target while restoreModel is pending settlement. */
  let activeTemporaryTarget: FuguTarget | undefined;
  /** Temporary target to reapply for exactly one post-compact continuation run. */
  let continueTargetAfterCompact: FuguTarget | undefined;
  /** Literal user-input classification pending before_agent_start application. */
  let pendingLiteralRouteDecision: FuguRouteDecision | undefined;
  let consecutiveFailures = 0;
  let manualOverrideActive = false;
  const validationBashCalls = new Set<string>();

  const clearPendingLiteralRouteDecision = () => {
    pendingLiteralRouteDecision = undefined;
  };

  const clearTemporaryRouteState = (
    options?: { preserveContinuation?: boolean },
  ) => {
    restoreModel = undefined;
    activeTemporaryTarget = undefined;
    if (!options?.preserveContinuation) {
      continueTargetAfterCompact = undefined;
    }
  };

  const clearAllAutomaticState = () => {
    expectedAutomaticModel = undefined;
    clearTemporaryRouteState();
    clearPendingLiteralRouteDecision();
  };

  const clearNonRestorationPendingState = () => {
    expectedAutomaticModel = undefined;
    consecutiveFailures = 0;
    clearPendingLiteralRouteDecision();
    continueTargetAfterCompact = undefined;
  };

  const isAutomaticOperationCurrent = (expected: AutomaticModelIdentity) =>
    expectedAutomaticModel !== undefined &&
    sameModelIdentity(expectedAutomaticModel, expected);

  const notify = (
    ctx: ExtensionContext,
    message: string,
    level: "info" | "warning" = "info",
  ) => {
    if (ctx.hasUI) ctx.ui.notify(message, level);
  };

  const lookupModel = (ctx: ExtensionContext, target: FuguTarget) => {
    try {
      return ctx.modelRegistry.find(PROVIDER, target);
    } catch {
      return undefined;
    }
  };

  const restoreModelIfNeeded = async (ctx: ExtensionContext, quiet = false) => {
    if (!restoreModel) return true;

    const current = ctx.model;
    if (current && sameModel(current, restoreModel)) {
      clearTemporaryRouteState({ preserveContinuation: true });
      return true;
    }

    const target = lookupModel(ctx, restoreModel.id as FuguTarget) ??
      restoreModel;
    const previous = restoreModel;
    const expected = modelIdentity(target);

    expectedAutomaticModel = expected;
    try {
      const restored = await pi.setModel(target);
      if (!isAutomaticOperationCurrent(expected)) {
        return false;
      }
      if (restored) {
        clearTemporaryRouteState({ preserveContinuation: true });
        if (!quiet) {
          notify(ctx, `元のモデルに復元: ${target.provider}/${target.id}`);
        }
        return true;
      }
      restoreModel = previous;
      if (!quiet) {
        notify(
          ctx,
          `元のモデルへの復元に失敗: ${target.provider}/${target.id}`,
          "warning",
        );
      }
      return false;
    } catch {
      if (!isAutomaticOperationCurrent(expected)) {
        return false;
      }
      const after = ctx.model;
      if (after && sameModel(after, target)) {
        clearTemporaryRouteState({ preserveContinuation: true });
        return true;
      }
      restoreModel = previous;
      if (!quiet) {
        notify(ctx, "元のモデルへの復元中にエラーが発生しました", "warning");
      }
      return false;
    } finally {
      if (sameModelIdentity(expectedAutomaticModel, expected)) {
        expectedAutomaticModel = undefined;
      }
    }
  };

  const applyRouteTarget = async (
    ctx: ExtensionContext,
    target: FuguTarget,
    reason: string,
  ) => {
    const current = ctx.model;
    if (!current || !isFuguPair(current)) return false;
    if (target === BASE_MODEL && isBaseModel(current)) {
      if (restoreModel && sameModel(current, restoreModel)) {
        clearTemporaryRouteState({ preserveContinuation: true });
      }
      return true;
    }
    if (target === ULTRA_MODEL && isUltraModel(current)) {
      if (restoreModel && sameModel(current, restoreModel)) {
        clearTemporaryRouteState({ preserveContinuation: true });
      }
      return true;
    }

    if (!isTargetInScope(ctx, target)) {
      notify(
        ctx,
        `${PROVIDER}/${target} は scopedModels の対象外です`,
        "warning",
      );
      return false;
    }

    const next = lookupModel(ctx, target);
    if (!next) {
      notify(ctx, `モデルが見つかりません: ${PROVIDER}/${target}`, "warning");
      return false;
    }

    const expected = modelIdentity(next);
    expectedAutomaticModel = expected;
    try {
      const switched = await pi.setModel(next);
      if (!isAutomaticOperationCurrent(expected)) {
        return false;
      }
      if (!switched) {
        notify(ctx, `モデル切替に失敗: ${PROVIDER}/${target}`, "warning");
        return false;
      }

      if (!restoreModel) {
        restoreModel = current;
      }

      if (restoreModel && sameModel(next, restoreModel)) {
        clearTemporaryRouteState({ preserveContinuation: true });
      } else {
        activeTemporaryTarget = target;
      }

      notify(ctx, `${reason} → ${PROVIDER}/${target}`);
      return true;
    } catch {
      if (!isAutomaticOperationCurrent(expected)) {
        return false;
      }
      const after = ctx.model;
      if (after && sameModel(after, next)) {
        if (!restoreModel) {
          restoreModel = current;
        }
        if (restoreModel && sameModel(after, restoreModel)) {
          clearTemporaryRouteState({ preserveContinuation: true });
        } else {
          activeTemporaryTarget = target;
        }
        notify(ctx, `${reason} → ${PROVIDER}/${target}`);
        return true;
      }
      notify(ctx, `モデル切替中にエラー: ${PROVIDER}/${target}`, "warning");
      return false;
    } finally {
      if (sameModelIdentity(expectedAutomaticModel, expected)) {
        expectedAutomaticModel = undefined;
      }
    }
  };

  const applyRouteDecision = async (
    ctx: ExtensionContext,
    decision: FuguRouteDecision,
  ) => {
    if (!decision.target) return;
    await applyRouteTarget(ctx, decision.target, decision.reason);
  };

  const routeFromText = async (ctx: ExtensionContext, text: string) => {
    if (!enabled || manualOverrideActive) return;
    const decision = classifyFuguPrompt(text);
    await applyRouteDecision(ctx, decision);
  };

  const routeContinuation = async (ctx: ExtensionContext) => {
    const target = continueTargetAfterCompact;
    continueTargetAfterCompact = undefined;
    if (!enabled || !target || manualOverrideActive) return;
    await applyRouteTarget(ctx, target, "コンパクト後の自動継続");
  };

  pi.on("session_start", () => {
    manualOverrideActive = false;
    pi.events.emit(MODEL_ROUTER_READY_EVENT, undefined);
  });

  pi.on("session_compact", (event) => {
    if (
      event.reason !== "manual" && !event.willRetry && restoreModel &&
      activeTemporaryTarget
    ) {
      continueTargetAfterCompact = activeTemporaryTarget;
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await restoreModelIfNeeded(ctx, true);

    if (event.prompt.startsWith(AUTO_CONTINUE_PREFIX)) {
      clearPendingLiteralRouteDecision();
      await routeContinuation(ctx);
      return;
    }

    if (continueTargetAfterCompact) {
      continueTargetAfterCompact = undefined;
    }

    if (pendingLiteralRouteDecision) {
      const decision = pendingLiteralRouteDecision;
      clearPendingLiteralRouteDecision();
      if (enabled && !manualOverrideActive) {
        await applyRouteDecision(ctx, decision);
      }
      return;
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      clearPendingLiteralRouteDecision();
      const isStreaming = event.streamingBehavior === "steer" ||
        event.streamingBehavior === "followUp";
      if (!isStreaming && !event.text.startsWith(AUTO_CONTINUE_PREFIX)) {
        continueTargetAfterCompact = undefined;
      }
      return;
    }

    clearPendingLiteralRouteDecision();
    continueTargetAfterCompact = undefined;

    if (!enabled) return;

    const isSteerOrFollowUp = event.streamingBehavior === "steer" ||
      event.streamingBehavior === "followUp";
    if (isSteerOrFollowUp) {
      await routeFromText(ctx, event.text);
      return;
    }

    if (event.source === "interactive" || event.source === "rpc") {
      pendingLiteralRouteDecision = classifyFuguPrompt(event.text);
    }
  });

  pi.on("model_select", (event) => {
    if (
      expectedAutomaticModel &&
      sameModelIdentity(expectedAutomaticModel, event.model)
    ) {
      return;
    }
    clearAllAutomaticState();
    if (event.source !== "restore") manualOverrideActive = true;
  });

  pi.on("agent_start", () => {
    consecutiveFailures = 0;
    validationBashCalls.clear();
    clearPendingLiteralRouteDecision();
  });

  pi.on("tool_execution_start", (event) => {
    if (event.toolName !== "bash") return;
    const command = typeof event.args?.command === "string"
      ? event.args.command
      : "";
    if (isValidationBashCommand(command)) {
      validationBashCalls.add(event.toolCallId);
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const monitored = STRUGGLE_MONITOR_TOOLS.has(event.toolName) &&
      (event.toolName !== "bash" || validationBashCalls.has(event.toolCallId));

    if (event.toolName === "bash") validationBashCalls.delete(event.toolCallId);

    if (!monitored || !enabled) return;

    if (event.isError) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
      return;
    }

    if (
      consecutiveFailures < STRUGGLE_THRESHOLD || !isBaseModel(ctx.model) ||
      manualOverrideActive
    ) {
      return;
    }

    consecutiveFailures = 0;
    await applyRouteTarget(
      ctx,
      ULTRA_MODEL,
      `fugu が苦戦（${STRUGGLE_THRESHOLD} 回連続失敗）`,
    );
  });

  pi.on("agent_settled", async (_event, ctx) => {
    try {
      await restoreModelIfNeeded(ctx);
    } finally {
      // auto-continue waits for this instead of racing an async model restore.
      pi.events.emit(MODEL_SETTLED_EVENT, undefined);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await restoreModelIfNeeded(ctx, true);
    clearAllAutomaticState();
  });

  pi.registerTool({
    name: "escalate_to_fugu_ultra",
    label: "Escalate to Fugu Ultra",
    description:
      "Escalate the current turn to fugu-ultra for genuinely difficult, high-stakes decisions.",
    promptSnippet:
      "Escalate to fugu-ultra for irreversible high-stakes decisions only",
    promptGuidelines: [
      "Use escalate_to_fugu_ultra only for irreversible architecture decisions, security/data/money/production correctness, conflicting constraints, or unresolved repeated failure.",
      "Do NOT use for routine reading, implementation, tests, formatting, commits, or PR creation.",
    ],
    parameters: Type.Object({
      reason: Type.String({ description: "Why ultra is needed for this turn" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const reason = params.reason.trim();
      if (!reason) {
        return {
          content: [{ type: "text", text: "reason is required." }],
          details: {},
        };
      }

      const current = ctx.model;
      if (!current || !isFuguPair(current)) {
        return {
          content: [{
            type: "text",
            text: `現在のモデル ${current?.provider}/${
              current?.id ?? "unknown"
            } は自動 fugu ルーターの対象外です。`,
          }],
          details: {},
        };
      }
      if (isUltraModel(current)) {
        return {
          content: [{ type: "text", text: "すでに fugu-ultra です。" }],
          details: {},
        };
      }
      if (!enabled) {
        return {
          content: [{ type: "text", text: "auto-fugu は OFF です。" }],
          details: {},
        };
      }
      if (!isTargetInScope(ctx, ULTRA_MODEL)) {
        return {
          content: [{
            type: "text",
            text: `${PROVIDER}/${ULTRA_MODEL} は scopedModels の対象外です。`,
          }],
          details: {},
        };
      }

      const switched = await applyRouteTarget(ctx, ULTRA_MODEL, reason);
      return {
        content: [{
          type: "text",
          text: switched
            ? `fugu-ultra に昇格しました: ${reason}`
            : `fugu-ultra への昇格に失敗しました: ${reason}`,
        }],
        details: {},
      };
    },
  });

  pi.registerCommand("auto-fugu", {
    description: "fugu/fugu-ultra 自動切替の ON/OFF / 状態表示",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();

      if (arg === "status") {
        notify(ctx, `auto-fugu: ${enabled ? "ON" : "OFF"}`);
        return;
      }

      if (arg && arg !== "on" && arg !== "off") {
        notify(
          ctx,
          `不明な引数: ${args.trim()}。/auto-fugu on|off|status`,
          "warning",
        );
        return;
      }

      if (arg === "on") {
        enabled = true;
        manualOverrideActive = false;
      } else if (arg === "off") {
        enabled = false;
        clearNonRestorationPendingState();
        await restoreModelIfNeeded(ctx);
      } else {
        enabled = !enabled;
        if (enabled) {
          manualOverrideActive = false;
        } else {
          clearNonRestorationPendingState();
          await restoreModelIfNeeded(ctx);
        }
      }

      notify(ctx, `auto-fugu 自動切替: ${enabled ? "ON" : "OFF"}`);
    },
  });

  // 購読側が後ロードでも取りこぼさないよう、ping に応じて ready を再送する。
  pi.events.on(MODEL_ROUTER_PING_EVENT, () => {
    pi.events.emit(MODEL_ROUTER_READY_EVENT, undefined);
  });
  // /reload は session_start を再発火しないので、初期化直後にも ready を通知する。
  setTimeout(() => pi.events.emit(MODEL_ROUTER_READY_EVENT, undefined), 0);
}
