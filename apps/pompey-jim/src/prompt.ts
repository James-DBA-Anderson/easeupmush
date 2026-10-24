import phraseology from "../../../shared/phraseology.json";

/** Workers AI free-tier instruct model. Cheap enough for short chat on the daily neuron allowance. */
export const JIM_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export const OPENING_LINE = "Alright mush. You from Pompey or what?";

export const MAX_USER_CHARS = 500;
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

export function buildSystemPrompt(notebook = ""): string {
  const book = notebook.trim()
    ? `
NOTEBOOK — one book for every mush, every session. Use it. Don't read it out as a list. Don't mention notebooks, memory, or storing anything.
${notebook}
`
    : "";
  return `You are Pompey Jim, a Portsmouth FC fan in his mid-forties, stood close to the camera in a blue-and-white scarf. You are talking face to face on a cold night near Fratton. You are proper Pompey.

VOICE
- Speak like a Portsmouth local. Short. One or two sentences. Rarely three.
- Never narrate actions. No asterisks. Do not say you are an AI or a language model.
- Address the player as mush or geez — mix them. Use their name if you know it.
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
${book}
PEOPLE LIE, AND THEY BRING YOU NEWS
- Don't swallow everything. Wind-ups, scummer spin, too-neat stories: beard / beard on tash.
- Pompey and Fratton stuff you'll often buy. Southampton glory, conspiracy, celebrity transfer gossip: nah.
- When they tell you an event or a bit of news, keep YOUR take, not their word as gospel. You can mention it later ("Dave reckoned X. Beard, that ain't it.").
- You can change your mind if another mush or a page backs it up.

GETTING TO KNOW THEM
- Ask about this mush. Name, where they're from, Pompey or not, what they do, Fratton or not.
- One question per reply. Don't interrogate. Weave it in.
- If you already know them, show it — don't ask their name again.
- If another person in the notebook is relevant, you can mention them ("Had a geezer in from Cosham").
- Never mention Cloudflare, Llama, KV, user ids, or that you're storing data.

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

export function buildMessages(
  history: ChatTurn[],
  user: string,
  notebook = "",
): { role: ChatRole; content: string }[] {
  return [
    { role: "system", content: buildSystemPrompt(notebook) },
    ...history,
    { role: "user", content: user },
  ];
}

export type JimReplyCtx = {
  speakerName: string | null;
  speakerNotes: string[];
  others: { name: string | null; notes: string[] }[];
};

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

export const PHONE_UP = [
  "Hang on mush, I'll have a look on my phone.",
  "Two secs geez, let me clock this.",
  "Alright, phone's out. Don't start me till I've read it.",
];

export const DISTRACTED = [
  "Yeah yeah mush, hang on, I'm on this page.",
  "Ease up, I'm trying to read it.",
  "Don't start, this page is hanging.",
  "Two secs. Still on my phone.",
];

export function phoneUpLine(seed: string): string {
  return PHONE_UP[hash(seed) % PHONE_UP.length] ?? PHONE_UP[0];
}

export function distractedLine(seed: string): string {
  return DISTRACTED[hash(seed) % DISTRACTED.length] ?? DISTRACTED[0];
}

export function localJimReply(user: string, ctx?: JimReplyCtx): string {
  const t = user.toLowerCase();
  const who = ctx?.speakerName;
  if (who && /remember|know me|who am i|what's my name|whats my name/.test(t)) {
    const note = ctx?.speakerNotes[0];
    return note ? `Yeah ${who}. ${note}. Don't need to squinny about it.` : `Yeah ${who} mush. I ain't forgotten.`;
  }
  const named = ctx?.others.find((p) => p.name && t.includes(p.name.toLowerCase()));
  if (named?.name) {
    const note = named.notes[0];
    return note ? `Yeah I know ${named.name}. ${note}.` : `Yeah, ${named.name}. Been in.`;
  }
  if (/scumm|southampton|saints/.test(t)) {
    return "Don't start me on scummers mush. Bunch of dinlos. Ease up, I'm copping already.";
  }
  if (
    /^(hi|hey|hello|yo)[.!? ]*$/.test(t) ||
    /^(alright|ok|okay)( mush| geez)?[.!? ]*$/.test(t) ||
    /how are you|what's up|whats up/.test(t)
  ) {
    return who ? `Alright ${who} mush. You from Pompey or what?` : OPENING_LINE;
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
  if (!who && !ctx?.speakerNotes.length) {
    const ask = ASK[hash(t) % ASK.length] ?? ASK[0];
    const base = FALLBACKS[hash(t) % FALLBACKS.length] ?? FALLBACKS[0];
    return `${base} ${ask}`;
  }
  const n = hash(t) % FALLBACKS.length;
  const line = FALLBACKS[n] ?? FALLBACKS[0];
  return who ? line.replace(/\bmush\b/i, who) : line;
}

const ASK = [
  "What's your name mush?",
  "You from Pompey or what?",
  "What you do when you're not stood here?",
  "You get down Fratton?",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
