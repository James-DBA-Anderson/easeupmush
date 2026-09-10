import { cloneLevel, DEFAULT_LEVEL } from "../level/defaultLevel";
import {
  clearLocalLevel,
  downloadLevel,
  readLocalLevel,
  writeLocalLevel,
} from "../level/storage";
import {
  EDITOR_VIEW_STORAGE_KEY,
  type LevelData,
  type PlaceableId,
  type XZ,
} from "../level/types";
import {
  clearRefBackground,
  readRefBackground,
  writeRefBackground,
} from "./refStorage";
import { PlacePreview } from "./placePreview";
import { PLACEABLE_IDS, PLACEABLE_LABELS } from "./previewMeshes";

type Tool = "pan" | "bg" | "shore" | "paths" | "ring" | "place" | "bins";

type Hit =
  | { kind: "shore" | "ring" | "bins"; index: number }
  | { kind: "path"; path: number; index: number }
  | { kind: "pathAll"; path: number }
  | { kind: "place"; id: PlaceableId };

type EditorView = { x: number; z: number; scale: number };

const MAX_HISTORY = 80;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const status = document.getElementById("status")!;
const pathSelect = document.getElementById("path-select") as HTMLSelectElement;
const undoBtn = document.getElementById("undo") as HTMLButtonElement;
const zoomInput = document.getElementById("zoom") as HTMLInputElement;
const zoomVal = document.getElementById("zoom-val")!;
const refPanel = document.getElementById("ref-panel")!;
const refOpacityInput = document.getElementById("ref-opacity") as HTMLInputElement;
const mapOpacityInput = document.getElementById("map-opacity") as HTMLInputElement;
const refSizeInput = document.getElementById("ref-size") as HTMLInputElement;
const refRotInput = document.getElementById("ref-rot") as HTMLInputElement;
const refOpacityVal = document.getElementById("ref-opacity-val")!;
const mapOpacityVal = document.getElementById("map-opacity-val")!;
const refSizeVal = document.getElementById("ref-size-val")!;
const refRotVal = document.getElementById("ref-rot-val")!;
const workspace = document.getElementById("workspace")!;
const placeCatalog = document.getElementById("place-catalog")!;
const placeYawInput = document.getElementById("place-yaw") as HTMLInputElement;
const placeYawVal = document.getElementById("place-yaw-val")!;
const placePreviewCanvas = document.getElementById(
  "place-preview",
) as HTMLCanvasElement;

let level: LevelData = readLocalLevel() ?? cloneLevel(DEFAULT_LEVEL);
let tool: Tool = "shore";
let activePath = 0;
let selected: Hit | null = null;
const history: LevelData[] = [];

let viewX = 0;
let viewZ = 0;
let viewScale = 1.8;
let viewSaveTimer: number | null = null;

