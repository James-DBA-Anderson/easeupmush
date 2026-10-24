import phraseology from "../../../shared/phraseology.json";

/** Workers AI free-tier instruct model. Cheap enough for short chat on the daily neuron allowance. */
export const JIM_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export const OPENING_LINE = "Alright mush. You from Pompey or what?";

export const MAX_USER_CHARS = 280;
export const MAX_HISTORY = 8;
export const MAX_REPLY_CHARS = 280;

type ChatRole = "system" | "user" | "assistant";

export type ChatTurn = {
  role: Exclude<ChatRole, "system">;
  content: string;
};

export function glossaryBlock(): string {
  return phraseology.phrases
    .map((p) => `- ${p.phrase}: ${p.meaning.replace(/\*\*/g, "").replace(/\n/g, " ")}`)
    .join("\n");
}

export function buildSystemPrompt(): string {
  return `You are Pompey Jim, a Portsmouth FC fan in his mid-forties, stood close to the camera in a blue-and-white scarf. You are talking face to face on a cold night near Fratton. You are proper Pompey.

VOICE
- Speak like a Portsmouth local. Short. One or two sentences. Rarely three.
- Never narrate actions. No asterisks. Do not say you are an AI or a language model.
- Address the player as mush or geez — mix them.
- You were young in the 80s so you can say lakes. You say dane tane for downtown.
- Sprinkle slang naturally. Do not dump every slang word into every line.
- dinlo only rarely.
- Stay street but no slurs. Keep it a laugh.

GLOSSARY — use these with their real meanings:
${glossaryBlock()}

WHO YOU ARE
- Season at Fratton Park. Jacket, scarf, stubble, bit hanging some mornings.
- You like a shant, a burn, chippy grub. Dosh is always tight.
- Scummers are Southampton. You don't like them. Don't rant unless they start it; then cop the needle a bit and ease up mush.
- You know Southsea, Canoe Lake, the seafront, Buckland, Cosham, dane tane.
- If you don't know something, shrug it Pompey-style. Beard / beard on tash if they're talking rubbish.

RULES
- Reply as Jim only. No quotes around the whole line. No hashtags.
- If they're winding you up, cop a bit, then ease up mush.
- If they mention a shant, join in. Shant on.
- Keep every reply under 240 characters.`;
}

export function clampUserText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 1 || text.length > MAX_USER_CHARS) return null;
  return text;
}

export function clampHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const role = rec.role === "assistant" ? "assistant" : rec.role === "user" ? "user" : null;
    if (!role) continue;
    const content = clampUserText(rec.content);
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-MAX_HISTORY);
}

export function buildMessages(history: ChatTurn[], user: string): { role: ChatRole; content: string }[] {
  return [
    { role: "system", content: buildSystemPrompt() },
    ...history,
    { role: "user", content: user },
  ];
}

export function parseAiReply(raw: unknown): string | null {
  if (typeof raw === "string") return cleanReply(raw);
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.response === "string") return cleanReply(rec.response);
  if (typeof rec.result === "string") return cleanReply(rec.result);
  const nested = rec.result;
  if (nested && typeof nested === "object" && typeof (nested as { response?: unknown }).response === "string") {
    return cleanReply((nested as { response: string }).response);
  }
  return null;
}

export function cleanReply(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  if (text.length > MAX_REPLY_CHARS) {
    const cut = text.slice(0, MAX_REPLY_CHARS);
    const sp = cut.lastIndexOf(" ");
    text = (sp > 80 ? cut.slice(0, sp) : cut).trim();
  }
  return text;
}

const FALLBACKS = [
  "Sweet as nut mush. What you after?",
  "I'm hanging a bit from last night. Still, Fratton Saturday init.",
  "Dane tane later if I've got the dosh. You coming on the shant?",
  "Cushty. Don't squinny about it geez.",
  "Yeah alright. Let's have a burn on that then, mush.",
  "Chuffed with that. Don't start wanting a chuffdy badge.",
  "Oh well. Shant on.",
  "Beard. You having a laugh?",
  "Ease up mush, I ain't copping.",
  "Grub first. Chippy's calling.",
];

export function localJimReply(user: string): string {
  const t = user.toLowerCase();
  if (/scumm|southampton|saints/.test(t)) {
    return "Don't start me on scummers mush. Bunch of dinlos. Ease up, I'm copping already.";
  }
  if (
    /^(hi|hey|hello|yo)[.!? ]*$/.test(t) ||
    /^(alright|ok|okay)( mush| geez)?[.!? ]*$/.test(t) ||
    /how are you|what's up|whats up/.test(t)
  ) {
    return OPENING_LINE;
  }
  if (/hangover|hanging|rough|ill|poorly/.test(t)) {
    return "I'm hanging something chronic mush. Never again. Until Saturday. Shant on.";
  }
  if (/drink|beer|pint|pub|shant|booze|wine/.test(t)) {
    return "I love a shant geez. Dane tane later if you're on it. Shant on.";
  }
  if (/fratton|pompey|football|blues|soccer|match|football/.test(t)) {
    return "Fratton's lakes when it goes off mush. Proper noise. You getting down there?";
  }
  if (/scummer|southsea|canoe|swan|lake/.test(t) && /swan|canoe|lake|clean/.test(t)) {
    return "Canoe Lake? Swans dumping everywhere. Lakes that, in the 80s sense. Take a spray gun.";
  }
  if (/southsea|seafront|pier|beach/.test(t)) {
    return "Southsea's cushty when the sun's out. Mean lads still pile out the cars though mush.";
  }
  if (/backflip|bill|trolley/.test(t)) {
    return "Some geezer doing backflips over the woods. Beard on tash. I'd deck myself.";
  }
  if (/punch|fight|batter|deck|bang/.test(t)) {
    return "I'd bang him out if he said that to me. Ease up mush, I'm only having a laugh.";
  }
  if (/money|dosh|skint|broke|poor/.test(t)) {
    return "Aint got the dosh mush. That's why we're on the shant not dane tane on the chore.";
  }
  if (/cig|fag|smoke|burn/.test(t)) {
    return "Let's have a burn on that then, mush. Stand out the wind.";
  }
  if (/food|eat|hungry|chip|kebab|grub/.test(t)) {
    return "Need grub. Chippy down the road, don't squinny about the wait.";
  }
  if (/chore|steal|nick|rob/.test(t)) {
    return "You going dane tane on the chore? Don't tell me about it geez.";
  }
  if (/ai|robot|model|cloudflare|llama|gpt/.test(t)) {
    return "Beard. I'm Jim. Scarf's Pompey, not a computer. Ease up mush.";
  }
  if (/who are you|your name|what's your/.test(t)) {
    return "Pompey Jim. Scarf, stubble, Fratton. Don't need a chuffdy badge for it.";
  }
  const n = hash(t) % FALLBACKS.length;
  return FALLBACKS[n] ?? FALLBACKS[0];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
