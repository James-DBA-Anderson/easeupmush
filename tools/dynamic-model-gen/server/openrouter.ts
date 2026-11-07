/** OpenRouter support for Meshbench — drop-in alternative to Ollama for chat/JSON generation. */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterOpts = {
  apiKey: string;
  model: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export async function openrouterChat({
  apiKey,
  model,
  system,
  temperature = 0.15,
  maxTokens = 1100,
}: OpenRouterOpts & { messages: Array<{ role: string; content: string }> }): Promise<string> {
  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: system ? [{ role: "system", content: system }] : [],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content");
  return content;
}

export function openrouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function openrouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-3.5-haiku";
}
