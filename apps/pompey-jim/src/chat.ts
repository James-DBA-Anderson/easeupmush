import { OPENING_LINE, type ChatTurn } from "./prompt";

export const CHAT_API = "/api/pompey-jim/chat";

export type JimMood = "idle" | "think" | "talk" | "copped";

export type ChatState = {
  history: ChatTurn[];
  lastUser: string;
  lastJim: string;
  mood: JimMood;
  error: string;
};

export function initialChat(): ChatState {
  return {
    history: [{ role: "assistant", content: OPENING_LINE }],
    lastUser: "",
    lastJim: OPENING_LINE,
    mood: "talk",
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
    }),
  });
  let reply = "";
  let error = "";
  try {
    const body = (await res.json()) as { reply?: unknown; error?: unknown };
    if (typeof body.reply === "string") reply = body.reply.trim();
    if (typeof body.error === "string") error = body.error;
  } catch {
    error = "Couldn't read him mush.";
  }
  if (!res.ok || !reply) {
    return {
      ...state,
      lastUser: user,
      lastJim: fallbackLine(error),
      mood: "copped",
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
    mood: moodFrom(reply),
    error: "",
  };
}

function moodFrom(reply: string): JimMood {
  const t = reply.toLowerCase();
  if (/copped|scummer|dinlo|ease up/.test(t)) return "copped";
  return "talk";
}

function fallbackLine(error: string): string {
  if (/filth/i.test(error)) return "Ease up mush, keep it decent.";
  return "Hang on mush, I'm hanging too hard to think. Say that again.";
}
