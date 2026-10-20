/** Procedural SFX for Backflip Bill — no sample files. */

export type AmbienceKind = "park" | "rooftop" | "woods" | "train";

export function ambienceOf(level: { theme?: string; train?: unknown }): AmbienceKind {
  if (level.train) return "train";
  if (level.theme === "woods") return "woods";
  if (level.theme === "park") return "park";
  return "rooftop";
}

interface LoopVoice {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private whoosh: LoopVoice | null = null;
  private wind: LoopVoice | null = null;
  private scrape: LoopVoice | null = null;
  private bedAir: LoopVoice | null = null;
  private bedHum: LoopVoice | null = null;
  private bedLeaves: LoopVoice | null = null;
  private bedWater: LoopVoice | null = null;
  private ambience: AmbienceKind | "off" = "off";
  private nextCueAt = 0;
  private nextClackAt = 0;
  private lastAt = new Map<string, number>();

  private ensure(): AudioContext | null {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx, 0.55, false);
      this.brown = makeNoise(this.ctx, 0.9, true);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ensureLoops();
    return this.ctx;
  }

  public resume(): void {
    this.ensure();
  }

  /** Keep air whoosh / fall wind in step with the body, and the level bed. */
  public tick(info: {
    flipping: boolean;
    omega: number;
    air: boolean;
    fall: number;
    speed: number;
    scrape?: number;
    ambience?: AmbienceKind | "off";
    river?: number;
    hush?: number;
  }): void {
    const ctx = this.ensure();
    if (!ctx || !this.whoosh || !this.wind || !this.scrape) return;
    const t = ctx.currentTime;
    const spin = info.flipping ? Math.max(0, info.omega) : 0;
    const whooshGain = info.air && spin > 0.4 ? Math.min(0.11, 0.018 + spin * 0.014) : 0.0001;
    const whooshHz = 320 + Math.min(1600, spin * 95 + info.speed * 18);
    setParam(this.whoosh.gain.gain, whooshGain, t, 0.08);
    setParam(this.whoosh.filter.frequency, whooshHz, t, 0.1);

    const fall = info.air ? Math.max(0, info.fall) : 0;
    const windGain =
      info.air && (fall > 1.2 || info.speed > 4)
        ? Math.min(0.055, 0.008 + fall * 0.004 + info.speed * 0.002)
        : 0.0001;
    const windHz = 480 + Math.min(1400, fall * 70 + info.speed * 22);
    setParam(this.wind.gain.gain, windGain, t, 0.12);
    setParam(this.wind.filter.frequency, windHz, t, 0.14);

    const scrape = Math.max(0, info.scrape ?? 0);
    const scrapeGain = scrape > 0.05 ? Math.min(0.1, 0.02 + scrape * 0.075) : 0.0001;
    const scrapeHz = 620 + scrape * 780 + Math.sin(t * 31) * 90;
    setParam(this.scrape.gain.gain, scrapeGain, t, 0.07);
    setParam(this.scrape.filter.frequency, scrapeHz, t, 0.09);

    this.tickAmbience(info.ambience ?? "off", info.river ?? 0, info.hush ?? 0, fall);
  }

  public jump(): void {
    this.noiseBurst(0.09, 0.07, 900, 2.2);
    this.sweep(190, 560, 0.13, 0.1, "triangle");
    this.thud(92, 0.09, 0.1);
  }

  public splash(heavy = false): void {
    const k = heavy ? 1.5 : 1;
    this.noiseBurst(0.14 * k, 0.1 * k, 280, 1.3);
    this.thud(56, 0.1 * k, 0.08 * k);
    this.sweep(210, 70, 0.18 * k, 0.07, "sine");
    if (heavy) {
      this.noiseBurst(0.22, 0.16, 160, 0.7);
      this.thud(38, 0.2, 0.14);
      this.sweep(140, 42, 0.28, 0.09, "sine");
    }
  }

  public cleanLand(impact = 6): void {
    const k = clamp(impact / 10, 0.45, 1.15);
    this.thud(78, 0.14, 0.16 * k);
    this.noiseBurst(0.07, 0.05 * k, 420, 0.8);
    this.sweep(220, 140, 0.08, 0.05, "sine");
  }

  public stumble(impact = 8): void {
    const k = clamp(impact / 10, 0.5, 1.2);
    this.thud(64, 0.16, 0.15 * k);
    this.noiseBurst(0.12, 0.09 * k, 280, 0.6);
    this.sweep(240, 70, 0.12, 0.07, "square");
  }

  public fall(impact = 10): void {
    const k = clamp(impact / 12, 0.55, 1.25);
    this.noiseBurst(0.2, 0.12 * k, 180, 0.45);
    this.thud(48, 0.22, 0.18 * k);
    this.sweep(180, 42, 0.24, 0.09, "sawtooth");
  }

  public death(): void {
    this.noiseBurst(0.28, 0.1, 220, 0.5);
    this.sweep(260, 48, 0.36, 0.1, "triangle");
  }

  public finish(): void {
    this.arpeggio([392, 523, 659, 784], 0.09, 0.07, "triangle");
  }

  public celebrate(): void {
    this.arpeggio([523, 659, 784, 1046], 0.08, 0.075, "square");
  }

  public results(): void {
    this.arpeggio([392, 494, 587, 784, 988], 0.1, 0.08, "triangle");
  }

  public levelStart(): void {
    if (!this.gate("level", 0.4)) return;
    this.arpeggio([330, 440], 0.1, 0.05, "sine");
  }

  public bonus(kind: "layout" | "extra" | "star"): void {
    if (kind === "layout") {
      if (!this.gate("layout", 0.12)) return;
      this.sweep(880, 1180, 0.05, 0.035, "sine");
      return;
    }
    if (kind === "extra") {
      this.arpeggio([520, 760, 980], 0.055, 0.065, "square");
      return;
    }
    this.arpeggio([660, 880, 1175, 1568], 0.05, 0.07, "triangle");
  }

  public miss(): void {
    this.sweep(420, 110, 0.22, 0.07, "sine");
    this.noiseBurst(0.12, 0.04, 500, 1.1);
  }

  public snap(): void {
    this.noiseBurst(0.045, 0.16, 2400, 3.2);
    this.sweep(980, 210, 0.05, 0.12, "square");
    this.sweep(260, 70, 0.08, 0.09, "sawtooth");
  }

  public foot(speed = 0.6): void {
    if (!this.gate("foot", 0.11)) return;
    const k = 0.75 + 0.55 * clamp(speed, 0.2, 1);
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    this.thud(74 * jitter, 0.1, 0.34 * k);
    this.thud(140 * jitter, 0.045, 0.14 * k);
    this.noiseBurst(0.08, 0.18 * k, 480, 1.05);
  }

  public skid(): void {
    if (!this.gate("skid", 0.35)) return;
    this.noiseBurst(0.22, 0.08, 1100, 2.4);
    this.sweep(180, 70, 0.18, 0.05, "sawtooth");
  }

  public nestKnock(): void {
    if (!this.gate("nest", 0.4)) return;
    this.noiseBurst(0.1, 0.09, 720, 1.4);
    this.sweep(340, 90, 0.14, 0.06, "triangle");
    this.thud(70, 0.07, 0.07);
  }

  public eggSplat(): void {
    if (!this.gate("splat", 0.08)) return;
    this.noiseBurst(0.07, 0.09, 240, 0.7);
    this.thud(52, 0.08, 0.06);
    this.sweep(180, 70, 0.09, 0.04, "sine");
  }

  public grit(): void {
    if (!this.gate("grit", 0.2)) return;
    this.noiseBurst(0.055, 0.03 + Math.random() * 0.028, 780 + Math.random() * 820, 1.7);
  }

  public tuck(): void {
    if (!this.gate("tuck", 0.16)) return;
    this.sweep(520, 180, 0.1, 0.045, "triangle");
    this.noiseBurst(0.08, 0.045, 1400, 1.6);
  }

  public extend(): void {
    if (!this.gate("extend", 0.16)) return;
    this.sweep(220, 640, 0.12, 0.05, "triangle");
    this.noiseBurst(0.09, 0.04, 900, 1.3);
  }

  public hoopPass(): void {
    this.noiseBurst(0.16, 0.08, 650, 0.7);
    this.sweep(420, 210, 0.18, 0.06, "sine");
    this.arpeggio([660, 330], 0.07, 0.04, "triangle");
  }

  public hoopClang(): void {
    if (!this.gate("clang", 0.22)) return;
    this.noiseBurst(0.08, 0.1, 1800, 2.8);
    this.sweep(1480, 420, 0.09, 0.08, "square");
    this.sweep(880, 220, 0.12, 0.05, "triangle");
  }

  public junkClatter(kind: string, mag: number): void {
    const k = clamp(mag / 7, 0.32, 1.2);
    if (kind === "trolley") {
      if (!this.gate("trolley", 0.07)) return;
      this.noiseBurst(0.07 * k, 0.11 * k, 1500 + Math.random() * 500, 2.5);
      this.sweep(880 + Math.random() * 220, 160, 0.12, 0.075 * k, "square");
      this.thud(64 + Math.random() * 18, 0.08, 0.09 * k);
      this.sweep(420, 90, 0.16, 0.04 * k, "triangle");
    } else if (kind === "tyre") {
      if (!this.gate("tyre", 0.09)) return;
      this.thud(46 + Math.random() * 10, 0.13, 0.1 * k);
      this.noiseBurst(0.11, 0.07 * k, 210 + Math.random() * 80, 0.7);
    } else if (kind === "cone") {
      if (!this.gate("cone", 0.06)) return;
      this.noiseBurst(0.05, 0.065 * k, 1900 + Math.random() * 500, 3);
      this.sweep(1420, 560, 0.07, 0.05 * k, "triangle");
    } else {
      if (!this.gate("bag", 0.09)) return;
      this.noiseBurst(0.13, 0.08 * k, 170, 0.75);
      this.thud(40, 0.1, 0.055 * k);
    }
  }

  public bodyHit(mag: number): void {
    if (!this.gate("hit", 0.09)) return;
    const k = clamp(mag / 9, 0.35, 1.2);
    this.thud(54 + mag * 2, 0.14, 0.12 * k);
    this.noiseBurst(0.1, 0.07 * k, 240, 0.55);
  }

  public stretch(): void {
    if (!this.gate("stretch", 0.35)) return;
    this.noiseBurst(0.12, 0.035, 480, 0.9);
    this.sweep(180, 260, 0.14, 0.03, "sine");
  }

  public warn(): void {
    if (!this.gate("warn", 0.55)) return;
    this.arpeggio([392, 330], 0.08, 0.06, "square");
    this.noiseBurst(0.07, 0.04, 1400, 2.2);
  }

  public altLow(): void {
    if (!this.gate("altLow", 0.7)) return;
    this.arpeggio([523, 392, 330], 0.07, 0.055, "square");
    this.sweep(640, 220, 0.16, 0.05, "triangle");
  }

  public grab(): void {
    this.noiseBurst(0.08, 0.05, 380, 0.8);
    this.thud(70, 0.08, 0.06);
    this.sweep(180, 320, 0.1, 0.04, "sine");
  }

  public drop(): void {
    this.noiseBurst(0.1, 0.045, 500, 1);
    this.sweep(240, 90, 0.1, 0.04, "triangle");
  }

  public folkYell(): void {
    if (!this.gate("yell", 0.38)) return;
    this.sweep(430, 190, 0.2, 0.075, "square");
    this.sweep(520, 260, 0.12, 0.045, "sawtooth");
    this.noiseBurst(0.09, 0.04, 980, 1.5);
  }

  private tickAmbience(
    kind: AmbienceKind | "off",
    river: number,
    hush: number,
    fall: number,
  ): void {
    if (!this.ctx || !this.bedAir || !this.bedHum || !this.bedLeaves || !this.bedWater) return;
    const t = this.ctx.currentTime;
    if (kind !== this.ambience) {
      this.ambience = kind;
      this.nextCueAt = t + 0.8 + Math.random() * 0.7;
      this.nextClackAt = t + 0.18;
    }
    const duck = 1 - clamp(hush, 0, 1) * 0.78;
    const gust = 1 + 0.16 * Math.sin(t * 0.21) + 0.09 * Math.sin(t * 0.67);
    const fallDuck = fall > 1.6 ? 0.45 : 1;
    let air = 0;
    let hum = 0;
    let leaves = 0;
    let water = 0;
    let airHz = 420;
    let humHz = 90;
    if (kind === "park") {
      air = 0.02;
      hum = 0.011;
      leaves = 0.026;
      airHz = 380;
      humHz = 70;
    } else if (kind === "rooftop") {
      air = 0.034;
      hum = 0.024;
      leaves = 0.008;
      airHz = 520;
      humHz = 58;
    } else if (kind === "woods") {
      air = 0.018;
      hum = 0.008;
      leaves = 0.032;
      water = 0.012 + clamp(river, 0, 1) * 0.07;
      airHz = 340;
      humHz = 80;
    } else if (kind === "train") {
      air = 0.04;
      hum = 0.05;
      airHz = 640;
      humHz = 48;
    }
    setParam(this.bedAir.gain.gain, air * gust * duck * fallDuck, t, 0.55);
    setParam(this.bedAir.filter.frequency, airHz * (0.92 + 0.08 * gust), t, 0.4);
    setParam(this.bedHum.gain.gain, hum * duck, t, 0.7);
    setParam(this.bedHum.filter.frequency, humHz, t, 0.5);
    setParam(this.bedLeaves.gain.gain, leaves * gust * duck, t, 0.45);
    setParam(this.bedWater.gain.gain, water * duck, t, 0.6);

    if (kind === "train" && t >= this.nextClackAt) {
      this.trainClack();
      this.nextClackAt = t + 0.34 + Math.random() * 0.05;
    }
    if (kind !== "off" && t >= this.nextCueAt) this.playCue(kind);
  }

  private playCue(kind: AmbienceKind): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const roll = Math.random();
    if (kind === "park") {
      if (roll < 0.72) this.birdChirp(0.026);
      else this.carPass(0.03);
      this.nextCueAt = t + 2.6 + Math.random() * 4.2;
      return;
    }
    if (kind === "rooftop") {
      if (roll < 0.42) this.gullCry(0.032);
      else if (roll < 0.88) this.carPass(0.038);
      else this.birdChirp(0.018);
      this.nextCueAt = t + 3.4 + Math.random() * 6.5;
      return;
    }
    if (kind === "woods") {
      if (roll < 0.7) this.birdChirp(0.03);
      else if (roll < 0.9) this.windGust();
      else this.foxYip();
      this.nextCueAt = t + 1.8 + Math.random() * 3.6;
      return;
    }
    this.windGust();
    this.nextCueAt = t + 4.2 + Math.random() * 6.5;
  }

  private birdChirp(peak: number): void {
    const pan = (Math.random() - 0.5) * 1.5;
    const base = 1680 + Math.random() * 920;
    const hop = 0.055 + Math.random() * 0.04;
    this.chirp(base, base * (1.08 + Math.random() * 0.12), 0.055, peak, pan, 2400);
    this.chirp(base * 1.06, base * 0.92, 0.05, peak * 0.7, pan, 2200, hop);
    if (Math.random() < 0.45) {
      this.chirp(base * 0.94, base * 1.12, 0.045, peak * 0.55, pan, 2100, hop * 2);
    }
  }

  private gullCry(peak: number): void {
    const pan = (Math.random() - 0.5) * 1.3;
    const base = 920 + Math.random() * 200;
    this.chirp(base, base * 0.7, 0.18, peak, pan, 1500);
    this.chirp(base * 0.88, base * 0.54, 0.22, peak * 0.65, pan, 1300, 0.1);
  }

  private foxYip(): void {
    const pan = (Math.random() - 0.5) * 1.4;
    this.chirp(640, 280, 0.16, 0.028, pan, 720);
    this.chirp(520, 210, 0.12, 0.018, pan, 600, 0.12);
  }

  private windGust(): void {
    this.noiseBurst(0.55, 0.048, 340, 0.55);
    this.noiseBurst(0.85, 0.028, 980, 0.45);
  }

  private carPass(peak: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t0 = ctx.currentTime;
    const dur = 1.15;
    const from = Math.random() < 0.5 ? -0.92 : 0.92;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(240, t0);
    filter.frequency.exponentialRampToValueAtTime(620, t0 + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
    filter.Q.value = 1.1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    pan.pan.setValueAtTime(from, t0);
    pan.pan.linearRampToValueAtTime(-from, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private trainClack(): void {
    this.thud(62 + Math.random() * 10, 0.045, 0.035);
    this.noiseBurst(0.03, 0.04, 1280 + Math.random() * 400, 2.1);
  }

  private chirp(
    from: number,
    to: number,
    dur: number,
    peak: number,
    panAmt: number,
    formant: number,
    delay = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(panAmt, -1, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = formant;
    bp.Q.value = 1.15;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, to), t + dur);
    const partial = ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.setValueAtTime(from * 1.5, t);
    partial.frequency.exponentialRampToValueAtTime(Math.max(90, to * 1.5), t + dur);
    const pg = ctx.createGain();
    pg.gain.value = 0.14;
    osc.connect(bp);
    partial.connect(pg);
    pg.connect(bp);
    bp.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    osc.start(t);
    partial.start(t);
    osc.stop(t + dur + 0.03);
    partial.stop(t + dur + 0.03);
  }

  private ensureLoops(): void {
    if (!this.ctx || !this.master || !this.brown) return;
    if (!this.whoosh) this.whoosh = this.loopVoice(this.brown, "bandpass", 500, 0.9);
    if (!this.wind) this.wind = this.loopVoice(this.brown, "highpass", 700, 0.5);
    if (!this.scrape) this.scrape = this.loopVoice(this.noise ?? this.brown, "bandpass", 920, 1.2);
    if (!this.bedAir) this.bedAir = this.loopVoice(this.brown, "highpass", 420, 0.55);
    if (!this.bedHum) this.bedHum = this.loopVoice(this.brown, "lowpass", 80, 0.7);
    if (!this.bedLeaves) this.bedLeaves = this.loopVoice(this.noise ?? this.brown, "bandpass", 2100, 0.55);
    if (!this.bedWater) this.bedWater = this.loopVoice(this.noise ?? this.brown, "bandpass", 360, 0.65);
  }

  private loopVoice(
    buf: AudioBuffer,
    type: BiquadFilterType,
    hz: number,
    q: number,
  ): LoopVoice {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    gain.gain.value = 0.0001;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    src.start();
    return { src, filter, gain };
  }

  private gate(key: string, gap: number): boolean {
    const ctx = this.ensure();
    if (!ctx) return false;
    const t = ctx.currentTime;
    const prev = this.lastAt.get(key) ?? -99;
    if (t - prev < gap) return false;
    this.lastAt.set(key, t);
    return true;
  }

  private thud(freq: number, dur: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.42), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private arpeggio(
    freqs: number[],
    step: number,
    gain: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const start = t0 + i * step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + step * 1.35);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(start);
      osc.stop(start + step + 0.08);
    });
  }

  private noiseBurst(dur: number, gain: number, hz: number, q: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.value = hz;
    filter.Q.value = q;
    g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}

function setParam(param: AudioParam, value: number, t: number, tau: number): void {
  const v = Math.max(0.0001, value);
  param.cancelScheduledValues(t);
  param.setTargetAtTime(v, t, tau);
}

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = brown ? last * 0.88 + w * 0.12 : w;
    data[i] = last;
  }
  return buf;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
