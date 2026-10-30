import { isFilthyName } from "../../backflip-bill/src/game/profanity.ts";
import { OPENING_LINE } from "./prompt";

export const KNOWLEDGE_KEY = "pompey-jim:knowledge";

const MAX_PEOPLE = 80;
const MAX_NOTES = 12;
const MAX_SHARED = 80;
const MAX_TAKES = 80;
const MAX_SOURCES = 40;
const MAX_NOTE_CHARS = 160;
const MAX_CLAIM = 180;
const MAX_TAKE = 220;
const MAX_NAME = 24;
const MAX_NOTEBOOK_CHARS = 3200;

export type JimPerson = {
  id: string;
  name: string | null;
  notes: string[];
  seen: number;
  updatedAt: number;
};

export type JimStance = "buy" | "beard" | "maybe";
export type JimTakeKind = "news" | "event" | "page" | "claim";

export type JimTake = {
  claim: string;
  take: string;
  stance: JimStance;
  source: string;
  kind: JimTakeKind;
  date: string;
  at: number;
};

export type JimSourceKind = "pfc" | "pompey" | "nation" | "page";

export type JimSource = {
  host: string;
  url: string;
  kind: JimSourceKind;
  decent: boolean;
  blocked: boolean;
  lastOk: number;
  lastFail: number;
  hits: number;
};

export type JimJob = {
  userId: string;
  url: string;
  query?: string;
  startedAt: number;
  status: "fetching" | "done" | "fail";
  fail?: "dead" | "banned";
  reply?: string;
};

export type JimKnowledge = {
  people: Record<string, JimPerson>;
  shared: string[];
  takes: JimTake[];
  sources: JimSource[];
  updatedAt: number;
};

export type JimExtract = {
  name: string | null;
  notes: string[];
  shared: string[];
  takes: JimTake[];
};

export function emptyKnowledge(): JimKnowledge {
  return { people: {}, shared: [], takes: [], sources: [], updatedAt: 0 };
}

export function clampUserId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  return id;
}

export function parseKnowledge(raw: unknown): JimKnowledge {
  const out = emptyKnowledge();
  if (!raw || typeof raw !== "object") return out;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt)) {
    out.updatedAt = rec.updatedAt;
  }
  if (Array.isArray(rec.shared)) {
    for (const row of rec.shared) {
      const note = cleanNote(row);
      if (note) out.shared.push(note);
    }
  }
  if (Array.isArray(rec.takes)) {
    for (const row of rec.takes) {
      const take = cleanTake(row);
      if (take) out.takes.push(take);
    }
  }
  if (Array.isArray(rec.sources)) {
    for (const row of rec.sources) {
      const src = cleanSource(row);
      if (src) out.sources.push(src);
    }
  }
  if (rec.people && typeof rec.people === "object" && !Array.isArray(rec.people)) {
    for (const [id, row] of Object.entries(rec.people as Record<string, unknown>)) {
      if (!clampUserId(id) || !row || typeof row !== "object") continue;
      const p = row as Record<string, unknown>;
      const notes: string[] = [];
      if (Array.isArray(p.notes)) {
        for (const n of p.notes) {
          const note = cleanNote(n);
          if (note) notes.push(note);
        }
      }
      out.people[id] = {
        id,
        name: cleanName(p.name),
        notes: notes.slice(0, MAX_NOTES),
        seen: typeof p.seen === "number" && Number.isFinite(p.seen) ? Math.max(0, Math.floor(p.seen)) : 0,
        updatedAt: typeof p.updatedAt === "number" && Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
      };
    }
  }
  return trimKnowledge(out);
}

