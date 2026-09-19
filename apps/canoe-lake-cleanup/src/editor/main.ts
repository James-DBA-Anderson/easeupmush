import { cloneLevel, DEFAULT_LEVEL } from "../level/defaultLevel";
import {
  clearLocalLevel,
  downloadLevel,
  loadShippedLevel,
  readLocalLevel,
  shipLevel,
  writeLocalLevel,
} from "../level/storage";
import {
  EDITOR_VIEW_STORAGE_KEY,
  TREE_KINDS,
  TREE_LABELS,
  isMultiPlaceable,
  type LevelData,
  type ElevEdgeStyle,
  type FairyLightColor,
  type FenceStyle,
  type PlaceableId,
  type TreeKind,
  type XZ,
} from "../level/types";
import {
  createPlaceholderMission,
  formatMissionClock,
  isPlaceholderMission,
  missionClockChoices,
  missionClockFromSelectValue,
  missionClockSelectValue,
  missionLabel,
  normalizeMissionSpots,
} from "../level/missions";
import {
  clearRefBackground,
  readRefBackground,
  writeRefBackground,
} from "./refStorage";
import { PlacePreview } from "./placePreview";
import { PLACEABLE_IDS, PLACEABLE_LABELS } from "./previewMeshes";
import { WalkMode } from "./walkMode";
import { PATH_STRIP_WIDTH } from "../game/world/lake";
import { HOUSE_DEPTH, ROAD_WIDTH } from "../game/world/buildings";

type Tool =
  | "pan"
  | "bg"
  | "shore"
  | "paths"
  | "roads"
  | "terraces"
  | "lights"
  | "ring"
  | "playArea"
  | "carPark"
  | "beach"
  | "elev"
  | "place"
  | "bins"
  | "trees"
  | "missions";

type Hit =
  | {
      kind:
        | "shore"
        | "ring"
        | "bins"
        | "trees"
        | "playArea"
        | "carPark"
        | "beach"
        | "missions";
      index: number;
    }
  | { kind: "elev"; zone: number; index: number }
  | { kind: "path"; path: number; index: number }
  | { kind: "pathAll"; path: number }
  | { kind: "place"; index: number };

type EditorView = { x: number; z: number; scale: number };

const MAX_HISTORY = 80;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const status = document.getElementById("status")!;
const pathSelect = document.getElementById("path-select") as HTMLSelectElement;
const treeKindSelect = document.getElementById("tree-kind") as HTMLSelectElement;
const fenceStyleSelect = document.getElementById(
  "fence-style",
) as HTMLSelectElement;
const foliageYawGroup = document.getElementById("foliage-yaw-group");
const foliageYawInput = document.getElementById("foliage-yaw") as HTMLInputElement | null;
const foliageYawVal = document.getElementById("foliage-yaw-val");
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
const polyGroupLabel = document.getElementById("poly-group-label");
const polyHint = document.getElementById("poly-hint");
const fairyColorGroup = document.getElementById("fairy-color-group");
const fairyColorSelect = document.getElementById(
  "fairy-color",
) as HTMLSelectElement;
const elevSelect = document.getElementById("elev-select") as HTMLSelectElement;
const elevHeightInput = document.getElementById(
  "elev-height",
) as HTMLInputElement;
const elevHeightVal = document.getElementById("elev-height-val")!;
const elevEdgeSelect = document.getElementById(
  "elev-edge",
) as HTMLSelectElement;
const missionSelect = document.getElementById(
  "mission-select",
) as HTMLSelectElement;
const missionNameInput = document.getElementById(
  "mission-name",
) as HTMLInputElement;
const missionStartSelect = document.getElementById(
  "mission-start",
) as HTMLSelectElement;
const missionEndSelect = document.getElementById(
  "mission-end",
) as HTMLSelectElement;
const addMissionBtn = document.getElementById(
  "add-mission",
) as HTMLButtonElement;
const delMissionBtn = document.getElementById(
  "del-mission",
) as HTMLButtonElement;
const ribbonTabs = document.getElementById("ribbon-tabs")!;
const ribbonPanes = Array.from(
  document.querySelectorAll<HTMLElement>(".ribbon-pane"),
);

let level: LevelData = readLocalLevel() ?? cloneLevel(DEFAULT_LEVEL);
if (!Array.isArray(level.playParkOutline)) level.playParkOutline = [];
if (!Array.isArray(level.carParkOutline)) level.carParkOutline = [];
if (!Array.isArray(level.beachOutline)) level.beachOutline = [];
if (!Array.isArray(level.elevationZones)) level.elevationZones = [];
if (!Array.isArray(level.roadPolylines)) {
  level.roadPolylines = cloneLevel(DEFAULT_LEVEL).roadPolylines;
}
if (!Array.isArray(level.terraceRuns)) {
  level.terraceRuns = cloneLevel(DEFAULT_LEVEL).terraceRuns;
}
if (!Array.isArray(level.fairyLightRuns)) level.fairyLightRuns = [];
level.missionSpots = normalizeMissionSpots(level.missionSpots);
if (!level.fenceStyle) level.fenceStyle = "wire";
fenceStyleSelect.value = level.fenceStyle;

// No local save yet — prefer shipped public/levels JSON over the baked TS copy.
if (!readLocalLevel()) {
  void loadShippedLevel().then((shipped) => {
    if (readLocalLevel()) return;
    level = shipped;
    if (!Array.isArray(level.playParkOutline)) level.playParkOutline = [];
    if (!Array.isArray(level.carParkOutline)) level.carParkOutline = [];
    if (!Array.isArray(level.beachOutline)) level.beachOutline = [];
    if (!Array.isArray(level.elevationZones)) level.elevationZones = [];
    if (!Array.isArray(level.roadPolylines)) {
      level.roadPolylines = cloneLevel(DEFAULT_LEVEL).roadPolylines;
    }
    if (!Array.isArray(level.terraceRuns)) {
      level.terraceRuns = cloneLevel(DEFAULT_LEVEL).terraceRuns;
    }
    if (!Array.isArray(level.fairyLightRuns)) level.fairyLightRuns = [];
    level.missionSpots = normalizeMissionSpots(level.missionSpots);
    if (!level.fenceStyle) level.fenceStyle = "wire";
    fenceStyleSelect.value = level.fenceStyle;
    fillPathSelect();
    fillElevSelect();
    fillMissionSelect();
    draw();
  });
}
let tool: Tool = "shore";
let activePath = 0;
let activeElev = 0;
let activeMission = 0;
let selected: Hit | null = null;
let placeTreeKind: TreeKind = "holm";
/** Yaw used when placing flower beds (radians). */
let placeFoliageYaw = 0;
/** Catalog pick — click empty map places equipment of this kind. */
let catalogPlaceId: PlaceableId = "boathouse";
const history: LevelData[] = [];

/** Assigned below once the DOM helpers exist; used from dirty/undo. */
let walk: WalkMode;

let viewX = 0;
let viewZ = 0;
let viewScale = 1.8;
let viewSaveTimer: number | null = null;

function isPolyTool(t: Tool = tool): boolean {
  return t === "paths" || t === "roads" || t === "terraces" || t === "lights";
}

function ensureFairyRuns(): void {
  if (!Array.isArray(level.fairyLightRuns)) level.fairyLightRuns = [];
}

function ensureMissionSpots(): void {
  level.missionSpots = normalizeMissionSpots(level.missionSpots);
}

function fairyStampColor(): FairyLightColor {
  return fairyColorSelect.value === "red" ? "red" : "blue";
}

/** Active open-polyline layer for Paths / Roads / Terraces / Fairy lights. */
function polyLines(): XZ[][] {
  if (tool === "roads") return level.roadPolylines;
  if (tool === "terraces") return level.terraceRuns;
  if (tool === "lights") {
    ensureFairyRuns();
    return level.fairyLightRuns.map((r) => r.points);
  }
  return level.pathPolylines;
}

/** Push a new open polyline onto the active poly layer (handles fairy wrappers). */
function addPolyLine(points: XZ[]): number {
  if (tool === "lights") {
    ensureFairyRuns();
    level.fairyLightRuns.push({ color: fairyStampColor(), points });
    return level.fairyLightRuns.length - 1;
  }
  const lines = polyLines();
  lines.push(points);
  return lines.length - 1;
}

function removePolyLine(index: number): void {
  if (tool === "lights") {
    ensureFairyRuns();
    level.fairyLightRuns.splice(index, 1);
  } else {
    polyLines().splice(index, 1);
  }
}

function ensureElevZones(): void {
  if (!Array.isArray(level.elevationZones)) level.elevationZones = [];
}

function elevOutline(): XZ[] | null {
  ensureElevZones();
  return level.elevationZones[activeElev]?.outline ?? null;
}

function seedElevZone(wx: number, wz: number, height = 0.6): number {
  ensureElevZones();
  const edge: ElevEdgeStyle =
    elevEdgeSelect.value === "wall" ||
    elevEdgeSelect.value === "steps" ||
    elevEdgeSelect.value === "slope"
      ? elevEdgeSelect.value
      : "slope";
  level.elevationZones.push({
    outline: [
      [wx - 8, wz - 6],
      [wx + 8, wz - 6],
      [wx + 8, wz + 6],
      [wx - 8, wz + 6],
    ],
    height,
    edge,
  });
  activeElev = level.elevationZones.length - 1;
  return activeElev;
}

