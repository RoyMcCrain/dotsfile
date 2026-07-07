import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MIN_OPENAI_OUTPUT_TOKENS = 16;

const isObjectPayload = (payload: unknown): payload is Record<string, unknown> => {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
};

export default function clampOpenAIOutputTokens(pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    if (!isObjectPayload(event.payload)) return;

    const maxOutputTokens = event.payload.max_output_tokens;
    if (typeof maxOutputTokens !== "number") return;
    if (!Number.isFinite(maxOutputTokens)) return;
    if (maxOutputTokens >= MIN_OPENAI_OUTPUT_TOKENS) return;

    return {
      ...event.payload,
      max_output_tokens: MIN_OPENAI_OUTPUT_TOKENS,
    };
  });
}