export function applyExtract(kb: JimKnowledge, userId: string, extract: JimExtract, at = Date.now()): JimKnowledge {
  const people = { ...kb.people };
  const name = cleanName(extract.name);
  const matchId = name
    ? Object.values(people).find((p) => p.id !== userId && p.name?.toLowerCase() === name.toLowerCase())?.id
    : undefined;
  const match = matchId ? people[matchId] : undefined;
  if (matchId) delete people[matchId];
  const prev = people[userId] ?? match;
  const person: JimPerson = prev
    ? { ...prev, id: userId, notes: [...prev.notes] }
    : { id: userId, name: null, notes: [], seen: 0, updatedAt: at };
  if (match && prev !== match) {
    person.seen += match.seen;
    for (const note of match.notes) pushUnique(person.notes, note, MAX_NOTES);
  }
  person.seen += 1;
  person.updatedAt = at;
  if (name) person.name = name;
  for (const note of extract.notes) pushUnique(person.notes, note, MAX_NOTES);
  people[userId] = person;
  const shared = [...kb.shared];
  for (const note of extract.shared) pushUnique(shared, note, MAX_SHARED);
  const takes = [...kb.takes];
  for (const take of extract.takes) pushTake(takes, take);
  return trimKnowledge({ people, shared, takes, sources: kb.sources, updatedAt: at });
}

export function applyNews(kb: JimKnowledge, takes: JimTake[], at = Date.now()): JimKnowledge {
  const next = [...kb.takes];
  for (const take of takes) pushTake(next, take);
  return trimKnowledge({ ...kb, takes: next, updatedAt: at });
}

export function resolveSpeaker(kb: JimKnowledge, userId: string, hintName?: string | null): JimPerson | null {
  const direct = kb.people[userId];
  if (direct && (direct.name || direct.notes.length)) return direct;
  const name = cleanName(hintName);
  if (name) {
    const match = Object.values(kb.people).find((p) => p.name?.toLowerCase() === name.toLowerCase());
    if (match) return match;
  }
  return direct ?? null;
}

export function clampHintName(raw: unknown): string | null {
  return cleanName(raw);
}

export function touchSpeaker(kb: JimKnowledge, userId: string, at = Date.now()): JimKnowledge {
  return applyExtract(kb, userId, { name: null, notes: [], shared: [], takes: [] }, at);
}

export function formatNotebook(kb: JimKnowledge, userId: string, hintName?: string | null): string {
  const speaker = resolveSpeaker(kb, userId, hintName);
  const lines: string[] = [];
  if (!speaker || (!speaker.name && speaker.notes.length === 0 && speaker.seen === 0)) {
    const name = cleanName(hintName);
    lines.push(name ? `This mush: ${name} — no notes yet.` : "This mush: new face. You do not know their name. Ask.");
  } else {
    lines.push(`This mush: ${formatPerson(speaker)}`);
  }
  const speakerId = speaker?.id ?? userId;
  const others = Object.values(kb.people)
    .filter((p) => p.id !== speakerId && p.id !== userId && (p.name || p.notes.length))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 24);
  if (others.length) {
    lines.push("Other people (same book, any session):");
    for (const p of others) lines.push(`- ${formatPerson(p)}`);
  } else {
    lines.push("Other people: none yet.");
  }
  if (kb.shared.length) {
    lines.push("Shared:");
    for (const fact of kb.shared.slice(-24)) lines.push(`- ${fact}`);
  }
  const decent = kb.sources.filter((s) => s.decent && !s.blocked);
  if (decent.length) {
    lines.push(`Decent sources (prefer these): ${decent.map((s) => s.host).join(", ")}`);
  }
  const newsBits = pickNewsBits(kb.takes, 14);
  if (newsBits.length) {
    lines.push("News with dates and sources — weave ONE if it fits (prefer Pompey/PFC over national). Don't dump a bulletin.");
    for (const take of newsBits) {
      lines.push(`- ${take.date} [${take.kind}/${take.stance}] ${take.claim} (${take.source}) — ${take.take}`);
    }
  }
  let text = lines.join("\n");
  if (text.length > MAX_NOTEBOOK_CHARS) text = `${text.slice(0, MAX_NOTEBOOK_CHARS).trim()}…`;
  return text;
}

export function openingFor(kb: JimKnowledge, userId: string, hintName?: string | null): string {
  const p = resolveSpeaker(kb, userId, hintName);
  const name = p?.name ?? cleanName(hintName);
  if (name && p?.notes[0]) {
    return `Alright ${name} mush. Still ${shortHook(p.notes[0])}?`;
  }
  if (name) {
    return `Alright ${name} mush. You from Pompey or what?`;
  }
  if (p?.notes[0]) {
    return `Alright mush. I remember — ${shortHook(p.notes[0])}. What's your name?`;
  }
  return OPENING_LINE;
}

