/** On-screen pad state — held across frames; Just* cleared after each take(). */

export type MobilePadFrame = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  leftJust: boolean;
  rightJust: boolean;
  upJust: boolean;
  downJust: boolean;
  punch: boolean;
  kick: boolean;
  jump: boolean;
  grab: boolean;
  block: boolean;
  run: boolean;
  interact: boolean;
  loot: boolean;
  cover: boolean;
  punchJust: boolean;
  kickJust: boolean;
  jumpJust: boolean;
  grabJust: boolean;
  interactJust: boolean;
  lootJust: boolean;
  /** Menus / continue — Jump or Punch tap. */
  confirmJust: boolean;
  restartJust: boolean;
  pauseJust: boolean;
};

const held = {
  left: false,
  right: false,
  up: false,
  down: false,
  punch: false,
  kick: false,
  jump: false,
  grab: false,
  block: false,
  run: false,
  interact: false,
  loot: false,
  cover: false,
};

const edged = {
  leftJust: false,
  rightJust: false,
  upJust: false,
  downJust: false,
  punchJust: false,
  kickJust: false,
  jumpJust: false,
  grabJust: false,
  interactJust: false,
  lootJust: false,
  coverJust: false,
  confirmJust: false,
  restartJust: false,
  pauseJust: false,
};

let mounted = false;
let root: HTMLElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let pauseOverlay: HTMLElement | null = null;
let pauseResume: (() => void) | null = null;
let pauseRestart: (() => void) | null = null;
let promptOverlay: HTMLElement | null = null;
let promptTitle: HTMLElement | null = null;
let promptBody: HTMLElement | null = null;
let promptBtn: HTMLButtonElement | null = null;
let promptAltBtn: HTMLButtonElement | null = null;
let promptOnPress: (() => void) | null = null;
let promptOnAlt: (() => void) | null = null;
/** Off on the title screen so the start tap isn't fighting the pad. */
let padActive = false;

/** Stick deadzone / travel — knobs past this count as a direction. */
const STICK_DEAD = 0.28;
const STICK_MAX_PX = 52;

export function isMobilePlay(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  const shortSide = Math.min(screen.width, screen.height);
  return mobileUa || ((coarse || noHover) && shortSide <= 920);
}

export function isLandscape(): boolean {
  return window.matchMedia("(orientation: landscape)").matches;
}

/**
 * Snapshot for the player tick. Clears move/attack Just* flags.
 * Interact / loot / confirm / restart stay latched until consume*().
 */
export function takeMobilePad(): MobilePadFrame {
  const frame: MobilePadFrame = {
    left: held.left,
    right: held.right,
    up: held.up,
    down: held.down,
    leftJust: edged.leftJust,
    rightJust: edged.rightJust,
    upJust: edged.upJust,
    downJust: edged.downJust,
    punch: held.punch,
    kick: held.kick,
    jump: held.jump,
    grab: held.grab,
    block: held.block,
    run: held.run,
    interact: held.interact,
    loot: held.loot,
    cover: held.cover,
    punchJust: edged.punchJust,
    kickJust: edged.kickJust,
    jumpJust: edged.jumpJust,
    grabJust: edged.grabJust,
    interactJust: edged.interactJust,
    lootJust: edged.lootJust,
    confirmJust: edged.confirmJust,
    restartJust: edged.restartJust,
    pauseJust: edged.pauseJust,
  };
  edged.leftJust = false;
  edged.rightJust = false;
  edged.upJust = false;
  edged.downJust = false;
  edged.punchJust = false;
  edged.kickJust = false;
  edged.jumpJust = false;
  edged.grabJust = false;
  // Drop unused menu confirms so an old Punch doesn't skip Casey later
  edged.confirmJust = false;
  return frame;
}

export function consumeInteractJust(): boolean {
  const v = edged.interactJust;
  edged.interactJust = false;
  return v;
}

export function consumeLootJust(): boolean {
  const v = edged.lootJust;
  edged.lootJust = false;
  return v;
}

export function consumeCoverJust(): boolean {
  const v = edged.coverJust;
  edged.coverJust = false;
  return v;
}

