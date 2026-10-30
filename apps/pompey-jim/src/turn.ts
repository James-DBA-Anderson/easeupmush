import {
  applyExtract,
  applyNews,
  askingForNews,
  buildExtractPrompt,
  clampHintName,
  clampUserId,
  failReply,
  formatNotebook,
  heuristicExtract,
  openingFor,
  parseExtract,
  parseJob,
  parseKnowledge,
  pickNewsBits,
  resolveSpeaker,
  stanceFor,
  takeLine,
  type JimExtract,
  type JimJob,
  type JimKnowledge,
  type JimTake,
} from "./knowledge";
import {
  buildMessages,
  distractedLine,
  JIM_MODEL,
  localJimReply,
  parseAiReply,
  phoneUpLine,
  type ChatTurn,
} from "./prompt";
import { browseNews, decentLine, markSource, sourceKindFor, takesFromPage } from "./news";
import { fetchPage, findLink, type PageOk } from "./read";
import { lookUp, looksLikeLookup } from "./lookup";

export type KnowledgeStore = {
  load(): Promise<unknown>;
  save(kb: JimKnowledge): Promise<void>;
};

export type JobStore = {
  get(userId: string): Promise<unknown>;
  set(job: JimJob): Promise<void>;
  clear(userId: string): Promise<void>;
};

export type AiRunner = (
  messages: { role: string; content: string }[],
  opts: { max_tokens: number; temperature: number },
) => Promise<unknown>;

export type JimChatResult = {
  reply: string;
  reading: boolean;
  name: string | null;
  remember: () => Promise<void>;
  follow?: () => Promise<void>;
  browse?: () => Promise<void>;
};

const JOB_MS = 45_000;

export async function jimHello(
  store: KnowledgeStore,
  userId: string | null,
  hintName?: string | null,
): Promise<{ reply: string; name: string | null; browse?: () => Promise<void> }> {
  const kb = parseKnowledge(await store.load());
  const p = resolveSpeaker(kb, userId ?? "", hintName);
  const name = p?.name ?? clampHintName(hintName);
  if (p && userId && p.id !== userId) {
    await store.save(applyExtract(kb, userId, { name, notes: [], shared: [], takes: [] }));
  }
  return {
    reply: openingFor(kb, userId ?? "", name),
    name,
    browse: () => browseNews(store),
  };
}

export async function jimPeek(jobs: JobStore, userId: string | null): Promise<{ reply?: string; reading: boolean }> {
  if (!userId) return { reading: false };
  const job = parseJob(await jobs.get(userId));
  if (!job) return { reading: false };
  if (job.status === "fetching" && Date.now() - job.startedAt < JOB_MS) {
    return { reading: true };
  }
  if (job.status === "fetching") {
    const reply = failReply("dead");
    await jobs.clear(userId);
    return { reply, reading: false };
  }
  const reply = job.reply ?? (job.status === "fail" ? failReply(job.fail ?? "dead") : undefined);
  await jobs.clear(userId);
  return { reply, reading: false };
}