export function buildExtractPrompt(kb: JimKnowledge, userId: string, user: string, reply: string): string {
  return `Extract lasting facts for Pompey Jim's notebook. Return ONLY JSON:
{"name": string|null, "notes": string[], "shared": string[], "takes": [{"claim":string,"take":string,"stance":"buy"|"beard"|"maybe","kind":"news"|"event"|"claim","source":string}]}
Rules:
- name: this speaker's name if they stated it, else null
- notes: short third-person facts about THIS speaker only (where they're from, work, Pompey or not, likes)
- shared: solid background useful for ANY future visitor (the games, Fratton, the site)
- takes: news, events, rumours. Keep Jim's OPINION. People lie. stance buy = he believes it, beard = rubbish, maybe = not sure
- take must sound like Jim (short, Pompey). source is the speaker's name or "a mush"
- Skip greetings, jokes, links, and anything already in the notebook
- Empty arrays if nothing new
- No markdown

Notebook now:
${formatNotebook(kb, userId)}

Speaker just said: ${user}
Jim replied: ${reply}`;
}

export function parseExtract(raw: unknown): JimExtract {
  const empty: JimExtract = { name: null, notes: [], shared: [], takes: [] };
  const text = unwrapAi(raw);
  if (!text) return empty;
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  try {
    const rec = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    const notes: string[] = [];
    const shared: string[] = [];
    const takes: JimTake[] = [];
    if (Array.isArray(rec.notes)) for (const n of rec.notes) {
      const note = cleanNote(n);
      if (note) notes.push(note);
    }
    if (Array.isArray(rec.shared)) for (const n of rec.shared) {
      const note = cleanNote(n);
      if (note) shared.push(note);
    }
    if (Array.isArray(rec.takes)) for (const row of rec.takes) {
      const take = cleanTake(row);
      if (take) takes.push(take);
    }
    return { name: cleanName(rec.name), notes, shared, takes };
  } catch {
    return empty;
  }
}

