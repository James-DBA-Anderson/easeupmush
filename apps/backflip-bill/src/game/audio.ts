/** Tiny Web Audio cues — no asset files. */
export class Sfx {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  public resume(): void {
    this.ensure();
  }

  public jump(): void {
    this.blip(180, 420, 0.16, 0.09, "triangle");
  }

  public cleanLand(): void {
    this.blip(140, 90, 0.1, 0.08, "sine");
  }

  public stumble(): void {
    this.noise(0.12, 0.07);
    this.blip(220, 80, 0.14, 0.06, "square");
  }

  public fall(): void {
    this.noise(0.18, 0.1);
    this.blip(160, 40, 0.22, 0.08, "sawtooth");
  }

  public death(): void {
    this.blip(240, 60, 0.28, 0.1, "triangle");
  }

  public finish(): void {
    this.blip(330, 520, 0.12, 0.07, "square");
    window.setTimeout(() => this.blip(440, 660, 0.14, 0.07, "square"), 90);
  }

  public bonus(from: number, to: number): void {
    this.blip(from, to, 0.11, 0.07, "square");
  }

  /** Bone/joint going well past its stop — sharp crack. */
  public snap(): void {
    this.noise(0.045, 0.15);
    this.blip(980, 210, 0.05, 0.12, "square");
    this.blip(260, 70, 0.08, 0.09, "sawtooth");
  }

  private blip(
    from: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  private noise(dur: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const n = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }
}
