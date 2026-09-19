/**
 * Procedural SFX + chilled cute background loop.
 * Unlocks on first gesture (browser autoplay rules).
 */

/** Soft pentatonic wander — C major-ish, an octave up. */
const MELODY_HZ = [
  523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 698.46, 659.25, 587.33, 523.25,
  392.0, 440.0, 523.25, 659.25, 587.33, 523.25,
];

/** Gentle pad chords: Cmaj7 → Am7 → Fmaj7 → Gsus2. */
const PAD_CHORDS: number[][] = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 146.83, 174.61, 220.0],
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66, 349.23],
];

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private unlocked = false;
  private musicOn = false;
  private nextNoteAt = 0;
  private noteI = 0;
  private chordI = 0;
  private nextChordAt = 0;
  private padStops: Array<() => void> = [];

  public unlock(): void {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.unlocked = true;
    this.startMusic();
  }

  public carrot(): void {
    this.blip([880, 1175, 1568], 0.07, 0.045, "sine");
  }

  public jump(): void {
    this.sweep(220, 520, 0.14, 0.1, "square");
  }

  public knock(): void {
    this.thud(110, 0.18, 0.22);
    this.blip([330, 220], 0.05, 0.06, "triangle");
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicBus || this.musicOn) return;
    this.musicOn = true;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.exponentialRampToValueAtTime(0.14, t + 2.5);
    this.nextNoteAt = t + 0.4;
    this.nextChordAt = t;
    this.noteI = 0;
    this.chordI = 0;
    this.scheduleMusic();
    window.setInterval(() => this.scheduleMusic(), 180);
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicBus || !this.musicOn) return;
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 1.2;

    while (this.nextChordAt < ahead) {
      this.playPad(this.nextChordAt, PAD_CHORDS[this.chordI % PAD_CHORDS.length]!);
      this.chordI += 1;
      this.nextChordAt += 6.4;
    }

    while (this.nextNoteAt < ahead) {
      const hz = MELODY_HZ[this.noteI % MELODY_HZ.length]!;
      // Occasional rest for breathing room.
      if (this.noteI % 11 !== 7) {
        this.playPluck(this.nextNoteAt, hz);
      }
      this.noteI += 1;
      this.nextNoteAt += 0.58;
    }
  }

  private playPad(when: number, freqs: number[]): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const dur = 7.2;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.value = f;
      // Slight detune twin for width.
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = f * 1.003;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.4;

      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.045, when + 1.4);
      g.gain.setValueAtTime(0.045, when + dur - 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      g2.gain.setValueAtTime(0.0001, when);
      g2.gain.exponentialRampToValueAtTime(0.028, when + 1.6);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + dur);

      osc.connect(g);
      osc2.connect(g2);
      g.connect(filter);
      g2.connect(filter);
      filter.connect(this.musicBus);
      osc.start(when);
      osc2.start(when);
      osc.stop(when + dur + 0.05);
      osc2.stop(when + dur + 0.05);
      this.padStops.push(() => {
        try {
          osc.stop();
          osc2.stop();
        } catch {
          /* already stopped */
        }
      });
    }
  }

  private playPluck(when: number, hz: number): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.value = hz;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, when);
    filter.frequency.exponentialRampToValueAtTime(600, when + 0.35);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.055, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.55);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.6);
  }

  private blip(
    freqs: number[],
    step: number,
    gain: number,
    type: OscillatorType,
  ): void {
    if (!this.ready() || !this.sfxBus) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const start = t0 + i * step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + step * 0.9);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(start);
      osc.stop(start + step);
    });
  }

  private sweep(
    from: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    if (!this.ready() || !this.sfxBus) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private thud(freq: number, dur: number, gain: number): void {
    if (!this.ready() || !this.sfxBus) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private ready(): boolean {
    if (!this.unlocked || !this.ctx || !this.master) return false;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }
}

export const gameAudio = new GameAudio();