function readEditorView(): EditorView | null {
  try {
    const raw = localStorage.getItem(EDITOR_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<EditorView>;
    if (
      typeof v.x !== "number" ||
      typeof v.z !== "number" ||
      typeof v.scale !== "number" ||
      !Number.isFinite(v.x) ||
      !Number.isFinite(v.z) ||
      !Number.isFinite(v.scale)
    ) {
      return null;
    }
    return {
      x: v.x,
      z: v.z,
      scale: clampViewScale(v.scale),
    };
  } catch {
    return null;
  }
}

const VIEW_SCALE_MIN = 0.25;
const VIEW_SCALE_MAX = 12;
const VIEW_SCALE_LOG_MIN = Math.log(VIEW_SCALE_MIN);
const VIEW_SCALE_LOG_MAX = Math.log(VIEW_SCALE_MAX);

function clampViewScale(s: number): number {
  return Math.min(VIEW_SCALE_MAX, Math.max(VIEW_SCALE_MIN, s));
}

function scaleToZoomSlider(scale: number): number {
  const t =
    (Math.log(clampViewScale(scale)) - VIEW_SCALE_LOG_MIN) /
    (VIEW_SCALE_LOG_MAX - VIEW_SCALE_LOG_MIN);
  return Math.round(t * 1000);
}

function zoomSliderToScale(slider: number): number {
  const t = Math.min(1000, Math.max(0, slider)) / 1000;
  return Math.exp(
    VIEW_SCALE_LOG_MIN + t * (VIEW_SCALE_LOG_MAX - VIEW_SCALE_LOG_MIN),
  );
}

function syncZoomSlider(): void {
  zoomInput.value = String(scaleToZoomSlider(viewScale));
  zoomVal.textContent = `${viewScale.toFixed(2)}×`;
}

function setViewScale(next: number, anchorSx?: number, anchorSy?: number): void {
  const sx = anchorSx ?? canvas.clientWidth / 2;
  const sy = anchorSy ?? canvas.clientHeight / 2;
  const [beforeX, beforeZ] = worldFromScreen(sx, sy);
  viewScale = clampViewScale(next);
  const [afterX, afterZ] = worldFromScreen(sx, sy);
  viewX += beforeX - afterX;
  viewZ += beforeZ - afterZ;
  syncZoomSlider();
}

function persistViewNow(): void {
  localStorage.setItem(
    EDITOR_VIEW_STORAGE_KEY,
    JSON.stringify({ x: viewX, z: viewZ, scale: viewScale }),
  );
}

function persistView(debounceMs = 200): void {
  if (viewSaveTimer != null) window.clearTimeout(viewSaveTimer);
  viewSaveTimer = window.setTimeout(() => {
    viewSaveTimer = null;
    persistViewNow();
  }, debounceMs);
}

const savedView = readEditorView();
if (savedView) {
  viewX = savedView.x;
  viewZ = savedView.z;
  viewScale = savedView.scale;
}

let refImage: HTMLImageElement | null = null;
/** Source blob kept so we can re-persist without re-encoding. */
let refBlob: Blob | null = null;
let refOpacity = 0.45;
let mapOpacity = 0.7;
/** Reference image centre in world XZ, width in metres, rotation in degrees. */
let refX = 20;
let refZ = 0;
let refWidth = 420;
let refRotDeg = 0;
let refSaveTimer: number | null = null;

let dragging: Hit | null = null;
let dragStarted = false;
let panning = false;
let lastMx = 0;
let lastMy = 0;
let movingRef = false;
let yawHistoryPushed = false;

const placePreview = new PlacePreview(placePreviewCanvas);
placePreview.setHandlers({
  onYawDrag: (yawRad) => {
    applyPlaceYaw(yawRad, !yawHistoryPushed);
    yawHistoryPushed = true;
  },
});

function findPlaceable(id: PlaceableId) {
  return level.placeables.find((p) => p.id === id);
}

function syncPlaceCatalog(): void {
  const activeId =
    selected?.kind === "place" ? selected.id : null;
  placeCatalog.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle(
      "active",
      (btn as HTMLElement).dataset.id === activeId,
    );
  });
}

function syncPlaceYawUi(yawRad: number): void {
  const deg = Math.round(((yawRad * 180) / Math.PI + 540) % 360 - 180);
  placeYawInput.value = String(deg);
  placeYawVal.textContent = `${deg}°`;
}

function applyPlaceYaw(yawRad: number, push = true): void {
  if (selected?.kind !== "place") return;
  const pl = findPlaceable(selected.id);
  if (!pl) return;
  if (push) pushHistory();
  pl.yaw = yawRad;
  placePreview.setYaw(yawRad);
  syncPlaceYawUi(yawRad);
  writeLocalLevel(level);
  draw();
}

function selectPlaceable(id: PlaceableId, focus = false): void {
  const pl = findPlaceable(id);
  if (!pl) return;
  selected = { kind: "place", id };
  syncPlaceCatalog();
  syncPlaceYawUi(pl.yaw);
  placePreview.setPlaceable(id, pl.yaw);
  if (focus) {
    viewX = pl.x;
    viewZ = pl.z;
    persistView();
  }
  status.textContent = `${PLACEABLE_LABELS[id]} selected — drag on map to move, yaw slider or Shift-drag preview to turn.`;
  draw();
}

function syncPlacePanel(): void {
  const open = tool === "place";
  workspace.classList.toggle("place-open", open);
  if (open) {
    placePreview.start();
    placePreview.resize();
    if (selected?.kind === "place") {
      const pl = findPlaceable(selected.id);
      if (pl) {
        placePreview.setPlaceable(selected.id, pl.yaw);
        syncPlaceYawUi(pl.yaw);
      }
    } else if (level.placeables[0]) {
      selectPlaceable(level.placeables[0].id);
    }
    syncPlaceCatalog();
  } else {
    placePreview.stop();
  }
}

function buildPlaceCatalog(): void {
  placeCatalog.innerHTML = "";
  for (const id of PLACEABLE_IDS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = id;
    btn.textContent = PLACEABLE_LABELS[id];
    btn.addEventListener("click", () => {
      setTool("place");
      selectPlaceable(id, true);
    });
    placeCatalog.appendChild(btn);
  }
}

function syncRefPanel(): void {
  refPanel.classList.toggle("on", !!refImage);
  refOpacityInput.value = String(Math.round(refOpacity * 100));
  mapOpacityInput.value = String(Math.round(mapOpacity * 100));
  refSizeInput.value = String(Math.round(refWidth));
  refRotInput.value = String(Math.round(refRotDeg));
  refOpacityVal.textContent = `${Math.round(refOpacity * 100)}%`;
  mapOpacityVal.textContent = `${Math.round(mapOpacity * 100)}%`;
  refSizeVal.textContent = `${Math.round(refWidth)}m`;
  refRotVal.textContent = `${Math.round(refRotDeg)}°`;
}