export async function jimChat(opts: {
  message: string;
  history: ChatTurn[];
  userId: string | null;
  hintName?: string | null;
  store: KnowledgeStore;
  jobs: JobStore;
  runAi: AiRunner | null;
}): Promise<JimChatResult> {
  const userId = opts.userId ?? "anon-unknown";
  const hint = clampHintName(opts.hintName);
  const existing = parseJob(await opts.jobs.get(userId));
  if (existing?.status === "fetching" && Date.now() - existing.startedAt < JOB_MS) {
    return {
      reply: distractedLine(opts.message),
      reading: true,
      name: hint,
      remember: async () => {
        /* still reading */
      },
    };
  }
  if (existing?.status === "done" || existing?.status === "fail") {
    const reply = existing.reply ?? failReply(existing.fail ?? "dead");
    await opts.jobs.clear(userId);
    return {
      reply,
      reading: false,
      name: hint,
      remember: async () => {
        /* already stored when the page landed */
      },
    };
  }

  const guessed = heuristicExtract(opts.message, hint ?? "a mush");

  const doLookup = looksLikeLookup(opts.message);
  if (doLookup && !findLink(opts.message)) {
    const q = opts.message.trim();
    const job: JimJob = { userId, url: "wikipedia", query: q, startedAt: Date.now(), status: "fetching" };
    await opts.jobs.set(job);
    return {
      reply: phoneUpLine(q),
      reading: true,
      name: guessed.name ?? hint,
      remember: async () => {
        const latest = parseKnowledge(await opts.store.load());
        const extract = heuristicExtract(q, hint ?? "a mush");
        extract.name = extract.name ?? hint;
        await opts.store.save(applyExtract(latest, userId, extract));
      },
      follow: () => completeLookup(job, opts.store, opts.jobs, opts.runAi),
    };
  }

  const link = findLink(opts.message);
  if (link) {
    const job: JimJob = { userId, url: link, startedAt: Date.now(), status: "fetching" };
    await opts.jobs.set(job);
    return {
      reply: phoneUpLine(link),
      reading: true,
      name: guessed.name ?? hint,
      remember: async () => {
        const latest = parseKnowledge(await opts.store.load());
        const extract = heuristicExtract(opts.message.replace(link, "").trim() || opts.message);
        extract.name = extract.name ?? hint;
        extract.takes = [];
        await opts.store.save(applyExtract(latest, userId, extract));
      },
      follow: () => completeRead(job, opts.store, opts.jobs, opts.runAi),
    };
  }

  const kb = parseKnowledge(await opts.store.load());
  const speaker = resolveSpeaker(kb, userId, guessed.name ?? hint);
  const knownName = guessed.name ?? speaker?.name ?? hint;
  const notebook = formatNotebook(kb, userId, knownName);
  const ctx = {
    speakerName: knownName,
    speakerNotes: speaker?.notes ?? [],
    others: Object.values(kb.people)
      .filter((p) => p.id !== userId && p.id !== speaker?.id)
      .map((p) => ({ name: p.name, notes: p.notes })),
    news: pickNewsBits(kb.takes, 12).map((t) => ({
      date: t.date,
      claim: t.claim,
      take: t.take,
      source: t.source,
    })),
  };

  let reply: string | null = null;
  const askingNews = askingForNews(opts.message) || /\b(what's on|whats on|any pompey|match)\b/i.test(opts.message);
  if (!opts.runAi && guessed.takes[0] && !askingNews) {
    reply = guessed.takes[0].take;
  }
  if (opts.runAi) {
    try {
      const out = await opts.runAi(buildMessages(opts.history, opts.message, notebook), {
        max_tokens: 140,
        temperature: 0.9,
      });
      reply = parseAiReply(out);
    } catch {
      reply = null;
    }
  }
  reply = reply ?? localJimReply(opts.message, ctx);
  const said = reply;

  const remember = async () => {
    const latest = parseKnowledge(await opts.store.load());
    let extract: JimExtract = heuristicExtract(opts.message, knownName ?? "a mush");
    extract.name = extract.name ?? knownName;
    if (opts.runAi) {
      try {
        const out = await opts.runAi(
          [{ role: "user", content: buildExtractPrompt(latest, userId, opts.message, said) }],
          { max_tokens: 160, temperature: 0.2 },
        );
        const ai = parseExtract(out);
        extract = {
          name: ai.name ?? extract.name,
          notes: [...extract.notes, ...ai.notes],
          shared: [...extract.shared, ...ai.shared],
          takes: [...extract.takes, ...ai.takes],
        };
      } catch {
        /* keep heuristic */
      }
    }
    await opts.store.save(applyExtract(latest, userId, extract));
  };

  return {
    reply: said,
    reading: false,
    name: knownName,
    remember,
    browse: () => browseNews(opts.store),
  };
}

export async function completeRead(
  job: JimJob,
  store: KnowledgeStore,
  jobs: JobStore,
  runAi: AiRunner | null,
): Promise<void> {
  const page = await fetchPage(job.url);
  if (!page.ok) {
    const latest = parseKnowledge(await store.load());
    await store.save(markSource(latest, job.url, false, page.fail).kb);
    await jobs.set({
      ...job,
      status: "fail",
      fail: page.fail,
      reply: failReply(page.fail),
    });
    return;
  }
  const kind = sourceKindFor(job.url);
  const extras = takesFromPage(page, kind);
  const take = extras[0] ?? (await takeOnPage(page, runAi));
  const latest = parseKnowledge(await store.load());
  const marked = markSource(latest, job.url, true, undefined, kind);
  await store.save(applyNews(marked.kb, extras.length ? extras : [take]));
  const said = `${take.take} ${decentLine(page.host)}`;
  await jobs.set({ ...job, status: "done", reply: said });
}

export async function completeLookup(
  job: JimJob,
  store: KnowledgeStore,
  jobs: JobStore,
  runAi: AiRunner | null,
): Promise<void> {
  const q = job.query ?? "";
  const found = q ? await lookUp(q) : null;
  if (!found) {
    await jobs.set({
      ...job,
      status: "fail",
      fail: "dead",
      reply: "Couldnt find that mush. Beard, or I'm barking up the wrong tree.",
    });
    return;
  }

  const latest = parseKnowledge(await store.load());
  const take = await lookupToTake(found, runAi, q);
  await store.save(applyNews(latest, [take]));
  await jobs.set({ ...job, status: "done", reply: take.take });
}

function lookupPrompt(found: { title: string; extract: string }, q: string): string {
  return `You are Pompey Jim, a Portsmouth fan in his mid-forties in a blue-and-white scarf. Short replies — one or two sentences. Use Pompey slang naturally (mush, geez, dane tane, Fratton, shant, beard). Don't mention websites, Wikipedia, or that you looked anything up. Just sound like a bloke who knows the answer.

You know this: "${found.title}. ${found.extract.slice(0, 280)}"

Answer this question as Jim, casual and street: ${q}`;
}

async function lookupToTake(
  found: { title: string; extract: string; url: string },
  runAi: AiRunner | null,
  q: string,
): Promise<JimTake> {
  const claim = found.title.slice(0, 180);
  let reply = takeLine("maybe", claim);
  if (runAi) {
    try {
      const out = await runAi(
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        [{ role: "user" as const, content: lookupPrompt(found, q) }],
        { max_tokens: 140, temperature: 0.9 },
      );
      const parsed = parseAiReply(out);
      if (parsed) reply = parsed;
    } catch {
      /* keep fallback */
    }
  }
  return {
    claim,
    take: reply,
    stance: "maybe",
    source: "wikipedia.org",
    kind: "page",
    date: new Date().toISOString().slice(0, 10),
    at: Date.now(),
  };
}

async function takeOnPage(page: PageOk, runAi: AiRunner | null): Promise<JimTake> {
  const claim = (page.title || page.host).slice(0, 180);
  const fallbackStance = stanceFor(`${page.title} ${page.text}`);
  const fallback: JimTake = {
    claim,
    take: takeLine(fallbackStance, claim),
    stance: fallbackStance,
    source: page.host,
    kind: "page",
    date: page.date,
    at: Date.now(),
  };
  if (!runAi) return fallback;
  try {
    const out = await runAi(
      [
        {
          role: "user",
          content: `You are Pompey Jim. You just read this on your phone. People lie. Form YOUR take as a Pompey fan.
Return ONLY JSON: {"claim":string,"take":string,"stance":"buy"|"beard"|"maybe"}
take = one or two sentences in Jim's voice — this is what you say out loud. No markdown.

Host: ${page.host}
Title: ${page.title}
Text: ${page.text.slice(0, 2200)}`,
        },
      ],
      { max_tokens: 140, temperature: 0.7 },
    );
    const parsed = parseExtract({ response: typeof out === "string" ? out : undefined, ...(typeof out === "object" && out ? out : {}) });
    const aiTake = parsed.takes[0];
    if (aiTake) {
      return { ...aiTake, source: page.host, kind: "page", claim: aiTake.claim || claim };
    }
    const rec = parseLooseTake(out);
    if (rec) return { ...fallback, ...rec, source: page.host, kind: "page" };
  } catch {
    /* fallback */
  }
  return fallback;
}

function parseLooseTake(raw: unknown): Pick<JimTake, "claim" | "take" | "stance"> | null {
  const empty = parseExtract(raw);
  if (empty.takes[0]) {
    const t = empty.takes[0];
    return { claim: t.claim, take: t.take, stance: t.stance };
  }
  const text =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && typeof (raw as { response?: unknown }).response === "string"
        ? (raw as { response: string }).response
        : "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const rec = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const claim = typeof rec.claim === "string" ? rec.claim.trim() : "";
    const take = typeof rec.take === "string" ? rec.take.trim() : "";
    if (take.length < 4) return null;
    const stance = rec.stance === "buy" || rec.stance === "beard" ? rec.stance : "maybe";
    return { claim: claim || take.slice(0, 80), take, stance };
  } catch {
    return null;
  }
}

export { clampHintName, clampUserId, JIM_MODEL, findLink };

export function jobKey(userId: string): string {
  return `pompey-jim:job:${userId}`;
}
