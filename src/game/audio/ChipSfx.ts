/**
 * Procedural chip SFX — punches, kicks, whooshes, crashes.
 * Shares the AudioContext unlocked by chipRock (first user gesture).
 */

import { chipRock } from "./ChipRock";

type HitWeight = "light" | "mid" | "heavy" | "critical" | "block" | "weapon";

class ChipSfxEngine {
  private bus: GainNode | null = null;
  private muted = false;
  private hooked = false;
  private lastPlayAt = 0;

  private async ensure(): Promise<AudioContext | null> {
    await chipRock.unlock();
    const ctx = chipRock.context;
    if (!ctx) return null;
    if (!this.hooked) {
      this.hooked = true;
      chipRock.onMuteChange((m) => {
        this.muted = m;
        if (this.bus) this.bus.gain.value = m ? 0 : 0.28;
      });
    }
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.muted ? 0 : 0.28;
      this.bus.connect(ctx.destination);
    }
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }

  /** Soft rate-limit so a whirl doesn't become a wall of noise. */
  private allow(): boolean {
    const t = performance.now();
    if (t - this.lastPlayAt < 28) return false;
    this.lastPlayAt = t;
    return true;
  }

  async hit(weight: HitWeight = "mid"): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus || !this.allow()) return;
    const t = ctx.currentTime;
    if (weight === "block") {
      this.noiseBurst(ctx, t, 0.06, 2400, 0.14);
      this.blip(ctx, t, 520, 180, 0.05, 0.09);
      return;
    }
    if (weight === "weapon") {
      this.noiseBurst(ctx, t, 0.08, 3200, 0.18);
      this.blip(ctx, t, 220, 90, 0.07, 0.16);
      this.blip(ctx, t + 0.03, 440, 200, 0.05, 0.1);
      return;
    }
    if (weight === "light") {
      this.blip(ctx, t, 280, 140, 0.04, 0.1);
      this.noiseBurst(ctx, t, 0.035, 1800, 0.08);
      return;
    }
    if (weight === "critical" || weight === "heavy") {
      this.blip(ctx, t, 120, 55, 0.1, 0.22);
      this.blip(ctx, t + 0.02, 90, 40, 0.12, 0.16);
      this.noiseBurst(ctx, t, 0.1, 900, 0.2);
      if (weight === "critical") this.blip(ctx, t + 0.05, 660, 400, 0.06, 0.08);
      return;
    }
    // mid
    this.blip(ctx, t, 180, 80, 0.07, 0.15);
    this.noiseBurst(ctx, t, 0.055, 1400, 0.12);
  }

  async whoosh(heavy = false): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.noiseSweep(ctx, t, heavy ? 0.14 : 0.09, heavy ? 0.12 : 0.08);
  }

  async jump(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 220, 480, 0.08, 0.09, "square");
  }

  async land(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 90, 55, 0.06, 0.1, "triangle");
    this.noiseBurst(ctx, t, 0.04, 600, 0.08);
  }

  async ko(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 160, 60, 0.18, 0.2);
    this.blip(ctx, t + 0.08, 100, 45, 0.22, 0.16);
    this.noiseBurst(ctx, t + 0.04, 0.16, 500, 0.18);
  }

  async crash(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.2, 700, 0.28);
    this.blip(ctx, t, 70, 35, 0.2, 0.2, "sawtooth");
  }

  async chop(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(ctx, t + i * 0.04, 0.05, 2000 + i * 400, 0.14);
      this.blip(ctx, t + i * 0.04, 300 - i * 40, 80, 0.04, 0.1);
    }
  }

  async pickup(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 520, 780, 0.07, 0.08, "square");
    this.blip(ctx, t + 0.06, 780, 1040, 0.07, 0.07, "square");
  }

  async drop(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    this.blip(ctx, ctx.currentTime, 400, 180, 0.08, 0.07, "square");
  }

  async ui(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    this.blip(ctx, ctx.currentTime, 660, 880, 0.05, 0.05, "square");
  }

  async coin(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 880, 1320, 0.06, 0.07, "square");
    this.blip(ctx, t + 0.05, 1320, 1760, 0.07, 0.06, "square");
  }

  async siren(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 600, 900, 0.35, 0.08, "square");
    this.blip(ctx, t + 0.18, 900, 600, 0.35, 0.08, "square");
  }

  async boardSnap(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.08, 2800, 0.16);
    this.blip(ctx, t, 300, 90, 0.1, 0.12);
  }

  private blip(
    ctx: AudioContext,
    time: number,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    type: OscillatorType = "square",
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.bus!);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    time: number,
    dur: number,
    cutoff: number,
    gain: number,
  ): void {
    let buf = chipRock.noise;
    if (!buf) {
      const len = ctx.sampleRate * 0.15;
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = cutoff;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus!);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  private noiseSweep(ctx: AudioContext, time: number, dur: number, gain: number): void {
    let buf = chipRock.noise;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(400, time);
    f.frequency.exponentialRampToValueAtTime(2800, time + dur);
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus!);
    src.start(time);
    src.stop(time + dur + 0.02);
  }
}

export const chipSfx = new ChipSfxEngine();

/** Map a combat result / kind to a hit weight. */
export function hitWeightFor(
  kind: string,
  result: string,
): HitWeight {
  if (result === "blocked") return "block";
  if (kind === "weapon_swing" || kind === "thrown") return "weapon";
  if (
    kind === "boot_head" ||
    kind === "chin_shot" ||
    kind === "jump_kick" ||
    result === "out_cold" ||
    result === "crawl_away"
  ) {
    return "critical";
  }
  if (kind === "headbutt" || kind === "upper" || kind === "toss_hit") return "heavy";
  if (kind === "jab" || kind === "backhand") return "light";
  return "mid";
}
