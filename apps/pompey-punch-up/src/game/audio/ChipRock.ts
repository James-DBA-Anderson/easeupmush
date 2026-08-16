/**
 * Procedural chiptune rock — square leads, pulse bass, noise kit.
 * No asset files; unlocks on first user gesture (autoplay policy).
 *
 * Level 1: quiet bed → fight drop. Boss fight gets a heavier, darker cut.
 * Arranged in 4-bar phrases with A/B sections so it doesn't loop flat.
 */

type Pattern = readonly (number | null)[];

/** Quiet bed → scrap → boss tension, or title cruise. */
export type ChipRockMode = "bed" | "fight" | "boss" | "title";

const TEMPO_FIGHT = 148;
const TEMPO_TITLE = 126;
const TEMPO_BOSS = 118;
const TEMPO_BED = 92;
const STEPS_PER_BEAT = 4; // 16th notes
const LOOKAHEAD = 0.05;
const SCHEDULE_AHEAD = 0.2;

const MASTER_BED = 0.062;
const MASTER_TITLE = 0.098;
const MASTER_FIGHT = 0.112;
const MASTER_BOSS = 0.132;

// ── Note helpers (Hz) ──────────────────────────────────────────────
const e2 = 82.41;
const fs2 = 92.5;
const g2 = 98;
const a2 = 110;
const b2 = 123.47;
const c3 = 130.81;
const d3 = 146.83;
const e3 = 164.81;
const fs3 = 185;
const g3 = 196;
const a3 = 220;
const b3 = 246.94;
const c4 = 261.63;
const d4 = 293.66;
const e4 = 329.63;
const fs4 = 369.99;
const g4 = 392;
const a4 = 440;
const b4 = 493.88;
const c5 = 523.25;
const d5 = 587.33;
const e5 = 659.25;

/**
 * 64 sixteenths = 4 bars. null = rest.
 * Fight bass — E minor drive with a turnaround into A.
 */
const FIGHT_BASS_A: Pattern = [
  // bar 1 E
  e2, null, e2, null, e2, e2, g2, null,
  // bar 2 G
  g2, null, g2, null, g2, g2, a2, null,
  // bar 3 A
  a2, null, a2, null, a2, a2, b2, null,
  // bar 4 B → walk home
  b2, null, b2, a2, g2, fs2, e2, g2,
  // bar 5 E octaves
  e2, e2, null, e2, null, e2, g2, a2,
  // bar 6 C → G
  c3, null, c3, null, g2, g2, a2, null,
  // bar 7 A punch
  a2, null, a2, a2, null, a2, c3, null,
  // bar 8 turnaround
  b2, a2, g2, e2, d3, c3, b2, a2,
];

const FIGHT_BASS_B: Pattern = [
  e2, null, null, e2, e2, null, g2, null,
  a2, null, a2, null, g2, null, e2, null,
  c3, null, c3, b2, a2, null, g2, null,
  e2, e2, g2, a2, b2, a2, g2, e2,
  e2, null, e2, e2, null, g2, a2, b2,
  c3, null, null, c3, b2, a2, g2, null,
  a2, a2, null, a2, c3, null, d3, null,
  e3, d3, c3, b2, a2, g2, e2, null,
];

/** Lead riff A — memorable Southsea scrap hook. */
const FIGHT_LEAD_A: Pattern = [
  e4, null, g4, a4, null, b4, a4, g4,
  e4, null, null, d4, e4, null, g4, null,
  a4, null, b4, c5, null, b4, a4, g4,
  fs4, null, e4, d4, e4, null, null, null,
  e4, g4, a4, null, b4, null, a4, g4,
  e4, null, d4, e4, g4, a4, null, null,
  a4, b4, c5, b4, a4, g4, e4, null,
  d4, e4, g4, a4, b4, a4, g4, e4,
];

