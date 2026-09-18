/**
 * Procedural park audio — Solent wash, birds, flyovers, parade traffic, and
 * the lance. Unlocks on the first user gesture (click / tap / key) so the
 * intro can play with ambience.
 */

type BirdCue = "gull" | "duck" | "swan";

export type FlyoverKind = "jet" | "light" | "spitfire" | "heli";

export interface FlyoverCue {
  id: number;
  kind: FlyoverKind;
  x: number;
  y: number;
  z: number;
}

export interface TrafficCue {
  id: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  music: boolean;
  /** Boy racers — much louder, farther reach. */
  roar?: boolean;
}

type FlyoverVoice = {
  kind: FlyoverKind;
  gain: GainNode;
  pan: StereoPannerNode;
  /** Main tone — pitch tracks approach. */
  tone: OscillatorNode | null;
  toneGain: GainNode | null;
  /** Prop / fan flutter depth. */
  flutter: OscillatorNode | null;
  flutterGain: GainNode | null;
  nodes: { stop: () => void }[];
  lastHoriz: number;
};

type TrafficVoice = {
  gain: GainNode;
  pan: StereoPannerNode;
  engine: OscillatorNode | null;
  music: boolean;
  nodes: { stop: () => void }[];
  lastHoriz: number;
  /** Next melody note time (audio context). */
  nextNote: number;
  noteI: number;
  scale: number[];
};

class ParkAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private muted = false;

  private seaNodes: { stop: () => void }[] = [];
  private seaRunning = false;

  private lanceGain: GainNode | null = null;
  private lanceNodes: { stop: () => void }[] = [];
  private lanceOn = false;

  private swanGain: GainNode | null = null;
  private swanNodes: { stop: () => void }[] = [];
  private swanHissOn = false;

  private pedalGain: GainNode | null = null;
  private pedalNodes: { stop: () => void }[] = [];
  private pedalCrankRate: AudioParam | null = null;
  private pedalTickRate: AudioParam | null = null;
  private pedalRunning = false;

  private flyovers = new Map<number, FlyoverVoice>();
  private traffic = new Map<number, TrafficVoice>();

  private nextWave = 2 + Math.random() * 4;
  private nextGull = 3 + Math.random() * 6;
  private nextDuck = 5 + Math.random() * 8;
  private lastBirdAt = 0;
  private lastCrashAt = 0;
  private lastShoveAt = 0;
  private lastSplashAt = 0;
  private lastWingAt = 0;
  private lastWashAt = 0;

  private noiseBuf: AudioBuffer | null = null;

  /** First click / key — browsers block audio until a gesture. */
  public async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.buildNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.unlocked = true;
    this.startSea();
  }

  public setMuted(on: boolean): void {
    this.muted = on;
    if (this.master) this.master.gain.value = on ? 0 : 0.55;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Keep ambience ticking. `hosing` drives the lance loop; `swanAngry` the
   * hiss when a bird's got its wings up; `flyovers` / `traffic` the sky and
   * the parade.
   */
  public update(
    delta: number,
    opts: {
      hosing: boolean;
      swanAngry: boolean;
      gullsNear: number;
      ducksNear: number;
      /** 0 idle → 1 hard pedalling on a hire swan. */
      pedalling?: number;
      flyovers?: ReadonlyArray<FlyoverCue>;
      traffic?: ReadonlyArray<TrafficCue>;
      listener?: { x: number; y: number; z: number };
      paused: boolean;
    },
  ): void {
    if (!this.unlocked || !this.ctx || !this.master) return;
    const listener = opts.listener ?? { x: 0, y: 0, z: 0 };
    if (opts.paused) {
      this.setLance(false);
      this.setSwanHiss(false);
      this.setPedalling(0);
      this.syncFlyovers([], listener, delta);
      this.syncTraffic([], listener, delta);
      return;
    }

    this.setLance(opts.hosing);
    this.setSwanHiss(opts.swanAngry);
    this.setPedalling(opts.pedalling ?? 0);
    this.syncFlyovers(opts.flyovers ?? [], listener, delta);
    this.syncTraffic(opts.traffic ?? [], listener, delta);

    this.nextWave -= delta;
    if (this.nextWave <= 0) {
      this.waveBreak((Math.random() - 0.5) * 1.4);
      this.nextWave = 3.5 + Math.random() * 7;
    }

    const gullChance = 0.06 + Math.min(0.18, opts.gullsNear * 0.045);
    this.nextGull -= delta;
    if (this.nextGull <= 0) {
      if (Math.random() < gullChance || opts.gullsNear > 0) {
        this.bird("gull", opts.gullsNear > 2);
      }
      this.nextGull = 4 + Math.random() * 9;
    }

    this.nextDuck -= delta;
    if (this.nextDuck <= 0) {
      if (opts.ducksNear > 0 || Math.random() < 0.28) {
        this.bird("duck");
      }
      this.nextDuck = 6 + Math.random() * 12;
    }
  }

  /** One-shot cry — rate-limited so a flock doesn't become a wall. */
  public bird(kind: BirdCue, loud = false): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastBirdAt < (loud ? 160 : 380)) return;
    this.lastBirdAt = now;
    const t = this.ctx.currentTime;
    if (kind === "gull") this.gullCry(t, loud);
    else if (kind === "duck") this.duckQuack(t);
    else this.swanCall(t, loud);
  }

  /**
   * Pedalo into the bank (or going under) — plastic hull crunch + water slap.
   * `intensity` 0–1 from impact speed.
   */
  public boatCrash(intensity = 0.6): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    const strength = Math.max(0.15, Math.min(1, intensity));
    // Soft bumps can stack; hard hits get a short lockout.
    if (now - this.lastCrashAt < (strength > 0.55 ? 220 : 90)) return;
    this.lastCrashAt = now;
    const t = this.ctx.currentTime;
    this.hullCrunch(t, strength);
  }

  /**
   * Boy-racer pass — a short, nasty engine blare on top of the rolling roar.
   */
  public engineRoar(intensity = 1): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const strength = Math.max(0.4, Math.min(1.2, intensity));
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.85);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.95);
    // Sub thump under the rev.
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    const sg = this.ctx.createGain();
    sub.frequency.setValueAtTime(55, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.1 * strength, t + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.58);
  }

  /** Hot metal into cold water — hissing steam plume. */
  public steamHiss(intensity = 1): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const strength = Math.max(0.4, Math.min(1.3, intensity));
    this.crashBurst(t, 0.55, 900, 0.09 * strength, 0.5);
    this.crashBurst(t + 0.05, 0.8, 2200, 0.07 * strength, 0.85);
    this.crashBurst(t + 0.12, 1.2, 3800, 0.05 * strength, 1.1);
    this.crashBurst(t + 0.25, 1.6, 1800, 0.035 * strength, 0.7);
  }

  /** Swan (or similar) has just shoved you — body thud + wing buffet. */
  public shoveHit(intensity = 0.75): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastShoveAt < 280) return;
    this.lastShoveAt = now;
    const t = this.ctx.currentTime;
    const strength = Math.max(0.35, Math.min(1, intensity));
    this.bodyThud(t, strength);
  }

  /** Van cab door — open creak or shut slam for the shift intro. */
  public vanDoor(open: boolean): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    if (open) {
      // Soft hinge creak + latch click.
      this.crashBurst(t, 0.22, 420, 0.045, 0.7);
      this.crashBurst(t + 0.05, 0.28, 180, 0.035, 0.45);
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.028, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.42);
    } else {
      // Door slam.
      this.crashBurst(t, 0.12, 220, 0.09, 0.5);
      this.crashBurst(t + 0.02, 0.08, 900, 0.05, 1.1);
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }

  /** Soft boot on paving — used while walking off the van. */
  public footstep(soft = false): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const peak = soft ? 0.028 : 0.042;
    this.crashBurst(t, 0.07, soft ? 280 : 360, peak, 0.55);
    this.crashBurst(t + 0.01, 0.05, 110, peak * 0.7, 0.4);
  }

  /**
   * Big entry splash — cleaner or public going in, swan touchdown.
   * `intensity` ~0.4–1.4; `panAmt` −1…1 relative to listener.
   */
  public waterSplash(intensity = 1, panAmt = 0): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const now = performance.now();
    const strength = Math.max(0.25, Math.min(1.5, intensity));
    if (now - this.lastSplashAt < (strength > 0.75 ? 70 : 120)) return;
    this.lastSplashAt = now;
    const t = this.ctx.currentTime;
    const pan = this.panNode(panAmt);
    const peak = 0.07 + strength * 0.14;
    this.crashBurst(t, 0.28 + strength * 0.12, 160, peak * 1.15, 0.4, pan);
    this.crashBurst(t + 0.03, 0.22, 480, peak * 0.95, 0.7, pan);
    this.crashBurst(t + 0.07, 0.35, 1400, peak * 0.55, 1.1, pan);
    this.crashBurst(t + 0.12, 0.45, 2800, peak * 0.28, 0.9, pan);
    // Hollow boom under the spray.
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(90 + strength * 30, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(pan);
    osc.start(t);
    osc.stop(t + 0.42);
  }

  /** Smaller plop — bird bank cross, wade wake, duck put-down. */
  public waterPlop(intensity = 0.45, panAmt = 0): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const now = performance.now();
    const strength = Math.max(0.15, Math.min(1, intensity));
    if (now - this.lastSplashAt < 55) return;
    this.lastSplashAt = now;
    const t = this.ctx.currentTime;
    const pan = this.panNode(panAmt);
    const peak = 0.03 + strength * 0.07;
    this.crashBurst(t, 0.12, 220, peak, 0.5, pan);
    this.crashBurst(t + 0.02, 0.14, 900, peak * 0.7, 0.95, pan);
    if (strength > 0.45) {
      this.crashBurst(t + 0.05, 0.16, 2100, peak * 0.35, 1.1, pan);
    }
  }

  /** Hull / paddle wash pulse — RC wakes, ski spray, pedalo churn ticks. */
  public boatWash(intensity = 0.45, panAmt = 0): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const now = performance.now();
    const strength = Math.max(0.12, Math.min(1, intensity));
    if (now - this.lastWashAt < 70) return;
    this.lastWashAt = now;
    const t = this.ctx.currentTime;
    const pan = this.panNode(panAmt);
    const peak = 0.022 + strength * 0.055;
    this.crashBurst(t, 0.1, 380, peak, 0.6, pan);
    this.crashBurst(t + 0.015, 0.14, 1100, peak * 0.75, 0.85, pan);
  }

  /** Wing whoosh — takeoff / flush. */
  public wingFlap(intensity = 0.65, panAmt = 0): void {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const now = performance.now();
    const strength = Math.max(0.2, Math.min(1.2, intensity));
    if (now - this.lastWingAt < 90) return;
    this.lastWingAt = now;
    const t = this.ctx.currentTime;
    const pan = this.panNode(panAmt);
    const peak = 0.03 + strength * 0.055;
    this.crashBurst(t, 0.09, 700, peak, 0.7, pan);
    this.crashBurst(t + 0.04, 0.1, 1600, peak * 0.85, 0.9, pan);
    this.crashBurst(t + 0.09, 0.11, 520, peak * 0.55, 0.55, pan);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(220 + strength * 80, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(pan);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private panNode(panAmt: number): AudioNode {
    const pan = this.ctx!.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panAmt));
    pan.connect(this.master!);
    return pan;
  }

  private bodyThud(t: number, strength: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const peak = 0.1 + strength * 0.14;

    // Soft body hit.
    this.crashBurst(t, 0.14, 140, peak, 0.5);
    // Cloth / wing buffet.
    this.crashBurst(t + 0.015, 0.11, 900, peak * 0.7, 0.85);
    if (strength > 0.55) {
      this.crashBurst(t + 0.04, 0.08, 2200, peak * 0.4, 1.2);
    }

    // Brief low “oof” tone.
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(95 + strength * 25, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 280;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private hullCrunch(t: number, strength: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const peak = 0.08 + strength * 0.18;

    // Low thud into the bank.
    this.crashBurst(t, 0.18 + strength * 0.12, 180, peak * 1.1, 0.4);
    // Mid plastic crunch.
    this.crashBurst(t + 0.02, 0.12 + strength * 0.08, 620, peak * 0.9, 0.9);
    // Brighter crackle on a harder hit.
    if (strength > 0.4) {
      this.crashBurst(t + 0.04, 0.08, 1800, peak * 0.55, 1.3);
    }

    // Short woody / hollow knock under the noise.
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    const g = this.ctx.createGain();
    const from = 140 + strength * 40;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private crashBurst(
    t: number,
    dur: number,
    cutoff: number,
    peak: number,
    q: number,
    dest: AudioNode | null = null,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = cutoff;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest ?? this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Match live flyovers to voices; fade anything that has left the sky. */
  private syncFlyovers(
    planes: ReadonlyArray<FlyoverCue>,
    listener: { x: number; y: number; z: number },
    delta: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const live = new Set(planes.map((p) => p.id));
    for (const [id, voice] of this.flyovers) {
      if (live.has(id)) continue;
      this.releaseFlyover(id, voice);
    }

    const t = this.ctx.currentTime;
    for (const plane of planes) {
      let voice = this.flyovers.get(plane.id);
      if (!voice) {
        voice = this.makeFlyover(plane.kind);
        this.flyovers.set(plane.id, voice);
      }
      this.driveFlyover(voice, plane, listener, delta, t);
    }
  }

  private makeFlyover(kind: FlyoverKind): FlyoverVoice {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.master!);

    const nodes: { stop: () => void }[] = [];
    let tone: OscillatorNode | null = null;
    let toneGain: GainNode | null = null;
    let flutter: OscillatorNode | null = null;
    let flutterGain: GainNode | null = null;

    if (kind === "spitfire") {
      // Merlin: mid rumble + prop flutter — clear from the ground.
      const body = ctx.createGain();
      body.gain.value = 1;
      body.connect(pan);

      const noise = this.loopNoise(0.55, 900, 0.6);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 380;
      bp.Q.value = 0.7;
      noise.out.connect(bp);
      bp.connect(body);
      nodes.push(noise);

      tone = ctx.createOscillator();
      tone.type = "sawtooth";
      tone.frequency.value = 95;
      toneGain = ctx.createGain();
      toneGain.gain.value = 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      lp.Q.value = 0.5;
      tone.connect(lp);
      lp.connect(toneGain);
      toneGain.connect(body);
      tone.start();
      nodes.push({
        stop: () => {
          try {
            tone!.stop();
          } catch {
            /* already */
          }
        },
      });

      // Four-blade pulse on the body — that Merlin chug.
      flutter = ctx.createOscillator();
      flutter.type = "sine";
      flutter.frequency.value = 28;
      flutterGain = ctx.createGain();
      flutterGain.gain.value = 0.35;
      flutter.connect(flutterGain);
      flutterGain.connect(body.gain);
      flutter.start();
      nodes.push({
        stop: () => {
          try {
            flutter!.stop();
          } catch {
            /* already */
          }
        },
      });
    } else if (kind === "heli") {
      // Chop-chop: broadband wash + a slow amplitude pulse for the blades.
      const body = ctx.createGain();
      body.gain.value = 1;
      body.connect(pan);

      const noise = this.loopNoise(0.7, 700, 0.55);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 160;
      bp.Q.value = 0.55;
      noise.out.connect(bp);
      bp.connect(body);
      nodes.push(noise);

      tone = ctx.createOscillator();
      tone.type = "sawtooth";
      tone.frequency.value = 62;
      toneGain = ctx.createGain();
      toneGain.gain.value = 0.14;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 280;
      tone.connect(lp);
      lp.connect(toneGain);
      toneGain.connect(body);
      tone.start();
      nodes.push({
        stop: () => {
          try {
            tone!.stop();
          } catch {
            /* already */
          }
        },
      });

      flutter = ctx.createOscillator();
      flutter.type = "sine";
      flutter.frequency.value = 18;
      flutterGain = ctx.createGain();
      flutterGain.gain.value = 0.55;
      flutter.connect(flutterGain);
      flutterGain.connect(body.gain);
      flutter.start();
      nodes.push({
        stop: () => {
          try {
            flutter!.stop();
          } catch {
            /* already */
          }
        },
      });
    } else if (kind === "light") {
      const body = ctx.createGain();
      body.gain.value = 1;
      body.connect(pan);

      const noise = this.loopNoise(0.35, 500, 0.5);
      noise.out.connect(body);
      nodes.push(noise);

      tone = ctx.createOscillator();
      tone.type = "triangle";
      tone.frequency.value = 78;
      toneGain = ctx.createGain();
      toneGain.gain.value = 0.12;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      tone.connect(lp);
      lp.connect(toneGain);
      toneGain.connect(body);
      tone.start();
      nodes.push({
        stop: () => {
          try {
            tone!.stop();
          } catch {
            /* already */
          }
        },
      });

      flutter = ctx.createOscillator();
      flutter.frequency.value = 22;
      flutterGain = ctx.createGain();
      flutterGain.gain.value = 0.18;
      flutter.connect(flutterGain);
      flutterGain.connect(body.gain);
      flutter.start();
      nodes.push({
        stop: () => {
          try {
            flutter!.stop();
          } catch {
            /* already */
          }
        },
      });
    } else {
      // High jet — barely-there distant rumble.
      const noise = this.loopNoise(0.45, 220, 0.4);
      noise.out.connect(pan);
      nodes.push(noise);

      tone = ctx.createOscillator();
      tone.type = "sine";
      tone.frequency.value = 52;
      toneGain = ctx.createGain();
      toneGain.gain.value = 0.18;
      tone.connect(toneGain);
      toneGain.connect(pan);
      tone.start();
      nodes.push({
        stop: () => {
          try {
            tone!.stop();
          } catch {
            /* already */
          }
        },
      });
    }

    return {
      kind,
      gain,
      pan,
      tone,
      toneGain,
      flutter,
      flutterGain,
      nodes,
      lastHoriz: 800,
    };
  }

  private driveFlyover(
    voice: FlyoverVoice,
    plane: FlyoverCue,
    listener: { x: number; y: number; z: number },
    delta: number,
    t: number,
  ): void {
    const dx = plane.x - listener.x;
    const dz = plane.z - listener.z;
    const horiz = Math.hypot(dx, dz);
    const height = Math.max(40, plane.y - listener.y);

    // Spitfire is close and loud; jets are a distant wash high up.
    const reach =
      voice.kind === "spitfire"
        ? 520
        : voice.kind === "heli"
          ? 480
          : voice.kind === "light"
            ? 700
            : 900;
    const peak =
      voice.kind === "spitfire"
        ? 0.2
        : voice.kind === "heli"
          ? 0.16
          : voice.kind === "light"
            ? 0.055
            : 0.028;
    const heightFade =
      voice.kind === "spitfire" || voice.kind === "heli"
        ? 1
        : voice.kind === "light"
          ? Math.max(0.25, Math.min(1, 1.15 - height / 900))
          : Math.max(0.15, Math.min(0.55, 1.05 - height / 1600));

    const near = Math.max(0, 1 - horiz / reach);
    const curve = near * near;
    const level = Math.max(0.0001, peak * curve * heightFade);

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(level, t, 0.08);

    // Left/right from the listener’s facing isn’t available — pan by world X.
    const panAmt = Math.max(-1, Math.min(1, dx / (reach * 0.65)));
    voice.pan.pan.setTargetAtTime(panAmt, t, 0.12);

    // Mild Doppler from closing rate.
    const closing = (voice.lastHoriz - horiz) / Math.max(0.016, delta);
    voice.lastHoriz = horiz;
    const doppler = Math.max(-18, Math.min(22, closing * 0.035));
    if (voice.tone) {
      const base =
        voice.kind === "spitfire"
          ? 95
          : voice.kind === "heli"
            ? 62
            : voice.kind === "light"
              ? 78
              : 52;
      voice.tone.frequency.setTargetAtTime(base + doppler, t, 0.1);
    }
    if (voice.flutter && (voice.kind === "spitfire" || voice.kind === "heli")) {
      const blade = voice.kind === "heli" ? 18 : 28;
      voice.flutter.frequency.setTargetAtTime(
        blade + doppler * 0.15,
        t,
        0.12,
      );
    }
  }

  private releaseFlyover(id: number, voice: FlyoverVoice): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(0.0001, t, 0.12);
    const dying = voice.nodes.slice();
    this.flyovers.delete(id);
    window.setTimeout(() => {
      for (const n of dying) n.stop();
      try {
        voice.gain.disconnect();
        voice.pan.disconnect();
      } catch {
        /* already */
      }
    }, 350);
  }

  /** Parade cars — engine pass-by; the odd one with the stereo up. */
  private syncTraffic(
    cars: ReadonlyArray<TrafficCue>,
    listener: { x: number; y: number; z: number },
    delta: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const live = new Set(cars.map((c) => c.id));
    for (const [id, voice] of this.traffic) {
      if (live.has(id)) continue;
      this.releaseTraffic(id, voice);
    }

    const t = this.ctx.currentTime;
    for (const car of cars) {
      let voice = this.traffic.get(car.id);
      if (!voice) {
        voice = this.makeTraffic(car.music);
        this.traffic.set(car.id, voice);
      }
      this.driveTraffic(voice, car, listener, delta, t);
    }
  }

  private makeTraffic(music: boolean): TrafficVoice {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    pan.connect(gain);
    gain.connect(this.master!);

    const nodes: { stop: () => void }[] = [];

    // Tyre / road hiss.
    const hiss = this.loopNoise(0.35, 1600, 0.45);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.55;
    hiss.out.connect(bp);
    bp.connect(pan);
    nodes.push(hiss);

    // Engine drone.
    const engine = ctx.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 68;
    const eg = ctx.createGain();
    eg.gain.value = 0.14;
    const elp = ctx.createBiquadFilter();
    elp.type = "lowpass";
    elp.frequency.value = 240;
    engine.connect(elp);
    elp.connect(eg);
    eg.connect(pan);
    engine.start();
    nodes.push({
      stop: () => {
        try {
          engine.stop();
        } catch {
          /* already */
        }
      },
    });

    // Mild engine flutter.
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 14;
    const fg = ctx.createGain();
    fg.gain.value = 0.035;
    flutter.connect(fg);
    fg.connect(eg.gain);
    flutter.start();
    nodes.push({
      stop: () => {
        try {
          flutter.stop();
        } catch {
          /* already */
        }
      },
    });

    const roots = [110, 123, 131, 147, 165];
    const root = roots[Math.floor(Math.random() * roots.length)]!;
    const scale = [0, 2, 3, 5, 7, 8, 10, 12].map(
      (semi) => root * Math.pow(2, semi / 12),
    );

    if (music) {
      // Muffled car stereo — bass thump + soft melody through a low shelf.
      const rootHz = root;
      const bass = ctx.createOscillator();
      bass.type = "triangle";
      bass.frequency.value = rootHz;
      const bg = ctx.createGain();
      bg.gain.value = 0.0001;
      const blp = ctx.createBiquadFilter();
      blp.type = "lowpass";
      blp.frequency.value = 280;
      bass.connect(blp);
      blp.connect(bg);
      bg.connect(pan);
      bass.start();
      nodes.push({
        stop: () => {
          try {
            bass.stop();
          } catch {
            /* already */
          }
        },
      });

      // Pulse the bass for a simple beat.
      const beat = ctx.createOscillator();
      beat.type = "square";
      beat.frequency.value = 2.05;
      const beatG = ctx.createGain();
      beatG.gain.value = 0.07;
      beat.connect(beatG);
      beatG.connect(bg.gain);
      beat.start();
      nodes.push({
        stop: () => {
          try {
            beat.stop();
          } catch {
            /* already */
          }
        },
      });
    }

    return {
      gain,
      pan,
      engine,
      music,
      nodes,
      lastHoriz: 400,
      nextNote: ctx.currentTime + 0.2,
      noteI: 0,
      scale,
    };
  }

  private driveTraffic(
    voice: TrafficVoice,
    car: TrafficCue,
    listener: { x: number; y: number; z: number },
    delta: number,
    t: number,
  ): void {
    const dx = car.x - listener.x;
    const dz = car.z - listener.z;
    const horiz = Math.hypot(dx, dz);
    const reach = car.roar ? 320 : voice.music ? 220 : 160;
    const near = Math.max(0, 1 - horiz / reach);
    const curve = near * near * (voice.music || car.roar ? 1 : near);
    const speedFactor = Math.min(1.6, car.speed / (car.roar ? 18 : 12));
    const peak = car.roar ? 0.28 : voice.music ? 0.11 : 0.065;
    const level = Math.max(0.0001, peak * curve * (0.55 + speedFactor * 0.45));

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(level, t, 0.07);

    const panAmt = Math.max(-1, Math.min(1, dx / (reach * 0.55)));
    voice.pan.pan.setTargetAtTime(panAmt, t, 0.1);

    const closing = (voice.lastHoriz - horiz) / Math.max(0.016, delta);
    voice.lastHoriz = horiz;
    const doppler = Math.max(-18, Math.min(22, closing * 0.05));
    if (voice.engine) {
      const base = car.roar
        ? 72 + speedFactor * 55
        : 58 + speedFactor * 28;
      voice.engine.frequency.setTargetAtTime(base + doppler, t, 0.06);
    }

    if (voice.music && level > 0.008 && t >= voice.nextNote) {
      this.carStereoNote(voice, t, Math.min(1, curve * 1.4));
    }
  }

  /** One muffled melody note from a passing stereo. */
  private carStereoNote(voice: TrafficVoice, t: number, loud: number): void {
    if (!this.ctx || !this.master) return;
    const freq = voice.scale[voice.noteI % voice.scale.length]!;
    voice.noteI += 1 + (Math.random() < 0.25 ? 1 : 0);
    // Slightly irregular dancehall / pop rhythm.
    const step = 0.22 + Math.random() * 0.08;
    voice.nextNote = t + step * (Math.random() < 0.12 ? 2 : 1);

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq * 2;
    const g = this.ctx.createGain();
    const peak = 0.035 * loud;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.6;
    // Extra muffling — heard from outside with the windows up a bit.
    const lp2 = this.ctx.createBiquadFilter();
    lp2.type = "lowpass";
    lp2.frequency.value = 700;
    osc.connect(lp);
    lp.connect(lp2);
    lp2.connect(g);
    g.connect(voice.pan);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private releaseTraffic(id: number, voice: TrafficVoice): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(0.0001, t, 0.15);
    const dying = voice.nodes.slice();
    this.traffic.delete(id);
    window.setTimeout(() => {
      for (const n of dying) n.stop();
      try {
        voice.gain.disconnect();
        voice.pan.disconnect();
      } catch {
        /* already */
      }
    }, 400);
  }

  private startSea(): void {
    if (!this.ctx || !this.master || this.seaRunning) return;
    this.seaRunning = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.master);

    // Soft bed — brownish noise through a low shelf.
    const bed = this.loopNoise(0.22, 480, 0.55);
    bed.out.connect(gain);
    this.seaNodes.push(bed);

    // Brighter foam layer, quieter.
    const foam = this.loopNoise(0.1, 1400, 0.35);
    foam.out.connect(gain);
    this.seaNodes.push(foam);

    // Slow swell on the bed.
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 0.045;
    lfo.connect(lfoG);
    lfoG.connect(gain.gain);
    lfo.start();
    this.seaNodes.push({
      stop: () => {
        try {
          lfo.stop();
        } catch {
          /* already */
        }
      },
    });

    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 2.5);
  }

  /**
   * Pedal-boat churn — paddle splash and a soft crank tick while you're
   * turning the pedals. `effort` is 0–1 from boat speed.
   */
  private setPedalling(effort: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const want = Math.max(0, Math.min(1, effort));
    const on = want > 0.04;

    if (!on) {
      if (!this.pedalRunning) return;
      this.pedalRunning = false;
      if (this.pedalGain) {
        this.pedalGain.gain.cancelScheduledValues(t);
        this.pedalGain.gain.setTargetAtTime(0.0001, t, 0.08);
      }
      const dying = this.pedalNodes.slice();
      this.pedalNodes = [];
      this.pedalGain = null;
      this.pedalCrankRate = null;
      this.pedalTickRate = null;
      window.setTimeout(() => {
        for (const n of dying) n.stop();
      }, 220);
      return;
    }

    if (!this.pedalRunning) {
      this.pedalRunning = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(this.master);
      this.pedalGain = gain;

      // Paddle wheel in the water — soft mid splash bed.
      const splash = this.loopNoise(0.4, 1100, 0.55);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 780;
      bp.Q.value = 0.65;
      splash.out.connect(bp);
      const splashBody = this.ctx.createGain();
      splashBody.gain.value = 0.7;
      bp.connect(splashBody);
      splashBody.connect(gain);
      this.pedalNodes.push(splash);

      // Soft mechanical whir under the splash.
      const whir = this.ctx.createOscillator();
      whir.type = "triangle";
      whir.frequency.value = 92;
      const wg = this.ctx.createGain();
      wg.gain.value = 0.04;
      const wl = this.ctx.createBiquadFilter();
      wl.type = "lowpass";
      wl.frequency.value = 260;
      whir.connect(wl);
      wl.connect(wg);
      wg.connect(gain);
      whir.start();
      this.pedalNodes.push({
        stop: () => {
          try {
            whir.stop();
          } catch {
            /* already */
          }
        },
      });

      // Crank pulse on the splash each stroke.
      const crank = this.ctx.createOscillator();
      crank.type = "sine";
      crank.frequency.value = 2.2;
      this.pedalCrankRate = crank.frequency;
      const cg = this.ctx.createGain();
      cg.gain.value = 0.28;
      crank.connect(cg);
      cg.connect(splashBody.gain);
      crank.start();
      this.pedalNodes.push({
        stop: () => {
          try {
            crank.stop();
          } catch {
            /* already */
          }
        },
      });

      // Brighter drip on the stroke.
      const tickNoise = this.loopNoise(0.2, 2400, 0.4);
      const tickBp = this.ctx.createBiquadFilter();
      tickBp.type = "bandpass";
      tickBp.frequency.value = 1600;
      tickBp.Q.value = 1.4;
      tickNoise.out.connect(tickBp);
      const tickG = this.ctx.createGain();
      tickG.gain.value = 0.0001;
      tickBp.connect(tickG);
      tickG.connect(gain);
      this.pedalNodes.push(tickNoise);

      const tickLfo = this.ctx.createOscillator();
      tickLfo.type = "square";
      tickLfo.frequency.value = 2.2;
      this.pedalTickRate = tickLfo.frequency;
      const tickDepth = this.ctx.createGain();
      tickDepth.gain.value = 0.045;
      tickLfo.connect(tickDepth);
      tickDepth.connect(tickG.gain);
      tickLfo.start();
      this.pedalNodes.push({
        stop: () => {
          try {
            tickLfo.stop();
          } catch {
            /* already */
          }
        },
      });
    }

    const level = 0.035 + want * 0.12;
    this.pedalGain!.gain.cancelScheduledValues(t);
    this.pedalGain!.gain.setTargetAtTime(level, t, 0.06);
    const rate = 1.4 + want * 2.8;
    this.pedalCrankRate?.setTargetAtTime(rate, t, 0.1);
    this.pedalTickRate?.setTargetAtTime(rate, t, 0.1);
  }

  private setLance(on: boolean): void {
    if (on === this.lanceOn) return;
    this.lanceOn = on;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;

    if (!on) {
      if (this.lanceGain) {
        this.lanceGain.gain.cancelScheduledValues(t);
        this.lanceGain.gain.setTargetAtTime(0.0001, t, 0.05);
      }
      const dying = this.lanceNodes.slice();
      this.lanceNodes = [];
      window.setTimeout(() => {
        for (const n of dying) n.stop();
      }, 200);
      this.lanceGain = null;
      return;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.master);
    this.lanceGain = gain;

    // White hiss through a high bandpass — pressure washer bite.
    const hiss = this.loopNoise(0.55, 4200, 0.7);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2800;
    bp.Q.value = 0.7;
    hiss.out.connect(bp);
    bp.connect(gain);
    this.lanceNodes.push(hiss);

    // Low pump throb underneath.
    const pump = this.ctx.createOscillator();
    pump.type = "sawtooth";
    pump.frequency.value = 55;
    const pg = this.ctx.createGain();
    pg.gain.value = 0.08;
    const pf = this.ctx.createBiquadFilter();
    pf.type = "lowpass";
    pf.frequency.value = 180;
    pump.connect(pf);
    pf.connect(pg);
    pg.connect(gain);
    pump.start();
    this.lanceNodes.push({
      stop: () => {
        try {
          pump.stop();
        } catch {
          /* already */
        }
      },
    });

    // Slight flutter so it doesn't sit dead flat.
    const flutter = this.ctx.createOscillator();
    const fg = this.ctx.createGain();
    flutter.frequency.value = 18;
    fg.gain.value = 0.025;
    flutter.connect(fg);
    fg.connect(gain.gain);
    flutter.start();
    this.lanceNodes.push({
      stop: () => {
        try {
          flutter.stop();
        } catch {
          /* already */
        }
      },
    });

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
  }

  private setSwanHiss(on: boolean): void {
    if (on === this.swanHissOn) return;
    this.swanHissOn = on;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;

    if (!on) {
      if (this.swanGain) {
        this.swanGain.gain.cancelScheduledValues(t);
        this.swanGain.gain.setTargetAtTime(0.0001, t, 0.08);
      }
      const dying = this.swanNodes.slice();
      this.swanNodes = [];
      window.setTimeout(() => {
        for (const n of dying) n.stop();
      }, 250);
      this.swanGain = null;
      return;
    }

    this.bird("swan", true);

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.master);
    this.swanGain = gain;

    const noise = this.loopNoise(0.12, 1400, 0.45);
    noise.out.connect(gain);
    this.swanNodes.push(noise);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 190;
    const og = this.ctx.createGain();
    og.gain.value = 0.06;
    const of = this.ctx.createBiquadFilter();
    of.type = "lowpass";
    of.frequency.value = 600;
    osc.connect(of);
    of.connect(og);
    og.connect(gain);
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.linearRampToValueAtTime(140, t + 0.5);
    osc.start();
    this.swanNodes.push({
      stop: () => {
        try {
          osc.stop();
        } catch {
          /* already */
        }
      },
    });

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
  }

  private waveBreak(panAmt: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panAmt));
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    pan.connect(gain);
    gain.connect(this.master);

    const burst = (delay: number, dur: number, cutoff: number, peak: number) => {
      if (!this.ctx || !this.noiseBuf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      f.Q.value = 0.55;
      const g = this.ctx.createGain();
      const at = t + delay;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(pan);
      src.start(at);
      src.stop(at + dur + 0.02);
    };

    burst(0, 0.65, 300, 0.045);
    burst(0.14, 0.8, 460, 0.032);
    burst(0.32, 0.95, 200, 0.022);
  }

  private gullCry(t: number, loud: boolean): void {
    if (!this.ctx || !this.master) return;
    const peak = loud ? 0.055 : 0.032;
    const pan = (Math.random() - 0.5) * (loud ? 0.35 : 1.2);
    // Herring-gull “kee-yah”: two soft descending whistles, not a buzzsaw.
    const base = 980 + Math.random() * 180;
    this.chirp(t, base, base * 0.72, 0.16, peak, pan, 1600);
    this.chirp(
      t + 0.09 + Math.random() * 0.04,
      base * 0.88,
      base * 0.55,
      0.2,
      peak * 0.7,
      pan,
      1400,
    );
    if (loud) {
      this.chirp(t + 0.22, base * 1.05, base * 0.7, 0.12, peak * 0.45, pan, 1500);
    }
  }

  private duckQuack(t: number): void {
    if (!this.ctx || !this.master) return;
    const pan = (Math.random() - 0.5) * 1.1;
    const base = 280 + Math.random() * 60;
    // Soft nasal quack — short, low, filtered.
    this.chirp(t, base * 1.15, base * 0.7, 0.07, 0.045, pan, 520);
    this.chirp(t + 0.06, base, base * 0.55, 0.08, 0.038, pan, 480);
  }

  private swanCall(t: number, loud: boolean): void {
    if (!this.ctx || !this.master) return;
    const peak = loud ? 0.05 : 0.028;
    const pan = (Math.random() - 0.5) * 0.5;
    const base = 340 + Math.random() * 40;
    this.chirp(t, base, base * 0.75, 0.22, peak, pan, 700);
    this.chirp(t + 0.14, base * 0.9, base * 0.55, 0.26, peak * 0.65, pan, 620);
  }

  /**
   * Soft descending whistle (sine + gentle triangle) through a bandpass —
   * readable as a bird without the harsh sawtooth buzz.
   */
  private chirp(
    t: number,
    from: number,
    to: number,
    dur: number,
    peak: number,
    panAmt: number,
    formant: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panAmt));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.025, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    pan.connect(g);
    g.connect(this.master);

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = formant;
    bp.Q.value = 1.1;
    bp.connect(pan);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = formant * 1.8;
    lp.Q.value = 0.4;
    lp.connect(bp);

    const fundamental = this.ctx.createOscillator();
    fundamental.type = "sine";
    fundamental.frequency.setValueAtTime(from, t);
    fundamental.frequency.exponentialRampToValueAtTime(
      Math.max(60, to),
      t + dur,
    );
    const fg = this.ctx.createGain();
    fg.gain.value = 0.85;
    fundamental.connect(fg);
    fg.connect(lp);

    // Quiet odd harmonic for a touch of edge without buzz.
    const partial = this.ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.setValueAtTime(from * 1.5, t);
    partial.frequency.exponentialRampToValueAtTime(
      Math.max(80, to * 1.5),
      t + dur,
    );
    const pg = this.ctx.createGain();
    pg.gain.value = 0.12;
    partial.connect(pg);
    pg.connect(lp);

    fundamental.start(t);
    partial.start(t);
    fundamental.stop(t + dur + 0.03);
    partial.stop(t + dur + 0.03);
  }

  /** Looping filtered noise; connect `.out`, call `.stop()` when done. */
  private loopNoise(
    volume: number,
    cutoff: number,
    q = 0.5,
  ): { out: GainNode; stop: () => void } {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(f);
    f.connect(g);
    src.start();
    return {
      out: g,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already */
        }
      },
    };
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Mild brown noise — less harsh for sea beds.
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }
}

export const parkAudio = new ParkAudioEngine();
