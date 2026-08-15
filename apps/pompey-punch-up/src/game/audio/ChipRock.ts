/**
 * Procedural chiptune rock — square leads, pulse bass, noise kit.
 * No asset files; unlocks on first user gesture (autoplay policy).
 *
 * Level 1: quiet bed → fight drop. Boss fight gets a heavier, darker cut.
 */

type Pattern = readonly (number | null)[];

/** Quiet bed → scrap → boss tension, or title cruise. */
export type ChipRockMode = "bed" | "fight" | "boss" | "title";

const TEMPO_FIGHT = 152;
const TEMPO_BOSS = 128;
const STEPS_PER_BEAT = 4; // 16th notes
const LOOKAHEAD = 0.05;
const SCHEDULE_AHEAD = 0.18;

const MASTER_BED = 0.028;
const MASTER_TITLE = 0.07;
const MASTER_FIGHT = 0.1;
const MASTER_BOSS = 0.125;

/** A minor / E power-chord rock loop (Hz). null = rest. */
const BASS: Pattern = [
  82.41, null, 82.41, null, 82.41, 82.41, 110, null, // E2
  98, null, 98, null, 98, 98, 123.47, null, // G2
  110, null, 110, null, 110, 110, 146.83, null, // A2
  123.47, null, 123.47, null, 130.81, 123.47, 110, 98, // B2 → walk
];

const LEAD: Pattern = [
  329.63, 392, 440, 493.88, 440, 392, 329.63, null, // E4 riff
  392, 440, 493.88, 587.33, 493.88, 440, 392, null,
  440, 523.25, 587.33, 659.25, 587.33, 523.25, 440, null,
  493.88, 440, 392, 369.99, 329.63, 293.66, 329.63, 392,
];

const FIFTH: Pattern = [
  123.47, null, 123.47, null, 123.47, 123.47, 164.81, null,
  146.83, null, 146.83, null, 146.83, 146.83, 185, null,
  164.81, null, 164.81, null, 164.81, 164.81, 220, null,
  185, null, 185, null, 196, 185, 164.81, 146.83,
];

/** 1 = kick, 2 = snare, 3 = hat, 4 = kick+hat */
const DRUMS: Pattern = [
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 4, 3, 4, 3, 3, 3, 2, 3, 3, 3, 4, 3,
  2, 3, 2, 3, 4, 3,
];

/** Boss: low E drone walk — heavier, less bounce. */
const BOSS_BASS: Pattern = [
  65.41, null, 65.41, 65.41, null, 65.41, 82.41, null, // C2 → E2
  73.42, null, 73.42, 73.42, null, 73.42, 98, null, // D2 → G2
  82.41, null, 82.41, 82.41, null, 82.41, 110, null, // E2 → A2
  77.78, null, 77.78, 73.42, 69.3, 65.41, 61.74, 58.27, // crawl down
];

/** Boss lead — minor, sparse, mean. */
const BOSS_LEAD: Pattern = [
  311.13, null, null, 329.63, null, null, 293.66, null, // Eb / E / D
  null, 246.94, null, 233.08, 220, null, null, null,
  311.13, 329.63, null, 349.23, null, 329.63, 311.13, null,
  246.94, null, 220, null, 196, null, 185, 174.61,
];

const BOSS_FIFTH: Pattern = [
  98, null, null, 98, null, null, 123.47, null,
  110, null, null, 110, null, null, 146.83, null,
  123.47, null, null, 123.47, null, null, 164.81, null,
  116.54, null, 110, null, 103.83, 98, 92.5, 87.31,
];

/** Half-time stomp — kick on the ones, fat snares. */
const BOSS_DRUMS: Pattern = [
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 2, 4, 3, 3, 3, 2, 3, 3, 2, 4, 3,
  2, 3, 4, 2, 4, 2,
];

class ChipRockEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing = false;
  private muted = false;
  private step = 0;
  private nextNoteTime = 0;
  private timer: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** Extra bite once the fight is on (0–1). */
  private heat = 0.35;
  private mode: ChipRockMode = "title";
  /** 0 = bed only, 1 = full drop — eases up when fight kicks in. */
  private drop = 0;
  private dropTarget = 0;

  get isPlaying(): boolean {
    return this.playing;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get currentMode(): ChipRockMode {
    return this.mode;
  }

  /** Call from a click / key — creates + resumes the AudioContext. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_TITLE;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setHeat(t: number): void {
    this.heat = Math.max(0, Math.min(1, t));
  }

  /**
   * Arrangement: quiet bed (L1 stroll) → fight drop → boss weight, or title.
   */
  setMode(mode: ChipRockMode): void {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === "bed") {
      this.dropTarget = 0;
      this.drop = Math.min(this.drop, 0.08);
      this.applyMaster(MASTER_BED, 0.6);
    } else if (mode === "title") {
      this.dropTarget = 0.55;
      this.drop = 0.55;
      this.applyMaster(MASTER_TITLE, 0.25);
    } else if (mode === "boss") {
      this.dropTarget = 1;
      // Hard cut into the boss bed so it reads as a gear change
      if (was !== "boss") this.drop = Math.max(this.drop, 0.85);
      this.applyMaster(MASTER_BOSS, was === "fight" ? 0.55 : 1.1);
    } else {
      // fight — ramp the drop so it kicks in from the quiet bed
      this.dropTarget = 1;
      if (was === "bed" || this.drop < 0.3) {
        this.applyMaster(MASTER_FIGHT, 1.4);
      } else if (was === "boss") {
        this.applyMaster(MASTER_FIGHT, 0.7);
      } else {
        this.applyMaster(MASTER_FIGHT, 0.35);
      }
    }
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get noise(): AudioBuffer | null {
    return this.noiseBuffer;
  }

  /** Notify listeners (SFX bus) when mute flips. */
  private onMute: ((muted: boolean) => void) | null = null;

  onMuteChange(cb: (muted: boolean) => void): void {
    this.onMute = cb;
  }

  private masterLevelFor(mode: ChipRockMode): number {
    if (mode === "bed") return MASTER_BED;
    if (mode === "title") return MASTER_TITLE;
    if (mode === "boss") return MASTER_BOSS;
    return MASTER_FIGHT;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      const vol = this.masterLevelFor(this.mode);
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : vol,
        this.ctx.currentTime,
        0.04,
      );
    }
    this.onMute?.(this.muted);
    return this.muted;
  }

  async start(): Promise<void> {
    await this.unlock();
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.tick();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private applyMaster(level: number, rampSec: number): void {
    if (!this.master || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(level, t + Math.max(0.05, rampSec));
  }

  private tempo(): number {
    return this.mode === "boss" ? TEMPO_BOSS : TEMPO_FIGHT;
  }

  private tick = (): void => {
    if (!this.playing || !this.ctx) return;
    // Ease drop toward target (~1.2s to full from bed)
    const dt = LOOKAHEAD;
    if (this.drop < this.dropTarget) {
      this.drop = Math.min(this.dropTarget, this.drop + dt / 1.15);
    } else if (this.drop > this.dropTarget) {
      this.drop = Math.max(this.dropTarget, this.drop - dt / 0.8);
    }
    const loopLen =
      this.mode === "boss" ? BOSS_BASS.length : BASS.length;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextNoteTime);
      const secondsPerStep = 60 / this.tempo() / STEPS_PER_BEAT;
      this.nextNoteTime += secondsPerStep;
      this.step = (this.step + 1) % loopLen;
    }
    this.timer = window.setTimeout(this.tick, LOOKAHEAD * 1000);
  };

  private scheduleStep(step: number, time: number): void {
    if (this.mode === "boss") {
      this.scheduleBossStep(step, time);
      return;
    }
    this.scheduleFightStep(step, time);
  }

  private scheduleFightStep(step: number, time: number): void {
    const out = this.master!;
    const d = this.drop;
    const bass = BASS[step % BASS.length]!;
    const lead = LEAD[step % LEAD.length]!;
    const fifth = FIFTH[step % FIFTH.length]!;
    const drum = DRUMS[step % DRUMS.length]!;

    // Bed: sparse pulse bass + soft hats. Fight drop brings drums + lead.
    if (bass !== null) {
      const everyOther = d < 0.35 && step % 2 !== 0;
      if (!everyOther) {
        const g = 0.05 + d * (0.07 + this.heat * 0.04);
        this.tone(bass, time, 0.1 + d * 0.02, "square", g, out);
      }
    }
    if (fifth !== null && d > 0.35) {
      this.tone(fifth, time, 0.1, "square", (0.03 + this.heat * 0.03) * d, out);
    }
    if (lead !== null && d > 0.25) {
      const leadGain = (0.02 + d * 0.05 + this.heat * 0.035) * Math.min(1, d * 1.2);
      this.tone(lead, time, 0.07 + d * 0.04, "square", leadGain, out);
      if (d > 0.7 && this.heat > 0.55 && step % 2 === 0) {
        this.tone(lead * 2, time, 0.05, "triangle", 0.022 * d, out);
      }
    }

    if (d < 0.2) {
      // Soft tick hats only on the bed
      if (drum === 3 || drum === 4) this.hat(time, out, 0.018);
      return;
    }

    const drumMul = Math.min(1, (d - 0.15) / 0.55);
    if ((drum === 1 || drum === 4) && d > 0.4) this.kick(time, out, 0.12 + 0.12 * drumMul);
    if (drum === 2 && d > 0.45) this.snare(time, out, 0.08 + 0.1 * drumMul);
    if (drum === 3 || drum === 4) {
      this.hat(time, out, (drum === 4 ? 0.025 : 0.04) * (0.4 + 0.6 * drumMul));
    }
  }

  /** Darker, slower half-time — reads as the boss scrap. */
  private scheduleBossStep(step: number, time: number): void {
    const out = this.master!;
    const d = Math.max(0.85, this.drop);
    const h = Math.max(0.75, this.heat);
    const bass = BOSS_BASS[step % BOSS_BASS.length]!;
    const lead = BOSS_LEAD[step % BOSS_LEAD.length]!;
    const fifth = BOSS_FIFTH[step % BOSS_FIFTH.length]!;
    const drum = BOSS_DRUMS[step % BOSS_DRUMS.length]!;

    if (bass !== null) {
      this.tone(bass, time, 0.14, "square", 0.09 + h * 0.05, out);
      // Sub octave for weight
      this.tone(bass * 0.5, time, 0.16, "triangle", 0.05 + h * 0.03, out);
    }
    if (fifth !== null) {
      this.tone(fifth, time, 0.12, "square", 0.035 + h * 0.025, out);
    }
    if (lead !== null) {
      this.tone(lead, time, 0.1, "square", 0.045 + h * 0.04, out);
      // Slightly detuned twin — ugly, serious
      this.tone(lead * 1.01, time, 0.09, "sawtooth", 0.018 + h * 0.012, out);
    }

    // Low drone pulse every bar
    if (step % 16 === 0) {
      this.tone(41.2, time, 0.45, "triangle", 0.04 + h * 0.02, out);
    }

    if ((drum === 1 || drum === 4) && d > 0.4) {
      this.kick(time, out, 0.2 + 0.1 * h);
    }
    if (drum === 2 && d > 0.45) {
      this.snare(time, out, 0.12 + 0.1 * h);
    }
    if (drum === 3 || drum === 4) {
      this.hat(time, out, (drum === 4 ? 0.03 : 0.045) * (0.5 + 0.5 * h));
    }
  }

  private tone(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    out: AudioNode,
  ): void {
    if (gain < 0.004) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private kick(time: number, out: AudioNode, peak = 0.22): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private snare(time: number, out: AudioNode, peak = 0.16): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.12);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, time);
    og.gain.setValueAtTime(peak * 0.5, time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(og);
    og.connect(out);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  private hat(time: number, out: AudioNode, gain: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer || gain < 0.004) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.05);
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}

/** Shared across Boot → Beach so the riff keeps rolling. */
export const chipRock = new ChipRockEngine();