/** Lead B — answer phrase, higher, more urgency. */
const FIGHT_LEAD_B: Pattern = [
  b4, null, a4, g4, null, a4, b4, c5,
  b4, null, null, a4, g4, null, e4, null,
  e5, null, d5, c5, null, b4, a4, g4,
  a4, null, g4, e4, null, null, null, null,
  g4, a4, b4, null, c5, null, b4, a4,
  g4, null, e4, g4, a4, null, b4, null,
  c5, b4, a4, g4, a4, null, e4, null,
  g4, a4, b4, a4, g4, fs4, e4, null,
];

/** Harmony fifths / power doubles under the lead. */
const FIGHT_FIFTH_A: Pattern = [
  b2, null, b2, null, b2, b2, d3, null,
  d3, null, d3, null, d3, d3, e3, null,
  e3, null, e3, null, e3, e3, g3, null,
  fs2, null, e3, d3, b2, a2, g2, e2,
  b2, b2, null, b2, null, b2, d3, e3,
  g3, null, g3, null, d3, d3, e3, null,
  e3, null, e3, e3, null, e3, g3, null,
  fs2, e3, d3, b2, a2, g2, e2, d3,
];

const FIGHT_ARP_A: Pattern = [
  e4, g4, b4, e5, b4, g4, e4, null,
  g4, b4, d5, g4, d5, b4, g4, null,
  a4, c5, e5, a4, e5, c5, a4, null,
  b4, d5, fs4, b4, a4, g4, e4, null,
  e4, null, g4, b4, null, e5, null, b4,
  g4, null, b4, d5, null, g4, null, null,
  a4, c5, null, e5, c5, a4, null, null,
  b4, null, a4, g4, e4, null, null, null,
];

/** 1 = kick, 2 = snare, 3 = hat, 4 = kick+hat, 5 = snare+hat, 6 = fill tom */
const FIGHT_DRUMS_A: Pattern = [
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 2, 3, 2, 3, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 4, 3,
  4, 3, 3, 3, 2, 3, 5, 3, 4, 2, 3, 2, 6, 2, 4, 2,
];

const FIGHT_DRUMS_B: Pattern = [
  4, 3, 4, 3, 2, 3, 3, 3, 4, 3, 3, 4, 2, 3, 3, 3,
  4, 3, 3, 3, 2, 3, 4, 3, 4, 3, 2, 3, 2, 5, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 3,
  4, 2, 3, 2, 5, 3, 2, 3, 6, 2, 6, 2, 2, 2, 4, 2,
];

/** Title — seaside arcade anthem; A = hook cruise, B = lift / chorus. */
const TITLE_BASS_A: Pattern = [
  // Em — walk the front
  e2, null, e2, null, e2, g2, a2, null,
  g2, null, g2, null, g2, a2, b2, null,
  a2, null, a2, null, a2, c3, d3, null,
  b2, null, a2, g2, e2, null, g2, a2,
  // repeat with punch
  e2, e2, null, e2, g2, null, a2, b2,
  c3, null, c3, null, g2, g2, a2, null,
  a2, null, a2, a2, c3, null, e3, null,
  d3, c3, b2, a2, g2, e2, null, null,
];

const TITLE_BASS_B: Pattern = [
  // Chorus lift — C → G → Am → Em
  c3, null, c3, null, c3, e3, g2, null,
  g2, null, g2, null, g2, b2, d3, null,
  a2, null, a2, a2, null, c3, e3, null,
  e2, e2, g2, a2, b2, a2, g2, e2,
  c3, null, null, c3, e3, null, g3, null,
  g2, null, b2, d3, null, g2, null, null,
  a2, a2, null, a2, c3, null, e3, d3,
  e3, d3, c3, b2, a2, g2, e2, null,
];

/** Memorable hook — singable over the scrap demos. */
const TITLE_LEAD_A: Pattern = [
  e4, null, g4, a4, b4, null, a4, g4,
  e4, null, null, d4, e4, null, g4, null,
  a4, null, b4, c5, null, b4, a4, g4,
  fs4, null, e4, d4, e4, null, null, null,
  e4, g4, a4, null, b4, null, a4, g4,
  e4, null, d4, e4, g4, a4, null, null,
  a4, b4, c5, b4, a4, g4, e4, null,
  g4, a4, null, b4, a4, g4, e4, null,
];

