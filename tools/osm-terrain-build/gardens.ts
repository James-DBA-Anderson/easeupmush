import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import earcut from "earcut";
import { localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OS_BUILDINGS = `${DATA_DIR}/portsmouth-os-buildings.json`;
const OUT_TREES = `${DATA_DIR}/portsmouth-trees.json`;
const GAME_TREES = path.resolve("../../apps/simpompey/public/models/portsmouth-trees.json");

type Pt = { x: number; y: number };
type House = { pts: Pt[]; cx: number; cy: number; area: number; minS: number; maxS: number };

function uniqueRing(nodes: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === n[0] && prev[1] === n[1]) continue;
    out.push(n);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    const xi = pts[i].x, xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function triangulateRing(pts: Pt[]): number[] {
  if (pts.length < 3) return [];
  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);
  const idx = earcut(flat, undefined, 2);
  const out: number[] = [];
  for (const i of idx) out.push(pts[i].x, pts[i].y);
  return out;
}

function skipBuilding(type: string): boolean {
  return /^(apartments|residential|industrial|retail|commercial|warehouse|supermarket|school|church|cathedral|garage|garages|grandstand|stadium|hangar|hospital|hotel|parking|ruins|construction|kiosk|shed|greenhouse|container|service|office|train_station)$/.test(
    type,
  );
}

type Seg = { ax: number; ay: number; bx: number; by: number };

function distToSeg(x: number, y: number, s: Seg): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
  return Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t));
}

class RoadIndex {
  private cell = 14;
  private bins = new Map<string, Seg[]>();
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  add(a: Pt, b: Pt) {
    const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    const x0 = Math.floor(Math.min(a.x, b.x) / this.cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / this.cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / this.cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / this.cell);
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        const k = `${xi},${yi}`;
        const bin = this.bins.get(k);
        if (bin) bin.push(seg);
        else this.bins.set(k, [seg]);
      }
    }
  }
  nearestPoint(x: number, y: number, maxD: number): Pt | null {
    const r = Math.ceil(maxD / this.cell) + 1;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = maxD;
    let pt: Pt | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const s of bin) {
          const d = distToSeg(x, y, s);
          if (d < best) {
            best = d;
            const tx = s.bx - s.ax;
            const ty = s.by - s.ay;
            const l2 = tx * tx + ty * ty || 1;
            const t = Math.max(0, Math.min(1, ((x - s.ax) * tx + (y - s.ay) * ty) / l2));
            pt = { x: s.ax + tx * t, y: s.ay + ty * t };
          }
        }
      }
    }
    return pt;
  }
  within(x: number, y: number, maxD: number): boolean {
    const r = Math.ceil(maxD / this.cell) + 1;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const s of bin) {
          if (distToSeg(x, y, s) <= maxD) return true;
        }
      }
    }
    return false;
  }
}

class BuildingIndex {
  private cell = 16;
  private bins = new Map<string, House[]>();
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  add(h: House) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of h.pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        const k = `${xi},${yi}`;
        const b = this.bins.get(k);
        if (b) {
          if (!b.includes(h)) b.push(h);
        } else this.bins.set(k, [h]);
      }
    }
  }
  hits(x: number, y: number, ignore?: House): boolean {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const h of bin) {
          if (h === ignore) continue;
          if (pointInPoly(x, y, h.pts)) return true;
        }
      }
    }
    return false;
  }
}

function isHouse(type: string, area: number, minS: number, maxS: number): boolean {
  if (skipBuilding(type)) return false;
  if (area < 32 || area > 3600) return false;
  if (minS > 15 || maxS > 240) return false;
  return true;
}

