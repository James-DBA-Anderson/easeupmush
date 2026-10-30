import {
  applyNews,
  parseKnowledge,
  stanceFor,
  takeLine,
  upsertSource,
  type JimKnowledge,
  type JimSource,
  type JimSourceKind,
  type JimTake,
} from "./knowledge";
import { fetchPage, hostLabel, shortDate, type PageOk } from "./read";

/** Seed list — Jim prefers PFC / Pompey, then a little national. Decent ones rise as they load. */
export const SEED_SOURCES: JimSource[] = [
  {
    host: "portsmouthfc.co.uk",
    url: "https://www.portsmouthfc.co.uk/news",
    kind: "pfc",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
  {
    host: "bbc.co.uk",
    url: "https://feeds.bbci.co.uk/sport/football/teams/portsmouth/rss.xml",
    kind: "pfc",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
  {
    host: "bbc.co.uk",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    kind: "pfc",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
  {
    host: "portsmouth.co.uk",
    url: "https://www.portsmouth.co.uk/sport/football/portsmouth",
    kind: "pompey",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
  {
    host: "bbc.co.uk",
    url: "https://feeds.bbci.co.uk/news/england/hampshire/rss.xml",
    kind: "pompey",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
  {
    host: "bbc.co.uk",
    url: "https://feeds.bbci.co.uk/news/uk/rss.xml",
    kind: "nation",
    decent: false,
    blocked: false,
    lastOk: 0,
    lastFail: 0,
    hits: 0,
  },
];

const STALE_MS = 20 * 60 * 1000;
const MAX_PER_SWEEP = 3;
const MAX_ITEMS = 4;

export function withSeedSources(kb: JimKnowledge): JimKnowledge {
  let next = kb;
  for (const seed of SEED_SOURCES) {
    if (!next.sources.some((s) => s.url === seed.url)) {
      next = upsertSource(next, seed);
    }
  }
  return next;
}

export function sourceKindFor(url: string): JimSourceKind {
  const host = hostLabel(url);
  const blob = `${host} ${url}`.toLowerCase();
  if (/portsmouthfc|teams\/portsmouth|pompey/.test(blob)) return "pfc";
  if (/portsmouth\.co\.uk|hampshire|southsea|fratton|gosport|havant/.test(blob)) return "pompey";
  if (/bbc\.co\.uk\/news|\/news\/uk|guardian|independent|sky\.com\/news/.test(blob)) return "nation";
  return "page";
}

export function markSource(
  kb: JimKnowledge,
  url: string,
  ok: boolean,
  fail?: "dead" | "banned",
  kind?: JimSourceKind,
): { kb: JimKnowledge; firstDecent: boolean } {
  const host = hostLabel(url);
  const now = Date.now();
  const prev = kb.sources.find((s) => s.url === url) ?? kb.sources.find((s) => s.host === host && s.url.includes(host));
  const firstDecent = ok && !prev?.decent;
  const next: JimSource = {
    host,
    url: prev?.url === url || !prev ? url : prev.url,
    kind: kind ?? prev?.kind ?? sourceKindFor(url),
    decent: ok ? true : (prev?.decent ?? false),
    blocked: fail === "banned" ? true : ok ? false : (prev?.blocked ?? false),
    lastOk: ok ? now : (prev?.lastOk ?? 0),
    lastFail: ok ? (prev?.lastFail ?? 0) : now,
    hits: (prev?.hits ?? 0) + (ok ? 1 : 0),
  };
  if (!ok && fail !== "banned" && prev?.url === url) {
    next.url = url;
  }
  return { kb: upsertSource(kb, { ...next, url }), firstDecent };
}

export function pickSources(kb: JimKnowledge, now = Date.now()): JimSource[] {
  const book = withSeedSources(kb);
  const open = book.sources.filter((s) => !s.blocked && now - s.lastOk >= STALE_MS);
  open.sort((a, b) => {
    const decent = Number(b.decent) - Number(a.decent);
    if (decent) return decent;
    const kindRank = (k: JimSourceKind) => (k === "pfc" ? 0 : k === "pompey" ? 1 : k === "nation" ? 2 : 3);
    const kinds = kindRank(a.kind) - kindRank(b.kind);
    if (kinds) return kinds;
    return a.lastOk - b.lastOk || b.hits - a.hits;
  });
  const picked: JimSource[] = [];
  const seenHostKind = new Set<string>();
  for (const src of open) {
    if (picked.length >= MAX_PER_SWEEP) break;
    const key = `${src.host}:${src.kind}`;
    if (seenHostKind.has(key) && src.kind !== "nation") continue;
    seenHostKind.add(key);
    picked.push(src);
  }
  return picked;
}

export function takesFromPage(page: PageOk, kind: JimSourceKind): JimTake[] {
  const items = page.items.length
    ? page.items.slice(0, MAX_ITEMS)
    : [{ title: page.title, desc: page.text.slice(0, 180), date: page.date }];
  const out: JimTake[] = [];
  for (const item of items) {
    const claim = item.title.slice(0, 180);
    if (claim.length < 6) continue;
    const text = `${item.title} ${item.desc}`;
    const stance = stanceFor(text);
    out.push({
      claim,
      take: takeLine(stance, claim),
      stance,
      source: page.host,
      kind: kind === "page" ? "page" : "news",
      date: shortDate(item.date || page.date),
      at: Date.now(),
    });
  }
  return out;
}

export async function browseNews(store: {
  load(): Promise<unknown>;
  save(kb: JimKnowledge): Promise<void>;
}): Promise<void> {
  let kb = withSeedSources(parseKnowledge(await store.load()));
  const picks = pickSources(kb);
  if (!picks.length) {
    const seeded = withSeedSources(parseKnowledge(await store.load()));
    if (seeded.sources.length !== parseKnowledge(await store.load()).sources.length) {
      await store.save(seeded);
    }
    return;
  }
  for (const src of picks) {
    const page = await fetchPage(src.url);
    if (!page.ok) {
      kb = markSource(kb, src.url, false, page.fail, src.kind).kb;
      continue;
    }
    const marked = markSource(kb, src.url, true, undefined, src.kind);
    kb = applyNews(marked.kb, takesFromPage(page, src.kind));
  }
  await store.save(kb);
}

export function decentLine(_host: string): string {
  return "That site's decent, I'll remember that.";
}
