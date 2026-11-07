import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import earcut from "earcut";
import { extractVomPeaks } from "./vom.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OS_BUILDINGS = `${DATA_DIR}/portsmouth-os-buildings.json`;
const OUT_TREES = `${DATA_DIR}/portsmouth-trees.json`;
const GAME_TREES = path.resolve("../../apps/simpompey/public/models/portsmouth-trees.json");

const SOUTH = 50.76;
const WEST = -1.17;
const NORTH = 50.835;
const EAST = -1.02;

const R_EARTH = 6_371_000;
const MID_LAT = (SOUTH + NORTH) / 2;
const SCALE_X = (Math.PI / 180) * R_EARTH * Math.cos((MID_LAT * Math.PI) / 180);
const SCALE_Y = (Math.PI / 180) * R_EARTH;

function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

type Pt = { x: number; y: number };
type Ring = { pts: Pt[]; minX: number; maxX: number; minY: number; maxY: number };
type TreeKind = "broadleaf" | "pine";
type Tree = { x: number; z: number; h: number; kind: TreeKind };
type CoverKind = "wood" | "park" | "grass" | "sand" | "paved" | "railway" | "allotment" | "garden" | "courtyard";

const CELL = 40;
const OCC_CELL = 8;
const MAX_TREES = 80_000;

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

function ringBox(pts: Pt[]): Ring {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { pts, minX, maxX, minY, maxY };
}

function ringSpanM(r: Ring): number {
  return Math.hypot(r.maxX - r.minX, r.maxY - r.minY);
}

function isGiantBuilding(r: Ring): boolean {
  return (r.maxX - r.minX) * (r.maxY - r.minY) > 40_000;
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

function hash01(x: number, z: number, salt = 0): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 17.13) * 43758.5453;
  return n - Math.floor(n);
}

function treeHeight(x: number, z: number, tagged?: string): number {
  if (tagged) {
    const m = /([0-9]+(?:\.[0-9]+)?)/.exec(tagged);
    if (m) {
      const h = Number(m[1]);
      if (Number.isFinite(h) && h >= 2 && h <= 40) return h;
    }
  }
  return 7 + hash01(x, z, 1) * 11;
}

function isPineTags(tags: Record<string, string>): boolean {
  const blob = [tags.genus, tags.species, tags.taxon, tags.leaf_type, tags["leaf_cycle"]].filter(Boolean).join(" ").toLowerCase();
  return /pinus|pine|needle|conifer|evergreen/.test(blob);
}

const ROW_SPACING = 7.4;

function samplePolyline(pts: Pt[], spacing: number, closed: boolean): Pt[] {
  const path = pts.slice();
  if (closed && path.length >= 3) {
    const a = path[0];
    const b = path[path.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 0.4) path.push({ x: a.x, y: a.y });
  }
  if (path.length < 2) return [];
  const out: Pt[] = [{ x: path[0].x, y: path[0].y }];
  let acc = 0;
  let next = spacing;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    while (next <= acc + len + 1e-6) {
      const t = (next - acc) / len;
      out.push({ x: path[i].x + dx * t, y: path[i].y + dy * t });
      next += spacing;
    }
    acc += len;
  }
  const last = path[path.length - 1];
  const prev = out[out.length - 1];
  if (prev && Math.hypot(last.x - prev.x, last.y - prev.y) > spacing * 0.4) {
    out.push({ x: last.x, y: last.y });
  }
  return out;
}