function makeHouse(pts: Pt[]): House | null {
  if (pts.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  const area = Math.abs(signedArea(pts));
  const minS = Math.min(maxX - minX, maxY - minY);
  const maxS = Math.max(maxX - minX, maxY - minY);
  return { pts, cx, cy, area, minS, maxS };
}

function backEdge(pts: Pt[], cx: number, cy: number, bx: number, by: number): { a: Pt; b: Pt } | null {
  let best = -Infinity;
  let edge: { a: Pt; b: Pt } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 3.2 || len > 260) continue;
    const ex = (b.x - a.x) / len;
    const ey = (b.y - a.y) / len;
    const facing = -ey * bx + ex * by;
    if (Math.abs(facing) < 0.42) continue;
    const score = (mx - cx) * bx + (my - cy) * by;
    if (score > best) {
      best = score;
      edge = facing >= 0 ? { a, b } : { a: b, b: a };
    }
  }
  return edge;
}

function isTerraceRow(house: House, tx: number, ty: number, buildings: BuildingIndex): boolean {
  if (house.maxS > 16 && house.maxS > house.minS * 1.7 && house.minS <= 14) return true;
  const side = house.minS * 0.55 + 2.2;
  return (
    buildings.hits(house.cx + tx * side, house.cy + ty * side, house) ||
    buildings.hits(house.cx - tx * side, house.cy - ty * side, house)
  );
}

const MIN_GARDEN = 4.4;
const MAX_GARDEN = 20;

function terraceGardenDepth(
  mx: number,
  my: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  dx: number,
  dy: number,
  house: House,
  houses: BuildingIndex,
  buildings: BuildingIndex,
  roads: RoadIndex,
): number | null {
  let hit = 0;
  for (let s = 1.2; s <= MAX_GARDEN; s += 0.5) {
    const x = mx + dx * s;
    const y = my + dy * s;
    if (roads.within(x, y, 2.7)) return null;
    if (houses.hits(x, y, house)) {
      hit = s;
      break;
    }
    if (buildings.hits(x, y, house)) return null;
  }
  if (hit < MIN_GARDEN) return null;
  const gap = hit - 0.4;
  for (let s = 1.2; s <= gap; s += 0.65) {
    if (roads.within(ax + dx * s, ay + dy * s, 2.5)) return null;
    if (roads.within(bx + dx * s, by + dy * s, 2.5)) return null;
  }
  return gap * 0.5;
}

function splitEdge(a: Pt, b: Pt, target = 6.4): Array<{ a: Pt; b: Pt }> {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.round(len / target));
  const out: Array<{ a: Pt; b: Pt }> = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    out.push({
      a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
      b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
    });
  }
  return out;
}

