/** OpenRouter support for Spritebench image generation. */
export type OpenRouterImageOpts = {
  apiKey: string;
  model: string;
  prompt: string;
  width?: number;
  height?: number;
};

export async function openrouterImage({
  apiKey,
  model,
  prompt,
  width = 512,
  height = 512,
}: OpenRouterImageOpts): Promise<{ imageBase64: string; model: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: `${width}x${height}`,
      response_format: "b64_json",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenRouter returned no image");
  return { imageBase64: b64, model };
}

export function openrouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function openrouterImageModel(): string {
  return process.env.OPENROUTER_IMAGE_MODEL?.trim() || "openai/dall-e-3";
}
