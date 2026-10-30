import { clampHistory, OPENING_LINE, type ChatTurn } from "./prompt";

export const CHAT_API = "/api/pompey-jim/chat";
const USER_KEY = "pompey-jim-user";
const CARD_KEY = "pompey-jim-session";

export type SessionCard = {
  id: string;
  name: string | null;
  history: ChatTurn[];
  lastUser: string;
  lastJim: string;
};

export function visitorId(): string {
  const valid = (raw: string | null | undefined): string | null => {
    const s = raw?.trim();
    return s && /^[a-zA-Z0-9_-]{8,64}$/.test(s) ? s : null;
  };
  const fromStore =
    readStore(sessionStorage, USER_KEY) ??
    readStore(localStorage, USER_KEY) ??
    readCookie(USER_KEY);
  const id = valid(fromStore) ?? makeId();
  writeStore(sessionStorage, USER_KEY, id);
  writeStore(localStorage, USER_KEY, id);
  writeCookie(USER_KEY, id);
  return id;
}

export function loadCard(): SessionCard {
  const id = visitorId();
  const raw = readStore(sessionStorage, CARD_KEY) ?? readStore(localStorage, CARD_KEY);
  if (raw) {
    try {
      const rec = JSON.parse(raw) as Record<string, unknown>;
      const history = clampHistory(rec.history);
      const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : null;
      const lastUser = typeof rec.lastUser === "string" ? rec.lastUser : "";
      const lastJim =
        typeof rec.lastJim === "string" && rec.lastJim.trim()
          ? rec.lastJim.trim()
          : history.filter((t) => t.role === "assistant").slice(-1)[0]?.content ?? OPENING_LINE;
      return {
        id,
        name,
        history: history.length ? history : [{ role: "assistant", content: lastJim }],
        lastUser,
        lastJim,
      };
    } catch {
      /* corrupt cache */
    }
  }
  return {
    id,
    name: null,
    history: [{ role: "assistant", content: OPENING_LINE }],
    lastUser: "",
    lastJim: OPENING_LINE,
  };
}

export function saveCard(next: {
  name?: string | null;
  history: ChatTurn[];
  lastUser: string;
  lastJim: string;
}): void {
  const prev = loadCard();
  const card: SessionCard = {
    id: prev.id,
    name: next.name ?? prev.name,
    history: next.history.slice(-12),
    lastUser: next.lastUser,
    lastJim: next.lastJim,
  };
  const json = JSON.stringify(card);
  writeStore(sessionStorage, CARD_KEY, json);
  writeStore(localStorage, CARD_KEY, json);
}

export type JimMood = "idle" | "think" | "talk" | "copped" | "read";

export type ChatState = {
  history: ChatTurn[];
  lastUser: string;
  lastJim: string;
  mood: JimMood;
  reading: boolean;
  error: string;
};

export async function greetJim(): Promise<ChatState> {
  const card = loadCard();
  const state = initialChat();
  try {
    const q = new URLSearchParams({ user: card.id });
    if (card.name) q.set("name", card.name);
    const res = await fetch(`${CHAT_API}?${q.toString()}`);
    if (!res.ok) return state;
    const body = (await res.json()) as { reply?: unknown; name?: unknown };
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : card.name;
    const reply = typeof body.reply === "string" && body.reply.trim() ? body.reply.trim() : state.lastJim;
    const hadTurns = card.history.some((t) => t.role === "user");
    const history: ChatTurn[] = hadTurns ? card.history : [{ role: "assistant", content: reply }];
    const next: ChatState = {
      ...state,
      history,
      lastJim: reply,
    };
    saveCard({ name, history: next.history, lastUser: next.lastUser, lastJim: next.lastJim });
    return next;
  } catch {
    return state;
  }
}

export function initialChat(): ChatState {
  const card = loadCard();
  return {
    history: card.history,
    lastUser: card.lastUser,
    lastJim: card.lastJim,
    mood: moodFrom(card.lastJim),
    reading: false,
    error: "",
  };
}

export async function askJim(state: ChatState, user: string): Promise<ChatState> {
  const card = loadCard();
  const res = await fetch(CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: user,
      history: state.history.slice(-8),
      user: card.id,
      name: card.name,
    }),
  });
  let reply = "";
  let error = "";
  let reading = false;
  let name: string | null = card.name;
  try {
    const body = (await res.json()) as { reply?: unknown; error?: unknown; reading?: unknown; name?: unknown };
    if (typeof body.reply === "string") reply = body.reply.trim();
    if (typeof body.error === "string") error = body.error;
    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim();
    reading = body.reading === true;
  } catch {
    error = "Couldn't read him mush.";
  }
  if (!res.ok || !reply) {
    return {
      ...state,
      lastUser: user,
      lastJim: fallbackLine(error),
      mood: "copped",
      reading: false,
      error: error || "Jim's hanging too hard to talk.",
    };
  }
  const next: ChatTurn[] = [
    ...state.history,
    { role: "user" as const, content: user },
    { role: "assistant" as const, content: reply },
  ].slice(-16);
  saveCard({ name, history: next, lastUser: user, lastJim: reply });
  return {
    history: next,
    lastUser: user,
    lastJim: reply,
    mood: reading ? "read" : moodFrom(reply),
    reading,
    error: "",
  };
}

export async function peekJim(): Promise<{ reply?: string; reading: boolean }> {
  const res = await fetch(`${CHAT_API}?user=${encodeURIComponent(visitorId())}&job=1`);
  if (!res.ok) return { reading: false };
  const body = (await res.json()) as { reply?: unknown; reading?: unknown };
  return {
    reading: body.reading === true,
    reply: typeof body.reply === "string" ? body.reply.trim() : undefined,
  };
}

function moodFrom(reply: string): JimMood {
  const t = reply.toLowerCase();
  if (/copped|scummer|dinlo|ease up/.test(t)) return "copped";
  if (/beard/.test(t)) return "copped";
  return "talk";
}

function fallbackLine(error: string): string {
  if (/filth/i.test(error)) return "Ease up mush, keep it decent.";
  return "Hang on mush, I'm hanging too hard to think. Say that again.";
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `mush-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
  }
}

function readStore(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStore(store: Storage | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

function readCookie(name: string): string | null {
  try {
    const hit = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* cookie blocked */
  }
}