function fillElevSelect(): void {
  ensureElevZones();
  elevSelect.innerHTML = "";
  level.elevationZones.forEach((zone, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    const edge = zone.edge ?? "wall";
    opt.textContent = `Berm ${i + 1} (${zone.height.toFixed(2)} m · ${edge})`;
    elevSelect.appendChild(opt);
  });
  if (level.elevationZones.length === 0) {
    const opt = document.createElement("option");
    opt.value = "0";
    opt.textContent = "No berms";
    elevSelect.appendChild(opt);
  }
  activeElev = Math.min(
    activeElev,
    Math.max(0, level.elevationZones.length - 1),
  );
  elevSelect.value = String(activeElev);
  syncElevHeightUi();
}

function syncElevHeightUi(): void {
  ensureElevZones();
  const zone = level.elevationZones[activeElev];
  const h = zone?.height ?? 0.6;
  elevHeightInput.value = String(h);
  elevHeightVal.textContent = `${h.toFixed(2)} m`;
  elevHeightInput.disabled = !zone;
  const edge = zone?.edge ?? "wall";
  elevEdgeSelect.value = edge;
  elevEdgeSelect.disabled = !zone;
}

function polyNoun(): string {
  if (tool === "roads") return "Road";
  if (tool === "terraces") return "Terrace";
  if (tool === "lights") return "Light run";
  return "Path";
}

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
let refFlipH = false;
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
    setStampOrPlaceYaw(yawRad, !yawHistoryPushed);
    yawHistoryPushed = true;
  },
});

function placeableAt(index: number) {
  return level.placeables[index];
}

function syncPlaceCatalog(): void {
  placeCatalog.querySelectorAll("button").forEach((btn) => {
    const id = (btn as HTMLElement).dataset.id as PlaceableId;
    const active =
      selected?.kind === "place"
        ? placeableAt(selected.index)?.id === id
        : catalogPlaceId === id;
    btn.classList.toggle("active", !!active);
  });
}

function syncPlaceYawUi(yawRad: number): void {
  const deg = Math.round(((yawRad * 180) / Math.PI + 540) % 360 - 180);
  placeYawInput.value = String(deg);
  placeYawVal.textContent = `${deg}°`;
}

/** Yaw for the next stamp, or the selected placeable when one is picked. */
function stampYaw(): number {
  return (Number(placeYawInput.value) * Math.PI) / 180;
}

function setStampOrPlaceYaw(yawRad: number, push = true): void {
  if (selected?.kind === "place") {
    applyPlaceYaw(yawRad, push);
    return;
  }
  placePreview.setYaw(yawRad);
  syncPlaceYawUi(yawRad);
}

function applyPlaceYaw(yawRad: number, push = true): void {
  if (selected?.kind !== "place") return;
  const pl = placeableAt(selected.index);
  if (!pl) return;
  if (push) pushHistory();
  pl.yaw = yawRad;
  placePreview.setYaw(yawRad);
  syncPlaceYawUi(yawRad);
  writeLocalLevel(level);
  draw();
  if (walk.isActive()) walk.scheduleRebuild();
}

function selectPlaceableIndex(index: number, focus = false): void {
  const pl = placeableAt(index);
  if (!pl) return;
  selected = { kind: "place", index };
  catalogPlaceId = pl.id;
  syncPlaceCatalog();
  syncPlaceYawUi(pl.yaw);
  placePreview.setPlaceable(pl.id, pl.yaw);
  if (focus) {
    viewX = pl.x;
    viewZ = pl.z;
    persistView();
  }
  status.textContent = isMultiPlaceable(pl.id)
    ? `${PLACEABLE_LABELS[pl.id]} — drag to move, yaw to turn, Delete to remove. Click empty map to add another.`
    : `${PLACEABLE_LABELS[pl.id]} selected — drag on map to move, yaw slider or Shift-drag preview to turn.`;
  draw();
}

function selectPlaceableType(id: PlaceableId, focus = false): void {
  catalogPlaceId = id;
  // Cafés / play kit: catalog pick always arms stamp mode so you can plant
  // another without the map jumping to the first existing one.
  if (isMultiPlaceable(id)) {
    let yaw = stampYaw();
    if (selected?.kind === "place") {
      const pl = placeableAt(selected.index);
      if (pl?.id === id) yaw = pl.yaw;
    }
    selected = null;
    syncPlaceCatalog();
    placePreview.setPlaceable(id, yaw);
    syncPlaceYawUi(yaw);
    const count = level.placeables.filter((p) => p.id === id).length;
    status.textContent = count
      ? `${PLACEABLE_LABELS[id]} — click empty map to place another (${count} already). Click a marker to move.`
      : `${PLACEABLE_LABELS[id]} — click the map to place.`;
    draw();
    return;
  }
  const existing = level.placeables.findIndex((p) => p.id === id);
  if (existing >= 0) {
    selectPlaceableIndex(existing, focus);
    return;
  }
  // Unique landmark not in this level yet — arm stamp mode like multis.
  const yaw = stampYaw();
  selected = null;
  syncPlaceCatalog();
  placePreview.setPlaceable(id, yaw);
  syncPlaceYawUi(yaw);
  status.textContent = `${PLACEABLE_LABELS[id]} — click the map to place.`;
  draw();
}

function syncPlacePanel(): void {
  const open = tool === "place";
  workspace.classList.toggle("place-open", open);
  if (open) {
    placePreview.start();
    placePreview.resize();
    if (selected?.kind === "place") {
      const pl = placeableAt(selected.index);
      if (pl) {
        placePreview.setPlaceable(pl.id, pl.yaw);
        syncPlaceYawUi(pl.yaw);
      }
    } else if (level.placeables[0]) {
      selectPlaceableIndex(0);
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
      selectPlaceableType(id, true);
    });
    placeCatalog.appendChild(btn);
  }
}

function syncRefPanel(): void {
  refPanel.classList.toggle("has-image", !!refImage);
  for (const id of [
    "ref-opacity",
    "ref-size",
    "ref-rot",
    "fit-ref",
    "ref-flip",
    "ref-rot-reset",
  ]) {
    const el = document.getElementById(id);
    if (el && "disabled" in el) {
      (el as HTMLButtonElement).disabled = !refImage;
    }
  }
  refOpacityInput.value = String(Math.round(refOpacity * 100));
  mapOpacityInput.value = String(Math.round(mapOpacity * 100));
  refSizeInput.value = String(Math.round(refWidth));
  refRotInput.value = String(Math.round(refRotDeg));
  refOpacityVal.textContent = `${Math.round(refOpacity * 100)}%`;
  mapOpacityVal.textContent = `${Math.round(mapOpacity * 100)}%`;
  refSizeVal.textContent = `${Math.round(refWidth)}m`;
  refRotVal.textContent = `${Math.round(refRotDeg)}°`;
}

function syncRibbon(): void {
  ribbonTabs.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle(
      "active",
      (btn as HTMLElement).dataset.tool === tool,
    );
  });
  for (const pane of ribbonPanes) {
    const keys = (pane.dataset.for ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    pane.classList.toggle("on", keys.includes(tool));
  }
  if (polyGroupLabel) {
    polyGroupLabel.textContent =
      tool === "lights" ? "Fairy lights" : `${polyNoun()}s`;
  }
  if (fairyColorGroup) fairyColorGroup.hidden = tool !== "lights";
  if (tool === "lights") syncFairyColorUi();
  if (polyHint) {
    polyHint.textContent =
      tool === "roads"
        ? "Parade stone centre-lines. Same controls as Paths — houses sit on Terraces beside them."
        : tool === "terraces"
          ? "House façade runs. Same controls as Paths — façades face the park along each segment."
          : tool === "lights"
            ? "Each node is a 12 ft pole. Wire sags between poles (max 20%). Bulbs alternate red and blue; ribbon colour sets which leads."
            : "Click an edge to add a node · drag a node · Shift-drag moves the whole line · arrows nudge · dropdown selects a whole line.";
  }
}

function syncFairyColorUi(): void {
  ensureFairyRuns();
  const run = level.fairyLightRuns[activePath];
  if (run) fairyColorSelect.value = run.color;
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
    flipH: refFlipH,
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
  refFlipH = false;
  if (refSaveTimer != null) {
    window.clearTimeout(refSaveTimer);
    refSaveTimer = null;
  }
  void clearRefBackground();
  syncRefPanel();
  status.textContent = "Background image removed.";
  draw();
  if (walk.isActive()) walk.syncOverlay();
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
  if (activePath >= polyLines().length) {
    activePath = Math.max(0, polyLines().length - 1);
  }
  if (activeElev >= level.elevationZones.length) {
    activeElev = Math.max(0, level.elevationZones.length - 1);
  }
  fillPathSelect();
  fillElevSelect();
  level.missionSpots = normalizeMissionSpots(level.missionSpots);
  fillMissionSelect();
  if (!level.fenceStyle) level.fenceStyle = "wire";
  fenceStyleSelect.value = level.fenceStyle;
  writeLocalLevel(level);
  syncUndoBtn();
  status.textContent = "Undid last edit.";
  draw();
  walk.scheduleRebuild();
  walk.syncMarker();
}

function dirty(): void {
  writeLocalLevel(level);
  status.textContent = walk.isActive()
    ? "Saved — walk view rebuilds shortly."
    : "Saved to browser — reload the game to play this layout.";
  draw();
  if (walk.isActive()) {
    walk.scheduleRebuild();
    walk.syncMarker();
  }
}

/** Hit radius in metres — map uses zoom; walk ground-snap is a fallback only. */
function hitRadiusM(): number {
  return walk.isActive() ? 3.5 : 8 / viewScale;
}

function edgeSnapM(): number {
  return walk.isActive() ? 4 : 14 / viewScale;
}

