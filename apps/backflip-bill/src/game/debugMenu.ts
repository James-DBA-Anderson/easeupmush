import type { Game } from "./game";
import {
  applyTuning,
  snapshotTuning,
  TUNING_DEFAULTS,
  tuning,
  type Tuning,
  type TuckScheme,
} from "./tuning";
import { LEVELS } from "./world";

type NumericTuning = Exclude<keyof Tuning, "tuckScheme">;

interface SliderSpec {
  key: NumericTuning;
  label: string;
  min: number;
  max: number;
  step: number;
}

const MOVEMENT: SliderSpec[] = [
  { key: "maxSpeed", label: "Move speed", min: 1.5, max: 20, step: 0.1 },
  { key: "accel", label: "Acceleration", min: 2, max: 80, step: 0.5 },
  { key: "decel", label: "Deceleration", min: 2, max: 80, step: 0.5 },
  { key: "turnAccel", label: "Turn accel", min: 2, max: 80, step: 0.5 },
  { key: "gravity", label: "Gravity", min: 6, max: 48, step: 0.5 },
  { key: "jumpVy", label: "Jump height", min: 3, max: 24, step: 0.1 },
];

const FLIP: SliderSpec[] = [
  { key: "flipDurationSlow", label: "Flip time (stand)", min: 0.35, max: 3, step: 0.01 },
  { key: "flipDurationFast", label: "Flip time (run-up)", min: 0.25, max: 2.5, step: 0.01 },
  { key: "tuckLerp", label: "Tuck blend", min: 1, max: 20, step: 0.1 },
  { key: "tuckRateStraight", label: "Spin (layout)", min: 0.15, max: 2, step: 0.01 },
  { key: "tuckRateCrouch", label: "Spin (tuck)", min: 0.4, max: 3, step: 0.01 },
];

const LANDING: SliderSpec[] = [
  { key: "cleanLandDeg", label: "Clean land (°)", min: 4, max: 80, step: 1 },
  { key: "stumbleLandDeg", label: "Stumble land (°)", min: 10, max: 170, step: 1 },
  { key: "cleanTuck", label: "Clean tuck (max)", min: 0.05, max: 0.7, step: 0.01 },
  { key: "hardTuck", label: "Hard tuck (min)", min: 0.4, max: 1, step: 0.01 },
  { key: "stumbleTime", label: "Stumble time", min: 0.1, max: 3, step: 0.05 },
  { key: "fallenTime", label: "Ragdoll / downed time", min: 0.15, max: 4, step: 0.05 },
  { key: "deathTime", label: "Death delay", min: 0.2, max: 4, step: 0.05 },
];

const SCHEMES: { id: TuckScheme; label: string; hint: string }[] = [
  { id: "vertical", label: "Up / down", hint: "Up straightens, down tucks" },
  { id: "horizontal", label: "Left / right", hint: "Left straightens, right tucks" },
  { id: "holdJump", label: "Hold jump", hint: "Hold FLIP to tuck, release to stretch" },
];

