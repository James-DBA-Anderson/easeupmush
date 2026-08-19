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

export function mountTouchPad(): void {
  const shell = document.getElementById("shell");
  const padEl = document.getElementById("touch-pad");
  if (!shell || !padEl) return;

  const apply = (): void => {
    const touch = isTouchUi();
    document.documentElement.classList.toggle("touch-ui", touch);
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    document.documentElement.classList.toggle("needs-portrait", touch && landscape);
    window.dispatchEvent(new Event("resize"));
  };
  apply();
  window.matchMedia("(hover: none) and (pointer: coarse)").addEventListener("change", apply);
  window.matchMedia("(orientation: landscape)").addEventListener("change", apply);

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

  for (const dir of ["up", "down", "left", "right"] as const) {
    bindHold(
      padEl.querySelector(`[data-dir="${dir}"]`),
      () => setDir(dir, true),
      () => setDir(dir, false),
    );
  }

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

  window.addEventListener("blur", clearDirs);
}
