import * as THREE from "three";

/** One real second is one minute of the shift, so a full day runs 24 minutes. */
const MINUTES_PER_SECOND = 1;
const START_HOUR = 6;

interface Keyframe {
  hour: number;
  sky: number;
  ambient: number;
  sun: number;
  sunColor: number;
}

const KEYFRAMES: readonly Keyframe[] = [
  { hour: 0, sky: 0x0a1220, ambient: 0.3, sun: 0.12, sunColor: 0x6f8cc0 },
  { hour: 4.5, sky: 0x2c3d56, ambient: 0.4, sun: 0.22, sunColor: 0x8496bd },
  { hour: 6.5, sky: 0xe3b48f, ambient: 0.6, sun: 0.6, sunColor: 0xffc38c },
  { hour: 9, sky: 0x9fc4d8, ambient: 0.66, sun: 0.85, sunColor: 0xfff3dd },
  { hour: 13, sky: 0xa8cfe0, ambient: 0.7, sun: 0.95, sunColor: 0xffffff },
  { hour: 17.5, sky: 0xb8cbd4, ambient: 0.66, sun: 0.75, sunColor: 0xffeccc },
  { hour: 19.5, sky: 0xd9a173, ambient: 0.58, sun: 0.5, sunColor: 0xffab72 },
  { hour: 21, sky: 0x5d5570, ambient: 0.45, sun: 0.28, sunColor: 0x9d92bd },
  { hour: 22.5, sky: 0x18223a, ambient: 0.34, sun: 0.15, sunColor: 0x6f8cc0 },
];

export interface SkyState {
  sky: THREE.Color;
  ambient: number;
  sun: number;
  sunColor: THREE.Color;
  sunPosition: THREE.Vector3;
}

/** Tracks the time of shift and hands out the lighting that goes with it. */
export class DayCycle {
  private minutes = START_HOUR * 60;
  private readonly display: HTMLElement;

  constructor(display: HTMLElement) {
    this.display = display;
    this.render();
  }

  public update(delta: number): void {
    this.minutes = (this.minutes + delta * MINUTES_PER_SECOND) % (24 * 60);
    this.render();
  }

  public get hour(): number {
    return this.minutes / 60;
  }

  /** The time as it reads on the clock, for anything else that needs it. */
  public clockFace(): string {
    const h = Math.floor(this.minutes / 60);
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  private render(): void {
    this.display.textContent = this.clockFace();
  }

  public skyState(): SkyState {
    const h = this.hour;
    let before = KEYFRAMES[KEYFRAMES.length - 1]!;
    let after = KEYFRAMES[0]!;
    for (let i = 0; i < KEYFRAMES.length; i++) {
      const frame = KEYFRAMES[i]!;
      if (frame.hour <= h) {
        before = frame;
        after = KEYFRAMES[i + 1] ?? KEYFRAMES[0]!;
      }
    }
    // Wrapping past midnight means the later keyframe is a day ahead.
    const span = (after.hour - before.hour + 24) % 24 || 24;
    const t = THREE.MathUtils.clamp(((h - before.hour + 24) % 24) / span, 0, 1);

    // The sun tracks east to west across the day and sits below the horizon at night.
    const dayProgress = (h - 6) / 12;
    const arc = dayProgress * Math.PI;
    // Kept well above the horizon even at dawn, or the flat ground goes black.
    const sunPosition = new THREE.Vector3(
      Math.cos(Math.PI - arc) * 150,
      Math.max(60, Math.sin(arc) * 150),
      50,
    );

    return {
      sky: new THREE.Color(before.sky).lerp(new THREE.Color(after.sky), t),
      ambient: THREE.MathUtils.lerp(before.ambient, after.ambient, t),
      sun: THREE.MathUtils.lerp(before.sun, after.sun, t),
      sunColor: new THREE.Color(before.sunColor).lerp(
        new THREE.Color(after.sunColor),
        t,
      ),
      sunPosition,
    };
  }
}