export function mountDebugMenu(game: Game): void {
  let disk = snapshotTuning();
  let open = false;

  const root = document.createElement("div");
  root.id = "debug-ui";
  root.innerHTML = `
    <style>
      #debug-ui {
        pointer-events: none;
        font-family: "Source Sans 3", "Segoe UI", sans-serif;
      }
      #debug-launch,
      #debug-menu {
        pointer-events: auto;
      }
      #debug-launch {
        position: fixed;
        left: max(0.65rem, env(safe-area-inset-left));
        bottom: max(0.75rem, env(safe-area-inset-bottom));
        z-index: 50;
        font-family: inherit;
        font-weight: 700;
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 999px;
        border: 1px solid rgba(232, 240, 244, 0.35);
        background: rgba(7, 20, 26, 0.82);
        color: #f0a23a;
        padding: 0.38rem 0.85rem;
        cursor: pointer;
        box-shadow: 0 4px 16px #0005;
      }
      body.touch-ui #debug-launch {
        bottom: calc(min(34vw, 148px) + 1.8rem + env(safe-area-inset-bottom, 0px));
      }
      #debug-menu {
        position: fixed;
        inset: 0;
        z-index: 50;
        width: 100%;
        height: 100dvh;
        overflow: auto;
        color: #e8f0f4;
        background: rgba(7, 20, 26, 0.96);
        border: 0;
        border-radius: 0;
        box-shadow: none;
        padding: max(0.85rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      }
      #debug-menu .debug-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
        gap: 0.55rem;
      }
      #debug-menu .level-picks {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      #debug-menu .level-picks button[aria-pressed="true"] {
        background: #f0a23a;
        color: #07141a;
        border-color: #f0a23a;
      }
      #debug-ui:not(.open) #debug-menu { display: none; }
      #debug-ui.open #debug-launch { display: none; }
      #debug-menu h2 {
        margin: 0;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #f0a23a;
      }
      #debug-menu .debug-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.55rem;
      }
      #debug-menu fieldset {
        border: 1px solid rgba(200, 221, 230, 0.14);
        border-radius: 8px;
        margin: 0 0 0.55rem;
        padding: 0.45rem 0.55rem 0.55rem;
      }
      #debug-menu legend {
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #c8dde6;
        padding: 0 0.25rem;
      }
      #debug-menu label.scheme {
        display: flex;
        gap: 0.4rem;
        align-items: flex-start;
        font-size: 0.82rem;
        font-weight: 600;
        margin: 0.22rem 0;
        cursor: pointer;
      }
      #debug-menu label.scheme small {
        display: block;
        font-weight: 500;
        opacity: 0.7;
      }
      #debug-menu .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.25rem 0.4rem;
        align-items: center;
        margin: 0.28rem 0;
        font-size: 0.78rem;
      }
      #debug-menu .row span { opacity: 0.9; }
      #debug-menu .row b {
        font-variant-numeric: tabular-nums;
        font-size: 0.75rem;
        color: #f0a23a;
        min-width: 2.6rem;
        text-align: right;
      }
      #debug-menu input[type="range"] { width: 100%; grid-column: 1 / -1; }
      #debug-menu .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      #debug-menu button {
        font-family: inherit;
        font-weight: 700;
        font-size: 0.78rem;
        border-radius: 999px;
        border: 1px solid rgba(232, 240, 244, 0.28);
        background: rgba(232, 240, 244, 0.08);
        color: #e8f0f4;
        padding: 0.28rem 0.7rem;
        cursor: pointer;
      }
      #debug-menu button.primary {
        background: #f0a23a;
        color: #07141a;
        border-color: #f0a23a;
      }
      #debug-menu .status {
        font-size: 0.72rem;
        min-height: 1.1em;
        margin-top: 0.4rem;
        opacity: 0.85;
      }
    </style>
    <button type="button" id="debug-launch" aria-expanded="false" aria-controls="debug-menu">Debug</button>
    <aside id="debug-menu" hidden>
    <div class="debug-head">
      <h2>Debug</h2>
      <button type="button" class="toggle" aria-expanded="false">Hide</button>
    </div>
    <div class="debug-body">
      <fieldset>
        <legend>Level</legend>
        <div class="level-picks">
          ${LEVELS.map(
            (lv, i) =>
              `<button type="button" data-level="${i}" aria-pressed="false">${lv.title}</button>`,
          ).join("")}
        </div>
      </fieldset>
      <div class="debug-grid">
      <fieldset>
        <legend>Controls</legend>
        ${SCHEMES.map(
          (s) => `
          <label class="scheme">
            <input type="radio" name="tuck-scheme" value="${s.id}">
            <span>${s.label}<small>${s.hint}</small></span>
          </label>`,
        ).join("")}
      </fieldset>
      <fieldset>
        <legend>Movement</legend>
        ${MOVEMENT.map(sliderHtml).join("")}
      </fieldset>
      <fieldset>
        <legend>Flip</legend>
        ${FLIP.map(sliderHtml).join("")}
      </fieldset>
      <fieldset>
        <legend>Landing</legend>
        ${LANDING.map(sliderHtml).join("")}
      </fieldset>
      </div>
      <div class="actions">
        <button type="button" class="primary save">Save</button>
        <button type="button" class="revert">Revert</button>
        <button type="button" class="factory">Factory</button>
      </div>
      <p class="status">Tweaks apply live. Save writes them into the game for deploys.</p>
    </div>
    </aside>
  `;
  document.body.appendChild(root);

  const status = root.querySelector(".status")!;
  const panel = root.querySelector("#debug-menu") as HTMLElement;
  const launch = root.querySelector("#debug-launch") as HTMLButtonElement;
  const toggle = root.querySelector(".toggle") as HTMLButtonElement;

  const setOpen = (next: boolean): void => {
    open = next;
    root.classList.toggle("open", open);
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  launch.addEventListener("click", () => setOpen(true));
  toggle.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Backquote" || e.repeat) return;
    if (e.target instanceof HTMLInputElement && e.target.type !== "radio") return;
    e.preventDefault();
    setOpen(!open);
  });

  const refresh = (): void => {
    for (const spec of [...MOVEMENT, ...FLIP, ...LANDING]) {
      const input = root.querySelector<HTMLInputElement>(`[data-key="${spec.key}"]`);
      const read = root.querySelector<HTMLElement>(`[data-read="${spec.key}"]`);
      if (!input || !read) continue;
      const value = tuning[spec.key] as number;
      input.value = String(value);
      read.textContent = formatVal(value, spec.step);
    }
    const radio = root.querySelector<HTMLInputElement>(
      `input[name="tuck-scheme"][value="${tuning.tuckScheme}"]`,
    );
    if (radio) radio.checked = true;
    const current = game.debugLevelIndex();
    for (const btn of root.querySelectorAll<HTMLButtonElement>("[data-level]")) {
      btn.setAttribute("aria-pressed", Number(btn.dataset.level) === current ? "true" : "false");
    }
  };

  root.querySelector(".level-picks")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-level]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const index = Number(btn.dataset.level);
    if (!Number.isFinite(index)) return;
    game.debugGotoLevel(index);
    refresh();
    status.textContent = `Jumped to ${LEVELS[index]?.title ?? "level"}.`;
  });

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.name === "tuck-scheme") {
      applyTuning({ tuckScheme: el.value as TuckScheme });
      game.onTuningChanged();
      return;
    }
    const key = el.dataset.key as NumericTuning | undefined;
    if (!key) return;
    applyTuning({ [key]: Number(el.value) });
    const read = root.querySelector<HTMLElement>(`[data-read="${key}"]`);
    if (read) read.textContent = formatVal(tuning[key], Number(el.step) || 0.1);
    game.onTuningChanged();
  });

  root.querySelector(".save")!.addEventListener("click", () => {
    void saveToDisk(status, () => {
      disk = snapshotTuning();
    });
  });
  root.querySelector(".revert")!.addEventListener("click", () => {
    applyTuning(disk);
    refresh();
    game.onTuningChanged();
    status.textContent = "Reverted to last save.";
  });
  root.querySelector(".factory")!.addEventListener("click", () => {
    applyTuning(TUNING_DEFAULTS);
    refresh();
    game.onTuningChanged();
    status.textContent = "Factory defaults. Save to keep them.";
  });

  refresh();
}

function sliderHtml(spec: SliderSpec): string {
  return `<label class="row">
    <span>${spec.label}</span>
    <b data-read="${spec.key}"></b>
    <input type="range" data-key="${spec.key}" min="${spec.min}" max="${spec.max}" step="${spec.step}">
  </label>`;
}

function formatVal(value: number, step: number): string {
  const digits = step >= 1 ? 0 : String(step).split(".")[1]?.length ?? 1;
  return value.toFixed(digits);
}

async function saveToDisk(status: Element, onOk: () => void): Promise<void> {
  status.textContent = "Saving…";
  try {
    const url = new URL("__debug/tuning", window.location.href);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshotTuning()),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    status.textContent = "Saved. These values ship in the build.";
    onOk();
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
  }
}