function persistRefNow(): void {
  if (!refBlob || !refImage) return;
  void writeRefBackground({
    image: refBlob,
    x: refX,
    z: refZ,
    width: refWidth,
    rotDeg: refRotDeg,
    imageOpacity: refOpacity,
    mapOpacity,
  });
}

function persistRef(debounceMs = 200): void {
  if (refSaveTimer != null) window.clearTimeout(refSaveTimer);
  refSaveTimer = window.setTimeout(() => {
    refSaveTimer = null;
    persistRefNow();
  }, debounceMs);
}

function clearRefImage(): void {
  refImage = null;
  refBlob = null;
  refRotDeg = 0;
  if (refSaveTimer != null) {
    window.clearTimeout(refSaveTimer);
    refSaveTimer = null;
  }
  void clearRefBackground();
  syncRefPanel();
  status.textContent = "Background image removed.";
  draw();
}

function syncUndoBtn(): void {
  undoBtn.disabled = history.length === 0;
}

function pushHistory(): void {
  history.push(cloneLevel(level));
  if (history.length > MAX_HISTORY) history.shift();
  syncUndoBtn();
}

function undo(): void {
  const prev = history.pop();
  if (!prev) return;
  level = prev;
  selected = null;
  dragging = null;
  if (activePath >= level.pathPolylines.length) {
    activePath = Math.max(0, level.pathPolylines.length - 1);
  }
  fillPathSelect();
  writeLocalLevel(level);
  syncUndoBtn();
  status.textContent = "Undid last edit.";
  draw();
}

function dirty(): void {
  writeLocalLevel(level);
  status.textContent = "Saved to browser — reload the game to play this layout.";
  draw();
}

function worldFromScreen(sx: number, sy: number): XZ {
  const x = (sx - canvas.clientWidth / 2) / viewScale + viewX;
  const z = viewZ - (sy - canvas.clientHeight / 2) / viewScale;
  return [x, z];
}

function screenFromWorld(x: number, z: number): [number, number] {
  return [
    canvas.clientWidth / 2 + (x - viewX) * viewScale,
    canvas.clientHeight / 2 - (z - viewZ) * viewScale,
  ];
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (tool === "place") placePreview.resize();
  draw();
}

