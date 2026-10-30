/** Try Wikipedia for a quick factual answer. */
export type LookupResult = {
  title: string;
  extract: string;
  url: string;
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (PompeyJim/1.0)",
  Accept: "application/json",
};

export async function lookUp(query: string): Promise<LookupResult | null> {
  const search = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&origin=*`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(search, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const results = ((data.query as Record<string, unknown>)?.search as Array<Record<string, unknown>>) ?? [];
    if (!results.length) return null;
    const top = results[0];
    const title = (top.title as string) ?? "";
    if (!title) return null;
    const summary = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const sres = await fetch(summary, { headers: HEADERS, signal: ctrl.signal });
    if (!sres.ok) return null;
    const sd = (await sres.json()) as Record<string, unknown>;
    const extract = (sd.extract as string) ?? "";
    if (!extract) return null;
    return { title, extract: extract.trim().slice(0, 600), url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const GREET = /\b(hi|hello|hey|yo|alright|ok|okay|thanks|cheers|bye|goodnight|good morning)\b/iu;

const SOCIAL = /\b(name|how are you|what.'s up|age|old are you|where do you live|from)\b/iu;

/** Does the message sound like it wants real info from a page? */
export function looksLikeLookup(user: string): boolean {
  const t = user.trim();
  if (t.length < 8 || t.length > 200) return false;
  if (GREET.test(t) && t.length < 40) return false;
  if (SOCIAL.test(t)) return false;
  if (/\s*\?$/.test(t) && t.length > 20) return true;
  if (/\b(who|what|when|where|how|why|is|are|did|does|do|was|were)\b/i.test(t)) return true;
  return false;
}
