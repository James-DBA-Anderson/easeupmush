/** Procedural SFX for Backflip Bill — no sample files. */

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

  /** Keep air whoosh / fall wind in step with the body. */
  public tick(info: {
    flipping: boolean;
    omega: number;
    air: boolean;
    fall: number;
    speed: number;
  }): void {
    const ctx = this.ensure();
    if (!ctx || !this.whoosh || !this.wind) return;
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
  }

  public jump(): void {
    this.noiseBurst(0.09, 0.07, 900, 2.2);
    this.sweep(190, 560, 0.13, 0.1, "triangle");
    this.thud(92, 0.09, 0.1);
  }

  public splash(): void {
    this.noiseBurst(0.14, 0.1, 320, 1.3);
    this.thud(56, 0.1, 0.08);
    this.sweep(210, 70, 0.18, 0.07, "sine");
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
    const k = 0.45 + 0.55 * clamp(speed, 0.2, 1);
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    this.thud(88 * jitter, 0.055, 0.055 * k);
    this.noiseBurst(0.04, 0.028 * k, 700, 1.4);
  }

  public skid(): void {
    if (!this.gate("skid", 0.35)) return;
    this.noiseBurst(0.22, 0.08, 1100, 2.4);
    this.sweep(180, 70, 0.18, 0.05, "sawtooth");
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

  private ensureLoops(): void {
    if (!this.ctx || !this.master || !this.brown || this.whoosh) return;
    this.whoosh = this.loopVoice(this.brown, "bandpass", 500, 0.9);
    this.wind = this.loopVoice(this.brown, "highpass", 700, 0.5);
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
