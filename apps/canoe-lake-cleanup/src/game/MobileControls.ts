/** Phone-sized, short landscape, or a coarse pointer on a modest screen. */
export const MOBILE_QUERY =
  "(max-width: 900px), (max-height: 600px) and (orientation: landscape), (pointer: coarse) and (max-width: 1200px)";

export function isMobilePlay(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

/**
 * Twin sticks for walking and looking, plus a third for aiming the hose.
 * Left = move, bottom-right = look, spray stick above look = aim/fire.
 */

const MAX_DISTANCE = 50;
/** Radians per second at full stick throw (scaled by 60fps in getLookDelta). */
const LOOK_SENSITIVITY = 0.048;
/** Ignore tiny look stick noise so the camera doesn't twitch at rest. */
const LOOK_DEADZONE = 0.1;
/** Spray stick must leave this ring before droplets fire. */
const SPRAY_DEADZONE = 0.18;

export class MobileControls {
  private root: HTMLElement;
  private moveContainer: HTMLElement;
  private moveKnob: HTMLElement;
  private lookContainer: HTMLElement;
  private lookKnob: HTMLElement;
  private sprayContainer: HTMLElement;
  private sprayKnob: HTMLElement;
  private rotatePrompt: HTMLElement;
  private media: MediaQueryList;

  private lookActive = false;
  private sprayActive = false;
  private moveTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private sprayTouchId: number | null = null;

  private moveX = 0;
  private moveY = 0;
  private lookX = 0;
  private lookY = 0;
  private sprayX = 0;
  private sprayY = 0;

  /** Where the look finger first landed — look is relative to that, not the pad centre. */
  private lookOriginX = 0;
  private lookOriginY = 0;

  private enabled = false;
  private landscape = true;

  constructor() {
    this.root = document.getElementById("mobile-controls")!;
    this.moveContainer = document.getElementById("joystick-container")!;
    this.moveKnob = document.getElementById("joystick-knob")!;
    this.lookContainer = document.getElementById("look-joystick-container")!;
    this.lookKnob = document.getElementById("look-joystick-knob")!;
    this.sprayContainer = document.getElementById("spray-joystick-container")!;
    this.sprayKnob = document.getElementById("spray-joystick-knob")!;
    this.rotatePrompt = document.getElementById("rotate-prompt")!;
    this.media = window.matchMedia(MOBILE_QUERY);

    this.setupStick(
      this.moveContainer,
      (id, x, y) => this.startMove(id, x, y),
      (id, x, y) => this.moveMove(id, x, y),
      (id) => this.endMove(id),
    );
    this.setupStick(
      this.lookContainer,
      (id, x, y) => this.startLook(id, x, y),
      (id, x, y) => this.moveLook(id, x, y),
      (id) => this.endLook(id),
    );
    this.setupStick(
      this.sprayContainer,
      (id, x, y) => this.startSpray(id, x, y),
      (id, x, y) => this.moveSpray(id, x, y),
      (id) => this.endSpray(id),
    );

    const refresh = () => this.applyLayout();
    this.media.addEventListener("change", refresh);
    window.addEventListener("orientationchange", refresh);
    window.addEventListener("resize", refresh);
    this.applyLayout();
  }

  private setupStick(
    el: HTMLElement,
    onStart: (id: number, x: number, y: number) => void,
    onMove: (id: number, x: number, y: number) => void,
    onEnd: (id: number) => void,
  ): void {
    el.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        onStart(t.identifier, t.clientX, t.clientY);
      },
      { passive: false },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          onMove(t.identifier, t.clientX, t.clientY);
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        onEnd(e.changedTouches[i].identifier);
      }
    };
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end, { passive: false });
  }

  private startMove(id: number, x: number, y: number): void {
    if (this.moveTouchId !== null) return;
    this.moveTouchId = id;
    this.moveContainer.classList.add("active");
    this.updateMove(x, y);
  }

  private moveMove(id: number, x: number, y: number): void {
    if (id !== this.moveTouchId) return;
    this.updateMove(x, y);
  }

  private endMove(id: number): void {
    if (id !== this.moveTouchId) return;
    this.moveTouchId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.moveContainer.classList.remove("active");
    this.moveKnob.style.transform = "translate(-50%, -50%)";
  }

  private updateMove(clientX: number, clientY: number): void {
    const rect = this.moveContainer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DISTANCE) {
      dx = (dx / dist) * MAX_DISTANCE;
      dy = (dy / dist) * MAX_DISTANCE;
    }
    this.moveX = dx / MAX_DISTANCE;
    this.moveY = dy / MAX_DISTANCE;
    this.moveKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private startLook(id: number, x: number, y: number): void {
    if (this.lookTouchId !== null) return;
    this.lookTouchId = id;
    this.lookActive = true;
    this.lookOriginX = x;
    this.lookOriginY = y;
    this.lookX = 0;
    this.lookY = 0;
    this.lookContainer.classList.add("active");
    this.lookKnob.style.transform = "translate(-50%, -50%)";
  }

  private moveLook(id: number, x: number, y: number): void {
    if (id !== this.lookTouchId) return;
    let dx = x - this.lookOriginX;
    let dy = y - this.lookOriginY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DISTANCE) {
      dx = (dx / dist) * MAX_DISTANCE;
      dy = (dy / dist) * MAX_DISTANCE;
    }
    let nx = dx / MAX_DISTANCE;
    let ny = dy / MAX_DISTANCE;
    const mag = Math.sqrt(nx * nx + ny * ny);
    if (mag < LOOK_DEADZONE) {
      nx = 0;
      ny = 0;
    } else {
      const scale = (mag - LOOK_DEADZONE) / (1 - LOOK_DEADZONE);
      nx = (nx / mag) * scale;
      ny = (ny / mag) * scale;
    }
    this.lookX = nx;
    this.lookY = ny;
    this.lookKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private endLook(id: number): void {
    if (id !== this.lookTouchId) return;
    this.lookTouchId = null;
    this.lookActive = false;
    this.lookX = 0;
    this.lookY = 0;
    this.lookContainer.classList.remove("active");
    this.lookKnob.style.transform = "translate(-50%, -50%)";
  }

  private startSpray(id: number, x: number, y: number): void {
    if (this.sprayTouchId !== null) return;
    this.sprayTouchId = id;
    this.sprayActive = true;
    this.sprayContainer.classList.add("active");
    this.updateSpray(x, y);
  }

  private moveSpray(id: number, x: number, y: number): void {
    if (id !== this.sprayTouchId) return;
    this.updateSpray(x, y);
  }

  private endSpray(id: number): void {
    if (id !== this.sprayTouchId) return;
    this.sprayTouchId = null;
    this.sprayActive = false;
    this.sprayX = 0;
    this.sprayY = 0;
    this.sprayContainer.classList.remove("active");
    this.sprayKnob.style.transform = "translate(-50%, -50%)";
  }

  private updateSpray(clientX: number, clientY: number): void {
    const rect = this.sprayContainer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DISTANCE) {
      dx = (dx / dist) * MAX_DISTANCE;
      dy = (dy / dist) * MAX_DISTANCE;
    }
    let nx = dx / MAX_DISTANCE;
    let ny = dy / MAX_DISTANCE;
    const mag = Math.sqrt(nx * nx + ny * ny);
    if (mag < SPRAY_DEADZONE) {
      this.sprayX = 0;
      this.sprayY = 0;
    } else {
      const scale = (mag - SPRAY_DEADZONE) / (1 - SPRAY_DEADZONE);
      this.sprayX = (nx / mag) * scale;
      this.sprayY = (ny / mag) * scale;
    }
    this.sprayKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private checkOrientation(): void {
    this.landscape = isLandscape();
    this.syncVisibility();
  }

  /** Decide whether this viewport wants on-screen sticks. */
  private applyLayout(): void {
    const want = isMobilePlay();
    if (want && !this.enabled) this.enable();
    else if (!want && this.enabled) this.disable();
    else this.checkOrientation();
  }

  private syncVisibility(): void {
    const show = this.enabled && this.landscape;
    this.root.classList.toggle("visible", show);
    this.moveContainer.classList.toggle("visible", show);
    this.lookContainer.classList.toggle("visible", show);
    this.sprayContainer.classList.toggle("visible", show);
    // Rotate prompt is owned by main.ts before boot; once the game is up,
    // keep it in step with orientation so it covers the world in portrait.
    this.rotatePrompt.classList.toggle(
      "visible",
      this.enabled && !this.landscape,
    );
  }

  public isLandscapePlay(): boolean {
    return this.enabled && this.landscape;
  }

  public enable(): void {
    this.enabled = true;
    document.documentElement.classList.add("touch-device", "touch-ui");
    document.body.classList.add("touch-device", "touch-ui");
    this.checkOrientation();
  }

  public disable(): void {
    this.enabled = false;
    document.documentElement.classList.remove("touch-device", "touch-ui");
    document.body.classList.remove("touch-device", "touch-ui");
    this.root.classList.remove("visible");
    this.syncVisibility();
    this.endMove(this.moveTouchId ?? -1);
    this.endLook(this.lookTouchId ?? -1);
    this.endSpray(this.sprayTouchId ?? -1);
  }

  public getMoveInput(): { x: number; y: number } {
    return { x: this.moveX, y: this.moveY };
  }

  /** Look stick contribution this frame (same sign convention as mouse movement). */
  public getLookDelta(delta: number): { x: number; y: number } {
    if (!this.lookActive) return { x: 0, y: 0 };
    const rate = LOOK_SENSITIVITY * 60 * delta;
    return { x: this.lookX * rate, y: this.lookY * rate };
  }

  /** Finger is on the spray stick (even inside the deadzone). */
  public isSprayHeld(): boolean {
    return this.sprayActive;
  }

  /**
   * Aim in stick space: +x right, +y down. Null when not past the deadzone.
   */
  public getSprayAim(): { x: number; y: number } | null {
    if (!this.sprayActive) return null;
    if (this.sprayX === 0 && this.sprayY === 0) return null;
    return { x: this.sprayX, y: this.sprayY };
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}
