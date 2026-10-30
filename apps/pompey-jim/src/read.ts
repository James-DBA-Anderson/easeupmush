export type PageItem = {
  title: string;
  desc: string;
  date: string;
};

export type PageOk = {
  ok: true;
  url: string;
  host: string;
  title: string;
  text: string;
  date: string;
  items: PageItem[];
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

export function hostLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname
      .replace(/^www\./, "")
      .replace(/^feeds\./, "")
      .replace(/^bbci\.co\.uk$/i, "bbc.co.uk");
  } catch {
    return "site";
  }
}

export function shortDate(raw?: string | number | null): string {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return new Date(raw).toISOString().slice(0, 10);
  }
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw.trim());
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
    const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso?.[1]) return iso[1];
  }
  return new Date().toISOString().slice(0, 10);
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
        Accept: "application/rss+xml,application/xml,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (PompeyJim/1.0)",
      },
    });
    if (!res.ok) {
      return { ok: false, fail: failKind(allowed, res.status) };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/html|text|json|xml|rss|atom|markdown/i.test(ctype) && ctype) {
      return { ok: false, fail: "dead" };
    }
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > 200_000 ? buf.slice(0, 200_000) : buf;
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const host = hostLabel(res.url || allowed);
    if (/<rss[\s>]|<feed[\s>]|<item[\s>]/i.test(raw)) {
      const feed = rssToPage(raw);
      if (feed.items.length || feed.text.length >= 40) {
        return {
          ok: true,
          url: allowed,
          host,
          title: feed.title || host,
          text: feed.text.slice(0, 3500),
          date: feed.date,
          items: feed.items,
        };
      }
    }
    const page = htmlToText(raw);
    if (!page.title && page.text.length < 40) return { ok: false, fail: "dead" };
    return {
      ok: true,
      url: allowed,
      host,
      title: page.title,
      text: page.text.slice(0, 3500),
      date: page.date,
      items: page.title
        ? [{ title: page.title, desc: page.desc || page.text.slice(0, 220), date: page.date }]
        : [],
    };
  } catch {
    return { ok: false, fail: failKind(allowed) };
  } finally {
    clearTimeout(timer);
  }
}

export function rssToPage(xml: string): { title: string; text: string; date: string; items: PageItem[] } {
  const chanTitle = cleanTag(xml.match(/<channel[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const items: PageItem[] = [];
  for (const b of blocks.slice(0, 8)) {
    const title = cleanTag(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const desc = cleanTag(
      b.match(/<(?:description|summary|content:encoded)[^>]*>([\s\S]*?)<\/(?:description|summary|content:encoded)>/i)?.[1] ??
        "",
    ).slice(0, 220);
    const pub = cleanTag(
      b.match(/<(?:pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published|dc:date)>/i)?.[1] ??
        "",
    );
    if (title.length >= 6) {
      items.push({ title: title.slice(0, 150), desc, date: shortDate(pub) });
    }
  }
  const date = items[0]?.date ?? shortDate();
  const text = items.map((it) => `${it.date}: ${it.title}${it.desc ? ` — ${it.desc}` : ""}`).join("\n");
  return { title: items[0]?.title || chanTitle, text, date, items };
}

export function htmlToText(html: string): { title: string; desc: string; text: string; date: string } {
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
  const metaDate =
    html.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1] ??
    html.match(/<time[^>]*datetime=["']([^"']+)/i)?.[1] ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ??
    "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = [title, desc, stripped].filter(Boolean).join(" — ");
  return { title: title.slice(0, 140), desc: desc.slice(0, 220), text, date: shortDate(metaDate) };
}

function cleanTag(raw: string): string {
  return decode(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  );
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
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