function closedNodes(nodes: [number, number][]): boolean {
  if (nodes.length < 4) return false;
  const a = nodes[0];
  const b = nodes[nodes.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function coverKindOf(tags: Record<string, string>): CoverKind | null {
  if (tags.natural === "wood" || tags.landuse === "forest" || tags.landuse === "orchard") {
    return "wood";
  }
  if (
    tags.natural === "beach" ||
    tags.natural === "sand" ||
    tags.natural === "shingle" ||
    tags.natural === "dune"
  ) {
    return "sand";
  }
  const surface = (tags.surface ?? "").toLowerCase();
  const pavedSurface = /asphalt|concrete|paving|sett|cobble|artificial|tartan|acrylic/.test(surface);
  if (tags.landuse === "railway") return "railway";
  if (
    tags.amenity === "parking" ||
    tags.amenity === "parking_space" ||
    tags.landuse === "garages" ||
    tags.leisure === "playground" ||
    tags.leisure === "track" ||
    (tags.highway === "pedestrian" && tags.area === "yes")
  ) {
    return "paved";
  }
  if (tags.leisure === "pitch") return pavedSurface ? "paved" : "grass";
  if (tags.landuse === "allotments") return "allotment";
  if (
    tags.landuse === "grass" ||
    tags.leisure === "common" ||
    tags.leisure === "nature_reserve" ||
    tags.natural === "grassland" ||
    tags.natural === "scrub" ||
    tags.natural === "heath" ||
    tags.natural === "wetland" ||
    tags.landuse === "meadow" ||
    tags.landuse === "village_green" ||
    tags.leisure === "golf_course"
  ) {
    return "grass";
  }
  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.landuse === "recreation_ground" ||
    tags.landuse === "cemetery" ||
    tags.leisure === "cemetery"
  ) {
    return "park";
  }
  return null;
}

function isWaterPolygon(tags: Record<string, string>): boolean {
  if (tags.natural === "water") return true;
  if (tags.landuse === "reservoir" || tags.landuse === "basin") return true;
  if (tags.water && tags.water !== "no") return true;
  return tags.waterway === "riverbank" || tags.waterway === "dock";
}

function isBare(tags: Record<string, string>): boolean {
  return (
    tags.natural === "beach" ||
    tags.natural === "sand" ||
    tags.natural === "bare_rock" ||
    tags.leisure === "pitch" ||
    tags.leisure === "track" ||
    tags.leisure === "playground"
  );
}

class SpatialRings {
  private cells = new Map<string, Ring[]>();
  add(ring: Ring) {
    const x0 = Math.floor(ring.minX / CELL);
    const x1 = Math.floor(ring.maxX / CELL);
    const y0 = Math.floor(ring.minY / CELL);
    const y1 = Math.floor(ring.maxY / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        const list = this.cells.get(key);
        if (list) list.push(ring);
        else this.cells.set(key, [ring]);
      }
    }
  }
  has(x: number, y: number, pad = 0): boolean {
    if (pad > 0) {
      if (this.has(x, y) || this.has(x + pad, y) || this.has(x - pad, y) || this.has(x, y + pad) || this.has(x, y - pad)) {
        return true;
      }
      return false;
    }
    const list = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
    if (!list) return false;
    for (const r of list) {
      if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) continue;
      if (pointInPoly(x, y, r.pts)) return true;
    }
    return false;
  }
}

function triangulateRing(pts: Pt[], holes: Pt[][] = []): number[] {
  if (pts.length < 3) return [];
  const rings = [pts, ...holes.filter((h) => h.length >= 3)];
  const flat: number[] = [];
  const holeIdx: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) holeIdx.push(flat.length / 2);
    for (const p of rings[r]) flat.push(p.x, p.y);
  }
  const idx = earcut(flat, holeIdx.length ? holeIdx : undefined, 2);
  const out: number[] = [];
  for (const i of idx) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

function stitchPolylines(parts: Pt[][]): Pt[][] {
  const chains = parts.filter((p) => p.length >= 2).map((p) => p.slice());
  const rings: Pt[][] = [];
  const joinTol = 1.2;
  while (chains.length) {
    const ring = chains.pop()!;
    for (let guard = 0; guard < 400; guard++) {
      const start = ring[0];
      const end = ring[ring.length - 1];
      if (Math.hypot(start.x - end.x, start.y - end.y) < joinTol && ring.length >= 4) break;
      let found = -1;
      let rev = false;
      let atStart = false;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        const cs = c[0];
        const ce = c[c.length - 1];
        if (Math.hypot(end.x - cs.x, end.y - cs.y) < joinTol) {
          found = i;
          break;
        }
        if (Math.hypot(end.x - ce.x, end.y - ce.y) < joinTol) {
          found = i;
          rev = true;
          break;
        }
        if (Math.hypot(start.x - ce.x, start.y - ce.y) < joinTol) {
          found = i;
          atStart = true;
          break;
        }
        if (Math.hypot(start.x - cs.x, start.y - cs.y) < joinTol) {
          found = i;
          rev = true;
          atStart = true;
          break;
        }
      }
      if (found < 0) break;
      const add = chains.splice(found, 1)[0];
      if (rev) add.reverse();
      if (atStart) ring.unshift(...add.slice(0, -1));
      else ring.push(...add.slice(1));
    }
    const closed: Pt[] = [];
    for (const p of ring) {
      const prev = closed[closed.length - 1];
      if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.15) continue;
      closed.push(p);
    }
    if (closed.length > 1) {
      const a = closed[0];
      const b = closed[closed.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < joinTol) closed.pop();
    }
    if (closed.length >= 3) rings.push(closed);
  }
  return rings;
}

