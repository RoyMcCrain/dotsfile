/**
 * 自動コンパクト後に、中断した作業を自動継続する拡張。
 *
 * why: pi は overflow 型の自動コンパクト（LLM 呼び出し中に context 超過）なら
 * willRetry:true で中断ターンを自動リトライするが、threshold 型
 * （ターン完了後に閾値超過で発火）や、リトライされない overflow ではそこで
 * 会話が止まる。長時間の自律作業ではここで手が止まるので、コンパクト直後の
 * idle 時に継続メッセージを 1 通だけ送って作業を再開させる。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONTINUE_MESSAGE =
  "(自動継続) 直前に自動コンパクトが実行されました。要約と直近の文脈をもとに、" +
  "中断していた作業をそのまま続けてください。すでに完了している場合は、" +
  "その旨だけ短く報告して追加の作業はしないでください。";

export default function autoContinueAfterCompact(pi: ExtensionAPI) {
  // コンパクト検知から settle まで持ち越し、idle になった瞬間に 1 回だけ継続する
  let continueAfterSettle = false;

  pi.on("session_compact", (event) => {
    // 手動 /compact は対象外。willRetry:true は pi が自動リトライ済みなので対象外。
    if (event.reason !== "manual" && !event.willRetry) {
      continueAfterSettle = true;
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!continueAfterSettle) return;
    continueAfterSettle = false; // 継続は 1 回だけ（多重・無限ループ防止）
    if (!ctx.isIdle()) return;
    pi.sendUserMessage(CONTINUE_MESSAGE);
  });
}