/** Chorus — higher, more open air. */
const TITLE_LEAD_B: Pattern = [
  g4, null, a4, b4, null, c5, b4, a4,
  g4, null, null, e4, g4, null, a4, null,
  c5, null, b4, a4, null, g4, a4, b4,
  a4, null, g4, e4, null, null, null, null,
  e5, null, d5, c5, null, b4, a4, g4,
  a4, null, g4, e4, null, g4, null, null,
  a4, c5, e5, null, d5, c5, b4, a4,
  g4, a4, b4, a4, g4, fs4, e4, null,
];

const TITLE_FIFTH_A: Pattern = [
  b3, null, null, b3, null, d4, null, null,
  d4, null, null, d4, null, e4, null, null,
  e4, null, null, e4, null, g4, null, null,
  fs3, null, e4, d4, b3, null, null, null,
  b3, null, b3, null, d4, null, e4, null,
  g3, null, null, g3, null, null, null, null,
  e4, null, e4, null, g4, null, null, null,
  fs3, null, e4, null, d4, b3, null, null,
];

const TITLE_FIFTH_B: Pattern = [
  e4, null, null, e4, null, g4, null, null,
  d4, null, null, d4, null, g4, null, null,
  e4, null, e4, null, null, a4, null, null,
  b3, null, a3, g3, e3, null, null, null,
  g4, null, null, g4, null, e4, null, null,
  d4, null, g4, null, null, d4, null, null,
  e4, null, a4, null, g4, e4, null, null,
  b3, a3, g3, fs3, e3, null, null, null,
];

const TITLE_ARP_A: Pattern = [
  e4, g4, b4, e5, null, b4, g4, null,
  g4, b4, d5, null, g4, null, null, null,
  a4, c5, e5, null, a4, e5, c5, null,
  b4, d5, null, fs4, b3, null, null, null,
  e4, null, g4, b4, null, e5, null, b4,
  g4, null, b4, d5, null, null, null, null,
  a4, c5, null, e5, null, c5, a4, null,
  b4, null, a4, g4, e4, null, null, null,
];

const TITLE_ARP_B: Pattern = [
  c5, e5, g4, c5, null, g4, e5, null,
  g4, b4, d5, null, g4, d5, null, null,
  a4, c5, e5, a4, null, e5, null, null,
  e4, g4, b4, e5, b4, g4, e4, null,
  c5, null, e5, g4, null, c5, null, null,
  b4, d5, g4, null, d5, null, null, null,
  a4, null, c5, e5, null, a4, null, null,
  e5, d5, c5, b4, a4, g4, e4, null,
];

const TITLE_DRUMS_A: Pattern = [
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 3, 3,
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 4, 2, 3, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 3, 3,
  4, 3, 3, 3, 2, 3, 5, 3, 4, 3, 2, 3, 2, 3, 4, 2,
];

const TITLE_DRUMS_B: Pattern = [
  4, 3, 4, 3, 2, 3, 3, 3, 4, 3, 3, 3, 2, 3, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 2, 3, 2, 5, 4, 3,
  4, 3, 3, 3, 2, 3, 3, 3, 4, 3, 3, 4, 2, 3, 3, 3,
  4, 2, 3, 2, 5, 3, 2, 3, 6, 2, 6, 2, 2, 2, 4, 2,
];

/** Boss — low drone crawl, sparse menace. */
const BOSS_BASS: Pattern = [
  65.41, null, 65.41, 65.41, null, 65.41, e2, null,
  73.42, null, 73.42, 73.42, null, 73.42, g2, null,
  e2, null, e2, e2, null, e2, a2, null,
  77.78, null, 77.78, 73.42, 69.3, 65.41, 61.74, 58.27,
  65.41, 65.41, null, 65.41, null, e2, null, null,
  73.42, null, null, 73.42, g2, null, fs2, null,
  e2, null, e2, null, a2, null, g2, null,
  fs2, e2, 73.42, 65.41, 61.74, 58.27, 55, 51.91,
];