function fillPathSelect(): void {
  pathSelect.innerHTML = "";
  level.pathPolylines.forEach((_, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Path ${i + 1} (${level.pathPolylines[i]!.length} pts)`;
    pathSelect.appendChild(opt);
  });
  if (activePath >= level.pathPolylines.length) activePath = 0;
  pathSelect.value = String(activePath);
}

function hitTest(sx: number, sy: number): Hit | null {
  const [wx, wz] = worldFromScreen(sx, sy);
  const thresh = 8 / viewScale;

  const near = (x: number, z: number) => Math.hypot(x - wx, z - wz) < thresh;

  if (tool === "shore" || tool === "pan") {
    for (let i = 0; i < level.shoreOutline.length; i++) {
      const p = level.shoreOutline[i]!;
      if (near(p[0], p[1])) return { kind: "shore", index: i };
    }
  }
  if (tool === "ring" || tool === "pan") {
    for (let i = 0; i < level.parkRing.length; i++) {
      const p = level.parkRing[i]!;
      if (near(p[0], p[1])) return { kind: "ring", index: i };
    }
  }
  if (tool === "paths" || tool === "pan") {
    for (let p = 0; p < level.pathPolylines.length; p++) {
      const line = level.pathPolylines[p]!;
      for (let i = 0; i < line.length; i++) {
        const pt = line[i]!;
        if (near(pt[0], pt[1])) return { kind: "path", path: p, index: i };
      }
    }
  }
  if (tool === "bins" || tool === "pan") {
    for (let i = 0; i < level.bins.length; i++) {
      const p = level.bins[i]!;
      if (near(p[0], p[1])) return { kind: "bins", index: i };
    }
  }
  if (tool === "place" || tool === "pan") {
    for (const pl of level.placeables) {
      if (near(pl.x, pl.z)) return { kind: "place", id: pl.id };
    }
  }
  return null;
}

function drawPoly(
  points: XZ[],
  stroke: string,
  closed: boolean,
  width = 1.5,
): void {
  if (points.length < 1) return;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [sx, sy] = screenFromWorld(p[0], p[1]);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  if (closed && points.length > 2) ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawHandles(
  points: XZ[],
  colour: string,
  kind: "shore" | "ring" | "bins",
): void {
  points.forEach((p, i) => {
    const [sx, sy] = screenFromWorld(p[0], p[1]);
    const sel =
      selected &&
      selected.kind === kind &&
      "index" in selected &&
      selected.index === i;
    ctx.beginPath();
    ctx.arc(sx, sy, sel ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#fff" : colour;
    ctx.fill();
    ctx.strokeStyle = "#000a";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function draw(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#1c2a20";
  ctx.fillRect(0, 0, w, h);

  if (refImage) {
    const aspect = refImage.naturalHeight / Math.max(1, refImage.naturalWidth);
    const worldH = refWidth * aspect;
    const [cx, cy] = screenFromWorld(refX, refZ);
    const rw = refWidth * viewScale;
    const rh = worldH * viewScale;
    ctx.save();
    ctx.translate(cx, cy);
    // Canvas Y is down; world +Z is up — negate so map rotation feels natural.
    ctx.rotate((-refRotDeg * Math.PI) / 180);
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(refImage, -rw / 2, -rh / 2, rw, rh);
    ctx.globalAlpha = 1;
    if (tool === "bg") {
      ctx.strokeStyle = "rgba(255,210,58,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffd23a";
      for (const [hx, hy] of [
        [-rw / 2, -rh / 2],
        [rw / 2, -rh / 2],
        [rw / 2, rh / 2],
        [-rw / 2, rh / 2],
      ] as const) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
      }
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = mapOpacity;

  // Park fill
  if (level.parkRing.length > 2) {
    ctx.beginPath();
    level.parkRing.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "#2a3d30";
    ctx.fill();
  }

  drawPoly(level.parkRing, "#c9a0ff", true, 2);

  for (let i = 0; i < level.pathPolylines.length; i++) {
    const line = level.pathPolylines[i]!;
    const active = tool === "paths" && i === activePath;
    drawPoly(line, active ? "#ffe7a0" : "#c4bda8", false, active ? 3 : 2);
  }

  drawPoly(level.shoreOutline, "#3aa0b8", true, 2.5);
  // Soft lake fill
  if (level.shoreOutline.length > 2) {
    ctx.beginPath();
    level.shoreOutline.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(47,109,124,0.55)";
    ctx.fill();
  }

  for (const pl of level.placeables) {
    const [sx, sy] = screenFromWorld(pl.x, pl.z);
    const sel = selected?.kind === "place" && selected.id === pl.id;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-(pl.yaw + Math.PI)); // tip toward −Z of building group ≈ water
    ctx.fillStyle = sel ? "#fff" : "#ff8a4c";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ffe8d6";
    ctx.font = "11px sans-serif";
    ctx.fillText(PLACEABLE_LABELS[pl.id], sx + 8, sy - 8);
  }

  for (const b of level.bins) {
    const [sx, sy] = screenFromWorld(b[0], b[1]);
    ctx.fillStyle = "#7dcea0";
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
  }

  if (tool === "shore") drawHandles(level.shoreOutline, "#3aa0b8", "shore");
  if (tool === "ring") drawHandles(level.parkRing, "#c9a0ff", "ring");
  if (tool === "paths") {
    const line = level.pathPolylines[activePath];
    if (line) {
      line.forEach((pt, i) => {
        const [sx, sy] = screenFromWorld(pt[0], pt[1]);
        const sel =
          selected?.kind === "path" &&
          selected.path === activePath &&
          selected.index === i;
        ctx.beginPath();
        ctx.arc(sx, sy, sel ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = sel ? "#fff" : "#ffe7a0";
        ctx.fill();
        ctx.strokeStyle = "#000a";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }
  if (tool === "bins") drawHandles(level.bins, "#7dcea0", "bins");

  ctx.restore();
}

function insertOnEdge(
  points: XZ[],
  wx: number,
  wz: number,
  closed: boolean,
  maxDist = 14 / viewScale,
): number {
  let best = -1;
  let bestDist = maxDist;
  const n = points.length;
  const edges = closed ? n : Math.max(0, n - 1);
  for (let i = 0; i < edges; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz || 1;
    let t = ((wx - a[0]) * abx + (wz - a[1]) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const d = Math.hypot(wx - px, wz - pz);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return -1;
  const a = points[best]!;
  const b = points[(best + 1) % n]!;
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz || 1;
  let t = ((wx - a[0]) * abx + (wz - a[1]) * abz) / len2;
  t = Math.max(0.05, Math.min(0.95, t));
  const px = a[0] + abx * t;
  const pz = a[1] + abz * t;
  points.splice(best + 1, 0, [px, pz]);
  return best + 1;
}

/** Distance from point to open polyline; returns path index or -1. */
function nearestPathEdge(
  wx: number,
  wz: number,
  maxDist = 14 / viewScale,
): { path: number; dist: number } | null {
  let bestPath = -1;
  let bestDist = maxDist;
  for (let p = 0; p < level.pathPolylines.length; p++) {
    const line = level.pathPolylines[p]!;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const len2 = abx * abx + abz * abz || 1;
      let t = ((wx - a[0]) * abx + (wz - a[1]) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(wx - (a[0] + abx * t), wz - (a[1] + abz * t));
      if (d < bestDist) {
        bestDist = d;
        bestPath = p;
      }
    }
  }
  return bestPath < 0 ? null : { path: bestPath, dist: bestDist };
}

function onPointerDown(ev: PointerEvent): void {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  lastMx = sx;
  lastMy = sy;
  dragStarted = false;

  if (ev.button === 1 || tool === "pan" || ev.altKey) {
    panning = true;
    canvas.setPointerCapture(ev.pointerId);
    return;
  }

  if (tool === "bg" && refImage) {
    movingRef = true;
    canvas.setPointerCapture(ev.pointerId);
    return;
  }

  const hit = hitTest(sx, sy);
  if (hit) {
    selected = hit;
    // Shift+drag a path node moves the whole path.
    if (hit.kind === "path" && ev.shiftKey) {
      dragging = { kind: "pathAll", path: hit.path };
      activePath = hit.path;
    } else {
      dragging = hit;
      if (hit.kind === "path") activePath = hit.path;
    }
    if (hit.kind === "place") {
      setTool("place");
      selectPlaceable(hit.id);
    }
    fillPathSelect();
    canvas.setPointerCapture(ev.pointerId);
    draw();
    return;
  }

  const [wx, wz] = worldFromScreen(sx, sy);

  if (tool === "shore") {
    pushHistory();
    const idx = insertOnEdge(level.shoreOutline, wx, wz, true);
    if (idx >= 0) {
      selected = { kind: "shore", index: idx };
      dirty();
    } else {
      history.pop();
      syncUndoBtn();
    }
  } else if (tool === "ring") {
    pushHistory();
    const idx = insertOnEdge(level.parkRing, wx, wz, true);
    if (idx >= 0) {
      selected = { kind: "ring", index: idx };
      dirty();
    } else {
      history.pop();
      syncUndoBtn();
    }
  } else if (tool === "paths") {
    // Prefer inserting on an existing path edge; Shift+drag on edge moves whole path.
    const near = nearestPathEdge(wx, wz);
    if (near && ev.shiftKey) {
      selected = { kind: "pathAll", path: near.path };
      dragging = selected;
      activePath = near.path;
      fillPathSelect();
      canvas.setPointerCapture(ev.pointerId);
      draw();
      return;
    }
    if (near) {
      pushHistory();
      activePath = near.path;
      const line = level.pathPolylines[activePath]!;
      const idx = insertOnEdge(line, wx, wz, false);
      if (idx >= 0) {
        selected = { kind: "path", path: activePath, index: idx };
        fillPathSelect();
        dirty();
      } else {
        history.pop();
        syncUndoBtn();
      }
      draw();
      return;
    }
    // Empty click: extend active path (or start one).
    pushHistory();
    if (!level.pathPolylines[activePath]) {
      level.pathPolylines.push([[wx, wz]]);
      activePath = level.pathPolylines.length - 1;
      selected = { kind: "path", path: activePath, index: 0 };
    } else {
      const line = level.pathPolylines[activePath]!;
      line.push([wx, wz]);
      selected = {
        kind: "path",
        path: activePath,
        index: line.length - 1,
      };
    }
    fillPathSelect();
    dirty();
  } else if (tool === "bins") {
    pushHistory();
    level.bins.push([wx, wz]);
    selected = { kind: "bins", index: level.bins.length - 1 };
    dirty();
  }

  draw();
}

function onPointerMove(ev: PointerEvent): void {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const dx = sx - lastMx;
  const dy = sy - lastMy;

  if (panning) {
    viewX -= dx / viewScale;
    viewZ += dy / viewScale;
    lastMx = sx;
    lastMy = sy;
    draw();
    return;
  }

  if (movingRef) {
    refX += dx / viewScale;
    refZ -= dy / viewScale;
    lastMx = sx;
    lastMy = sy;
    draw();
    return;
  }

  if (!dragging) return;

  if (!dragStarted) {
    pushHistory();
    dragStarted = true;
  }

  const [wx, wz] = worldFromScreen(sx, sy);
  if (dragging.kind === "shore") {
    level.shoreOutline[dragging.index] = [wx, wz];
  } else if (dragging.kind === "ring") {
    level.parkRing[dragging.index] = [wx, wz];
  } else if (dragging.kind === "path") {
    level.pathPolylines[dragging.path]![dragging.index] = [wx, wz];
  } else if (dragging.kind === "pathAll") {
    const line = level.pathPolylines[dragging.path];
    if (line) {
      const dWorldX = dx / viewScale;
      const dWorldZ = -dy / viewScale;
      for (let i = 0; i < line.length; i++) {
        const p = line[i]!;
        line[i] = [p[0] + dWorldX, p[1] + dWorldZ];
      }
    }
  } else if (dragging.kind === "bins") {
    level.bins[dragging.index] = [wx, wz];
  } else if (dragging.kind === "place") {
    const id = dragging.id;
    const pl = level.placeables.find((p) => p.id === id);
    if (pl) {
      pl.x = wx;
      pl.z = wz;
    }
  }
  lastMx = sx;
  lastMy = sy;
  draw();
}

function onPointerUp(): void {
  if (dragging && dragStarted) dirty();
  if (movingRef) persistRef(0);
  if (panning) persistView(0);
  yawHistoryPushed = false;
  dragging = null;
  dragStarted = false;
  panning = false;
  movingRef = false;
}

function onDblClick(ev: MouseEvent): void {
  if (tool !== "paths") return;
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const [wx, wz] = worldFromScreen(sx, sy);
  // Double-click on a path edge inserts a node; otherwise starts a new path.
  const near = nearestPathEdge(wx, wz);
  if (near) {
    pushHistory();
    activePath = near.path;
    const line = level.pathPolylines[activePath]!;
    const idx = insertOnEdge(line, wx, wz, false);
    if (idx >= 0) {
      selected = { kind: "path", path: activePath, index: idx };
      fillPathSelect();
      dirty();
    } else {
      history.pop();
      syncUndoBtn();
    }
    return;
  }
  pushHistory();
  level.pathPolylines.push([[wx, wz]]);
  activePath = level.pathPolylines.length - 1;
  selected = { kind: "path", path: activePath, index: 0 };
  fillPathSelect();
  dirty();
}

function onWheel(ev: WheelEvent): void {
  ev.preventDefault();
  // Ctrl/Cmd+scroll still zooms; plain scroll pans (trackpad two-finger too).
  if (ev.ctrlKey || ev.metaKey) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const factor = ev.deltaY > 0 ? 0.9 : 1.1;
    setViewScale(viewScale * factor, sx, sy);
    persistView();
    draw();
    return;
  }
  let dx = ev.deltaX;
  let dy = ev.deltaY;
  if (ev.shiftKey && dx === 0) {
    // Some mice send only deltaY with Shift for horizontal scroll.
    dx = dy;
    dy = 0;
  }
  if (ev.deltaMode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (ev.deltaMode === 2) {
    dx *= canvas.clientWidth;
    dy *= canvas.clientHeight;
  }
  viewX += dx / viewScale;
  viewZ -= dy / viewScale;
  persistView();
  draw();
}

function nudgeSelected(dx: number, dz: number): boolean {
  if (!selected) return false;
  if (selected.kind === "shore") {
    const p = level.shoreOutline[selected.index];
    if (!p) return false;
    level.shoreOutline[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "ring") {
    const p = level.parkRing[selected.index];
    if (!p) return false;
    level.parkRing[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "bins") {
    const p = level.bins[selected.index];
    if (!p) return false;
    level.bins[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "place") {
    const id = selected.id;
    const pl = level.placeables.find((p) => p.id === id);
    if (!pl) return false;
    pl.x += dx;
    pl.z += dz;
    return true;
  }
  if (selected.kind === "path") {
    const line = level.pathPolylines[selected.path];
    const p = line?.[selected.index];
    if (!p || !line) return false;
    line[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "pathAll") {
    const line = level.pathPolylines[selected.path];
    if (!line) return false;
    for (let i = 0; i < line.length; i++) {
      const p = line[i]!;
      line[i] = [p[0] + dx, p[1] + dz];
    }
    return true;
  }
  return false;
}

function onKeyDown(ev: KeyboardEvent): void {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
    ev.preventDefault();
    undo();
    return;
  }

  const arrow =
    ev.key === "ArrowLeft" ||
    ev.key === "ArrowRight" ||
    ev.key === "ArrowUp" ||
    ev.key === "ArrowDown";
  if (arrow && selected) {
    // Avoid scrolling the page; nudge selection in world metres.
    ev.preventDefault();
    const step = ev.shiftKey ? 1 : 0.25;
    let dx = 0;
    let dz = 0;
    if (ev.key === "ArrowLeft") dx = -step;
    else if (ev.key === "ArrowRight") dx = step;
    else if (ev.key === "ArrowUp") dz = step;
    else if (ev.key === "ArrowDown") dz = -step;
    if (!ev.repeat) pushHistory();
    if (nudgeSelected(dx, dz)) {
      writeLocalLevel(level);
      status.textContent = ev.shiftKey
        ? "Nudged 1m (Shift = coarse). Arrow keys tweak selection."
        : "Nudged 0.25m (Shift = 1m). Arrow keys tweak selection.";
      draw();
    } else if (!ev.repeat) {
      history.pop();
      syncUndoBtn();
    }
    return;
  }

  if (ev.key !== "Backspace" && ev.key !== "Delete") return;
  if (!selected) return;
  pushHistory();
  if (selected.kind === "shore" && level.shoreOutline.length > 3) {
    level.shoreOutline.splice(selected.index, 1);
  } else if (selected.kind === "ring" && level.parkRing.length > 3) {
    level.parkRing.splice(selected.index, 1);
  } else if (selected.kind === "path" || selected.kind === "pathAll") {
    const pathIdx = selected.path;
    const line = level.pathPolylines[pathIdx];
    if (!line) {
      history.pop();
      syncUndoBtn();
      return;
    }
    if (selected.kind === "pathAll" || line.length <= 2) {
      level.pathPolylines.splice(pathIdx, 1);
      activePath = Math.max(0, pathIdx - 1);
    } else {
      line.splice(selected.index, 1);
    }
    fillPathSelect();
  } else if (selected.kind === "bins") {
    level.bins.splice(selected.index, 1);
  } else {
    history.pop();
    syncUndoBtn();
    return;
  }
  selected = null;
  dirty();
}

function setTool(next: Tool): void {
  tool = next;
  document.querySelectorAll("#tools button").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.tool === next);
  });
  syncPlacePanel();
  status.textContent =
    next === "bg"
      ? "Background: drag to move the image. Scroll pans; Ctrl/Cmd+scroll or the Zoom slider zooms."
      : next === "shore"
        ? "Shore: drag points, click edge to insert, arrows to nudge, Delete to remove."
        : next === "paths"
          ? "Paths: click edge to add a node · drag node · Shift-drag whole path · arrows nudge · path dropdown selects whole path."
          : next === "ring"
            ? "Park ring: drag points, arrows to nudge."
            : next === "place"
              ? "Buildings: pick from the left list, drag on map, yaw in the preview panel."
              : next === "bins"
                ? "Bins: click to place, drag or arrows to move."
                : "Pan: drag or scroll to move the view. Zoom slider or Ctrl/Cmd+scroll to zoom.";
  draw();
}

document.querySelectorAll("#tools button").forEach((btn) => {
  btn.addEventListener("click", () => {
    setTool((btn as HTMLElement).dataset.tool as Tool);
  });
});

pathSelect.addEventListener("change", () => {
  activePath = Number(pathSelect.value) || 0;
  if (level.pathPolylines[activePath]) {
    selected = { kind: "pathAll", path: activePath };
    status.textContent =
      "Path selected — arrow keys move the whole path (Shift = 1m, else 0.25m).";
  }
  draw();
});

document.getElementById("add-path")!.addEventListener("click", () => {
  const [x, z] = [viewX, viewZ];
  pushHistory();
  level.pathPolylines.push([
    [x - 10, z],
    [x + 10, z],
  ]);
  activePath = level.pathPolylines.length - 1;
  fillPathSelect();
  dirty();
});

document.getElementById("del-path")!.addEventListener("click", () => {
  if (level.pathPolylines.length === 0) return;
  pushHistory();
  level.pathPolylines.splice(activePath, 1);
  activePath = Math.max(0, activePath - 1);
  fillPathSelect();
  dirty();
});

document.getElementById("undo")!.addEventListener("click", () => {
  undo();
});

document.getElementById("auto-bins")!.addEventListener("click", () => {
  pushHistory();
  level.bins = [];
  status.textContent =
    "Bins cleared — game will auto-place them on the path lip.";
  writeLocalLevel(level);
  draw();
});

document.getElementById("save")!.addEventListener("click", () => {
  writeLocalLevel(level);
  persistRefNow();
  persistViewNow();
  status.textContent =
    "Saved. Open the game (same browser) — it loads this layout first.";
});

document.getElementById("download")!.addEventListener("click", () => {
  downloadLevel(level);
  status.textContent =
    "Downloaded. Drop into public/levels/canoe-lake.json to ship with the build.";
});

document.getElementById("reset")!.addEventListener("click", () => {
  if (!confirm("Reset to the baked default layout?")) return;
  pushHistory();
  clearLocalLevel();
  level = cloneLevel(DEFAULT_LEVEL);
  activePath = 0;
  selected = null;
  fillPathSelect();
  dirty();
});

document.getElementById("import-file")!.addEventListener("change", async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (raw?.version !== 1) throw new Error("bad version");
    pushHistory();
    level = raw as LevelData;
    writeLocalLevel(level);
    activePath = 0;
    selected = null;
    fillPathSelect();
    status.textContent = "Imported and saved.";
    draw();
  } catch {
    status.textContent = "Import failed — need a canoe-lake level JSON.";
  }
});

function applyRefImage(
  img: HTMLImageElement,
  blob: Blob,
  opts?: {
    x?: number;
    z?: number;
    width?: number;
    rotDeg?: number;
    imageOpacity?: number;
    mapOpacity?: number;
    fromStorage?: boolean;
  },
): void {
  refImage = img;
  refBlob = blob;
  if (opts?.fromStorage) {
    if (opts.x != null) refX = opts.x;
    if (opts.z != null) refZ = opts.z;
    if (opts.width != null) refWidth = opts.width;
    if (opts.rotDeg != null) refRotDeg = opts.rotDeg;
    if (opts.imageOpacity != null) refOpacity = opts.imageOpacity;
    if (opts.mapOpacity != null) mapOpacity = opts.mapOpacity;
  } else {
    refRotDeg = 0;
    // Centre on current view; size so it roughly fills the park.
    refX = viewX;
    refZ = viewZ;
    let span = 300;
    if (level.parkRing.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const p of level.parkRing) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
      }
      span = Math.max(80, (maxX - minX) * 1.1);
    }
    refWidth = span;
  }
  syncRefPanel();
  if (!opts?.fromStorage) {
    setTool("bg");
    persistRefNow();
    status.textContent =
      "Image added and saved. Drag to position; Size/Rotate sliders to fit. Scroll pans; Zoom slider zooms.";
  } else {
    status.textContent = "Restored saved background image.";
  }
  draw();
}

function loadRefFromBlob(
  blob: Blob,
  opts?: Parameters<typeof applyRefImage>[2],
): void {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    applyRefImage(img, blob, opts);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    status.textContent = "Could not load that image.";
  };
  img.src = url;
}

async function pasteRefFromClipboard(): Promise<void> {
  try {
    if (!navigator.clipboard?.read) {
      status.textContent = "Clipboard read not supported — use Ctrl/Cmd+V instead.";
      return;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      loadRefFromBlob(blob);
      return;
    }
    status.textContent = "No image on the clipboard — copy a screenshot first.";
  } catch {
    status.textContent =
      "Clipboard blocked — click the page, then Paste image or Ctrl/Cmd+V.";
  }
}

document.getElementById("ref-file")!.addEventListener("change", (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  loadRefFromBlob(file);
  (ev.target as HTMLInputElement).value = "";
});

document.getElementById("paste-ref")!.addEventListener("click", () => {
  void pasteRefFromClipboard();
});

window.addEventListener("paste", (ev) => {
  const items = ev.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    ev.preventDefault();
    loadRefFromBlob(file);
    return;
  }
});

refOpacityInput.addEventListener("input", () => {
  refOpacity = Number(refOpacityInput.value) / 100;
  syncRefPanel();
  persistRef();
  draw();
});

mapOpacityInput.addEventListener("input", () => {
  mapOpacity = Number(mapOpacityInput.value) / 100;
  syncRefPanel();
  persistRef();
  draw();
});

refSizeInput.addEventListener("input", () => {
  refWidth = Number(refSizeInput.value);
  syncRefPanel();
  persistRef();
  draw();
});

refRotInput.addEventListener("input", () => {
  refRotDeg = Number(refRotInput.value);
  syncRefPanel();
  persistRef();
  draw();
});

document.getElementById("ref-rot-reset")!.addEventListener("click", () => {
  refRotDeg = 0;
  syncRefPanel();
  persistRef(0);
  draw();
});

document.getElementById("clear-ref")!.addEventListener("click", () => {
  clearRefImage();
});

document.getElementById("fit-ref")!.addEventListener("click", () => {
  if (!refImage) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of level.parkRing) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  refX = (minX + maxX) / 2;
  refZ = (minZ + maxZ) / 2;
  refWidth = (maxX - minX) * 1.15;
  syncRefPanel();
  persistRef(0);
  draw();
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("dblclick", onDblClick);
canvas.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", resize);

fillPathSelect();
buildPlaceCatalog();
syncRefPanel();
syncUndoBtn();
syncZoomSlider();
resize();
setTool("shore");

placeYawInput.addEventListener("input", () => {
  const deg = Number(placeYawInput.value);
  const yaw = (deg * Math.PI) / 180;
  applyPlaceYaw(yaw, !yawHistoryPushed);
  yawHistoryPushed = true;
});
placeYawInput.addEventListener("change", () => {
  yawHistoryPushed = false;
});
placePreviewCanvas.addEventListener("pointerup", () => {
  yawHistoryPushed = false;
});

zoomInput.addEventListener("input", () => {
  setViewScale(zoomSliderToScale(Number(zoomInput.value)));
  persistView();
  draw();
});

void readRefBackground().then((saved) => {
  if (!saved) return;
  loadRefFromBlob(saved.image, {
    fromStorage: true,
    x: saved.x,
    z: saved.z,
    width: saved.width,
    rotDeg: saved.rotDeg,
    imageOpacity: saved.imageOpacity,
    mapOpacity: saved.mapOpacity,
  });
});