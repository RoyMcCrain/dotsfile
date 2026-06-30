import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ModelList {
  data?: Array<{
    id: string;
    name?: string;
    context_window?: number;
    max_tokens?: number;
  }>;
}

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export default async function localOpenAI(pi: ExtensionAPI) {
  const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";

  try {
    const response = await fetchWithTimeout(`${baseUrl}/models`, 1500);
    if (!response.ok) return;

    const payload = (await response.json()) as ModelList;
    const models = payload.data ?? [];
    if (models.length === 0) return;

    pi.registerProvider("lm-studio", {
      name: "LM Studio",
      baseUrl,
      apiKey: process.env.LM_STUDIO_API_KEY
        ? "$LM_STUDIO_API_KEY"
        : "lm-studio",
      api: "openai-completions",
      models: models.map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: model.context_window ?? 128000,
        maxTokens: model.max_tokens ?? 4096,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
      })),
    });
  } catch {
    // Local endpoints are optional; keep Pi startup quiet when LM Studio is offline.
  }
}
