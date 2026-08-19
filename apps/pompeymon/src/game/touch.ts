export function isTouchUi(): boolean {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export const pad = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const taps = {
  action: false,
  cancel: false,
  bag: false,
  up: false,
  down: false,
  left: false,
  right: false,
};

export function consumeAction(): boolean {
  const hit = taps.action;
  taps.action = false;
  return hit;
}

export function consumeBag(): boolean {
  const hit = taps.bag;
  taps.bag = false;
  return hit;
}

export function consumeCancel(): boolean {
  const hit = taps.cancel;
  taps.cancel = false;
  return hit;
}

export function consumeDir(dir: "up" | "down" | "left" | "right"): boolean {
  const hit = taps[dir];
  taps[dir] = false;
  return hit;
}

function setDir(dir: "up" | "down" | "left" | "right", down: boolean): void {
  if (down && !pad[dir]) taps[dir] = true;
  pad[dir] = down;
}

function clearDirs(): void {
  pad.up = pad.down = pad.left = pad.right = false;
}

function lockPlayScreen(): void {
  const el = document.getElementById("game-screen");
  if (!el) return;
  if (!document.documentElement.classList.contains("touch-ui")) {
    el.style.width = "";
    el.style.height = "";
    return;
  }
  const vw = window.innerWidth;
  const cap = Math.round((window.screen.height || window.innerHeight) * 0.48);
  let h = Math.round((vw * 160) / 240);
  if (h > cap) h = cap;
  const w = Math.round((h * 240) / 160);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

export function mountTouchPad(): void {
  const padEl = document.getElementById("touch-pad");
  const dpad = document.querySelector(".dpad");
  if (!padEl || !dpad) return;

  const apply = (): void => {
    const touch = isTouchUi();
    document.documentElement.classList.toggle("touch-ui", touch);
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    document.documentElement.classList.toggle("needs-portrait", touch && landscape);
    lockPlayScreen();
    window.dispatchEvent(new Event("resize"));
  };
  apply();
  window.matchMedia("(hover: none) and (pointer: coarse)").addEventListener("change", apply);
  window.matchMedia("(orientation: landscape)").addEventListener("change", apply);
  window.addEventListener("pageshow", apply);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });

  const dirBtns = {
    up: dpad.querySelector('[data-dir="up"]'),
    down: dpad.querySelector('[data-dir="down"]'),
    left: dpad.querySelector('[data-dir="left"]'),
    right: dpad.querySelector('[data-dir="right"]'),
  };

  const paintHeld = (): void => {
    for (const dir of ["up", "down", "left", "right"] as const) {
      dirBtns[dir]?.classList.toggle("held", pad[dir]);
    }
  };

  const aim = (clientX: number, clientY: number): void => {
    const r = (dpad as HTMLElement).getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const nx = dx / Math.max(r.width / 2, 1);
    const ny = dy / Math.max(r.height / 2, 1);
    const dead = 0.16;
    setDir("left", nx < -dead);
    setDir("right", nx > dead);
    setDir("up", ny < -dead);
    setDir("down", ny > dead);
    paintHeld();
  };

  let dpadPtr: number | null = null;
  const dpadEl = dpad as HTMLElement;
  dpadEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dpadPtr = e.pointerId;
    dpadEl.setPointerCapture(e.pointerId);
    aim(e.clientX, e.clientY);
  });
  dpadEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== dpadPtr) return;
    e.preventDefault();
    aim(e.clientX, e.clientY);
  });
  const endDpad = (e: PointerEvent): void => {
    if (e.pointerId !== dpadPtr) return;
    dpadPtr = null;
    clearDirs();
    paintHeld();
  };
  dpadEl.addEventListener("pointerup", endDpad);
  dpadEl.addEventListener("pointercancel", endDpad);

  const bindHold = (el: Element | null, onDown: () => void, onUp: () => void): void => {
    if (!el) return;
    const down = (e: Event): void => {
      e.preventDefault();
      const pe = e as PointerEvent;
      if (typeof pe.pointerId === "number") (el as HTMLElement).setPointerCapture(pe.pointerId);
      onDown();
    };
    const up = (e: Event): void => {
      e.preventDefault();
      onUp();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  bindHold(
    padEl.querySelector("[data-pad=action]"),
    () => {
      taps.action = true;
    },
    () => undefined,
  );
  bindHold(
    padEl.querySelector("[data-pad=cancel]"),
    () => {
      taps.cancel = true;
    },
    () => undefined,
  );
  bindHold(
    padEl.querySelector("[data-pad=bag]"),
    () => {
      taps.bag = true;
    },
    () => undefined,
  );

  window.addEventListener("blur", () => {
    dpadPtr = null;
    clearDirs();
    paintHeld();
  });
}
