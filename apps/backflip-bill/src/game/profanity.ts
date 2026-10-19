/** Shown when a high-score name is too filthy to keep. */
export const FILTH_MESSAGE = "I ain't saving that filth mush";

const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "0": "o",
  "1": "i",
  "!": "i",
  "3": "e",
  "$": "s",
  "5": "s",
  "7": "t",
};

/** Short or ambiguous — only if the whole token is the word. */
const WHOLE = new Set([
  "anal",
  "anus",
  "arse",
  "ass",
  "clit",
  "coon",
  "cum",
  "cunt",
  "cunts",
  "dyke",
  "fag",
  "fags",
  "fck",
  "fcuk",
  "fuk",
  "jizz",
  "kike",
  "nigga",
  "nigger",
  "piss",
  "porn",
  "prick",
  "puss",
  "pussy",
  "rape",
  "sex",
  "shit",
  "shite",
  "slut",
  "spic",
  "tit",
  "tits",
  "twat",
  "wank",
  "whore",
]);

/** Long enough to hunt as a substring of the compacted name. */
const PARTS = [
  "asshole",
  "arsehol",
  "asswipe",
  "ballbag",
  "bastard",
  "bitch",
  "blowjob",
  "bollock",
  "clusterfuck",
  "cockface",
  "cocksuck",
  "cumshot",
  "cunt",
  "dickhead",
  "dickwad",
  "dildo",
  "dumbass",
  "faggot",
  "fck",
  "fcuk",
  "fuck",
  "fuk",
  "handjob",
  "jackass",
  "jizz",
  "motherf",
  "nigga",
  "nigger",
  "penis",
  "pissed",
  "prick",
  "pussy",
  "retard",
  "shit",
  "shite",
  "slut",
  "twat",
  "wank",
  "whore",
];

function letters(raw: string): string {
  const folded = raw.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  let out = "";
  for (const ch of folded) {
    const mapped = LEET[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  return out.replace(/(.)\1{2,}/g, "$1$1");
}

/** True if this name should not go on the public board. */
export function isFilthyName(raw: string): boolean {
  const compact = letters(raw);
  if (!compact) return false;
  if (WHOLE.has(compact)) return true;
  if (PARTS.some((w) => compact.includes(w))) return true;
  for (const token of raw.split(/[^\p{L}\p{N}]+/u)) {
    const word = letters(token);
    if (word && WHOLE.has(word)) return true;
  }
  return false;
}
