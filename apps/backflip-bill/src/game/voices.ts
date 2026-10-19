import type { LiveVoiceClip, LiveVoiceManifest } from "@easeupmush/shared/dialogue";

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function pickOne<T>(pool: T[]): T | null {
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

type Queued =
  | { kind: "text"; characterId: string; text: string }
  | { kind: "set"; characterId: string; set: string; fallback?: string };

class VoiceBank {
  private clips: LiveVoiceClip[] = [];
  private playing: HTMLAudioElement[] = [];
  private ready: Promise<void> = Promise.resolve();
  private ctx: AudioContext | null = null;
  private queued: Queued | null = null;
  private lastFile = new Map<string, string>();

  public load(): Promise<void> {
    this.ready = this.fetchManifest();
    return this.ready;
  }

  public resume(): void {
    const ctx = this.audioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const next = this.queued;
    this.queued = null;
    if (!next) return;
    if (next.kind === "text") this.playText(next.characterId, next.text);
    else this.playSet(next.characterId, next.set, next.fallback);
  }

  public playText(characterId: string, text: string): void {
    if (!text) return;
    void this.ready.then(() => {
      const clip = this.pick(
        `${characterId}:text:${text}`,
        (c) => c.characterId === characterId && c.text === text,
      );
      if (!clip) return;
      const ctx = this.audioCtx();
      if (ctx.state === "suspended") {
        this.queued = { kind: "text", characterId, text };
        return;
      }
      this.playClip(clip);
    });
  }

  /** Random live take from a catalog set. Tries `set`, then optional fallback. */
  public playSet(characterId: string, set: string, fallback?: string): void {
    if (!set) return;
    void this.ready.then(() => {
      const clip =
        this.pick(`${characterId}:set:${set}`, (c) => c.characterId === characterId && c.set === set) ??
        (fallback
          ? this.pick(
              `${characterId}:set:${fallback}`,
              (c) => c.characterId === characterId && c.set === fallback,
            )
          : null);
      if (!clip) return;
      const ctx = this.audioCtx();
      if (ctx.state === "suspended") {
        this.queued = { kind: "set", characterId, set, fallback };
        return;
      }
      this.playClip(clip);
    });
  }

  private pick(key: string, want: (c: LiveVoiceClip) => boolean): LiveVoiceClip | null {
    let pool = this.clips.filter(want);
    if (pool.length > 1) {
      const last = this.lastFile.get(key);
      const rest = pool.filter((c) => c.file !== last);
      if (rest.length) pool = rest;
    }
    const clip = pickOne(pool);
    if (clip) this.lastFile.set(key, clip.file);
    return clip;
  }

  private audioCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private async fetchManifest(): Promise<void> {
    this.clips = [];
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}voices/live.json`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as LiveVoiceManifest;
      this.clips = Array.isArray(data.clips) ? data.clips : [];
    } catch {
      this.clips = [];
    }
  }

  private playClip(clip: LiveVoiceClip): void {
    const base = import.meta.env.BASE_URL;
    const ctx = this.audioCtx();
    const audio = new Audio(`${base}voices/${clip.file}`);
    audio.preload = "auto";
    const src = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(clip.gainDb ?? 0);
    src.connect(gain);
    gain.connect(ctx.destination);
    const drop = () => {
      const i = this.playing.indexOf(audio);
      if (i >= 0) this.playing.splice(i, 1);
    };
    audio.addEventListener("ended", drop);
    audio.addEventListener("error", drop);
    this.playing.push(audio);
    void audio.play().catch(() => {
      this.queued = { kind: "text", characterId: clip.characterId, text: clip.text };
      drop();
    });
  }
}

export const voices = new VoiceBank();