/** How wide a walk-mode aim cone is for each foliage kind (metres). */
function treePickRadius(kind: TreeKind): number {
  switch (kind) {
    case "holm":
      return 6;
    case "plane":
      return 5;
    case "scrub":
    case "shrub":
      return 3;
    case "flowerBed":
      return 3;
    default:
      return 3.5;
  }
}

/**
 * Walk-mode picking: nearest editable item along the look ray (XZ cylinder),
 * so aiming at a trunk/crown selects it instead of the ground far behind.
 */
function pickWalkRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): Hit | null {
  let best: Hit | null = null;
  let bestDist = Infinity;
  let bestT = Infinity;

  const consider = (
    x: number,
    z: number,
    radius: number,
    hit: Hit,
    heights: number[],
  ): void => {
    for (const y of heights) {
      const tox = x - ox;
      const toy = y - oy;
      const toz = z - oz;
      const t = tox * dx + toy * dy + toz * dz;
      if (t < 0.4 || t > 70) continue;
      const cx = ox + dx * t;
      const cz = oz + dz * t;
      const dist = Math.hypot(cx - x, cz - z);
      if (dist > radius) continue;
      // Prefer closer to the ray, then nearer along the aim.
      if (dist < bestDist - 0.05 || (Math.abs(dist - bestDist) <= 0.05 && t < bestT)) {
        bestDist = dist;
        bestT = t;
        best = hit;
      }
    }
  };

  if (tool === "trees" || tool === "pan") {
    for (let i = 0; i < level.trees.length; i++) {
      const t = level.trees[i]!;
      const h =
        t.kind === "holm" || t.kind === "plane"
          ? [1, 3, 6, 10]
          : t.kind === "flowerBed"
            ? [0.3, 0.8]
            : [0.6, 1.5, 2.5];
      consider(t.x, t.z, treePickRadius(t.kind), { kind: "trees", index: i }, h);
    }
  }
  if (tool === "bins" || tool === "pan") {
    for (let i = 0; i < level.bins.length; i++) {
      const p = level.bins[i]!;
      consider(p[0], p[1], 2.2, { kind: "bins", index: i }, [0.4, 1]);
    }
  }
  if (tool === "missions" || tool === "pan") {
    ensureMissionSpots();
    for (let i = 0; i < level.missionSpots.length; i++) {
      const m = level.missionSpots[i]!;
      consider(m.x, m.z, 4, { kind: "missions", index: i }, [0.4, 1.2]);
    }
  }
  if (tool === "place" || tool === "pan") {
    for (let i = 0; i < level.placeables.length; i++) {
      const pl = level.placeables[i]!;
      consider(pl.x, pl.z, 5, { kind: "place", index: i }, [0.5, 1.5, 3, 5]);
    }
  }
  if (tool === "shore" || tool === "pan") {
    for (let i = 0; i < level.shoreOutline.length; i++) {
      const p = level.shoreOutline[i]!;
      consider(p[0], p[1], 2.5, { kind: "shore", index: i }, [0.2, 0.8]);
    }
  }
  if (tool === "ring" || tool === "pan") {
    for (let i = 0; i < level.parkRing.length; i++) {
      const p = level.parkRing[i]!;
      consider(p[0], p[1], 2.5, { kind: "ring", index: i }, [0.2, 1]);
    }
  }
  if (tool === "playArea" || tool === "pan") {
    for (let i = 0; i < level.playParkOutline.length; i++) {
      const p = level.playParkOutline[i]!;
      consider(p[0], p[1], 2.5, { kind: "playArea", index: i }, [0.2, 0.8]);
    }
  }
  if (tool === "carPark" || tool === "pan") {
    for (let i = 0; i < level.carParkOutline.length; i++) {
      const p = level.carParkOutline[i]!;
      consider(p[0], p[1], 2.5, { kind: "carPark", index: i }, [0.2, 0.8]);
    }
  }
  if (tool === "beach" || tool === "pan") {
    for (let i = 0; i < level.beachOutline.length; i++) {
      const p = level.beachOutline[i]!;
      consider(p[0], p[1], 2.5, { kind: "beach", index: i }, [0.2, 0.8]);
    }
  }
  if (tool === "elev" || tool === "pan") {
    ensureElevZones();
    for (let z = 0; z < level.elevationZones.length; z++) {
      const outline = level.elevationZones[z]!.outline;
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i]!;
        consider(p[0], p[1], 2.5, { kind: "elev", zone: z, index: i }, [
          0.2, 0.8,
        ]);
      }
    }
  }
  if (isPolyTool() || tool === "pan") {
    const lines = tool === "pan" ? level.pathPolylines : polyLines();
    for (let p = 0; p < lines.length; p++) {
      const line = lines[p]!;
      for (let i = 0; i < line.length; i++) {
        const pt = line[i]!;
        consider(pt[0], pt[1], 2.5, { kind: "path", path: p, index: i }, [
          0.2, 0.8,
        ]);
      }
    }
  }

  return best;
}

/** Apply a hit as the current selection (shared by map + walk). */
function applyHitSelection(hit: Hit): void {
  if (hit.kind === "place") {
    setTool("place");
    selectPlaceableIndex(hit.index);
    walk.syncMarker();
    return;
  }
  if (hit.kind === "trees" && tool !== "trees" && tool !== "pan") {
    setTool("trees");
  }
  selected = hit;
  if (hit.kind === "path") activePath = hit.path;
  if (hit.kind === "elev") {
    activeElev = hit.zone;
    fillElevSelect();
  }
  if (hit.kind === "trees") {
    const t = level.trees[hit.index];
    if (t) {
      placeTreeKind = t.kind;
      treeKindSelect.value = t.kind;
      if (t.kind === "flowerBed") placeFoliageYaw = t.yaw ?? 0;
    }
    syncFoliageYawUi();
    status.textContent = `${TREE_LABELS[placeTreeKind]} selected — hold to drag, Delete to remove.`;
  }
  if (hit.kind === "missions") {
    activeMission = hit.index;
    if (tool !== "missions" && tool !== "pan") setTool("missions");
    selected = { kind: "missions", index: hit.index };
    missionSelect.value = String(hit.index);
    syncMissionTimeUi();
    const m = level.missionSpots[hit.index];
    if (m) {
      status.textContent = `${missionLabel(m)} — drag the pin or use arrow keys.`;
    }
  }
  fillPathSelect();
  draw();
  walk.syncMarker();
}