function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  const nodeMap = new Map<number, [number, number]>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (inBox(lat, lon)) {
      nodeMap.set(Number(m[1]), [lat, lon]);
    }
  }

  const houses: House[] = [];
  const allBuildings: House[] = [];
  const roads = new RoadIndex();
  const blocked: Pt[][] = [];
  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);
    const tags = parseTags(wayStr);
    const ndRe = /<nd\s+ref="(\d+)"/g;
    const nodes: [number, number][] = [];
    let ndCount = 0;
    let ndMatch: RegExpExecArray | null;
    while ((ndMatch = ndRe.exec(wayStr)) !== null) {
      ndCount++;
      const n = nodeMap.get(Number(ndMatch[1]));
      if (n) nodes.push(n);
    }
    if (ndCount === 0 || nodes.length !== ndCount) continue;
    const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));

    if (tags.building && tags.building !== "no" && pts.length >= 3) {
      const h = makeHouse(pts);
      if (!h) continue;
      allBuildings.push(h);
      if (isHouse(tags.building, h.area, h.minS, h.maxS)) houses.push(h);
      continue;
    }
    if (tags.highway && nodes.length >= 2 && !["pedestrian", "footway", "path", "track", "steps", "cycleway"].some((p) => tags.highway.startsWith(p))) {
      for (let i = 0; i < pts.length - 1; i++) roads.add(pts[i], pts[i + 1]);
      continue;
    }
    if (
      tags.leisure === "park" ||
      tags.leisure === "garden" ||
      tags.leisure === "pitch" ||
      tags.landuse === "recreation_ground" ||
      tags.natural === "wood" ||
      tags.natural === "water" ||
      tags.natural === "beach"
    ) {
      if (pts.length >= 3) blocked.push(pts);
    }
  }

  const bIndex = new BuildingIndex();
  const houseIndex = new BuildingIndex();
  for (const h of allBuildings) bIndex.add(h);
  for (const h of houses) houseIndex.add(h);

  if (existsSync(OS_BUILDINGS)) {
    const extra = JSON.parse(readFileSync(OS_BUILDINGS, "utf8")) as Array<[number, number][] | { nodes: [number, number][] }>;
    for (const item of extra) {
      const nodes = Array.isArray(item) ? item : item.nodes;
      if (!nodes || nodes.length < 3) continue;
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      const h = makeHouse(pts);
      if (!h) continue;
      if (bIndex.hits(h.cx, h.cy)) continue;
      allBuildings.push(h);
      bIndex.add(h);
      if (isHouse("yes", h.area, h.minS, h.maxS)) {
        houses.push(h);
        houseIndex.add(h);
      }
    }
  }

  const garden: number[] = [];
  let lawns = 0;

  for (const house of houses) {
    const road = roads.nearestPoint(house.cx, house.cy, 22);
    if (!road) continue;
    let dx = house.cx - road.x;
    let dy = house.cy - road.y;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const tx = -dy;
    const ty = dx;
    if (!isTerraceRow(house, tx, ty, bIndex)) continue;
    const edge = backEdge(house.pts, house.cx, house.cy, dx, dy);
    if (!edge) continue;
    const plots = splitEdge(edge.a, edge.b, 7.2);
    for (const plot of plots) {
      const mx = (plot.a.x + plot.b.x) * 0.5;
      const my = (plot.a.y + plot.b.y) * 0.5;
      if (roads.within(mx, my, 3.2)) continue;
      const depth = terraceGardenDepth(
        mx,
        my,
        plot.a.x,
        plot.a.y,
        plot.b.x,
        plot.b.y,
        dx,
        dy,
        house,
        houseIndex,
        bIndex,
        roads,
      );
      if (depth === null) continue;
      let blockedYard = false;
      for (const ring of blocked) {
        if (pointInPoly(mx + dx * (depth * 0.5), my + dy * (depth * 0.5), ring)) {
          blockedYard = true;
          break;
        }
      }
      if (blockedYard) continue;
      const a2 = { x: plot.a.x + dx * depth, y: plot.a.y + dy * depth };
      const b2 = { x: plot.b.x + dx * depth, y: plot.b.y + dy * depth };
      const poly = [plot.a, plot.b, b2, a2];
      if (
        roads.within(a2.x, a2.y, 2.4) ||
        roads.within(b2.x, b2.y, 2.4) ||
        roads.within((a2.x + b2.x) * 0.5, (a2.y + b2.y) * 0.5, 2.4)
      ) {
        continue;
      }
      const tris = triangulateRing(poly);
      if (tris.length < 6) continue;
      garden.push(...tris);
      lawns++;
    }
  }

  if (!existsSync(OUT_TREES)) {
    console.error("Run trees first");
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(OUT_TREES, "utf8")) as {
    trees: unknown;
    cover: Record<string, number[]>;
    fences?: number[][];
    meta?: Record<string, unknown>;
  };
  prev.cover = prev.cover ?? {};
  prev.cover.garden = garden;
  prev.cover.courtyard = [];
  delete prev.fences;
  prev.meta = { ...prev.meta, gardens: lawns, courtyards: 0, fences: 0 };
  writeFileSync(OUT_TREES, JSON.stringify(prev));
  mkdirSync(path.dirname(GAME_TREES), { recursive: true });
  copyFileSync(OUT_TREES, GAME_TREES);
  console.log(`Gardens: ${lawns} terrace lawns, no fences`);
}

main();
