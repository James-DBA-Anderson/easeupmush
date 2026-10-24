import {
  applyExtract,
  buildExtractPrompt,
  clampUserId,
  failReply,
  formatNotebook,
  heuristicExtract,
  openingFor,
  parseExtract,
  parseJob,
  parseKnowledge,
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
import { fetchPage, findLink, type PageOk } from "./read";

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
  remember: () => Promise<void>;
  follow?: () => Promise<void>;
};

const JOB_MS = 45_000;

export async function jimHello(store: KnowledgeStore, userId: string | null): Promise<string> {
  const kb = parseKnowledge(await store.load());
  return openingFor(kb, userId ?? "");
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
  store: KnowledgeStore;
  jobs: JobStore;
  runAi: AiRunner | null;
}): Promise<JimChatResult> {
  const userId = opts.userId ?? "anon-unknown";
  const existing = parseJob(await opts.jobs.get(userId));
  if (existing?.status === "fetching" && Date.now() - existing.startedAt < JOB_MS) {
    return {
      reply: distractedLine(opts.message),
      reading: true,
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
      remember: async () => {
        /* already stored when the page landed */
      },
    };
  }

  const link = findLink(opts.message);
  if (link) {
    const job: JimJob = { userId, url: link, startedAt: Date.now(), status: "fetching" };
    await opts.jobs.set(job);
    return {
      reply: phoneUpLine(link),
      reading: true,
      remember: async () => {
        const latest = parseKnowledge(await opts.store.load());
        const extract = heuristicExtract(opts.message.replace(link, "").trim() || opts.message);
        extract.takes = [];
        await opts.store.save(applyExtract(latest, userId, extract));
      },
      follow: () => completeRead(job, opts.store, opts.jobs, opts.runAi),
    };
  }

  const kb = parseKnowledge(await opts.store.load());
  const notebook = formatNotebook(kb, userId);
  const speaker = kb.people[userId];
  const ctx = {
    speakerName: speaker?.name ?? null,
    speakerNotes: speaker?.notes ?? [],
    others: Object.values(kb.people)
      .filter((p) => p.id !== userId)
      .map((p) => ({ name: p.name, notes: p.notes })),
  };

  let reply: string | null = null;
  const guessed = heuristicExtract(opts.message, speaker?.name ?? "a mush");
  if (!opts.runAi && guessed.takes[0]) {
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
    let extract: JimExtract = heuristicExtract(opts.message, speaker?.name ?? "a mush");
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

  return { reply: said, reading: false, remember };
}

export async function completeRead(
  job: JimJob,
  store: KnowledgeStore,
  jobs: JobStore,
  runAi: AiRunner | null,
): Promise<void> {
  const page = await fetchPage(job.url);
  if (!page.ok) {
    await jobs.set({
      ...job,
      status: "fail",
      fail: page.fail,
      reply: failReply(page.fail),
    });
    return;
  }
  const take = await takeOnPage(page, runAi);
  const latest = parseKnowledge(await store.load());
  await store.save(
    applyExtract(latest, job.userId, {
      name: null,
      notes: [],
      shared: [],
      takes: [take],
    }),
  );
  await jobs.set({ ...job, status: "done", reply: take.take });
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

export { clampUserId, JIM_MODEL, findLink };

export function jobKey(userId: string): string {
  return `pompey-jim:job:${userId}`;
}
