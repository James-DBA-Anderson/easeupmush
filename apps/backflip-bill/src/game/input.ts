import { JOYSTICK_DEADZONE } from "./constants";

/** Portrait, phone-sized, or a coarse pointer — show the on-screen controls. */
export const MOBILE_QUERY =
  "(orientation: portrait), (max-width: 820px), (pointer: coarse)";

export function wantsTouchUi(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export interface PlayInput {
  /** −1 … +1 run. Horizontal air steering is ignored by the player. */
  run: number;
  /**
   * −1 straighten (up) … +1 crouch (down). Only used in the air.
   * 0 is the midpoint tuck.
   */
  tuck: number;
  /** Edge-triggered backflip / jump. */
  jump: boolean;
}

/**
 * Keyboard plus a floating virtual joystick (bottom left) and FLIP button
 * (bottom right). Pointer events so a desktop portrait viewport can drive it.
 */
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private stickRun = 0;
  private stickTuck = 0;
  private enabled = false;
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private flip: HTMLElement;
  private media: MediaQueryList;
  private stickId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private floating = false;

  private readonly onLayout = (): void => {
    this.applyLayout();
  };

  constructor() {
    this.root = document.getElementById("mobile-controls")!;
    this.stick = document.getElementById("mobile-stick")!;
    this.knob = document.getElementById("mobile-stick-knob")!;
    this.flip = document.getElementById("mobile-flip")!;
    this.media = window.matchMedia(MOBILE_QUERY);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    this.bindStick();
    this.bindFlip();
    this.bindFloatingZone();

    this.media.addEventListener("change", this.onLayout);
    window.addEventListener("orientationchange", this.onLayout);
    window.addEventListener("resize", this.onLayout);
    this.applyLayout();
  }

  public isTouchUi(): boolean {
    return this.enabled;
  }

  public poll(): PlayInput {
    let run = this.stickRun;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) run -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) run += 1;
    run = Math.max(-1, Math.min(1, run));

    let tuck = this.stickTuck;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) tuck -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) tuck += 1;
    tuck = Math.max(-1, Math.min(1, tuck));

    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return { run, tuck, jump };
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.media.removeEventListener("change", this.onLayout);
    window.removeEventListener("orientationchange", this.onLayout);
    window.removeEventListener("resize", this.onLayout);
  }

  private applyLayout(): void {
    const want = wantsTouchUi();
    this.enabled = want;
    document.documentElement.classList.toggle("touch-ui", want);
    document.body.classList.toggle("touch-ui", want);
    this.root.classList.toggle("visible", want);
    this.root.setAttribute("aria-hidden", want ? "false" : "true");
    if (!want) this.resetStick();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      this.jumpQueued = true;
    }
    if (e.code === "KeyW" || e.code === "ArrowUp") {
      this.jumpQueued = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.resetStick();
  };

  private bindFlip(): void {
    const on = (e: PointerEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.flip.setPointerCapture(e.pointerId);
      this.jumpQueued = true;
      this.flip.classList.add("active");
    };
    const off = (e: PointerEvent) => {
      e.preventDefault();
      this.flip.classList.remove("active");
    };
    this.flip.addEventListener("pointerdown", on);
    this.flip.addEventListener("pointerup", off);
    this.flip.addEventListener("pointercancel", off);
  }

  private bindStick(): void {
    const start = (e: PointerEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.beginStick(e.pointerId, e.clientX, e.clientY, false);
    };
    this.stick.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", this.onStickMove);
    window.addEventListener("pointerup", this.onStickEnd);
    window.addEventListener("pointercancel", this.onStickEnd);
  }

  /**
   * Press anywhere in the left half (except the flip button) to float the
   * stick under the finger, then drag left/right to run.
   */
  private bindFloatingZone(): void {
    const zone = document.getElementById("stick-zone");
    if (!zone) return;
    zone.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!this.enabled || this.stickId !== null) return;
      if (e.target === this.flip || this.flip.contains(e.target as Node)) return;
      e.preventDefault();
      this.beginStick(e.pointerId, e.clientX, e.clientY, true);
    });
  }

  private beginStick(
    id: number,
    clientX: number,
    clientY: number,
    floatTo: boolean,
  ): void {
    this.stickId = id;
    this.stick.classList.add("active");
    if (floatTo) {
      this.floating = true;
      const rect = this.stick.getBoundingClientRect();
      const x = Math.max(8, Math.min(window.innerWidth * 0.48 - rect.width, clientX - rect.width * 0.5));
      const y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, clientY - rect.height * 0.5));
      this.stick.style.left = `${x}px`;
      this.stick.style.top = `${y}px`;
      this.stick.style.bottom = "auto";
    }
    const rect = this.stick.getBoundingClientRect();
    this.stickOriginX = rect.left + rect.width * 0.5;
    this.stickOriginY = rect.top + rect.height * 0.5;
    this.updateStick(clientX, clientY);
  }

  private onStickMove = (e: PointerEvent): void => {
    if (this.stickId !== e.pointerId) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private onStickEnd = (e: PointerEvent): void => {
    if (this.stickId !== e.pointerId) return;
    this.resetStick();
  };

  private updateStick(clientX: number, clientY: number): void {
    const rect = this.stick.getBoundingClientRect();
    const max = Math.min(rect.width, rect.height) * 0.42;
    let dx = clientX - this.stickOriginX;
    let dy = clientY - this.stickOriginY;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let nx = dx / max;
    let ny = dy / max;
    if (Math.abs(nx) < JOYSTICK_DEADZONE) nx = 0;
    if (Math.abs(ny) < JOYSTICK_DEADZONE) ny = 0;
    this.stickRun = Math.max(-1, Math.min(1, nx));
    this.stickTuck = Math.max(-1, Math.min(1, ny));
  }

  private resetStick(): void {
    this.stickId = null;
    this.stickRun = 0;
    this.stickTuck = 0;
    this.stick.classList.remove("active");
    this.knob.style.transform = "translate(-50%, -50%)";
    if (this.floating) {
      this.stick.style.left = "";
      this.stick.style.top = "";
      this.stick.style.bottom = "";
      this.floating = false;
    }
  }
}
