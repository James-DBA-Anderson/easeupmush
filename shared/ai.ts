/** Shared AI runners — any game that needs a cheap local chat can grab one. */
export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AiOpts = {
  max_tokens: number;
  temperature: number;
};

/** Generic runner returned by any provider. */
export type AiRunner = (messages: ChatMessage[], opts: AiOpts) => Promise<unknown>;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

function openRouterAi(key: string, model?: string): AiRunner {
  const m = model || "anthropic/claude-3.5-haiku";
  return async (messages, opts) => {
    const res = await fetch(OPENROUTER_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: m, messages, ...opts }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    return res.json();
  };
}

function cloudflareAi(token: string, account: string, model?: string): AiRunner {
  const m = model || "@cf/meta/llama-3.2-3b-instruct";
  return async (messages, opts) => {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${m}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages, ...opts }),
      },
    );
    if (!res.ok) throw new Error(`Workers AI ${res.status}`);
    return res.json();
  };
}

/** Return an AI runner if credentials are found in env.
 * Priority: Cloudflare (Workers AI) → OpenRouter → null.
 * Set `OPENROUTER_API_KEY` in your `.env` to use OpenRouter locally.
 * Optionally set `OPENROUTER_MODEL` (defaults to `anthropic/claude-3.5-haiku`).
 */
export function makeAiRunner(): AiRunner | null {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (cfToken && cfAccount) {
    return cloudflareAi(cfToken, cfAccount, process.env.CLOUDFLARE_MODEL);
  }
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return openRouterAi(orKey, process.env.OPENROUTER_MODEL);
  }
  return null;
}
