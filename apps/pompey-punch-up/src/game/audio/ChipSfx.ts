/**
 * Procedural chip SFX — punches, kicks, whooshes, crashes, ambient beach noise.
 * Shares the AudioContext unlocked by chipRock (first user gesture).
 */

import { chipRock } from "./ChipRock";

type HitWeight = "light" | "mid" | "heavy" | "critical" | "block" | "weapon";

type AmbientVoice = {
  gain: GainNode;
  pan: StereoPannerNode;
  /** Base oscillator freqs to scale for Doppler / spin-up. */
  freqs: OscillatorNode[];
  baseHz: number[];
  stop: () => void;
};

class ChipSfxEngine {
  private bus: GainNode | null = null;
  private muted = false;
  private hooked = false;
  private lastPlayAt = 0;
  private lastGullAt = 0;
  private droneVoice: AmbientVoice | null = null;
  private hoverVoice: AmbientVoice | null = null;
  private spitfireVoice: AmbientVoice | null = null;
  private carVoice: AmbientVoice | null = null;

  private async ensure(): Promise<AudioContext | null> {
    await chipRock.unlock();
    const ctx = chipRock.context;
    if (!ctx) return null;
    if (!this.hooked) {
      this.hooked = true;
      chipRock.onMuteChange((m) => {
        this.muted = m;
        if (this.bus) this.bus.gain.value = m ? 0 : 0.28;
        this.silenceAmbience(m);
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

  private silenceAmbience(muted: boolean): void {
    if (!muted) return;
    for (const v of [this.droneVoice, this.hoverVoice, this.spitfireVoice, this.carVoice]) {
      if (v) v.gain.gain.value = 0;
    }
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

  /** Bat / chain / cue arc — woodier than a fist whoosh. */
  async weaponSwing(kind: string = "bat"): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    const heavy = kind === "bat" || kind === "chain" || kind === "cue";
    this.noiseSweep(ctx, t, heavy ? 0.16 : 0.11, heavy ? 0.14 : 0.09);
    this.blip(ctx, t, heavy ? 420 : 520, heavy ? 160 : 240, 0.09, 0.07, "sawtooth");
    if (kind === "chain") {
      this.noiseBurst(ctx, t + 0.02, 0.05, 2800, 0.1);
      this.blip(ctx, t + 0.04, 880, 400, 0.05, 0.05, "square");
    } else if (kind === "knuckle") {
      this.blip(ctx, t, 300, 120, 0.06, 0.08, "square");
    } else {
      this.blip(ctx, t + 0.06, 180, 90, 0.05, 0.06, "triangle");
    }
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

  /** Council countdown pip. */
  async nukeTick(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 980, 420, 0.16, 0.12, "square");
    this.blip(ctx, t + 0.04, 520, 220, 0.1, 0.08, "square");
  }

  /** Seafront goes up. */
  async nukeBlast(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.55, 180, 0.48);
    this.blip(ctx, t, 90, 28, 0.7, 0.38, "sawtooth");
    this.noiseBurst(ctx, t + 0.14, 0.85, 90, 0.32);
    this.blip(ctx, t + 0.18, 55, 22, 0.55, 0.22, "triangle");
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

  /** DBZ charge scream, chip-style. */
  async buzzCharge(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.55, 700, 0.16);
    this.blip(ctx, t, 160, 620, 0.55, 0.16, "sawtooth");
    this.blip(ctx, t + 0.18, 320, 980, 0.5, 0.14, "sawtooth");
    this.blip(ctx, t + 0.4, 540, 1400, 0.45, 0.12, "square");
  }

  async buzzFade(): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.blip(ctx, t, 980, 220, 0.28, 0.1, "triangle");
    this.noiseBurst(ctx, t, 0.18, 400, 0.1);
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

  /** Southsea gull — short nasal squawk. */
  async gullCry(loud = false): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const now = performance.now();
    if (now - this.lastGullAt < (loud ? 180 : 420)) return;
    this.lastGullAt = now;
    const t = ctx.currentTime;
    const peak = loud ? 0.14 : 0.08;
    this.blip(ctx, t, loud ? 920 : 780, loud ? 640 : 560, 0.07, peak, "sawtooth");
    this.blip(ctx, t + 0.055, loud ? 880 : 740, loud ? 520 : 480, 0.08, peak * 0.85, "sawtooth");
    this.noiseBurst(ctx, t, 0.06, 3200, peak * 0.55);
    if (loud) {
      this.blip(ctx, t + 0.12, 980, 700, 0.06, peak * 0.7, "square");
    }
  }

  /** Soft Solent shore break — distant wash, not a crash. */
  async waveBreak(pan = 0): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 1;
    panner.connect(gain);
    gain.connect(this.bus);

    const burst = (delay: number, dur: number, cutoff: number, peak: number) => {
      let buf = chipRock.noise;
      if (!buf) {
        const len = ctx.sampleRate * 0.2;
        buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      const at = t + delay;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(panner);
      src.start(at);
      src.stop(at + dur + 0.02);
    };

    burst(0, 0.55, 320, 0.038);
    burst(0.12, 0.7, 480, 0.028);
    burst(0.28, 0.85, 220, 0.02);
  }

  /**
   * Quadcopter buzz — intensity 0..1, pan −1..1 (screen space).
   * Pass active:false to fade out.
   */
  setDrone(active: boolean, intensity = 0, pan = 0): void {
    const ctx = chipRock.context;
    if (!ctx || !this.bus) {
      if (active) void this.ensure().then(() => this.setDrone(active, intensity, pan));
      return;
    }
    if (!active || intensity < 0.04) {
      this.fadeOutVoice(this.droneVoice, 0.25);
      this.droneVoice = null;
      return;
    }
    if (!this.droneVoice) this.droneVoice = this.startDroneLoop(ctx);
    // Quiet under the bed/fight cut — audible, not a fridge-hum takeover
    this.applyAmbient(this.droneVoice, intensity * 0.19, pan, 1);
  }

  setHovercraft(active: boolean, intensity = 0, pan = 0, spin = 1): void {
    const ctx = chipRock.context;
    if (!ctx || !this.bus) {
      if (active) {
        void this.ensure().then(() =>
          this.setHovercraft(active, intensity, pan, spin),
        );
      }
      return;
    }
    if (!active || intensity < 0.03) {
      this.fadeOutVoice(this.hoverVoice, 0.4);
      this.hoverVoice = null;
      return;
    }
    if (!this.hoverVoice) this.hoverVoice = this.startHoverLoop(ctx);
    this.applyAmbient(this.hoverVoice, intensity * 0.13, pan, spin);
  }

  setSpitfire(active: boolean, progress = 0.5, pan = 0): void {
    const ctx = chipRock.context;
    if (!ctx || !this.bus) {
      if (active) void this.ensure().then(() => this.setSpitfire(active, progress, pan));
      return;
    }
    if (!active) {
      this.fadeOutVoice(this.spitfireVoice, 0.35);
      this.spitfireVoice = null;
      return;
    }
    if (!this.spitfireVoice) this.spitfireVoice = this.startSpitfireLoop(ctx);
    const pitch = 1.32 - progress * 0.58;
    const envelope = Math.sin(Math.max(0.02, Math.min(0.98, progress)) * Math.PI);
    const gain = (0.035 + envelope * 0.1) * (this.muted ? 0 : 1);
    this.applyAmbient(this.spitfireVoice, gain, pan, pitch);
  }

  /** Passing motor on the front — intensity 0..1, pan −1..1, pitch for Doppler. */
  setPassingCar(active: boolean, intensity = 0, pan = 0, pitch = 1): void {
    const ctx = chipRock.context;
    if (!ctx || !this.bus) {
      if (active) {
        void this.ensure().then(() =>
          this.setPassingCar(active, intensity, pan, pitch),
        );
      }
      return;
    }
    if (!active || intensity < 0.03) {
      this.fadeOutVoice(this.carVoice, 0.3);
      this.carVoice = null;
      return;
    }
    if (!this.carVoice) this.carVoice = this.startCarLoop(ctx);
    this.applyAmbient(this.carVoice, intensity * 0.14, pan, pitch);
  }

  private applyAmbient(
    voice: AmbientVoice,
    gain: number,
    pan: number,
    pitchRatio: number,
  ): void {
    if (!chipRock.context) return;
    const t = chipRock.context.currentTime;
    const g = this.muted ? 0 : Math.max(0, gain);
    voice.gain.gain.setTargetAtTime(g, t, 0.05);
    voice.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.08);
    for (let i = 0; i < voice.freqs.length; i++) {
      const base = voice.baseHz[i] ?? 100;
      voice.freqs[i]!.frequency.setTargetAtTime(
        Math.max(30, base * pitchRatio),
        t,
        0.06,
      );
    }
  }

  private fadeOutVoice(voice: AmbientVoice | null, sec: number): void {
    if (!voice || !chipRock.context) return;
    const t = chipRock.context.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(0.0001, t, sec * 0.25);
    window.setTimeout(() => voice.stop(), sec * 1000 + 50);
  }

  private startDroneLoop(ctx: AudioContext): AmbientVoice {
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.bus!);

    // Low motor + mid prop whir — reads as a quadcopter without shouting
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 148;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 640;
    filt.Q.value = 1.6;
    const og = ctx.createGain();
    og.gain.value = 0.62;
    osc.connect(filt);
    filt.connect(og);
    og.connect(pan);

    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 222;
    const og2 = ctx.createGain();
    og2.gain.value = 0.28;
    osc2.connect(og2);
    og2.connect(pan);

    const osc3 = ctx.createOscillator();
    osc3.type = "triangle";
    osc3.frequency.value = 296;
    const og3 = ctx.createGain();
    og3.gain.value = 0.16;
    osc3.connect(og3);
    og3.connect(pan);

    const noise = this.loopNoise(ctx, 0.26, 2800, 0.42);
    noise.connect(pan);

    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 32;
    lfoG.gain.value = 22;
    lfo.connect(lfoG);
    lfoG.connect(filt.frequency);

    osc.start();
    osc2.start();
    osc3.start();
    lfo.start();

    return {
      gain,
      pan,
      freqs: [osc, osc2, osc3],
      baseHz: [148, 222, 296],
      stop: () => {
        try {
          osc.stop();
          osc2.stop();
          osc3.stop();
          lfo.stop();
          noise.disconnect();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private startHoverLoop(ctx: AudioContext): AmbientVoice {
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.bus!);

    const rumble = ctx.createOscillator();
    rumble.type = "triangle";
    rumble.frequency.value = 48;
    const rg = ctx.createGain();
    rg.gain.value = 0.7;
    rumble.connect(rg);
    rg.connect(pan);

    const fan = ctx.createOscillator();
    fan.type = "sawtooth";
    fan.frequency.value = 92;
    const ff = ctx.createBiquadFilter();
    ff.type = "lowpass";
    ff.frequency.value = 380;
    const fg = ctx.createGain();
    fg.gain.value = 0.4;
    fan.connect(ff);
    ff.connect(fg);
    fg.connect(pan);

    const wash = this.loopNoise(ctx, 0.22, 700, 0.45);
    wash.connect(pan);

    rumble.start();
    fan.start();

    return {
      gain,
      pan,
      freqs: [rumble, fan],
      baseHz: [48, 92],
      stop: () => {
        try {
          rumble.stop();
          fan.stop();
          wash.disconnect();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private startSpitfireLoop(ctx: AudioContext): AmbientVoice {
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.bus!);

    const eng = ctx.createOscillator();
    eng.type = "sawtooth";
    eng.frequency.value = 195;
    const ef = ctx.createBiquadFilter();
    ef.type = "bandpass";
    ef.frequency.value = 420;
    ef.Q.value = 1.1;
    const eg = ctx.createGain();
    eg.gain.value = 0.55;
    eng.connect(ef);
    ef.connect(eg);
    eg.connect(pan);

    const harm = ctx.createOscillator();
    harm.type = "triangle";
    harm.frequency.value = 390;
    const hg = ctx.createGain();
    hg.gain.value = 0.2;
    harm.connect(hg);
    hg.connect(pan);

    const hiss = this.loopNoise(ctx, 0.14, 1800, 0.28);
    hiss.connect(pan);

    eng.start();
    harm.start();

    return {
      gain,
      pan,
      freqs: [eng, harm],
      baseHz: [195, 390],
      stop: () => {
        try {
          eng.stop();
          harm.stop();
          hiss.disconnect();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  /** Low road rumble + tyre wash for a motor rolling past. */
  private startCarLoop(ctx: AudioContext): AmbientVoice {
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.bus!);

    const rumble = ctx.createOscillator();
    rumble.type = "triangle";
    rumble.frequency.value = 58;
    const rf = ctx.createBiquadFilter();
    rf.type = "lowpass";
    rf.frequency.value = 160;
    const rg = ctx.createGain();
    rg.gain.value = 0.75;
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(pan);

    const exhaust = ctx.createOscillator();
    exhaust.type = "sawtooth";
    exhaust.frequency.value = 96;
    const ef = ctx.createBiquadFilter();
    ef.type = "bandpass";
    ef.frequency.value = 220;
    ef.Q.value = 1.4;
    const eg = ctx.createGain();
    eg.gain.value = 0.32;
    exhaust.connect(ef);
    ef.connect(eg);
    eg.connect(pan);

    const tires = this.loopNoise(ctx, 0.2, 520, 0.55);
    tires.connect(pan);

    rumble.start();
    exhaust.start();

    return {
      gain,
      pan,
      freqs: [rumble, exhaust],
      baseHz: [58, 96],
      stop: () => {
        try {
          rumble.stop();
          exhaust.stop();
          tires.disconnect();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private loopNoise(
    ctx: AudioContext,
    gainVal: number,
    cutoff: number,
    q: number,
  ): GainNode {
    let buf = chipRock.noise;
    if (!buf) {
      const len = ctx.sampleRate * 0.35;
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = cutoff;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(f);
    f.connect(g);
    src.start();
    const wrap = ctx.createGain();
    wrap.gain.value = 1;
    g.connect(wrap);
    const origDisconnect = wrap.disconnect.bind(wrap);
    wrap.disconnect = ((...args: Parameters<GainNode["disconnect"]>) => {
      try {
        src.stop();
      } catch {
        /* */
      }
      return origDisconnect(...args);
    }) as GainNode["disconnect"];
    return wrap;
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