const BOSS_LEAD: Pattern = [
  311.13, null, null, e4, null, null, d4, null,
  null, b3, null, 233.08, a3, null, null, null,
  311.13, e4, null, 349.23, null, e4, 311.13, null,
  b3, null, a3, null, g3, null, 185, 174.61,
  311.13, null, e4, null, null, d4, null, b3,
  null, null, 233.08, a3, null, g3, null, null,
  e4, null, 311.13, null, d4, c4, b3, null,
  a3, null, g3, null, fs4, e4, d4, 311.13,
];

const BOSS_FIFTH: Pattern = [
  g2, null, null, g2, null, null, b2, null,
  a2, null, null, a2, null, null, d3, null,
  b2, null, null, b2, null, null, e3, null,
  116.54, null, a2, null, 103.83, g2, fs2, e2,
  g2, null, g2, null, null, b2, null, null,
  a2, null, null, a2, d3, null, null, null,
  b2, null, b2, null, e3, null, d3, null,
  116.54, a2, g2, fs2, e2, 73.42, 65.41, 61.74,
];

const BOSS_DRUMS: Pattern = [
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 2,
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 2, 3, 4, 2, 4, 2,
  4, 3, 3, 3, 2, 3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 2,
  4, 3, 2, 3, 2, 3, 5, 2, 4, 2, 6, 2, 4, 2, 4, 2,
];

/**
 * Quiet promenade bed — Em stroll before the scrap.
 * Slow pulse + soft fifths + sparse melody (no kit).
 */
const BED_PULSE: Pattern = [
  // Em
  e2, null, null, null, null, null, null, null,
  null, null, null, null, e2, null, null, null,
  // G
  g2, null, null, null, null, null, null, null,
  null, null, null, null, g2, null, null, null,
  // Am
  a2, null, null, null, null, null, null, null,
  null, null, null, null, a2, null, null, null,
  // B7 → home
  b2, null, null, null, null, null, null, null,
  a2, null, null, null, g2, null, e2, null,
];

const BED_FIFTH: Pattern = [
  b2, null, null, null, null, null, null, null,
  null, null, null, null, b2, null, null, null,
  d3, null, null, null, null, null, null, null,
  null, null, null, null, d3, null, null, null,
  e3, null, null, null, null, null, null, null,
  null, null, null, null, e3, null, null, null,
  fs2, null, null, null, null, null, null, null,
  e3, null, null, null, d3, null, b2, null,
];

const BED_ARP: Pattern = [
  null, null, e4, null, null, g4, null, null,
  null, b4, null, null, null, null, null, null,
  null, null, g4, null, null, b4, null, null,
  null, d5, null, null, null, null, null, null,
  null, null, a4, null, null, c5, null, null,
  null, e5, null, null, null, null, null, null,
  null, null, b4, null, null, a4, null, null,
  null, g4, null, null, e4, null, null, null,
];

/** Soft whistled lead — one note every beat or two. */
const BED_LEAD: Pattern = [
  e4, null, null, null, null, null, g4, null,
  null, null, null, null, b4, null, null, null,
  a4, null, null, null, null, null, g4, null,
  null, null, e4, null, null, null, null, null,
  g4, null, null, null, null, null, a4, null,
  null, null, null, null, b4, null, null, null,
  a4, null, null, null, g4, null, e4, null,
  null, null, d4, null, e4, null, null, null,
];

class ChipRockEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
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
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 3.2;
      this.comp.attack.value = 0.01;
      this.comp.release.value = 0.18;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
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
      // From title: ease down into the calm promenade bed
      this.applyMaster(MASTER_BED, was === "title" ? 1.6 : 0.7);
    } else if (mode === "title") {
      this.dropTarget = 0.75;
      this.drop = 0.75;
      this.step = 0;
      this.applyMaster(MASTER_TITLE, 0.25);
    } else if (mode === "boss") {
      this.dropTarget = 1;
      if (was !== "boss") {
        this.drop = Math.max(this.drop, 0.85);
        this.step = 0;
      }
      this.applyMaster(MASTER_BOSS, was === "fight" ? 0.55 : 1.1);
    } else {
      // Fight drop — keep bed under it while drop rises (see scheduleStep)
      this.dropTarget = 1;
      if (was === "bed" || this.drop < 0.3) {
        this.drop = Math.min(this.drop, 0.12);
        this.applyMaster(MASTER_FIGHT, 2.4);
      } else if (was === "boss") {
        this.step = 0;
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
    if (this.mode === "boss") return TEMPO_BOSS;
    if (this.mode === "title") return TEMPO_TITLE;
    if (this.mode === "bed") return TEMPO_BED;
    // Fight still climbing out of the bed — ease tempo up with the drop
    if (this.drop < 0.55) {
      return TEMPO_BED + (TEMPO_FIGHT - TEMPO_BED) * (this.drop / 0.55);
    }
    return TEMPO_FIGHT;
  }

  private tick = (): void => {
    if (!this.playing || !this.ctx) return;
    const dt = LOOKAHEAD;
    if (this.drop < this.dropTarget) {
      // Bed → fight takes ~2.6s so the calm bed bleeds under the drop
      const riseSec = this.mode === "fight" && this.drop < 0.55 ? 2.6 : 1.15;
      this.drop = Math.min(this.dropTarget, this.drop + dt / riseSec);
    } else if (this.drop > this.dropTarget) {
      this.drop = Math.max(this.dropTarget, this.drop - dt / 0.8);
    }
    const loopLen = 64;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextNoteTime);
      const secondsPerStep = 60 / this.tempo() / STEPS_PER_BEAT;
      // Light swing on even 16ths — loosens the march feel
      const swing =
        this.mode !== "boss" && this.step % 2 === 1
          ? secondsPerStep * 0.12
          : 0;
      this.nextNoteTime += secondsPerStep + swing;
      // 128 steps = A then B phrase
      this.step = (this.step + 1) % (loopLen * 2);
    }
    this.timer = window.setTimeout(this.tick, LOOKAHEAD * 1000);
  };

  private scheduleStep(step: number, time: number): void {
    if (this.mode === "boss") {
      this.scheduleBossStep(step % 64, time);
      return;
    }
    if (this.mode === "title") {
      this.scheduleTitleStep(step % 64, time);
      return;
    }
    if (this.mode === "bed") {
      this.scheduleBedStep(step % 64, time);
      return;
    }
    // Fight — keep the calm bed under the rising drop, then hand off
    if (this.drop < 0.55) {
      this.scheduleBedStep(step % 64, time, 1 - this.drop / 0.55);
      if (this.drop < 0.22) return;
    }
    this.scheduleFightStep(step, time);
  }

  private sectionB(step: number): boolean {
    return Math.floor(step / 64) % 2 === 1;
  }

  private scheduleBedStep(step: number, time: number, level = 1): void {
    const out = this.master!;
    const mul = Math.max(0, Math.min(1, level));
    if (mul < 0.05) return;
    const i = step % 64;
    const pulse = BED_PULSE[i]!;
    const fifth = BED_FIFTH[i]!;
    const arp = BED_ARP[i]!;
    const lead = BED_LEAD[i]!;

    if (pulse !== null) {
      this.tone(pulse, time, 0.42, "triangle", 0.052 * mul, out);
      this.tone(pulse * 2, time, 0.5, "sine", 0.028 * mul, out);
      this.tone(pulse * 3, time, 0.35, "sine", 0.012 * mul, out);
    }
    if (fifth !== null) {
      this.tone(fifth, time, 0.36, "triangle", 0.022 * mul, out);
      this.tone(fifth * 2, time, 0.3, "sine", 0.01 * mul, out);
    }
    if (arp !== null) {
      this.tone(arp, time, 0.16, "triangle", 0.026 * mul, out);
      this.tone(arp * 0.5, time, 0.14, "sine", 0.01 * mul, out);
    }
    if (lead !== null) {
      this.tone(lead, time, 0.2, "triangle", 0.034 * mul, out, 0.0012);
      this.tone(lead * 2, time, 0.12, "sine", 0.01 * mul, out);
    }
    // Soft coastal hush — no kick/snare on the bed
    if (i % 8 === 4) this.hat(time, out, 0.012 * mul);
    if (i % 16 === 0) this.hat(time, out, 0.009 * mul);
  }

  private scheduleTitleStep(step: number, time: number): void {
    const out = this.master!;
    const d = Math.max(0.6, this.drop);
    const i = step % 64;
    // Full step (0..127) for A/B — scheduleTitleStep receives step % 64 from
    // scheduleStep, so use this.step for section pick
    const bSide = this.sectionB(this.step);
    const bass = (bSide ? TITLE_BASS_B : TITLE_BASS_A)[i]!;
    const lead = (bSide ? TITLE_LEAD_B : TITLE_LEAD_A)[i]!;
    const fifth = (bSide ? TITLE_FIFTH_B : TITLE_FIFTH_A)[i]!;
    const arp = (bSide ? TITLE_ARP_B : TITLE_ARP_A)[i]!;
    const drum = (bSide ? TITLE_DRUMS_B : TITLE_DRUMS_A)[i]!;

    if (bass !== null) {
      this.tone(bass, time, 0.12, "square", 0.058 * d, out);
      this.tone(bass * 0.5, time, 0.14, "triangle", 0.032 * d, out);
    }
    if (fifth !== null && i % 2 === 0) {
      this.tone(fifth, time, 0.1, "square", 0.022 * d, out);
    }
    if (lead !== null) {
      this.tone(lead, time, 0.095, "square", 0.052 * d, out, 0.0016);
      this.tone(lead * 1.5, time, 0.065, "triangle", 0.016 * d, out);
      if (bSide) {
        this.tone(lead * 2, time, 0.05, "triangle", 0.01 * d, out);
      }
    }
    if (arp !== null && (bSide || i % 2 === 0)) {
      this.tone(arp, time, 0.07, "triangle", (bSide ? 0.026 : 0.02) * d, out);
    }
    // Soft pad root every bar
    if (i % 16 === 0 && bass !== null) {
      this.tone(bass * 2, time, 0.45, "sine", 0.018 * d, out);
    }
    if (i === 0) this.crash(time, out, bSide ? 0.055 : 0.04);

    if ((drum === 1 || drum === 4) && d > 0.4) this.kick(time, out, 0.15);
    if ((drum === 2 || drum === 5) && d > 0.4) this.snare(time, out, 0.095);
    if (drum === 6) this.tom(time, out, 0.08);
    if (drum === 3 || drum === 4 || drum === 5) {
      this.hat(time, out, drum === 4 ? 0.03 : 0.04);
    }
  }

  private scheduleFightStep(step: number, time: number): void {
    const out = this.master!;
    const d = this.drop;
    const h = this.heat;
    const i = step % 64;
    const bSide = this.sectionB(step);
    const bassPat = bSide ? FIGHT_BASS_B : FIGHT_BASS_A;
    const leadPat = bSide ? FIGHT_LEAD_B : FIGHT_LEAD_A;
    const drumPat = bSide ? FIGHT_DRUMS_B : FIGHT_DRUMS_A;
    const bass = bassPat[i]!;
    const lead = leadPat[i]!;
    const fifth = FIGHT_FIFTH_A[i]!;
    const arp = FIGHT_ARP_A[i]!;
    const drum = drumPat[i]!;

    if (bass !== null) {
      const everyOther = d < 0.4 && i % 2 !== 0;
      if (!everyOther) {
        const g = 0.048 + d * (0.055 + h * 0.035);
        this.tone(bass, time, 0.1 + d * 0.025, "square", g, out);
        this.tone(bass * 0.5, time, 0.12, "triangle", g * 0.45, out);
      }
    }
    if (fifth !== null && d > 0.4) {
      this.tone(fifth, time, 0.1, "square", (0.028 + h * 0.025) * d, out);
    }
    if (lead !== null && d > 0.28) {
      const leadGain = (0.028 + d * 0.045 + h * 0.04) * Math.min(1, d * 1.15);
      this.tone(lead, time, 0.075 + d * 0.035, "square", leadGain, out, 0.0022);
      if (d > 0.65 && h > 0.45) {
        this.tone(lead * 2, time, 0.05, "triangle", 0.018 * d, out);
      }
    }
    if (arp !== null && d > 0.55 && h > 0.35 && i % 2 === 0) {
      this.tone(arp, time, 0.055, "triangle", 0.016 * d * h, out);
    }

    if (d < 0.22) return;

    const drumMul = Math.min(1, (d - 0.15) / 0.5);
    if (i === 0 && d > 0.7) this.crash(time, out, 0.04 + h * 0.025);
    if ((drum === 1 || drum === 4) && d > 0.35) {
      this.kick(time, out, 0.13 + 0.11 * drumMul);
    }
    if ((drum === 2 || drum === 5) && d > 0.4) {
      this.snare(time, out, 0.085 + 0.09 * drumMul);
    }
    if (drum === 6 && d > 0.5) this.tom(time, out, 0.1 * drumMul);
    if (drum === 3 || drum === 4 || drum === 5) {
      this.hat(
        time,
        out,
        (drum === 4 ? 0.026 : 0.042) * (0.35 + 0.65 * drumMul),
      );
    }
  }

  private scheduleBossStep(step: number, time: number): void {
    const out = this.master!;
    const d = Math.max(0.85, this.drop);
    const h = Math.max(0.75, this.heat);
    const bass = BOSS_BASS[step]!;
    const lead = BOSS_LEAD[step]!;
    const fifth = BOSS_FIFTH[step]!;
    const drum = BOSS_DRUMS[step]!;

    if (bass !== null) {
      this.tone(bass, time, 0.15, "square", 0.095 + h * 0.045, out);
      this.tone(bass * 0.5, time, 0.18, "triangle", 0.055 + h * 0.03, out);
    }
    if (fifth !== null) {
      this.tone(fifth, time, 0.13, "square", 0.032 + h * 0.022, out);
    }
    if (lead !== null) {
      this.tone(lead, time, 0.11, "square", 0.048 + h * 0.038, out, 0.0015);
      this.tone(lead * 1.008, time, 0.1, "sawtooth", 0.016 + h * 0.012, out);
    }

    if (step % 16 === 0) {
      this.tone(41.2, time, 0.5, "triangle", 0.045 + h * 0.02, out);
    }
    if (step === 0) this.crash(time, out, 0.055);

    if ((drum === 1 || drum === 4) && d > 0.4) {
      this.kick(time, out, 0.22 + 0.1 * h);
    }
    if ((drum === 2 || drum === 5) && d > 0.45) {
      this.snare(time, out, 0.13 + 0.1 * h);
    }
    if (drum === 6) this.tom(time, out, 0.12 + 0.05 * h);
    if (drum === 3 || drum === 4 || drum === 5) {
      this.hat(time, out, (drum === 4 ? 0.03 : 0.048) * (0.5 + 0.5 * h));
    }
  }

  private tone(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    out: AudioNode,
    vibrato = 0,
  ): void {
    if (gain < 0.004 || !(freq > 0)) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.setValueAtTime(5.5, time);
      lfoG.gain.setValueAtTime(freq * vibrato, time);
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + dur + 0.03);
    }
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(gain * 0.7, time + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  private kick(time: number, out: AudioNode, peak = 0.22): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.14);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private snare(time: number, out: AudioNode, peak = 0.16): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1950;
    bp.Q.value = 0.85;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.13);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(195, time);
    og.gain.setValueAtTime(peak * 0.45, time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    osc.connect(og);
    og.connect(out);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  private tom(time: number, out: AudioNode, peak = 0.1): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.12);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private hat(time: number, out: AudioNode, gain: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer || gain < 0.004) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.045);
  }

  private crash(time: number, out: AudioNode, peak: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer || peak < 0.01) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4500;
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.5);
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Slightly brown-ish noise — less harsh hats
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }
}

/** Shared across Boot → Beach so the riff keeps rolling. */
export const chipRock = new ChipRockEngine();