export function consumeConfirmJust(): boolean {
  const v = edged.confirmJust;
  edged.confirmJust = false;
  return v;
}

export function consumeRestartJust(): boolean {
  const v = edged.restartJust;
  edged.restartJust = false;
  return v;
}

export function consumePauseJust(): boolean {
  const v = edged.pauseJust;
  edged.pauseJust = false;
  return v;
}

/** Peek before Player takes the pad — BeachScene steals Punch for pick up / buy / loot. */
export function peekPunchJust(): boolean {
  return edged.punchJust;
}

/** Swallow Punch so it doesn't also fire a jab. */
export function clearPunchJust(): void {
  edged.punchJust = false;
}

function setDir(dir: "left" | "right" | "up" | "down", on: boolean): void {
  if (on && !held[dir]) edged[`${dir}Just`] = true;
  held[dir] = on;
}

function clearDirs(): void {
  held.left = false;
  held.right = false;
  held.up = false;
  held.down = false;
}

/** Map stick nx/ny (−1..1) into discrete WASD-style holds. */
function applyStickAxes(nx: number, ny: number): void {
  const mag = Math.hypot(nx, ny);
  if (mag < STICK_DEAD) {
    clearDirs();
    return;
  }
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const diagonal = ax >= STICK_DEAD && ay >= STICK_DEAD;
  setDir("left", nx < -STICK_DEAD && (diagonal || ax >= ay));
  setDir("right", nx > STICK_DEAD && (diagonal || ax >= ay));
  setDir("up", ny < -STICK_DEAD && (diagonal || ay > ax));
  setDir("down", ny > STICK_DEAD && (diagonal || ay > ax));
}

function setBtn(
  key: "punch" | "kick" | "jump" | "grab" | "block" | "run" | "interact" | "loot" | "cover",
  on: boolean,
): void {
  if (on && !held[key]) {
    if (key === "punch" || key === "kick" || key === "jump" || key === "grab") {
      edged[`${key}Just`] = true;
    }
    if (key === "interact") edged.interactJust = true;
    if (key === "loot") edged.lootJust = true;
    if (key === "cover") edged.coverJust = true;
    if (key === "punch" || key === "jump") edged.confirmJust = true;
  }
  held[key] = on;
}

function bindHold(el: HTMLElement, onDown: () => void, onUp: () => void): void {
  const down = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    onDown();
    el.classList.add("is-down");
  };
  const up = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    onUp();
    el.classList.remove("is-down");
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("contextmenu", (ev) => ev.preventDefault());
}

