/** Phone-sized, short landscape, or coarse pointer on a modest screen. */
export const MOBILE_QUERY =
  "(max-width: 900px), (max-height: 600px) and (orientation: landscape), (pointer: coarse) and (max-width: 1200px)";

export function isMobilePlay(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export interface VirtualInput {
  /** Stick X: −1 left … +1 right. */
  moveX: number;
  /** Stick Y: −1 forward … +1 back (screen Y). */
  moveY: number;
  jump: boolean;
  sprint: boolean;
  attack: boolean;
}

const DEADZONE = 0.18;

/**
 * On-screen joystick + action buttons for phones / coarse pointers.
 */
export class MobileControls {
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private media: MediaQueryList;
  private enabled = false;
  private onChange: ((enabled: boolean) => void) | null = null;

  private touchId: number | null = null;
  private moveX = 0;
  private moveY = 0;
  private jump = false;
  private sprint = false;
  private attack = false;

  private readonly onLayout = (): void => {
    this.applyLayout();
  };

  constructor(onChange?: (enabled: boolean) => void) {
    this.root = document.getElementById("mobile-controls")!;
    this.stick = document.getElementById("mobile-stick")!;
    this.knob = document.getElementById("mobile-stick-knob")!;
    this.media = window.matchMedia(MOBILE_QUERY);

    this.bindStick();
    this.bindButton("mobile-jump", (on) => {
      this.jump = on;
    });
    this.bindButton("mobile-attack", (on) => {
      this.attack = on;
    });
    this.bindButton("mobile-sprint", (on) => {
      this.sprint = on;
    });

    this.media.addEventListener("change", this.onLayout);
    window.addEventListener("orientationchange", this.onLayout);
    window.addEventListener("resize", this.onLayout);
    // Apply before wiring onChange so Game isn't called mid-construction.
    this.applyLayout();
    this.onChange = onChange ?? null;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getInput(): VirtualInput {
    return {
      moveX: this.moveX,
      moveY: this.moveY,
      jump: this.jump,
      sprint: this.sprint,
      attack: this.attack,
    };
  }

  public dispose(): void {
    this.media.removeEventListener("change", this.onLayout);
    window.removeEventListener("orientationchange", this.onLayout);
    window.removeEventListener("resize", this.onLayout);
  }

  private applyLayout(): void {
    const want = isMobilePlay();
    const changed = want !== this.enabled;
    this.enabled = want;
    document.documentElement.classList.toggle("touch-ui", want);
    document.body.classList.toggle("touch-ui", want);
    this.root.classList.toggle("visible", want);
    this.root.setAttribute("aria-hidden", want ? "false" : "true");
    if (!want) {
      this.touchId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.jump = false;
      this.sprint = false;
      this.attack = false;
      this.stick.classList.remove("active");
      this.knob.style.transform = "translate(-50%, -50%)";
      for (const id of ["mobile-jump", "mobile-attack", "mobile-sprint"]) {
        document.getElementById(id)?.classList.remove("active");
      }
    }
    if (changed) this.onChange?.(want);
  }

  private bindStick(): void {
    const start = (e: TouchEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t || this.touchId !== null) return;
      this.touchId = t.identifier;
      this.stick.classList.add("active");
      this.updateStick(t.clientX, t.clientY);
    };
    const move = (e: TouchEvent) => {
      if (!this.enabled || this.touchId === null) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier === this.touchId) {
          this.updateStick(t.clientX, t.clientY);
        }
      }
    };
    const end = (e: TouchEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i]!.identifier === this.touchId) {
          this.touchId = null;
          this.moveX = 0;
          this.moveY = 0;
          this.stick.classList.remove("active");
          this.knob.style.transform = "translate(-50%, -50%)";
        }
      }
    };
    this.stick.addEventListener("touchstart", start, { passive: false });
    this.stick.addEventListener("touchmove", move, { passive: false });
    this.stick.addEventListener("touchend", end, { passive: false });
    this.stick.addEventListener("touchcancel", end, { passive: false });
  }

  private updateStick(clientX: number, clientY: number): void {
    const rect = this.stick.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const max = Math.min(rect.width, rect.height) * 0.42;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let nx = dx / max;
    let ny = dy / max;
    if (Math.hypot(nx, ny) < DEADZONE) {
      nx = 0;
      ny = 0;
    }
    this.moveX = nx;
    this.moveY = ny;
  }

  private bindButton(id: string, set: (on: boolean) => void): void {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e: TouchEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      set(true);
      el.classList.add("active");
    };
    const off = (e: TouchEvent) => {
      e.preventDefault();
      set(false);
      el.classList.remove("active");
    };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off, { passive: false });
    el.addEventListener("touchcancel", off, { passive: false });
  }
}
