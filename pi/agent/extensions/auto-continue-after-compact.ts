/**
 * 自動コンパクト後に、中断した作業を自動継続する拡張。
 *
 * why: pi は overflow 型の自動コンパクト（LLM 呼び出し中に context 超過）なら
 * willRetry:true で中断ターンを自動リトライするが、threshold 型
 * （ターン完了後に閾値超過で発火）や、リトライされない overflow ではそこで
 * 会話が止まる。長時間の自律作業ではここで手が止まるので、コンパクト直後の
 * idle 時に継続メッセージを 1 通だけ送って作業を再開させる。
 */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const MODEL_ROUTER_READY_EVENT = "auto-fugu:ready";
const MODEL_ROUTER_PING_EVENT = "auto-fugu:ping";
const MODEL_SETTLED_EVENT = "auto-fugu:model-settled";
const CONTINUE_MESSAGE =
  "(自動継続) 直前に自動コンパクトが実行されました。要約と直近の文脈をもとに、" +
  "中断していた作業をそのまま続けてください。すでに完了している場合は、" +
  "その旨だけ短く報告して追加の作業はしないでください。";

export default function autoContinueAfterCompact(pi: ExtensionAPI) {
  // コンパクト検知から settle まで持ち越し、idle になった瞬間に 1 回だけ継続する
  let continueAfterSettle = false;
  let continueTimer: ReturnType<typeof setTimeout> | undefined;
  let modelRouterActive = false;
  let modelRouterSettled = false;
  let settledContext: ExtensionContext | undefined;
  let settleFallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const clearContinueTimer = () => {
    if (continueTimer !== undefined) {
      clearTimeout(continueTimer);
      continueTimer = undefined;
    }
  };

  const clearSettleFallback = () => {
    if (settleFallbackTimer !== undefined) {
      clearTimeout(settleFallbackTimer);
      settleFallbackTimer = undefined;
    }
  };

  const startSettleFallback = (_ctx: ExtensionContext) => {
    clearSettleFallback();
    // model-settled イベントが来なくても継続を失わないための保険。
    settleFallbackTimer = setTimeout(() => {
      settleFallbackTimer = undefined;
      if (settledContext) scheduleContinue(settledContext);
    }, 2000);
  };

  const scheduleContinue = (ctx: ExtensionContext) => {
    clearSettleFallback();
    clearContinueTimer();
    // The event reschedules this fallback after auto-fugu finishes restoring.
    continueTimer = setTimeout(() => {
      continueTimer = undefined;
      settledContext = undefined;
      try {
        if (!ctx.isIdle()) return;
        pi.sendUserMessage(CONTINUE_MESSAGE);
      } catch {
        // reload / shutdown で ctx/pi が無効化されても落とさない
      }
    }, 0);
  };

  const unsubscribeModelReady = pi.events.on(MODEL_ROUTER_READY_EVENT, () => {
    modelRouterActive = true;
  });
  // 先にロード済みの auto-fugu がいれば ready を返させてロード順依存をなくす。
  pi.events.emit(MODEL_ROUTER_PING_EVENT, undefined);

  const unsubscribeModelSettled = pi.events.on(MODEL_SETTLED_EVENT, () => {
    clearSettleFallback();
    modelRouterSettled = true;
    if (!settledContext) return;
    scheduleContinue(settledContext);
  });

  pi.on("session_compact", (event) => {
    // 手動 /compact は対象外。willRetry:true は pi が自動リトライ済みなので対象外。
    if (event.reason !== "manual" && !event.willRetry) {
      continueAfterSettle = true;
    }
  });

  pi.on("agent_start", () => {
    modelRouterSettled = false;
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!continueAfterSettle) return;
    continueAfterSettle = false;
    settledContext = ctx;
    if (!modelRouterActive || modelRouterSettled) {
      scheduleContinue(ctx);
    } else {
      startSettleFallback(ctx);
    }
  });

  pi.on("session_shutdown", () => {
    continueAfterSettle = false;
    modelRouterSettled = false;
    settledContext = undefined;
    clearSettleFallback();
    clearContinueTimer();
    unsubscribeModelReady();
    unsubscribeModelSettled();
  });
}