/** Floating virtual stick — appears under the thumb, follows within a radius. */
function bindFloatingStick(zone: HTMLElement, stick: HTMLElement, knob: HTMLElement): void {
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;

  const placeStick = (x: number, y: number) => {
    originX = x;
    originY = y;
    stick.style.bottom = "auto";
    stick.style.left = `${x}px`;
    stick.style.top = `${y}px`;
    knob.style.transform = "translate(-50%, -50%)";
  };

  const moveKnob = (clientX: number, clientY: number) => {
    let dx = clientX - originX;
    let dy = clientY - originY;
    const mag = Math.hypot(dx, dy);
    if (mag > STICK_MAX_PX) {
      dx = (dx / mag) * STICK_MAX_PX;
      dy = (dy / mag) * STICK_MAX_PX;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    applyStickAxes(dx / STICK_MAX_PX, dy / STICK_MAX_PX);
  };

  const resetStick = () => {
    zone.classList.remove("is-active");
    stick.classList.remove("is-active");
    stick.style.left = "";
    stick.style.top = "";
    stick.style.bottom = "";
    clearDirs();
    knob.style.transform = "translate(-50%, -50%)";
  };

  const end = (ev: PointerEvent) => {
    if (pointerId === null || ev.pointerId !== pointerId) return;
    pointerId = null;
    resetStick();
    try {
      zone.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
  };

  zone.addEventListener("pointerdown", (ev) => {
    if (pointerId !== null) return;
    ev.preventDefault();
    ev.stopPropagation();
    pointerId = ev.pointerId;
    zone.setPointerCapture(ev.pointerId);
    zone.classList.add("is-active");
    stick.classList.add("is-active");
    placeStick(ev.clientX, ev.clientY);
    moveKnob(ev.clientX, ev.clientY);
  });
  zone.addEventListener("pointermove", (ev) => {
    if (pointerId === null || ev.pointerId !== pointerId) return;
    ev.preventDefault();
    moveKnob(ev.clientX, ev.clientY);
  });
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
  zone.addEventListener("lostpointercapture", () => {
    if (pointerId === null) return;
    pointerId = null;
    resetStick();
  });
  zone.addEventListener("contextmenu", (ev) => ev.preventDefault());
}

export function mountMobileControls(): void {
  if (mounted || !isMobilePlay()) return;
  mounted = true;
  document.body.classList.add("mobile-play");

  root = document.createElement("div");
  root.id = "mobile-pad";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="mp-stick-zone" aria-label="Move">
      <div class="mp-stick">
        <div class="mp-stick-base"></div>
        <div class="mp-stick-knob"></div>
      </div>
    </div>
    <div class="mp-cluster mp-cluster--fight">
      <button type="button" class="mp-btn mp-act mp-act--punch" data-btn="punch" aria-label="Punch">Punch</button>
      <button type="button" class="mp-btn mp-act mp-act--kick" data-btn="kick" aria-label="Kick">Kick</button>
      <button type="button" class="mp-btn mp-act mp-act--grab" data-btn="grab" aria-label="Grab">Grab</button>
      <button type="button" class="mp-btn mp-act mp-act--block" data-btn="block" aria-label="Block">Block</button>
      <button type="button" class="mp-btn mp-act mp-act--run" data-btn="run" aria-label="Run">Run</button>
      <button type="button" class="mp-btn mp-act mp-act--jump" data-btn="jump" aria-label="Jump">Jump</button>
    </div>
  `;
  document.body.appendChild(root);

  const zone = root.querySelector<HTMLElement>(".mp-stick-zone")!;
  const stick = root.querySelector<HTMLElement>(".mp-stick")!;
  const knob = root.querySelector<HTMLElement>(".mp-stick-knob")!;
  bindFloatingStick(zone, stick, knob);

  root.querySelectorAll<HTMLElement>("[data-btn]").forEach((el) => {
    const btn = el.dataset.btn as
      | "punch"
      | "kick"
      | "jump"
      | "grab"
      | "block"
      | "run"
      | "interact"
      | "loot"
      | "cover";
    bindHold(
      el,
      () => setBtn(btn, true),
      () => setBtn(btn, false),
    );
  });

  syncPadVisibility();
  window.addEventListener("orientationchange", syncPadVisibility);
  window.addEventListener("resize", syncPadVisibility);
}

function bindDebouncedTap(el: HTMLElement, fn: () => void): void {
  let armedAt = 0;
  const tap = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    const now = performance.now();
    if (now - armedAt < 400) return;
    armedAt = now;
    fn();
  };
  el.addEventListener("pointerup", tap);
  el.addEventListener("click", tap);
}

/** Pause control — HTML so it sits above the canvas on mobile and desktop. */
export function mountPauseButton(): void {
  if (!pauseBtn) {
    pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.id = "game-pause-btn";
    pauseBtn.className = "mp-btn mp-pause";
    pauseBtn.setAttribute("aria-label", "Pause");
    pauseBtn.textContent = "II";
    bindDebouncedTap(pauseBtn, () => {
      edged.pauseJust = true;
    });
    document.body.appendChild(pauseBtn);
  }
  mountPauseOverlay();
  mountHtmlPrompt();
}

function mountPauseOverlay(): void {
  if (pauseOverlay) return;
  pauseOverlay = document.createElement("div");
  pauseOverlay.id = "game-pause-overlay";
  pauseOverlay.innerHTML = `
    <div class="game-pause-card">
      <p class="game-pause-title">PAUSED</p>
      <button type="button" class="game-pause-resume" data-pause-act="resume">Resume</button>
      <button type="button" class="game-pause-restart" data-pause-act="restart">Restart checkpoint</button>
    </div>
  `;
  const resume = pauseOverlay.querySelector<HTMLElement>('[data-pause-act="resume"]')!;
  const restart = pauseOverlay.querySelector<HTMLElement>('[data-pause-act="restart"]')!;
  bindDebouncedTap(resume, () => pauseResume?.());
  bindDebouncedTap(restart, () => pauseRestart?.());
  document.body.appendChild(pauseOverlay);
}

export function bindPauseMenu(handlers: { resume: () => void; restart: () => void }): void {
  pauseResume = handlers.resume;
  pauseRestart = handlers.restart;
}

export function setPauseMenuOpen(on: boolean): void {
  if (!pauseOverlay) mountPauseOverlay();
  pauseOverlay?.classList.toggle("is-on", on);
}

function mountHtmlPrompt(): void {
  if (promptOverlay) return;
  promptOverlay = document.createElement("div");
  promptOverlay.id = "game-prompt-overlay";
  promptOverlay.innerHTML = `
    <div class="game-prompt-card">
      <p class="game-prompt-title"></p>
      <p class="game-prompt-body"></p>
      <button type="button" class="game-prompt-btn"></button>
      <button type="button" class="game-prompt-alt" hidden></button>
    </div>
  `;
  promptTitle = promptOverlay.querySelector(".game-prompt-title");
  promptBody = promptOverlay.querySelector(".game-prompt-body");
  promptBtn = promptOverlay.querySelector(".game-prompt-btn");
  promptAltBtn = promptOverlay.querySelector(".game-prompt-alt");
  if (promptBtn) {
    bindDebouncedTap(promptBtn, () => promptOnPress?.());
  }
  if (promptAltBtn) {
    bindDebouncedTap(promptAltBtn, () => promptOnAlt?.());
  }
  document.body.appendChild(promptOverlay);
}

/** Full-screen card above the pad — cuffs, nuke, and other end states. */
export function showHtmlPrompt(opts: {
  title: string;
  body?: string;
  buttonLabel: string;
  onPress: () => void;
  altLabel?: string;
  onAltPress?: () => void;
}): void {
  if (!promptOverlay) mountHtmlPrompt();
  promptOnPress = opts.onPress;
  promptOnAlt = opts.onAltPress ?? null;
  if (promptTitle) promptTitle.textContent = opts.title;
  if (promptBody) {
    const body = opts.body?.trim() ?? "";
    promptBody.textContent = body;
    promptBody.hidden = !body;
  }
  if (promptBtn) promptBtn.textContent = opts.buttonLabel;
  if (promptAltBtn) {
    const alt = opts.altLabel?.trim() ?? "";
    promptAltBtn.textContent = alt;
    promptAltBtn.hidden = !alt || !opts.onAltPress;
  }
  setPauseMenuOpen(false);
  promptOverlay?.classList.add("is-on");
}

export function hideHtmlPrompt(): void {
  promptOnPress = null;
  promptOnAlt = null;
  promptOverlay?.classList.remove("is-on");
}

export function setPauseButtonActive(on: boolean): void {
  if (!pauseBtn) mountPauseButton();
  pauseBtn?.classList.toggle("is-on", on);
  if (!on) setPauseMenuOpen(false);
}

export function syncPadVisibility(): void {
  const mobile = isMobilePlay();
  const land = isLandscape();
  document.body.classList.toggle("mobile-play", mobile);
  document.body.classList.toggle("mobile-landscape", mobile && land);
  document.body.classList.toggle("mobile-portrait", mobile && !land);
  if (!root) return;
  root.hidden = !(mobile && land && padActive);
}

export function setMobilePadActive(on: boolean): void {
  padActive = on;
  syncPadVisibility();
  setPauseButtonActive(on);
}

/** Prefer landscape; often needs a user gesture + fullscreen on Android. */
export async function tryEnforceLandscape(): Promise<void> {
  if (!isMobilePlay()) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    /* ignore — not always allowed */
  }
  try {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (orient?.lock) await orient.lock("landscape");
  } catch {
    /* iOS / unsupported — CSS rotate prompt covers this */
  }
  syncPadVisibility();
}