export function heuristicExtract(user: string, source = "a mush"): JimExtract {
  const notes: string[] = [];
  const shared: string[] = [];
  const takes: JimTake[] = [];
  const name =
    match(user, /\b(?:i(?:['’]?m| am)|name['’]?s|call me|it\s+is)\s+([A-Za-z][A-Za-z'-]{1,20})\b/i) ??
    match(user, /\bit['’]?s\s+([A-Z][a-z]{1,20})\b/);
  const from = match(user, /\b(?:from|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
  if (from && !/pompey|portsmouth|fratton|here/i.test(from)) {
    notes.push(`From ${from}`);
  }
  if (/\bfrom pompey\b|\bi['’]?m pompey\b|live in pompey|portsmouth/i.test(user)) {
    notes.push("From Pompey");
  }
  if (/\bscumm/i.test(user)) shared.push("Someone brought up scummers");
  if (/\bfratton\b/i.test(user)) notes.push("Talks about Fratton");
  if (/\bshant\b|\bpint\b|\bpub\b/i.test(user)) notes.push("Likes a shant");
  if (looksLikeNews(user) && !askingForNews(user)) {
    const stance = stanceFor(user);
    takes.push({
      claim: user.slice(0, MAX_CLAIM),
      take: takeLine(stance, user),
      stance,
      source: cleanName(source) ?? source,
      kind: /\b(match|kick\s*off|tonight|saturday|event|gig)\b/i.test(user) ? "event" : "news",
      date: new Date().toISOString().slice(0, 10),
      at: Date.now(),
    });
  }
  return { name: cleanName(name), notes, shared, takes };
}

export function looksLikeNews(user: string): boolean {
  return /\b(news|rumour|rumor|heard|apparently|reckon|happened|match|kick\s*off|signed|sacked|fired|won|lost|tonight|breaking)\b/i.test(
    user,
  );
}

/** Questions / prompts — don't file these as claims in the notebook. */
export function askingForNews(user: string): boolean {
  return /\b(any|got|what(?:'s|s)?|tell me|got any|heard any)\b.*\b(news|paper|headline|rumour|match)\b/i.test(
    user,
  ) || /\b(news|paper|headline)\s*\?/i.test(user);
}

export function stanceFor(text: string): JimStance {
  const t = text.toLowerCase();
  if (/scumm|southampton|saints|messi|ronaldo|premier league champions|won the league/.test(t)) return "beard";
  if (/fratton|pompey|blues|southsea|canoe lake/.test(t) && !/scumm/.test(t)) return "buy";
  if (/alien|conspiracy|fake|swear down|100%|definitely/.test(t)) return "beard";
  return "maybe";
}

export function takeLine(stance: JimStance, claim: string): string {
  const hook = claim.replace(/\s+/g, " ").trim().slice(0, 72);
  if (stance === "beard") return hook ? `Beard. ${hook}? That ain't it mush.` : "Beard. Beard on tash. That ain't it mush.";
  if (stance === "buy") return hook ? `Yeah that tracks — ${hook}.` : "Yeah that tracks. Fratton noise, that.";
  return hook ? `Maybe. I'll clock it. ${hook}` : "Maybe. I'll clock it.";
}

export function failReply(fail: "dead" | "banned"): string {
  if (fail === "banned") return "They've banned me off that site mush. Aint loading.";
  return "Aint working for me mush. Page is hanging.";
}

export function parseJob(raw: unknown): JimJob | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const userId = clampUserId(rec.userId);
  const url = typeof rec.url === "string" ? rec.url : "";
  if (!userId || !url) return null;
  const status = rec.status === "done" || rec.status === "fail" ? rec.status : "fetching";
  const fail = rec.fail === "banned" || rec.fail === "dead" ? rec.fail : undefined;
  return {
    userId,
    url,
    startedAt: typeof rec.startedAt === "number" ? rec.startedAt : 0,
    status,
    fail,
    reply: typeof rec.reply === "string" ? rec.reply : undefined,
  };
}

function formatPerson(p: JimPerson): string {
  const who = p.name ?? "no name yet";
  const bits = p.notes.length ? p.notes.join("; ") : "no notes yet";
  return `${who} — ${bits}`;
}

function shortHook(note: string): string {
  return note.replace(/\.$/, "").replace(/^(from|likes|talks about)\s+/i, (m) => m.toLowerCase());
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_NAME) return null;
  if (!/^[\p{L}][\p{L} .'\-]*$/u.test(name)) return null;
  if (
    /^(mush|geez|mate|jim|pompey|portsmouth|from|here|back|again|hanging|fine|good|alright|okay|well|skint|broke|tired|ready|going|down|out)$/i.test(
      name,
    )
  ) {
    return null;
  }
  if (isFilthyName(name)) return null;
  return name.replace(/^\w/, (c) => c.toUpperCase());
}

function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/\s+/g, " ").trim();
  if (note.length < 4 || note.length > MAX_NOTE_CHARS) return null;
  return note;
}

function pushUnique(list: string[], raw: string, cap: number): void {
  const note = cleanNote(raw);
  if (!note) return;
  const key = note.toLowerCase();
  if (list.some((n) => n.toLowerCase() === key || n.toLowerCase().includes(key) || key.includes(n.toLowerCase()))) {
    return;
  }
  list.push(note);
  if (list.length > cap) list.splice(0, list.length - cap);
}

function cleanTake(raw: unknown): JimTake | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const claim = typeof rec.claim === "string" ? rec.claim.replace(/\s+/g, " ").trim().slice(0, MAX_CLAIM) : "";
  const take = typeof rec.take === "string" ? rec.take.replace(/\s+/g, " ").trim().slice(0, MAX_TAKE) : "";
  if (claim.length < 4 || take.length < 4) return null;
  const stance: JimStance = rec.stance === "buy" || rec.stance === "beard" ? rec.stance : "maybe";
  const kind: JimTakeKind =
    rec.kind === "news" || rec.kind === "event" || rec.kind === "page" ? rec.kind : "claim";
  const source =
    typeof rec.source === "string" && rec.source.trim()
      ? rec.source
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^bbci\.co\.uk$/i, "bbc.co.uk")
          .slice(0, 40)
      : "a mush";
  return {
    claim,
    take,
    stance,
    source,
    kind,
    date:
      typeof rec.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.date)
        ? rec.date
        : new Date(typeof rec.at === "number" && Number.isFinite(rec.at) ? rec.at : Date.now())
            .toISOString()
            .slice(0, 10),
    at: typeof rec.at === "number" && Number.isFinite(rec.at) ? rec.at : Date.now(),
  };
}

function cleanSource(raw: unknown): JimSource | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const host =
    typeof rec.host === "string"
      ? rec.host
          .replace(/^www\./, "")
          .replace(/^feeds\./, "")
          .replace(/^bbci\.co\.uk$/i, "bbc.co.uk")
          .trim()
          .slice(0, 80)
      : "";
  const url = typeof rec.url === "string" ? rec.url.trim().slice(0, 240) : "";
  if (!host || !url) return null;
  const kind: JimSourceKind =
    rec.kind === "pfc" || rec.kind === "pompey" || rec.kind === "nation" || rec.kind === "page" ? rec.kind : "page";
  return {
    host,
    url,
    kind,
    decent: rec.decent === true,
    blocked: rec.blocked === true,
    lastOk: typeof rec.lastOk === "number" && Number.isFinite(rec.lastOk) ? rec.lastOk : 0,
    lastFail: typeof rec.lastFail === "number" && Number.isFinite(rec.lastFail) ? rec.lastFail : 0,
    hits: typeof rec.hits === "number" && Number.isFinite(rec.hits) ? Math.max(0, Math.floor(rec.hits)) : 0,
  };
}

export function upsertSource(kb: JimKnowledge, next: JimSource): JimKnowledge {
  const sources = kb.sources.map((s) => ({ ...s }));
  const idx = sources.findIndex((s) => s.url === next.url);
  if (idx >= 0) sources[idx] = { ...sources[idx], ...next };
  else sources.push(next);
  if (sources.length > MAX_SOURCES) {
    sources.sort((a, b) => Number(b.decent) - Number(a.decent) || b.hits - a.hits || b.lastOk - a.lastOk);
    sources.length = MAX_SOURCES;
  }
  return { ...kb, sources, updatedAt: Date.now() };
}

/** Site-sourced takes, Pompey/PFC first then a little national. */
export function pickNewsBits(takes: JimTake[], limit = 12): JimTake[] {
  const site = takes.filter((t) => (t.kind === "news" || t.kind === "event" || t.kind === "page") && /\./.test(t.source));
  const pompey = (t: JimTake) =>
    /portsmouth|pompey|fratton|millwall|mousinho|blues|gosport|havant|southsea|hampshire/i.test(t.claim + t.source);
  const local = site.filter(pompey);
  const nation = site.filter((t) => !pompey(t));
  return [...local.slice(-Math.max(8, Math.ceil(limit * 0.7))), ...nation.slice(-Math.max(3, Math.floor(limit * 0.3)))]
    .slice(-limit)
    .reverse();
}

function pushTake(list: JimTake[], raw: JimTake): void {
  const take = cleanTake(raw);
  if (!take) return;
  const key = take.claim.toLowerCase();
  const i = list.findIndex((t) => t.claim.toLowerCase() === key);
  if (i >= 0) list[i] = take;
  else list.push(take);
  if (list.length > MAX_TAKES) list.splice(0, list.length - MAX_TAKES);
}

function trimKnowledge(kb: JimKnowledge): JimKnowledge {
  const shared = kb.shared.slice(-MAX_SHARED);
  const takes = kb.takes.slice(-MAX_TAKES);
  const people = { ...kb.people };
  const ids = Object.keys(people);
  if (ids.length > MAX_PEOPLE) {
    const ranked = ids.sort((a, b) => {
      const pa = people[a];
      const pb = people[b];
      const na = pa?.name ? 1 : 0;
      const nb = pb?.name ? 1 : 0;
      if (nb !== na) return nb - na;
      return (pa?.updatedAt ?? 0) - (pb?.updatedAt ?? 0);
    });
    for (const id of ranked.slice(0, ids.length - MAX_PEOPLE)) delete people[id];
  }
  return { people, shared, takes, sources: kb.sources.slice(0, MAX_SOURCES), updatedAt: kb.updatedAt };
}

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ?? null;
}

function unwrapAi(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const rec = raw as Record<string, unknown>;
  if (typeof rec.response === "string") return rec.response;
  if (typeof rec.result === "string") return rec.result;
  const nested = rec.result;
  if (nested && typeof nested === "object" && typeof (nested as { response?: unknown }).response === "string") {
    return (nested as { response: string }).response;
  }
  return "";
}
