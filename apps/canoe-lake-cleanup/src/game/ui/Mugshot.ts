const W = 48;
const H = 56;
const REFRESH = 1 / 8;

interface FaceState {
  cleanliness: number;
  spraying: boolean;
  raining: boolean;
  hurt: boolean;
  /** What's left of him, from 1 down to 0. */
  health: number;
}

/**
 * A Doom-style status face for the council cleaner. He glances about, gurns
 * harder as the park gets filthier, and squints when it's chucking it down.
 */
export class Mugshot {
  private ctx: CanvasRenderingContext2D;
  private pixel: number;
  private since = 0;
  private glance = 0;
  private glanceFor = 1.2;
  private look: -1 | 0 | 1 = 0;
  private blink = 0;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth || 96;
    this.pixel = width / W;
    canvas.width = W * this.pixel * dpr;
    canvas.height = H * this.pixel * dpr;
    canvas.style.height = `${H * this.pixel}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("mugshot needs a 2D context");
    ctx.scale(dpr * this.pixel, dpr * this.pixel);
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  private box(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  public update(delta: number, state: FaceState): void {
    this.glance += delta;
    if (this.glance >= this.glanceFor) {
      this.glance = 0;
      this.glanceFor = 0.8 + Math.random() * 2.4;
      this.look = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)]!;
      if (Math.random() < 0.35) this.blink = 0.12;
    }
    if (this.blink > 0) this.blink -= delta;

    this.since += delta;
    if (this.since < REFRESH) return;
    this.since = 0;
    this.draw(state);
  }

  private draw(state: FaceState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    const grim =
      state.cleanliness < 30
        ? 3
        : state.cleanliness < 55
          ? 2
          : state.cleanliness < 80
            ? 1
            : 0;
    const skin = ["#e0a878", "#dfa070", "#d99368", "#cf8460"][grim]!;
    const shade = ["#b8814f", "#b47a4a", "#ab6f44", "#a1613c"][grim]!;

    // Hi-vis collar and shoulders.
    this.box(4, 46, 40, 10, "#d8e83a");
    this.box(4, 50, 40, 3, "#f4f9c8");
    this.box(18, 44, 12, 6, shade);

    // Head.
    this.box(10, 8, 28, 38, skin);
    this.box(10, 8, 28, 3, shade);
    this.box(8, 16, 2, 14, skin);
    this.box(38, 16, 2, 14, skin);

    // Hair, flattened by the weather.
    this.box(9, 5, 30, 6, "#4a3524");
    this.box(9, 9, 5, 5, "#4a3524");
    this.box(34, 9, 5, 5, "#4a3524");
    if (state.raining) this.box(9, 5, 30, 2, "#6b5138");

    // Brow: heavier the worse it gets.
    const browY = 17 + grim;
    this.box(13, browY, 9, 2 + (grim > 1 ? 1 : 0), "#4a3524");
    this.box(26, browY, 9, 2 + (grim > 1 ? 1 : 0), "#4a3524");
    if (grim >= 2) {
      this.box(20, browY + 1, 8, 2, skin);
      this.box(21, browY + 2, 6, 1, shade);
    }

    // Pecked: eyes screwed shut, mouth open, and no time for anything else.
    if (state.hurt) {
      this.box(13, 21, 9, 2, "#3a2018");
      this.box(26, 21, 9, 2, "#3a2018");
      this.box(22, 27, 4, 7, shade);
      this.box(19, 36, 10, 8, "#3a2018");
      this.box(20, 37, 8, 2, "#f4f0e4");
      this.box(11, 29, 5, 4, "#c2664c");
      this.box(32, 29, 5, 4, "#c2664c");
      this.damage(state.health);
      return;
    }

    // Eyes, squinting in the rain, darting about otherwise.
    const eyeY = 22;
    const squint = state.raining || grim === 3;
    this.box(14, eyeY, 8, squint ? 3 : 5, "#f4f0e4");
    this.box(27, eyeY, 8, squint ? 3 : 5, "#f4f0e4");
    if (this.blink <= 0) {
      const shift = this.look * 2;
      this.box(17 + shift, eyeY + 1, 3, squint ? 2 : 3, "#2b3038");
      this.box(30 + shift, eyeY + 1, 3, squint ? 2 : 3, "#2b3038");
    } else {
      this.box(14, eyeY + 1, 8, 2, shade);
      this.box(27, eyeY + 1, 8, 2, shade);
    }

    // Nose.
    this.box(22, 27, 4, 7, shade);
    this.box(22, 33, 5, 2, "#a1613c");

    // Mouth: a grin when the park's spotless, a proper grimace when it isn't.
    if (state.spraying) {
      this.box(17, 38, 14, 5, "#3a2018");
      this.box(18, 38, 12, 2, "#f4f0e4");
      this.box(21, 40, 2, 3, "#f4f0e4");
      this.box(25, 40, 2, 3, "#f4f0e4");
    } else if (grim === 0) {
      this.box(17, 38, 14, 2, "#3a2018");
      this.box(15, 37, 2, 2, "#3a2018");
      this.box(31, 37, 2, 2, "#3a2018");
    } else if (grim === 1) {
      this.box(18, 39, 12, 2, "#3a2018");
    } else if (grim === 2) {
      this.box(18, 40, 12, 2, "#3a2018");
      this.box(16, 39, 2, 2, "#3a2018");
      this.box(30, 39, 2, 2, "#3a2018");
    } else {
      this.box(17, 37, 14, 6, "#3a2018");
      this.box(18, 38, 12, 2, "#f4f0e4");
      this.box(18, 41, 12, 1, "#f4f0e4");
    }

    // A bit of colour in the cheeks once he's had enough.
    if (grim >= 2) {
      this.box(11, 30, 4, 3, "#c2664c");
      this.box(33, 30, 4, 3, "#c2664c");
    }

    this.damage(state.health);
  }

  /** What the swans have taken out of him so far: cuts, then a proper mess. */
  private damage(health: number): void {
    if (health > 0.75) return;

    // A beak has been across his cheek.
    this.box(31, 31, 6, 1, "#a83a2a");
    this.box(33, 30, 1, 3, "#a83a2a");

    if (health > 0.5) return;
    // Swollen eye and a split lip.
    this.box(13, 21, 9, 4, "#7a4a6a");
    this.box(14, 22, 7, 2, "#5c3550");
    this.box(24, 43, 5, 2, "#a83a2a");

    if (health > 0.25) return;
    // Bleeding from the hairline, and a nose that's stopped being a nose.
    this.box(20, 11, 3, 9, "#b02a20");
    this.box(21, 20, 2, 6, "#b02a20");
    this.box(22, 27, 4, 7, "#a05a48");
    this.box(26, 31, 5, 1, "#a83a2a");
    this.box(9, 34, 4, 4, "#8a2a22");
  }
}
