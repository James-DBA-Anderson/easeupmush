export type PageOk = {
  ok: true;
  url: string;
  host: string;
  title: string;
  text: string;
};

export type PageFail = {
  ok: false;
  fail: "dead" | "banned";
};

export type PageResult = PageOk | PageFail;

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)\]]+/gi;
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|::1|\[::1\])/i;

export function findLink(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m?.[0]) return null;
  let s = m[0].replace(/[.,;:!?]+$/g, "");
  if (s.startsWith("www.")) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function publicHttpUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith("www.")) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || PRIVATE_HOST.test(host) || host.endsWith(".local") || host === "0.0.0.0") return null;
  if (/^(metadata|metadata\.google\.internal)$/i.test(host)) return null;
  return u.toString();
}

export async function fetchPage(url: string): Promise<PageResult> {
  const allowed = publicHttpUrl(url);
  if (!allowed) return { ok: false, fail: "dead" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(allowed, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (PompeyJim/1.0)",
      },
    });
    if (!res.ok) {
      return { ok: false, fail: failKind(allowed, res.status) };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/html|text|json|xml|markdown/i.test(ctype) && ctype) {
      return { ok: false, fail: "dead" };
    }
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > 180_000 ? buf.slice(0, 180_000) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const { title, text } = htmlToText(html);
    if (!title && text.length < 40) return { ok: false, fail: "dead" };
    const host = new URL(res.url || allowed).hostname.replace(/^www\./, "");
    return { ok: true, url: allowed, host, title, text: text.slice(0, 3500) };
  } catch {
    return { ok: false, fail: failKind(allowed) };
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decode(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1] ??
      "",
  );
  const desc = decode(
    html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)?.[1] ??
      html.match(/name=["']description["'][^>]*content=["']([^"']+)/i)?.[1] ??
      "",
  );
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = [title, desc, stripped].filter(Boolean).join(" — ");
  return { title: title.slice(0, 140), text };
}

function failKind(url: string, status?: number): "dead" | "banned" {
  if (status === 401 || status === 403 || status === 451 || status === 429) return "banned";
  if (status && status >= 400) return "dead";
  let n = 0;
  for (let i = 0; i < url.length; i++) n = (n + url.charCodeAt(i)) % 5;
  return n === 0 ? "banned" : "dead";
}

function decode(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