const COVER_SPAN = 8000;

async function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  console.log(`XML size: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  const nodeMap = new Map<number, [number, number]>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST) {
      nodeMap.set(Number(m[1]), [lat, lon]);
    }
  }
  console.log(`  nodes in bbox: ${nodeMap.size}`);

  const trees: Tree[] = [];
  const osmExtras: Tree[] = [];
  const occupied = new Set<string>();
  const occupy = (x: number, z: number) => occupied.add(`${Math.round(x / OCC_CELL)},${Math.round(z / OCC_CELL)}`);
  const taken = (x: number, z: number) => occupied.has(`${Math.round(x / OCC_CELL)},${Math.round(z / OCC_CELL)}`);

  const buildings = new SpatialRings();
  const blocked = new SpatialRings();
  const cover: Record<CoverKind, number[]> = {
    wood: [],
    park: [],
    grass: [],
    sand: [],
    paved: [],
    railway: [],
    allotment: [],
    garden: [],
    courtyard: [],
  };
  const coverCounts: Record<CoverKind, number> = {
    wood: 0,
    park: 0,
    grass: 0,
    sand: 0,
    paved: 0,
    railway: 0,
    allotment: 0,
    garden: 0,
    courtyard: 0,
  };

  type TreeRow = { pts: Pt[]; tags: Record<string, string>; closed: boolean };
  const treeRows: TreeRow[] = [];
  let treeNodes = 0;
  nodeRe.lastIndex = 0;
  while ((m = nodeRe.exec(buf)) !== null) {
    const gt = buf.indexOf(">", m.index);
    if (gt === -1) continue;
    const head = buf.slice(m.index, gt + 1);
    if (head.endsWith("/>")) continue;
    const end = buf.indexOf("</node>", gt);
    if (end === -1) continue;
    const tags = parseTags(buf.slice(gt + 1, end));
    if (tags.natural !== "tree") continue;
    const n = nodeMap.get(Number(m[1]));
    if (!n) continue;
    const { x, y: z } = localM(n[0], n[1]);
    const kind: TreeKind = isPineTags(tags) || hash01(x, z, 2) < 0.04 ? "pine" : "broadleaf";
    osmExtras.push({ x, z, h: treeHeight(x, z, tags.height), kind });
    treeNodes++;
  }
  console.log(`  OSM tree nodes: ${treeNodes}`);

  let buildingCount = 0;
  let woodCount = 0;
  let blockedCount = 0;

  const emitCover = (kind: CoverKind, pts: Pt[], holes: Pt[][] = []) => {
    if (pts.length < 3) return;
    const ring = ringBox(pts);
    if (ringSpanM(ring) > COVER_SPAN) return;
    const tris = triangulateRing(pts, holes);
    if (tris.length < 6) return;
    cover[kind].push(...tris);
    coverCounts[kind]++;
    if (kind === "wood") woodCount++;
  };

  type CoverRel = { kind: CoverKind; members: { ref: number; role: string; pts: Pt[] }[] };
  const pendingRels: CoverRel[] = [];
  const relNeedWays = new Set<number>();
  const relStartRe = /<relation\s+id="(\d+)">/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relStartRe.exec(buf)) !== null) {
    const relStart = relMatch.index;
    const relEnd = buf.indexOf("</relation>", relStart);
    if (relEnd === -1) continue;
    const relStr = buf.slice(relStart, relEnd + 11);
    const tags = parseTags(relStr);
    const kind = coverKindOf(tags);
    if (!kind) continue;
    const members: CoverRel["members"] = [];
    const memberRe = /<member\s+type="(\w+)"\s+ref="(\d+)"\s+role="([^"]*)"/g;
    let mem: RegExpExecArray | null;
    while ((mem = memberRe.exec(relStr)) !== null) {
      if (mem[1] !== "way") continue;
      const ref = Number(mem[2]);
      members.push({ ref, role: mem[3], pts: [] });
      relNeedWays.add(ref);
    }
    if (members.length) pendingRels.push({ kind, members });
  }

  const wayStartRe = /<way\s+id="(\d+)">/g;
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

    const wayId = Number(wayMatch[1]);
    if (relNeedWays.has(wayId) && nodes.length >= 2) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      for (const rel of pendingRels) {
        for (const mem of rel.members) {
          if (mem.ref === wayId && mem.pts.length < 2) mem.pts = pts;
        }
      }
    }

    if (tags.building && tags.building !== "no" && nodes.length >= 3) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      if (pts.length >= 3) {
        const ring = ringBox(pts);
        if (!isGiantBuilding(ring)) {
          buildings.add(ring);
          buildingCount++;
        }
      }
      continue;
    }

    if ((isWaterPolygon(tags) || isBare(tags)) && nodes.length >= 3) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      if (pts.length >= 3) {
        const ring = ringBox(pts);
        if (ringSpanM(ring) <= 4000) {
          blocked.add(ring);
          blockedCount++;
        }
      }
    }

    if (tags.natural === "tree_row" && nodes.length >= 2) {
      const closed = closedNodes(nodes);
      const pts = (closed ? uniqueRing(nodes) : nodes).map(([lat, lon]) => localM(lat, lon));
      if (pts.length >= 2) treeRows.push({ pts, tags, closed });
    }

    const kind = coverKindOf(tags);
    if (kind && nodes.length >= 3) {
      emitCover(kind, uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon)));
    }
  }

  let relCover = 0;
  for (const rel of pendingRels) {
    const outers = stitchPolylines(
      rel.members.filter((m) => m.role !== "inner" && m.pts.length >= 2).map((m) => m.pts),
    );
    for (const outer of outers) {
      const before = coverCounts[rel.kind];
      emitCover(rel.kind, outer);
      if (coverCounts[rel.kind] > before) relCover++;
    }
  }

  if (existsSync(OS_BUILDINGS)) {
    const extra = JSON.parse(readFileSync(OS_BUILDINGS, "utf8")) as Array<[number, number][] | { nodes: [number, number][] }>;
    let osAdded = 0;
    for (const item of extra) {
      const nodes = Array.isArray(item) ? item : item.nodes;
      if (!nodes || nodes.length < 3) continue;
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      if (pts.length < 3) continue;
      const ring = ringBox(pts);
      if (isGiantBuilding(ring)) continue;
      buildings.add(ring);
      osAdded++;
    }
    console.log(`  OS extra footprints for tree skip: ${osAdded}`);
  }

  console.log(`  buildings: ${buildingCount}`);
  console.log(`  woods (cover): ${woodCount}`);
  console.log(`  blocked water/beach/pitch: ${blockedCount}`);
  console.log(`  tree rows: ${treeRows.length}`);
  console.log(`  cover relations: ${relCover}`);
  console.log(`  cover polys`, coverCounts);

  type PrevVegetation = {
    trees?: Tree[];
    cover?: Partial<Record<CoverKind, number[]>>;
    fences?: number[][];
  };
  const prevFile: PrevVegetation | null = existsSync(OUT_TREES)
    ? (JSON.parse(readFileSync(OUT_TREES, "utf8")) as PrevVegetation)
    : null;
  const keepGardens = (nextCover: Record<CoverKind, number[]>) => {
    if (prevFile?.cover?.garden?.length) nextCover.garden = prevFile.cover.garden;
    if (prevFile?.cover?.courtyard?.length) nextCover.courtyard = prevFile.cover.courtyard;
  };

  const plant = (
    x: number,
    z: number,
    h: number,
    kind: TreeKind,
    opts?: { pad?: number; skipTaken?: boolean },
  ) => {
    if (trees.length >= MAX_TREES) return false;
    if (!opts?.skipTaken && taken(x, z)) return false;
    if (buildings.has(x, z, opts?.pad ?? 2)) return false;
    if (blocked.has(x, z)) return false;
    trees.push({ x, z, h, kind });
    occupy(x, z);
    return true;
  };

  const plantRows = () => {
    for (const t of trees) occupy(t.x, t.z);
    const existing = new Set(occupied);
    const rowCells = new Set<string>();
    let planted = 0;
    for (const row of treeRows) {
      const pineRow = isPineTags(row.tags);
      const spots = samplePolyline(row.pts, ROW_SPACING, row.closed);
      for (const p of spots) {
        const x = p.x + (hash01(p.x, p.y, 8) - 0.5) * 0.65;
        const z = p.y + (hash01(p.x, p.y, 9) - 0.5) * 0.65;
        const fine = `${Math.round(x / 4)},${Math.round(z / 4)}`;
        if (rowCells.has(fine)) continue;
        const coarse = `${Math.round(x / OCC_CELL)},${Math.round(z / OCC_CELL)}`;
        if (existing.has(coarse)) continue;
        const kind: TreeKind = pineRow || hash01(x, z, 2) < 0.03 ? "pine" : "broadleaf";
        const h = Math.min(16, Math.max(4.5, treeHeight(x, z, row.tags.height) * 0.82));
        if (plant(x, z, h, kind, { pad: 0.7, skipTaken: true })) {
          rowCells.add(fine);
          planted++;
        }
      }
    }
    return planted;
  };

  const coverOnly = process.argv.includes("--cover-only");
  if (coverOnly && prevFile?.trees?.length) {
    trees.push(...prevFile.trees);
    keepGardens(cover);
    const rowsKept = plantRows();
    const payload = {
      trees,
      cover,
      meta: {
        treeNodes,
        woods: woodCount,
        rows: treeRows.length,
        rowsKept,
        total: trees.length,
        cover: coverCounts,
        note: "EA VOM trees; OSM tree rows; OSM land cover",
      },
    };
    writeFileSync(OUT_TREES, JSON.stringify(payload));
    mkdirSync(path.dirname(GAME_TREES), { recursive: true });
    copyFileSync(OUT_TREES, GAME_TREES);
    console.log(`Updated cover + ${rowsKept} tree-row trees on ${trees.length} trees → ${OUT_TREES}`);
    console.log(
      `  cover verts wood/park/grass/sand/paved/railway/allotment: ${cover.wood.length / 2} / ${cover.park.length / 2} / ${cover.grass.length / 2} / ${cover.sand.length / 2} / ${cover.paved.length / 2} / ${cover.railway.length / 2} / ${cover.allotment.length / 2}`,
    );
    return;
  }

  console.log("Fetching EA Vegetation Object Model…");
  const vomPeaks = await extractVomPeaks({
    south: SOUTH,
    west: WEST,
    north: NORTH,
    east: EAST,
    localM,
    cacheDir: `${DATA_DIR}/vom`,
  });
  console.log(`  VOM peaks: ${vomPeaks.length}`);
  let vomKept = 0;
  vomPeaks.sort((a, b) => b.h - a.h);
  for (const p of vomPeaks) {
    const kind: TreeKind = hash01(p.x, p.z, 5) < 0.04 ? "pine" : "broadleaf";
    if (plant(p.x, p.z, Math.min(28, Math.max(4, p.h)), kind)) vomKept++;
  }
  console.log(`  VOM planted: ${vomKept}`);

  let extrasKept = 0;
  for (const t of osmExtras) {
    if (plant(t.x, t.z, t.h, t.kind)) extrasKept++;
  }
  console.log(`  OSM extras planted: ${extrasKept}`);
  const rowsKept = plantRows();
  console.log(`  OSM tree rows planted: ${rowsKept} from ${treeRows.length} rows`);

  keepGardens(cover);
  const payload = {
    trees,
    cover,
    meta: {
      treeNodes,
      woods: woodCount,
      vomPeaks: vomPeaks.length,
      vomKept,
      extrasKept,
      rows: treeRows.length,
      rowsKept,
      total: trees.length,
      note: "EA VOM local maxima (OGL) + OSM tree nodes + OSM tree rows",
    },
  };
  writeFileSync(OUT_TREES, JSON.stringify(payload));
  mkdirSync(path.dirname(GAME_TREES), { recursive: true });
  copyFileSync(OUT_TREES, GAME_TREES);
  console.log(`Wrote ${trees.length} trees → ${OUT_TREES}`);
  console.log(
    `  cover verts wood/park/grass/sand/paved/railway/allotment: ${cover.wood.length / 2} / ${cover.park.length / 2} / ${cover.grass.length / 2} / ${cover.sand.length / 2} / ${cover.paved.length / 2} / ${cover.railway.length / 2} / ${cover.allotment.length / 2}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
