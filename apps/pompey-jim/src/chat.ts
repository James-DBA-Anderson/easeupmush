import { OPENING_LINE, type ChatTurn } from "./prompt";

export const CHAT_API = "/api/pompey-jim/chat";
const USER_KEY = "pompey-jim-user";

export function visitorId(): string {
  try {
    const had = localStorage.getItem(USER_KEY)?.trim();
    if (had && /^[a-zA-Z0-9_-]{8,64}$/.test(had)) return had;
    const id = crypto.randomUUID();
    localStorage.setItem(USER_KEY, id);
    return id;
  } catch {
    return "anon-unknown";
  }
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
  const state = initialChat();
  try {
    const res = await fetch(`${CHAT_API}?user=${encodeURIComponent(visitorId())}`);
    if (!res.ok) return state;
    const body = (await res.json()) as { reply?: unknown };
    if (typeof body.reply !== "string" || !body.reply.trim()) return state;
    const reply = body.reply.trim();
    return {
      ...state,
      history: [{ role: "assistant", content: reply }],
      lastJim: reply,
    };
  } catch {
    return state;
  }
}

export function initialChat(): ChatState {
  return {
    history: [{ role: "assistant", content: OPENING_LINE }],
    lastUser: "",
    lastJim: OPENING_LINE,
    mood: "talk",
    reading: false,
    error: "",
  };
}

export async function askJim(state: ChatState, user: string): Promise<ChatState> {
  const res = await fetch(CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: user,
      history: state.history.slice(-8),
      user: visitorId(),
    }),
  });
  let reply = "";
  let error = "";
  let reading = false;
  try {
    const body = (await res.json()) as { reply?: unknown; error?: unknown; reading?: unknown };
    if (typeof body.reply === "string") reply = body.reply.trim();
    if (typeof body.error === "string") error = body.error;
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
    { role: "user", content: user },
    { role: "assistant", content: reply },
  ];
  return {
    history: next.slice(-16),
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