function selectionWorldPos(): { x: number; z: number } | null {
  if (!selected) return null;
  if (selected.kind === "shore") {
    const p = level.shoreOutline[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "ring") {
    const p = level.parkRing[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "playArea") {
    const p = level.playParkOutline[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "carPark") {
    const p = level.carParkOutline[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "beach") {
    const p = level.beachOutline[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "elev") {
    const p = level.elevationZones[selected.zone]?.outline[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "bins") {
    const p = level.bins[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "missions") {
    const m = level.missionSpots[selected.index];
    return m ? { x: m.x, z: m.z } : null;
  }
  if (selected.kind === "trees") {
    const t = level.trees[selected.index];
    return t ? { x: t.x, z: t.z } : null;
  }
  if (selected.kind === "place") {
    const pl = placeableAt(selected.index);
    return pl ? { x: pl.x, z: pl.z } : null;
  }
  if (selected.kind === "path") {
    const p = polyLines()[selected.path]?.[selected.index];
    return p ? { x: p[0], z: p[1] } : null;
  }
  if (selected.kind === "pathAll") {
    const line = polyLines()[selected.path];
    if (!line?.length) return null;
    let x = 0;
    let z = 0;
    for (const p of line) {
      x += p[0];
      z += p[1];
    }
    return { x: x / line.length, z: z / line.length };
  }
  return null;
}

function moveSelectedTo(wx: number, wz: number): boolean {
  if (!selected) return false;
  if (selected.kind === "shore") {
    level.shoreOutline[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "ring") {
    level.parkRing[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "playArea") {
    level.playParkOutline[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "carPark") {
    level.carParkOutline[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "beach") {
    level.beachOutline[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "elev") {
    const outline = level.elevationZones[selected.zone]?.outline;
    if (!outline) return false;
    outline[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "path") {
    const line = polyLines()[selected.path];
    if (!line) return false;
    line[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "bins") {
    level.bins[selected.index] = [wx, wz];
    return true;
  }
  if (selected.kind === "trees") {
    const t = level.trees[selected.index];
    if (!t) return false;
    t.x = wx;
    t.z = wz;
    return true;
  }
  if (selected.kind === "place") {
    const pl = placeableAt(selected.index);
    if (!pl) return false;
    pl.x = wx;
    pl.z = wz;
    return true;
  }
  return false;
}

function deleteSelected(): boolean {
  if (!selected) return false;
  pushHistory();
  if (selected.kind === "shore" && level.shoreOutline.length > 3) {
    level.shoreOutline.splice(selected.index, 1);
  } else if (selected.kind === "ring" && level.parkRing.length > 3) {
    level.parkRing.splice(selected.index, 1);
  } else if (selected.kind === "playArea" && level.playParkOutline.length > 3) {
    level.playParkOutline.splice(selected.index, 1);
  } else if (selected.kind === "carPark" && level.carParkOutline.length > 3) {
    level.carParkOutline.splice(selected.index, 1);
  } else if (selected.kind === "beach" && level.beachOutline.length > 3) {
    level.beachOutline.splice(selected.index, 1);
  } else if (selected.kind === "elev") {
    const zone = level.elevationZones[selected.zone];
    if (!zone) {
      history.pop();
      syncUndoBtn();
      return false;
    }
    if (zone.outline.length > 3) {
      zone.outline.splice(selected.index, 1);
    } else {
      level.elevationZones.splice(selected.zone, 1);
      activeElev = Math.max(0, selected.zone - 1);
      fillElevSelect();
    }
  } else if (selected.kind === "path" || selected.kind === "pathAll") {
    const pathIdx = selected.path;
    const lines = polyLines();
    const line = lines[pathIdx];
    if (!line) {
      history.pop();
      syncUndoBtn();
      return false;
    }
    if (selected.kind === "pathAll" || line.length <= 2) {
      removePolyLine(pathIdx);
      activePath = Math.max(0, pathIdx - 1);
    } else {
      line.splice(selected.index, 1);
    }
    fillPathSelect();
  } else if (selected.kind === "bins") {
    level.bins.splice(selected.index, 1);
  } else if (selected.kind === "trees") {
    level.trees.splice(selected.index, 1);
  } else if (selected.kind === "place") {
    const pl = placeableAt(selected.index);
    if (!pl || !isMultiPlaceable(pl.id)) {
      history.pop();
      syncUndoBtn();
      return false;
    }
    level.placeables.splice(selected.index, 1);
  } else if (selected.kind === "missions") {
    history.pop();
    syncUndoBtn();
    activeMission = selected.index;
    return deleteActiveMission();
  } else {
    history.pop();
    syncUndoBtn();
    return false;
  }
  selected = null;
  dirty();
  return true;
}

function rotateSelected(dir: -1 | 1, shift: boolean, recordHistory = true): void {
  const step = ((shift ? 15 : 5) * Math.PI) / 180;
  if (selected?.kind === "trees") {
    const t = level.trees[selected.index];
    if (!t || t.kind !== "flowerBed") return;
    if (recordHistory) pushHistory();
    t.yaw = (t.yaw ?? 0) + dir * step;
    placeFoliageYaw = t.yaw;
    syncFoliageYawUi();
    dirty();
    return;
  }
  if (selected?.kind === "place") {
    const pl = placeableAt(selected.index);
    if (!pl) return;
    applyPlaceYaw(pl.yaw + dir * step, recordHistory);
  }
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
  const lines = polyLines();
  const noun = polyNoun();
  lines.forEach((_, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    if (tool === "lights") {
      const run = level.fairyLightRuns[i];
      const colour = run?.color ?? "blue";
      opt.textContent = `Run ${i + 1} (${colour} · ${lines[i]!.length} poles)`;
    } else {
      opt.textContent = `${noun} ${i + 1} (${lines[i]!.length} pts)`;
    }
    pathSelect.appendChild(opt);
  });
  if (activePath >= lines.length) activePath = 0;
  pathSelect.value = String(activePath);
  pathSelect.title = `Active ${noun.toLowerCase()}`;
}

function hitTestWorld(wx: number, wz: number): Hit | null {
  const thresh = hitRadiusM();
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
  if (tool === "playArea" || tool === "pan") {
    for (let i = 0; i < level.playParkOutline.length; i++) {
      const p = level.playParkOutline[i]!;
      if (near(p[0], p[1])) return { kind: "playArea", index: i };
    }
  }
  if (tool === "carPark" || tool === "pan") {
    for (let i = 0; i < level.carParkOutline.length; i++) {
      const p = level.carParkOutline[i]!;
      if (near(p[0], p[1])) return { kind: "carPark", index: i };
    }
  }
  if (tool === "beach" || tool === "pan") {
    for (let i = 0; i < level.beachOutline.length; i++) {
      const p = level.beachOutline[i]!;
      if (near(p[0], p[1])) return { kind: "beach", index: i };
    }
  }
  if (tool === "elev" || tool === "pan") {
    ensureElevZones();
    for (let z = 0; z < level.elevationZones.length; z++) {
      const outline = level.elevationZones[z]!.outline;
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i]!;
        if (near(p[0], p[1])) return { kind: "elev", zone: z, index: i };
      }
    }
  }
  if (isPolyTool() || tool === "pan") {
    const lines = tool === "pan" ? level.pathPolylines : polyLines();
    for (let p = 0; p < lines.length; p++) {
      const line = lines[p]!;
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
  if (tool === "missions" || tool === "pan") {
    ensureMissionSpots();
    for (let i = 0; i < level.missionSpots.length; i++) {
      const m = level.missionSpots[i]!;
      if (near(m.x, m.z)) return { kind: "missions", index: i };
    }
  }
  if (tool === "trees" || tool === "pan") {
    for (let i = 0; i < level.trees.length; i++) {
      const t = level.trees[i]!;
      if (near(t.x, t.z)) return { kind: "trees", index: i };
    }
  }
  if (tool === "place" || tool === "pan") {
    for (let i = 0; i < level.placeables.length; i++) {
      const pl = level.placeables[i]!;
      if (near(pl.x, pl.z)) return { kind: "place", index: i };
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

/**
 * Open polyline as a strip at real world width (metres × viewScale), matching
 * how roads / paths / terraces land in-game.
 */
function drawStrip(
  points: XZ[],
  fill: string,
  worldWidthM: number,
  edge?: string,
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [sx, sy] = screenFromWorld(p[0], p[1]);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(1, worldWidthM * viewScale);
  ctx.stroke();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, 1.25);
    ctx.stroke();
  }
}

function drawHandles(
  points: XZ[],
  colour: string,
  kind: "shore" | "ring" | "bins" | "playArea" | "carPark" | "beach" | "elev",
  zone = 0,
): void {
  points.forEach((p, i) => {
    const [sx, sy] = screenFromWorld(p[0], p[1]);
    const sel =
      selected &&
      ((kind === "elev" &&
        selected.kind === "elev" &&
        selected.zone === zone &&
        selected.index === i) ||
        (kind !== "elev" &&
          selected.kind === kind &&
          "index" in selected &&
          selected.index === i));
    ctx.beginPath();
    ctx.arc(sx, sy, sel ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#fff" : colour;
    ctx.fill();
    ctx.strokeStyle = "#000a";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

/** Red / amber mission pins — tip points north so they read as map markers. */
function drawMissionSpots(): void {
  ensureMissionSpots();
  const activeTool = tool === "missions";
  level.missionSpots.forEach((m, index) => {
    const [sx, sy] = screenFromWorld(m.x, m.z);
    const sel =
      (selected?.kind === "missions" && selected.index === index) ||
      (activeTool && index === activeMission);
    const placeholder = isPlaceholderMission(m);
    const fill = sel
      ? placeholder
        ? "#e88840"
        : "#ff6b5a"
      : activeTool
        ? placeholder
          ? "#c45a18"
          : "#e82a1a"
        : placeholder
          ? "rgba(160,80,30,0.55)"
          : "rgba(180,40,30,0.55)";
    ctx.save();
    ctx.translate(sx, sy);
    // Pin: circle + stem toward south (down on map).
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(6, 0);
    ctx.arc(0, -2, 7, 0.2, Math.PI - 0.2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = sel ? "#fff" : "#000a";
    ctx.lineWidth = sel ? 2 : 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sel ? "#ffe8e0" : placeholder ? "#e8d0b8" : "#f0c8c0";
    ctx.font = sel ? "bold 11px sans-serif" : "11px sans-serif";
    const label = placeholder
      ? `${missionLabel(m)} · draft`
      : missionLabel(m);
    ctx.fillText(label, sx + 10, sy - 6);
    ctx.fillStyle = sel ? "#ffc8b8" : "#c89890";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      `${formatMissionClock(m.start)} → ${formatMissionClock(m.end)}`,
      sx + 10,
      sy + 8,
    );
  });
}

function fillMissionClockSelect(select: HTMLSelectElement): void {
  if (select.options.length > 0) return;
  for (const c of missionClockChoices()) {
    const opt = document.createElement("option");
    opt.value = missionClockSelectValue(c);
    opt.textContent = formatMissionClock(c);
    select.appendChild(opt);
  }
}

function syncMissionTimeUi(): void {
  ensureMissionSpots();
  fillMissionClockSelect(missionStartSelect);
  fillMissionClockSelect(missionEndSelect);
  const m = level.missionSpots[activeMission];
  if (!m) return;
  missionNameInput.value = missionLabel(m);
  missionStartSelect.value = missionClockSelectValue(m.start);
  missionEndSelect.value = missionClockSelectValue(m.end);
  delMissionBtn.disabled = !isPlaceholderMission(m);
}

function fillMissionSelect(): void {
  ensureMissionSpots();
  missionSelect.innerHTML = "";
  level.missionSpots.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = isPlaceholderMission(m)
      ? `${missionLabel(m)} (draft)`
      : missionLabel(m);
    missionSelect.appendChild(opt);
  });
  if (activeMission >= level.missionSpots.length) activeMission = 0;
  missionSelect.value = String(activeMission);
  syncMissionTimeUi();
}

function selectMissionIndex(index: number): void {
  ensureMissionSpots();
  if (index < 0 || index >= level.missionSpots.length) return;
  activeMission = index;
  selected = { kind: "missions", index };
  missionSelect.value = String(index);
  syncMissionTimeUi();
}

function applyMissionClockFromUi(): void {
  ensureMissionSpots();
  const m = level.missionSpots[activeMission];
  if (!m) return;
  const nextStart = missionClockFromSelectValue(missionStartSelect.value);
  const nextEnd = missionClockFromSelectValue(missionEndSelect.value);
  if (m.start === nextStart && m.end === nextEnd) return;
  pushHistory();
  m.start = nextStart;
  m.end = nextEnd;
  dirty();
  draw();
}

function applyMissionNameFromUi(): void {
  ensureMissionSpots();
  const m = level.missionSpots[activeMission];
  if (!m) return;
  const next = missionNameInput.value.trim() || "Untitled mission";
  if (missionLabel(m) === next && m.name === next) return;
  pushHistory();
  m.name = next;
  dirty();
  fillMissionSelect();
  draw();
}

function addPlaceholderMission(): void {
  ensureMissionSpots();
  pushHistory();
  const spot = createPlaceholderMission(viewX, viewZ);
  level.missionSpots.push(spot);
  activeMission = level.missionSpots.length - 1;
  selected = { kind: "missions", index: activeMission };
  dirty();
  fillMissionSelect();
  status.textContent = `${missionLabel(spot)} — name it, set the window, drag the amber pin. Fill in the gameplay later.`;
  draw();
  walk.syncMarker();
  missionNameInput.focus();
  missionNameInput.select();
}

function deleteActiveMission(): boolean {
  ensureMissionSpots();
  const m = level.missionSpots[activeMission];
  if (!m) return false;
  if (!isPlaceholderMission(m)) {
    status.textContent =
      "Built-in missions stay put — clear the name/window only, or add a placeholder instead.";
    return false;
  }
  pushHistory();
  level.missionSpots.splice(activeMission, 1);
  activeMission = Math.min(activeMission, level.missionSpots.length - 1);
  selected =
    level.missionSpots.length > 0
      ? { kind: "missions", index: activeMission }
      : null;
  dirty();
  fillMissionSelect();
  status.textContent = "Placeholder removed.";
  draw();
  walk.syncMarker();
  return true;
}

function drawPlaceables(): void {
  level.placeables.forEach((pl, index) => {
    const [sx, sy] = screenFromWorld(pl.x, pl.z);
    const sel = selected?.kind === "place" && selected.index === index;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-(pl.yaw + Math.PI)); // tip toward −Z of building group ≈ water
    ctx.fillStyle = sel ? "#fff" : isMultiPlaceable(pl.id) ? "#f0c14a" : "#ff8a4c";
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
  });
}

function drawTrees(): void {
  for (let i = 0; i < level.trees.length; i++) {
    const t = level.trees[i]!;
    const [sx, sy] = screenFromWorld(t.x, t.z);
    const sel = selected?.kind === "trees" && selected.index === i;
    const fill =
      t.kind === "holm"
        ? "#3d7a4a"
        : t.kind === "plane"
          ? "#6bbf59"
          : t.kind === "shrub"
            ? "#2f8a4a"
            : t.kind === "flowerBed"
              ? "#d86a8a"
              : "#8a9a4a";
    ctx.beginPath();
    if (t.kind === "flowerBed") {
      const yaw = t.yaw ?? 0;
      const hw = 9 * viewScale * 0.35;
      const hd = 5.5 * viewScale * 0.35;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-yaw);
      ctx.rect(-hw, -hd, hw * 2, hd * 2);
      ctx.restore();
    } else if (t.kind === "scrub") {
      ctx.arc(sx, sy, sel ? 5 : 3.5, 0, Math.PI * 2);
    } else if (t.kind === "shrub") {
      ctx.ellipse(sx, sy, sel ? 6 : 4.5, sel ? 5 : 3.8, 0, 0, Math.PI * 2);
    } else if (t.kind === "plane") {
      ctx.moveTo(sx, sy - (sel ? 9 : 7));
      ctx.lineTo(sx + (sel ? 6 : 5), sy + (sel ? 5 : 4));
      ctx.lineTo(sx - (sel ? 6 : 5), sy + (sel ? 5 : 4));
      ctx.closePath();
    } else {
      ctx.arc(sx, sy, sel ? 7 : 5.5, 0, Math.PI * 2);
    }
    ctx.fillStyle = sel ? "#fff" : fill;
    ctx.fill();
    ctx.strokeStyle = "#000a";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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
    if (refFlipH) ctx.scale(-1, 1);
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(refImage, -rw / 2, -rh / 2, rw, rh);
    ctx.globalAlpha = 1;
    if (refFlipH) ctx.scale(-1, 1);
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

  // North bug — +Z is inland / top of the editor.
  {
    const pad = 16;
    ctx.fillStyle = "rgba(255,225,120,0.9)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", w / 2, pad);
    ctx.strokeStyle = "rgba(255,225,120,0.7)";
    ctx.beginPath();
    ctx.moveTo(w / 2, pad + 6);
    ctx.lineTo(w / 2, pad + 18);
    ctx.stroke();
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

  // Play-park wood-chip outline
  if (level.playParkOutline.length > 2) {
    ctx.beginPath();
    level.playParkOutline.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(196,160,106,0.55)";
    ctx.fill();
  }
  drawPoly(level.playParkOutline, "#c4a06a", true, 2);

  // Car park asphalt outline
  if (level.carParkOutline.length > 2) {
    ctx.beginPath();
    level.carParkOutline.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(144,164,174,0.4)";
    ctx.fill();
  }
  drawPoly(level.carParkOutline, "#90a4ae", true, 2);

  ensureElevZones();
  // Beach / shingle outline
  if (level.beachOutline.length > 2) {
    ctx.beginPath();
    level.beachOutline.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(201,187,154,0.5)";
    ctx.fill();
  }
  drawPoly(level.beachOutline, "#c9bb9a", true, 2);

  ensureElevZones();
  for (let z = 0; z < level.elevationZones.length; z++) {
    const zone = level.elevationZones[z]!;
    if (zone.outline.length < 3) continue;
    ctx.beginPath();
    zone.outline.forEach((p, i) => {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    const active = tool === "elev" && z === activeElev;
    ctx.fillStyle = active
      ? "rgba(139,195,74,0.45)"
      : "rgba(104,159,56,0.32)";
    ctx.fill();
    drawPoly(zone.outline, active ? "#c5e1a5" : "#8bc34a", true, active ? 3 : 2);
  }

  for (let i = 0; i < level.pathPolylines.length; i++) {
    const line = level.pathPolylines[i]!;
    const active = tool === "paths" && i === activePath;
    drawStrip(
      line,
      active ? "rgba(255,231,160,0.85)" : "rgba(184,184,190,0.7)",
      PATH_STRIP_WIDTH,
      active ? "#ffe7a0" : "#9a9aa0",
    );
  }

  for (let i = 0; i < level.roadPolylines.length; i++) {
    const line = level.roadPolylines[i]!;
    const active = tool === "roads" && i === activePath;
    drawStrip(
      line,
      active ? "rgba(240,192,112,0.9)" : "rgba(42,42,44,0.85)",
      ROAD_WIDTH,
      active ? "#f0c070" : "#5a5a5e",
    );
  }

  for (let i = 0; i < level.terraceRuns.length; i++) {
    const line = level.terraceRuns[i]!;
    const active = tool === "terraces" && i === activePath;
    drawStrip(
      line,
      active ? "rgba(232,180,160,0.88)" : "rgba(160,112,96,0.75)",
      HOUSE_DEPTH,
      active ? "#e8b4a0" : "#8a6050",
    );
  }

  ensureFairyRuns();
  for (let i = 0; i < level.fairyLightRuns.length; i++) {
    const run = level.fairyLightRuns[i]!;
    const active = tool === "lights" && i === activePath;
    const stroke =
      run.color === "red"
        ? active
          ? "#ff6b6b"
          : "#c94a4a"
        : active
          ? "#6bb8ff"
          : "#3a7ab8";
    const fill =
      run.color === "red"
        ? active
          ? "rgba(255,80,80,0.85)"
          : "rgba(180,60,60,0.65)"
        : active
          ? "rgba(80,160,255,0.85)"
          : "rgba(40,100,180,0.65)";
    drawStrip(run.points, fill, 0.6, stroke);
    // Pole dots
    for (const p of run.points) {
      const [sx, sy] = screenFromWorld(p[0], p[1]);
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(sx, sy, active ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
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

  // Bins stay with the faded map layer; buildings/trees draw on top when active.
  for (const b of level.bins) {
    const [sx, sy] = screenFromWorld(b[0], b[1]);
    ctx.fillStyle = "#7dcea0";
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
  }

  if (tool !== "place") drawPlaceables();
  if (tool !== "trees") drawTrees();

  if (tool === "shore") drawHandles(level.shoreOutline, "#3aa0b8", "shore");
  if (tool === "ring") drawHandles(level.parkRing, "#c9a0ff", "ring");
  if (tool === "playArea") {
    drawHandles(level.playParkOutline, "#c4a06a", "playArea");
  }
  if (tool === "carPark") {
    drawHandles(level.carParkOutline, "#90a4ae", "carPark");
  }
  if (tool === "beach") {
    drawHandles(level.beachOutline, "#c9bb9a", "beach");
  }
  if (tool === "elev") {
    ensureElevZones();
    for (let z = 0; z < level.elevationZones.length; z++) {
      drawHandles(
        level.elevationZones[z]!.outline,
        z === activeElev ? "#c5e1a5" : "#8bc34a",
        "elev",
        z,
      );
    }
  }
  if (isPolyTool()) {
    const line = polyLines()[activePath];
    const fill =
      tool === "roads"
        ? "#f0c070"
        : tool === "terraces"
          ? "#e8b4a0"
          : tool === "lights"
            ? level.fairyLightRuns[activePath]?.color === "red"
              ? "#ff6b6b"
              : "#6bb8ff"
            : "#ffe7a0";
    if (line) {
      line.forEach((pt, i) => {
        const [sx, sy] = screenFromWorld(pt[0], pt[1]);
        const sel =
          selected?.kind === "path" &&
          selected.path === activePath &&
          selected.index === i;
        ctx.beginPath();
        ctx.arc(sx, sy, sel ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = sel ? "#fff" : fill;
        ctx.fill();
        ctx.strokeStyle = "#000a";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }
  if (tool === "bins") drawHandles(level.bins, "#7dcea0", "bins");
  if (tool === "missions" || tool === "pan") drawMissionSpots();

  ctx.restore();

  // Active building/tree tools draw at full opacity so map fade can't hide them.
  if (tool === "place") drawPlaceables();
  if (tool === "trees") drawTrees();
}

function insertOnEdge(
  points: XZ[],
  wx: number,
  wz: number,
  closed: boolean,
  maxDist = edgeSnapM(),
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
  maxDist = edgeSnapM(),
): { path: number; dist: number } | null {
  let bestPath = -1;
  let bestDist = maxDist;
  const lines = polyLines();
  for (let p = 0; p < lines.length; p++) {
    const line = lines[p]!;
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

/**
 * Select or place at a world point — shared by the map and walk mode.
 * Returns whether a drag of `selected` may begin (hit an existing item).
 */
function actAtWorld(wx: number, wz: number, shift = false): boolean {
  const hit = hitTestWorld(wx, wz);
  if (hit) {
    if (hit.kind === "path" && shift) {
      selected = { kind: "pathAll", path: hit.path };
      activePath = hit.path;
      fillPathSelect();
      draw();
      walk.syncMarker();
      return true;
    }
    applyHitSelection(hit);
    return true;
  }

  if (tool === "pan" || tool === "bg") return false;

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
  } else if (tool === "playArea") {
    pushHistory();
    if (level.playParkOutline.length < 3) {
      level.playParkOutline = [
        [wx - 10, wz - 8],
        [wx + 10, wz - 8],
        [wx + 10, wz + 8],
        [wx - 10, wz + 8],
      ];
      selected = { kind: "playArea", index: 0 };
      dirty();
    } else {
      const idx = insertOnEdge(level.playParkOutline, wx, wz, true);
      if (idx >= 0) {
        selected = { kind: "playArea", index: idx };
        dirty();
      } else {
        history.pop();
        syncUndoBtn();
      }
    }
  } else if (tool === "carPark") {
    pushHistory();
    if (level.carParkOutline.length < 3) {
      level.carParkOutline = [
        [wx - 14, wz - 10],
        [wx + 14, wz - 10],
        [wx + 14, wz + 10],
        [wx - 14, wz + 10],
      ];
      selected = { kind: "carPark", index: 0 };
      dirty();
    } else {
      const idx = insertOnEdge(level.carParkOutline, wx, wz, true);
      if (idx >= 0) {
        selected = { kind: "carPark", index: idx };
        dirty();
      } else {
        history.pop();
        syncUndoBtn();
      }
    }
  } else if (tool === "beach") {
    pushHistory();
    if (level.beachOutline.length < 3) {
      level.beachOutline = [
        [wx - 50, wz - 12],
        [wx + 50, wz - 12],
        [wx + 50, wz + 12],
        [wx - 50, wz + 12],
      ];
      selected = { kind: "beach", index: 0 };
      dirty();
    } else {
      const idx = insertOnEdge(level.beachOutline, wx, wz, true);
      if (idx >= 0) {
        selected = { kind: "beach", index: idx };
        dirty();
      } else {
        history.pop();
        syncUndoBtn();
      }
    }
  } else if (tool === "elev") {
    pushHistory();
    ensureElevZones();
    const outline = elevOutline();
    if (!outline || outline.length < 3) {
      seedElevZone(wx, wz, Number(elevHeightInput.value) || 0.6);
      selected = { kind: "elev", zone: activeElev, index: 0 };
      fillElevSelect();
      dirty();
    } else {
      const idx = insertOnEdge(outline, wx, wz, true);
      if (idx >= 0) {
        selected = { kind: "elev", zone: activeElev, index: idx };
        dirty();
      } else {
        // Empty click away from edges — new berm.
        seedElevZone(wx, wz, Number(elevHeightInput.value) || 0.6);
        selected = { kind: "elev", zone: activeElev, index: 0 };
        fillElevSelect();
        dirty();
      }
    }
  } else if (isPolyTool()) {
    const near = nearestPathEdge(wx, wz);
    if (near && shift) {
      selected = { kind: "pathAll", path: near.path };
      activePath = near.path;
      fillPathSelect();
      draw();
      walk.syncMarker();
      return true;
    }
    if (near) {
      pushHistory();
      activePath = near.path;
      const line = polyLines()[activePath]!;
      const idx = insertOnEdge(line, wx, wz, false);
      if (idx >= 0) {
        selected = { kind: "path", path: activePath, index: idx };
        fillPathSelect();
        dirty();
      } else {
        history.pop();
        syncUndoBtn();
      }
      return false;
    }
    pushHistory();
    const lines = polyLines();
    if (!lines[activePath]) {
      activePath = addPolyLine([[wx, wz]]);
      selected = { kind: "path", path: activePath, index: 0 };
    } else {
      const line = lines[activePath]!;
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
  } else if (tool === "trees") {
    pushHistory();
    const spot =
      placeTreeKind === "flowerBed"
        ? { x: wx, z: wz, kind: placeTreeKind, yaw: placeFoliageYaw }
        : { x: wx, z: wz, kind: placeTreeKind };
    level.trees.push(spot);
    selected = { kind: "trees", index: level.trees.length - 1 };
    syncFoliageYawUi();
    status.textContent = `Placed ${TREE_LABELS[placeTreeKind]} — drag or arrows to move, Delete to remove.`;
    dirty();
  } else if (
    tool === "place" &&
    (isMultiPlaceable(catalogPlaceId) ||
      !level.placeables.some((p) => p.id === catalogPlaceId))
  ) {
    pushHistory();
    level.placeables.push({
      id: catalogPlaceId,
      x: wx,
      z: wz,
      yaw: stampYaw(),
    });
    selectPlaceableIndex(level.placeables.length - 1);
    dirty();
  }

  walk.syncMarker();
  return false;
}

function onPointerDown(ev: PointerEvent): void {
  if (walk.isActive()) return;
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

  const [wx, wz] = worldFromScreen(sx, sy);
  const hit = hitTestWorld(wx, wz);
  if (hit) {
    actAtWorld(wx, wz, ev.shiftKey);
    if (hit.kind === "path" && ev.shiftKey) {
      dragging = { kind: "pathAll", path: hit.path };
      activePath = hit.path;
    } else {
      dragging = hit;
    }
    canvas.setPointerCapture(ev.pointerId);
    return;
  }

  actAtWorld(wx, wz, ev.shiftKey);
  if (selected?.kind === "pathAll" && ev.shiftKey) {
    dragging = selected;
    canvas.setPointerCapture(ev.pointerId);
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
  } else if (dragging.kind === "playArea") {
    level.playParkOutline[dragging.index] = [wx, wz];
  } else if (dragging.kind === "carPark") {
    level.carParkOutline[dragging.index] = [wx, wz];
  } else if (dragging.kind === "beach") {
    level.beachOutline[dragging.index] = [wx, wz];
  } else if (dragging.kind === "elev") {
    const outline = level.elevationZones[dragging.zone]?.outline;
    if (outline) outline[dragging.index] = [wx, wz];
  } else if (dragging.kind === "path") {
    polyLines()[dragging.path]![dragging.index] = [wx, wz];
  } else if (dragging.kind === "pathAll") {
    const line = polyLines()[dragging.path];
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
  } else if (dragging.kind === "missions") {
    const m = level.missionSpots[dragging.index];
    if (m) {
      m.x = wx;
      m.z = wz;
      activeMission = dragging.index;
      missionSelect.value = String(dragging.index);
    }
  } else if (dragging.kind === "trees") {
    const t = level.trees[dragging.index];
    if (t) {
      t.x = wx;
      t.z = wz;
    }
  } else if (dragging.kind === "place") {
    const pl = placeableAt(dragging.index);
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
  if (movingRef) {
    persistRef(0);
    if (walk.isActive()) walk.syncOverlay();
  }
  if (panning) persistView(0);
  yawHistoryPushed = false;
  dragging = null;
  dragStarted = false;
  panning = false;
  movingRef = false;
}

function onDblClick(ev: MouseEvent): void {
  if (!isPolyTool()) return;
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const [wx, wz] = worldFromScreen(sx, sy);
  // Double-click on a path edge inserts a node; otherwise starts a new path.
  const near = nearestPathEdge(wx, wz);
  const lines = polyLines();
  if (near) {
    pushHistory();
    activePath = near.path;
    const line = lines[activePath]!;
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
  activePath = addPolyLine([[wx, wz]]);
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
  if (selected.kind === "playArea") {
    const p = level.playParkOutline[selected.index];
    if (!p) return false;
    level.playParkOutline[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "carPark") {
    const p = level.carParkOutline[selected.index];
    if (!p) return false;
    level.carParkOutline[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "beach") {
    const p = level.beachOutline[selected.index];
    if (!p) return false;
    level.beachOutline[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "elev") {
    const p = level.elevationZones[selected.zone]?.outline[selected.index];
    if (!p) return false;
    level.elevationZones[selected.zone]!.outline[selected.index] = [
      p[0] + dx,
      p[1] + dz,
    ];
    return true;
  }
  if (selected.kind === "bins") {
    const p = level.bins[selected.index];
    if (!p) return false;
    level.bins[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "missions") {
    const m = level.missionSpots[selected.index];
    if (!m) return false;
    m.x += dx;
    m.z += dz;
    return true;
  }
  if (selected.kind === "trees") {
    const t = level.trees[selected.index];
    if (!t) return false;
    t.x += dx;
    t.z += dz;
    return true;
  }
  if (selected.kind === "place") {
    const pl = placeableAt(selected.index);
    if (!pl) return false;
    pl.x += dx;
    pl.z += dz;
    return true;
  }
  if (selected.kind === "path") {
    const line = polyLines()[selected.path];
    const p = line?.[selected.index];
    if (!p || !line) return false;
    line[selected.index] = [p[0] + dx, p[1] + dz];
    return true;
  }
  if (selected.kind === "pathAll") {
    const line = polyLines()[selected.path];
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
  // Walk mode owns movement / Esc / Del while the pointer is locked.
  if (walk.isActive() && walk.isLocked()) return;

  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
    ev.preventDefault();
    undo();
    return;
  }

  if (
    (ev.key === "[" || ev.key === "]") &&
    selected?.kind === "trees" &&
    level.trees[selected.index]?.kind === "flowerBed"
  ) {
    ev.preventDefault();
    rotateSelected(ev.key === "]" ? 1 : -1, ev.shiftKey, !ev.repeat);
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
      walk.syncMarker();
      if (walk.isActive()) walk.scheduleRebuild();
    } else if (!ev.repeat) {
      history.pop();
      syncUndoBtn();
    }
    return;
  }

  if (ev.key !== "Backspace" && ev.key !== "Delete") return;
  deleteSelected();
}

function setTool(next: Tool): void {
  if (next !== tool) {
    selected = null;
    if (isPolyTool(next)) activePath = 0;
    if (next === "missions") {
      ensureMissionSpots();
      selected = { kind: "missions", index: activeMission };
    }
  }
  tool = next;
  syncRibbon();
  syncPlacePanel();
  status.textContent =
    next === "bg"
      ? "Background: drag to move the image. Scroll pans; Ctrl/Cmd+scroll or the Zoom slider zooms."
      : next === "shore"
        ? "Shore: drag points, click edge to insert, arrows to nudge, Delete to remove."
        : next === "paths"
          ? "Paths: click edge to add a node · drag node · Shift-drag whole path · arrows nudge."
          : next === "roads"
            ? "Roads: parade stone centre-lines — same as Paths. Houses sit on Terraces beside them."
            : next === "terraces"
              ? "Terraces: house façade runs — same as Paths. Houses face the park along each segment."
              : next === "lights"
                ? "Fairy lights: each click is a pole. Wire sags (max 20% of 12 ft). Bulbs alternate red/blue — ribbon picks which colour leads."
                : next === "ring"
                ? "Fencing: pick a style, drag points, arrows to nudge. Path spurs cut gateways."
                : next === "playArea"
                  ? "Play area: drag corners, click edge to insert — wood-chip outline for the play park."
                  : next === "carPark"
                    ? "Car park: drag corners, click edge to insert — asphalt pad; cars fill it in-game."
                    : next === "beach"
                      ? "Beach: drag corners, click edge to insert — sand pad; sea starts from its south edge."
                      : next === "elev"
                      ? "Terrain: berm outlines with height. Add berm, drag corners, click edge to insert, set height."
                      : next === "place"
                        ? "Buildings & kit: pick from the list. Cafés, bus stops & play kit — click map to place more. Yaw in the preview."
                        : next === "bins"
                          ? "Bins: click to place, drag or arrows to move."
                          : next === "trees"
                            ? level.trees.length === 0
                              ? "Foliage: pick a kind and click to place. Empty → none in the game."
                              : `Foliage: ${level.trees.length} placed — click to add, drag/arrows move, [ ] rotate beds, Delete remove.`
                            : next === "missions"
                              ? "Missions: Add a named draft pin, set start/end, drag it. Built-ins are red; placeholders amber."
                              : "Pan: drag or scroll to move the view. Zoom slider or Ctrl/Cmd+scroll to zoom.";
  fillPathSelect();
  fillElevSelect();
  fillMissionSelect();
  syncFoliageYawUi();
  draw();
}

ribbonTabs.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    setTool((btn as HTMLElement).dataset.tool as Tool);
  });
});

pathSelect.addEventListener("change", () => {
  activePath = Number(pathSelect.value) || 0;
  if (polyLines()[activePath]) {
    selected = { kind: "pathAll", path: activePath };
    status.textContent = `${polyNoun()} selected — arrow keys move the whole run (Shift = 1m, else 0.25m).`;
  }
  syncFairyColorUi();
  draw();
});

missionSelect.addEventListener("change", () => {
  selectMissionIndex(Number(missionSelect.value) || 0);
  const m = level.missionSpots[activeMission];
  status.textContent = m
    ? `${missionLabel(m)} — drag the pin or use arrow keys.`
    : "Missions";
  draw();
});
missionStartSelect.addEventListener("change", () => applyMissionClockFromUi());
missionEndSelect.addEventListener("change", () => applyMissionClockFromUi());
missionNameInput.addEventListener("change", () => applyMissionNameFromUi());
missionNameInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    applyMissionNameFromUi();
    missionNameInput.blur();
  }
});
addMissionBtn.addEventListener("click", () => {
  if (tool !== "missions") setTool("missions");
  addPlaceholderMission();
});
delMissionBtn.addEventListener("click", () => {
  if (tool !== "missions") setTool("missions");
  deleteActiveMission();
});

document.getElementById("add-path")!.addEventListener("click", () => {
  if (!isPolyTool()) setTool("paths");
  const [x, z] = [viewX, viewZ];
  pushHistory();
  activePath = addPolyLine([
    [x - 10, z],
    [x + 10, z],
  ]);
  fillPathSelect();
  syncFairyColorUi();
  dirty();
});

document.getElementById("del-path")!.addEventListener("click", () => {
  if (!isPolyTool()) setTool("paths");
  const lines = polyLines();
  if (lines.length === 0) return;
  pushHistory();
  removePolyLine(activePath);
  activePath = Math.max(0, activePath - 1);
  fillPathSelect();
  syncFairyColorUi();
  dirty();
});

fairyColorSelect.addEventListener("change", () => {
  if (tool !== "lights") return;
  ensureFairyRuns();
  const run = level.fairyLightRuns[activePath];
  if (!run) return;
  pushHistory();
  run.color = fairyStampColor();
  fillPathSelect();
  dirty();
});

elevSelect.addEventListener("change", () => {
  activeElev = Number(elevSelect.value) || 0;
  ensureElevZones();
  if (level.elevationZones[activeElev]) {
    selected = { kind: "elev", zone: activeElev, index: 0 };
    status.textContent = `Berm ${activeElev + 1} selected — drag corners or set height.`;
  }
  syncElevHeightUi();
  draw();
  walk.syncMarker();
});

document.getElementById("add-elev")!.addEventListener("click", () => {
  if (tool !== "elev") setTool("elev");
  pushHistory();
  seedElevZone(viewX, viewZ, Number(elevHeightInput.value) || 0.6);
  selected = { kind: "elev", zone: activeElev, index: 0 };
  fillElevSelect();
  dirty();
});

document.getElementById("del-elev")!.addEventListener("click", () => {
  if (tool !== "elev") setTool("elev");
  ensureElevZones();
  if (level.elevationZones.length === 0) return;
  pushHistory();
  level.elevationZones.splice(activeElev, 1);
  activeElev = Math.max(0, activeElev - 1);
  selected = null;
  fillElevSelect();
  dirty();
});

let elevHeightHistoryPushed = false;

elevHeightInput.addEventListener("input", () => {
  ensureElevZones();
  const zone = level.elevationZones[activeElev];
  const h = Number(elevHeightInput.value) || 0.6;
  elevHeightVal.textContent = `${h.toFixed(2)} m`;
  if (!zone) return;
  if (!elevHeightHistoryPushed) {
    pushHistory();
    elevHeightHistoryPushed = true;
  }
  zone.height = h;
  fillElevSelect();
  dirty();
});
elevHeightInput.addEventListener("change", () => {
  elevHeightHistoryPushed = false;
});
elevHeightInput.addEventListener("pointerup", () => {
  elevHeightHistoryPushed = false;
});

elevEdgeSelect.addEventListener("change", () => {
  ensureElevZones();
  const zone = level.elevationZones[activeElev];
  const v = elevEdgeSelect.value as ElevEdgeStyle;
  if (!zone || (v !== "wall" && v !== "steps" && v !== "slope")) return;
  if ((zone.edge ?? "wall") === v) return;
  pushHistory();
  zone.edge = v;
  fillElevSelect();
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

treeKindSelect.addEventListener("change", () => {
  const v = treeKindSelect.value as TreeKind;
  if (TREE_KINDS.includes(v)) placeTreeKind = v;
  syncFoliageYawUi();
});

fenceStyleSelect.addEventListener("change", () => {
  const v = fenceStyleSelect.value as FenceStyle;
  if (v !== "wire" && v !== "brick" && v !== "railings") return;
  if (level.fenceStyle === v) return;
  pushHistory();
  level.fenceStyle = v;
  dirty();
  status.textContent =
    v === "brick"
      ? "Fencing: brick wall with coping. Walk / reload the game to see it."
      : v === "railings"
        ? "Fencing: metal railings. Walk / reload the game to see it."
        : "Fencing: garden wire. Walk / reload the game to see it.";
});

function syncFoliageYawUi(): void {
  const showBeds =
    tool === "trees" &&
    (placeTreeKind === "flowerBed" ||
      (selected?.kind === "trees" &&
        level.trees[selected.index]?.kind === "flowerBed"));
  if (foliageYawGroup) foliageYawGroup.hidden = !showBeds;
  if (!foliageYawInput || !foliageYawVal) return;
  let yaw = placeFoliageYaw;
  if (
    selected?.kind === "trees" &&
    level.trees[selected.index]?.kind === "flowerBed"
  ) {
    yaw = level.trees[selected.index]!.yaw ?? 0;
  }
  const deg = Math.round(((yaw * 180) / Math.PI + 540) % 360 - 180);
  foliageYawInput.value = String(deg);
  foliageYawVal.textContent = `${deg}°`;
}

foliageYawInput?.addEventListener("input", () => {
  const deg = Number(foliageYawInput.value);
  const yaw = (deg * Math.PI) / 180;
  placeFoliageYaw = yaw;
  if (foliageYawVal) foliageYawVal.textContent = `${Math.round(deg)}°`;
  if (
    selected?.kind === "trees" &&
    level.trees[selected.index]?.kind === "flowerBed"
  ) {
    if (!yawHistoryPushed) {
      pushHistory();
      yawHistoryPushed = true;
    }
    level.trees[selected.index]!.yaw = yaw;
    writeLocalLevel(level);
    draw();
  }
});

foliageYawInput?.addEventListener("change", () => {
  yawHistoryPushed = false;
});

document.getElementById("auto-trees")!.addEventListener("click", () => {
  pushHistory();
  level.trees = [];
  selected = null;
  status.textContent =
    "Foliage cleared — the park will have none until you place some.";
  writeLocalLevel(level);
  draw();
});

document.getElementById("save")!.addEventListener("click", () => {
  void (async () => {
    writeLocalLevel(level);
    persistRefNow();
    persistViewNow();
    const shipped = await shipLevel(level);
    status.textContent = shipped
      ? "Saved to this browser and wrote public/levels/canoe-lake.json — reload the game (any device) to play it."
      : "Saved to this browser only (dev server write unavailable). Use Download JSON for the repo file.";
  })();
});

document.getElementById("download")!.addEventListener("click", () => {
  downloadLevel(level);
  status.textContent =
    "Downloaded. Drop into public/levels/canoe-lake.json to ship with the build.";
});

document.getElementById("reset")!.addEventListener("click", () => {
  void (async () => {
    if (
      !confirm(
        "Clear this browser’s save and reload the shipped level from the project?",
      )
    ) {
      return;
    }
    pushHistory();
    // Leave localStorage empty so the game also picks up the shipped JSON.
    clearLocalLevel();
    level = await loadShippedLevel();
    if (!Array.isArray(level.playParkOutline)) level.playParkOutline = [];
    if (!Array.isArray(level.carParkOutline)) level.carParkOutline = [];
    if (!Array.isArray(level.beachOutline)) level.beachOutline = [];
    if (!Array.isArray(level.elevationZones)) level.elevationZones = [];
    if (!Array.isArray(level.roadPolylines)) {
      level.roadPolylines = cloneLevel(DEFAULT_LEVEL).roadPolylines;
    }
    if (!Array.isArray(level.terraceRuns)) {
      level.terraceRuns = cloneLevel(DEFAULT_LEVEL).terraceRuns;
    }
    if (!Array.isArray(level.fairyLightRuns)) level.fairyLightRuns = [];
    if (!Array.isArray(level.trees)) level.trees = [];
    level.missionSpots = normalizeMissionSpots(level.missionSpots);
    activePath = 0;
    activeElev = 0;
    activeMission = 0;
    selected = null;
    fillPathSelect();
    fillElevSelect();
    fillMissionSelect();
    syncUndoBtn();
    status.textContent =
      "Browser save cleared — showing shipped level. Save only if you want to keep edits on this device.";
    draw();
    if (walk.isActive()) {
      walk.scheduleRebuild();
      walk.syncMarker();
    }
  })();
});

document.getElementById("import-file")!.addEventListener("change", async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (raw?.version !== 1) throw new Error("bad version");
    pushHistory();
    writeLocalLevel(raw as LevelData);
    level = readLocalLevel() ?? (raw as LevelData);
    if (!Array.isArray(level.playParkOutline)) level.playParkOutline = [];
    if (!Array.isArray(level.carParkOutline)) level.carParkOutline = [];
    if (!Array.isArray(level.beachOutline)) level.beachOutline = [];
    if (!Array.isArray(level.elevationZones)) level.elevationZones = [];
    if (!Array.isArray(level.trees)) level.trees = [];
    level.missionSpots = normalizeMissionSpots(level.missionSpots);
    activePath = 0;
    activeElev = 0;
    activeMission = 0;
    selected = null;
    fillPathSelect();
    fillElevSelect();
    fillMissionSelect();
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
    flipH?: boolean;
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
    if (opts.flipH != null) refFlipH = opts.flipH;
  } else {
    refRotDeg = 0;
    refFlipH = false;
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
  if (walk.isActive()) walk.syncOverlay();
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
  if (walk.isActive()) walk.syncOverlay();
});

mapOpacityInput.addEventListener("input", () => {
  mapOpacity = Number(mapOpacityInput.value) / 100;
  syncRefPanel();
  persistRef();
  draw();
  if (walk.isActive()) walk.syncOverlay();
});

refSizeInput.addEventListener("input", () => {
  refWidth = Number(refSizeInput.value);
  syncRefPanel();
  persistRef();
  draw();
  if (walk.isActive()) walk.syncOverlay();
});

refRotInput.addEventListener("input", () => {
  refRotDeg = Number(refRotInput.value);
  syncRefPanel();
  persistRef();
  draw();
  if (walk.isActive()) walk.syncOverlay();
});

document.getElementById("ref-rot-reset")!.addEventListener("click", () => {
  refRotDeg = 0;
  syncRefPanel();
  persistRef(0);
  draw();
  if (walk.isActive()) walk.syncOverlay();
});

document.getElementById("ref-flip")!.addEventListener("click", () => {
  if (!refImage) return;
  refFlipH = !refFlipH;
  persistRef(0);
  status.textContent = refFlipH
    ? "Background flipped horizontally."
    : "Background flip cleared.";
  draw();
  if (walk.isActive()) walk.syncOverlay();
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
  if (walk.isActive()) walk.syncOverlay();
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("dblclick", onDblClick);
canvas.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", resize);

const walkToggle = document.getElementById("walk-toggle") as HTMLButtonElement;
const debugToggle = document.getElementById("debug-toggle") as HTMLButtonElement;
const debugMenu = document.getElementById("debug-menu") as HTMLDivElement;

function setDebugMenuOpen(open: boolean): void {
  debugMenu.hidden = !open;
  debugToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

debugToggle.addEventListener("click", (ev) => {
  ev.stopPropagation();
  setDebugMenuOpen(debugMenu.hidden);
});

debugMenu.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest(
    "[data-debug-from]",
  ) as HTMLElement | null;
  if (!btn?.dataset.debugFrom) return;
  const from = btn.dataset.debugFrom;
  setDebugMenuOpen(false);
  // Real game — no walk-mode Maps underlay, intro skipped via ?debug=1.
  window.open(`./?debug=1&from=${encodeURIComponent(from)}`, "_blank");
  status.textContent = `Debug: opening game (${from}, no intro)…`;
});

document.addEventListener("click", () => {
  if (!debugMenu.hidden) setDebugMenuOpen(false);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !debugMenu.hidden) setDebugMenuOpen(false);
});

walk = new WalkMode({
  getLevel: () => level,
  getRefOverlay: () => ({
    image: refImage,
    x: refX,
    z: refZ,
    width: refWidth,
    rotDeg: refRotDeg,
    flipH: refFlipH,
    imageOpacity: refOpacity,
    mapOpacity,
  }),
  onAimClick: (aim) => {
    const rayHit = pickWalkRay(
      aim.originX,
      aim.originY,
      aim.originZ,
      aim.dirX,
      aim.dirY,
      aim.dirZ,
    );
    if (rayHit) {
      if (rayHit.kind === "path" && aim.shift) {
        selected = { kind: "pathAll", path: rayHit.path };
        activePath = rayHit.path;
        fillPathSelect();
        draw();
        walk.syncMarker();
        return true;
      }
      applyHitSelection(rayHit);
      return true;
    }
    actAtWorld(aim.groundX, aim.groundZ, aim.shift);
    return selectionWorldPos() !== null;
  },
  onGroundClick: ({ x, z, shift }) => {
    actAtWorld(x, z, shift);
  },
  onGroundDragStart: () => {
    pushHistory();
  },
  onGroundDrag: (x, z) => {
    if (!moveSelectedTo(x, z)) return;
    writeLocalLevel(level);
    draw();
    walk.syncMarker();
  },
  onGroundDragEnd: () => {
    dirty();
  },
  onDelete: () => {
    deleteSelected();
  },
  onRotate: (dir, shift) => {
    rotateSelected(dir, shift, true);
  },
  onUndo: () => {
    undo();
  },
  onExit: () => {
    walk.exit();
    walkToggle.textContent = "Walk";
    status.textContent =
      "Back to map — layout is saved in this browser. Reload the game to play it.";
    draw();
  },
  onStatus: (msg) => {
    status.textContent = msg;
  },
  getSelectionXZ: () => selectionWorldPos(),
});

walkToggle.addEventListener("click", () => {
  if (walk.isActive()) {
    walk.exit();
    walkToggle.textContent = "Walk";
    status.textContent = "Back to map.";
    draw();
    return;
  }
  if (tool === "bg") setTool("trees");
  walk.enter();
  walkToggle.textContent = "Map";
  resize();
});

fillPathSelect();
fillElevSelect();
fillMissionSelect();
buildPlaceCatalog();
syncRefPanel();
syncUndoBtn();
syncZoomSlider();
resize();
setTool("shore");

placeYawInput.addEventListener("input", () => {
  const deg = Number(placeYawInput.value);
  const yaw = (deg * Math.PI) / 180;
  setStampOrPlaceYaw(yaw, !yawHistoryPushed);
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
    flipH: saved.flipH,
  });
});