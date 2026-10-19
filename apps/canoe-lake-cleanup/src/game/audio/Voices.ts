import type { LiveVoiceClip, LiveVoiceManifest } from "@easeupmush/shared/dialogue";
import { catalog, sender } from "../../dialogue";
import { readVoicesEnabled } from "./voiceSettings";

const MAX_VOICES = 3;

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Catalog text (may include `{where}`) against the line spoken in-game. */
export function spokenMatches(catalogText: string, spoken: string): boolean {
  if (catalogText === spoken) return true;
  if (!catalogText.includes("{where}")) return false;
  const parts = catalogText.split("{where}").map(escapeRe);
  return new RegExp(`^${parts.join(".+")}$`).test(spoken);
}

class VoiceBank {
  private clips: LiveVoiceClip[] = [];
  private enabled = true;
  private playing: HTMLAudioElement[] = [];
  private ready: Promise<void> = Promise.resolve();
  private ctx: AudioContext | null = null;

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public load(): Promise<void> {
    this.enabled = readVoicesEnabled();
    this.ready = this.fetchManifest();
    return this.ready;
  }

  public playText(characterId: string, text: string): void {
    if (!this.enabled || !text) return;
    void this.ready.then(() => {
      if (!this.enabled) return;
      const pool = this.clips.filter(
        (c) => c.characterId === characterId && spokenMatches(c.text, text),
      );
      if (!pool.length) return;
      const clip = pool[Math.floor(Math.random() * pool.length)]!;
      this.playClip(clip);
    });
  }

  public playSender(from: string, text: string): void {
    if (!this.enabled || !text) return;
    void this.ready.then(() => {
      if (!this.enabled) return;
      const who = catalog.characters.find((c) => sender(c.id) === from);
      if (who) this.playText(who.id, text);
    });
  }

  public stop(): void {
    for (const audio of this.playing) {
      audio.pause();
      audio.src = "";
    }
    this.playing = [];
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

  private audioCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
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
    while (this.playing.length > MAX_VOICES) {
      const old = this.playing.shift();
      if (old) {
        old.pause();
        old.src = "";
      }
    }
    void ctx.resume().then(() => audio.play().catch(() => drop()));
  }
}

export const voices = new VoiceBank();
