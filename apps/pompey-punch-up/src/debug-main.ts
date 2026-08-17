import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/constants";
import { DebugArenaScene, type DebugSpawnKind } from "./game/scenes/DebugArenaScene";

const parent = document.getElementById("game-root");
if (!parent) throw new Error("Missing #game-root");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#2b2218",
  parent,
  pixelArt: false,
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [DebugArenaScene],
});

type DebugWindow = Window & {
  __debugArena?: DebugArenaScene;
  __debugPendingSpawn?: DebugSpawnKind | null;
};

function arena(): DebugArenaScene | undefined {
  return (window as DebugWindow).__debugArena;
}

function setNote(msg: string): void {
  const note = document.getElementById("refresh-note");
  if (note) note.textContent = msg;
}

function syncBrainButtons(): void {
  const mode = arena()?.getEnemyBrain() ?? "stand";
  document.querySelectorAll<HTMLElement>("[data-brain]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.brain === mode);
  });
}

function syncPlaceButtons(): void {
  const kind = arena()?.getPlaceKind() ?? null;
  document.querySelectorAll<HTMLElement>("[data-spawn]").forEach((btn) => {
    const k = btn.dataset.spawn;
    if (k === "clear" || k === "reset_player" || k === "cash" || k === "mount_board" ||
        k === "buzz_self" || k === "drone_film" || k === "drone_combat" ||
        k === "drone_flyby" || k === "drone_clear") {
      btn.classList.remove("active");
      return;
    }
    btn.classList.toggle("active", !!kind && k === kind);
  });
}

function runSpawn(kind: DebugSpawnKind): void {
  const scene = arena();
  if (!scene || !scene.isPanelReady()) {
    // Texture gen can take a beat — queue until create() finishes
    (window as DebugWindow).__debugPendingSpawn = kind;
    setNote("Arena loading… will place when ready.");
    return;
  }
  (window as DebugWindow).__debugPendingSpawn = null;
  scene.spawn(kind);
  syncPlaceButtons();
}

function flushPendingSpawn(): void {
  const pending = (window as DebugWindow).__debugPendingSpawn;
  const scene = arena();
  if (!pending || !scene?.isPanelReady()) return;
  (window as DebugWindow).__debugPendingSpawn = null;
  runSpawn(pending);
  setNote("No auto-reload — hit Refresh after you save.");
}

function wirePanel(): void {
  const panel = document.querySelector(".panel");
  if (!panel) return;

  // Event delegation — one listener, always hits the live arena bridge
  panel.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;

    const brainBtn = t.closest<HTMLElement>("[data-brain]");
    if (brainBtn) {
      const mode = brainBtn.dataset.brain as "stand" | "normal" | undefined;
      if (mode !== "stand" && mode !== "normal") return;
      const scene = arena();
      if (!scene) {
        setNote("Arena still loading…");
        return;
      }
      scene.setEnemyBrain(mode);
      syncBrainButtons();
      return;
    }

    const spawnBtn = t.closest<HTMLElement>("[data-spawn]");
    if (spawnBtn) {
      const kind = spawnBtn.dataset.spawn as DebugSpawnKind | undefined;
      if (!kind) return;
      runSpawn(kind);
      return;
    }

    if (t.closest("#btn-refresh")) {
      void restartServer();
    }
  });
}

async function restartServer(): Promise<void> {
  const btn = document.getElementById("btn-refresh");
  const note = document.getElementById("refresh-note");
  if (btn) {
    btn.setAttribute("disabled", "true");
    btn.textContent = "Restarting…";
  }
  if (note) note.textContent = "Bouncing Vite — page reloads when it's back.";

  try {
    await fetch("/__debug/restart", { method: "POST" });
  } catch {
    // Server may drop the connection mid-restart — expected
  }

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`/debug?_=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        location.reload();
        return;
      }
    } catch {
      // still down
    }
  }

  if (btn) {
    btn.removeAttribute("disabled");
    btn.textContent = "Refresh (restart server)";
  }
  location.reload();
}

wirePanel();
window.addEventListener("debug-arena-ready", () => {
  setNote("No auto-reload — hit Refresh after you save.");
  syncBrainButtons();
  syncPlaceButtons();
  flushPendingSpawn();
});
window.addEventListener("debug-arena-place", () => syncPlaceButtons());

void game;
