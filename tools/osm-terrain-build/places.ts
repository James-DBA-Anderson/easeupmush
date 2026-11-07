import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import earcut from "earcut";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT = `${DATA_DIR}/portsmouth-places.json`;
const GAME_OUT = path.resolve("../../apps/simpompey/public/models/portsmouth-places.json");

const SOUTH = 50.76;
const WEST = -1.17;
const NORTH = 50.835;
const EAST = -1.02;
const R_EARTH = 6_371_000;
const MID_LAT = (SOUTH + NORTH) / 2;
const SCALE_X = (Math.PI / 180) * R_EARTH * Math.cos((MID_LAT * Math.PI) / 180);
const SCALE_Y = (Math.PI / 180) * R_EARTH;

const PROTO_H = { tower: 18.5, chimney: 31, tank: 9.3, crane: 19 } as const;

function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

type Pt = { x: number; y: number };
type LandmarkKind = "tower" | "chimney" | "tank" | "crane";
type Pitch = { sport: string; t: number[]; r: number[] };
type Kit = { x: number; z: number; kind: LandmarkKind; heading: number; scale: number; name?: string };

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function hash01(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function uniqueRing(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.12) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.4) out.pop();
  }
  return out;
}

function triangulateRing(pts: Pt[]): number[] {
  if (pts.length < 3) return [];
  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);
  const idx = earcut(flat, undefined, 2);
  const out: number[] = [];
  for (const i of idx) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

function downsampleRing(pts: Pt[], maxN = 24): number[] {
  if (pts.length <= maxN) {
    const out: number[] = [];
    for (const p of pts) out.push(p.x, p.y);
    return out;
  }
  const out: number[] = [];
  for (let i = 0; i < maxN; i++) {
    const p = pts[Math.floor((i * pts.length) / maxN)];
    out.push(p.x, p.y);
  }
  return out;
}

function sportOf(tags: Record<string, string>): string | null {
  if (tags.leisure === "playground") return "playground";
  if (tags.leisure === "bowling_green") return "bowls";
  if (tags.leisure === "track") return (tags.sport ?? "running").split(";")[0];
  if (tags.leisure === "pitch") return (tags.sport ?? "pitch").split(";")[0] || "pitch";
  return null;
}

function parseHeight(raw?: string): number | null {
  if (!raw) return null;
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 3 && n <= 120 ? n : null;
}

function landmarkKind(tags: Record<string, string>): LandmarkKind | null {
  if (tags.disused === "yes" || tags.abandoned === "yes") return null;
  const mm = tags.man_made;
  if (mm === "chimney") return "chimney";
  if (mm === "storage_tank" || mm === "silo" || mm === "tank") return "tank";
  if (mm === "crane") return "crane";
  if (mm === "tower" || mm === "communications_tower" || mm === "water_tower" || mm === "mast") {
    const t = (tags["tower:type"] ?? "").toLowerCase();
    if (t === "lighting" || t === "bell_tower") return "tower";
    return "tower";
  }
  return null;
}

function scaleOf(kind: LandmarkKind, tags: Record<string, string>): number {
  const h = parseHeight(tags.height) ?? parseHeight(tags["height:m"]);
  const proto = PROTO_H[kind];
  if (h === null) return 1;
  return Math.min(4, Math.max(0.35, h / proto));
}

function headingOf(x: number, z: number, pts?: Pt[]): number {
  if (pts && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1.2) return Math.atan2(b.x - a.x, b.y - a.y);
  }
  return hash01(x, z) * Math.PI * 2;
}

function centroid(pts: Pt[]): Pt {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

function spanM(pts: Pt[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function wayNodes(wayStr: string, nodeMap: Map<number, [number, number]>): Pt[] {
  const nds: Pt[] = [];
  const ndRe = /<nd\s+ref="(\d+)"/g;
  let nd: RegExpExecArray | null;
  while ((nd = ndRe.exec(wayStr)) !== null) {
    const ll = nodeMap.get(Number(nd[1]));
    if (!ll) continue;
    nds.push(localM(ll[0], ll[1]));
  }
  return nds;
}

const buf = readFileSync(OSM_PATH, "utf8");
const pitches: Pitch[] = [];
const kits: Kit[] = [];
const nodeMap = new Map<number, [number, number]>();

const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
let m: RegExpExecArray | null;
while ((m = nodeRe.exec(buf)) !== null) {
  const id = Number(m[1]);
  const lat = Number(m[2]);
  const lon = Number(m[3]);
  const inBox = lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST;
  if (inBox) nodeMap.set(id, [lat, lon]);
  if (!inBox) continue;
  const gt = buf.indexOf(">", m.index);
  if (gt === -1 || buf[gt - 1] === "/") continue;
  const end = buf.indexOf("</node>", gt);
  if (end === -1) continue;
  const tags = parseTags(buf.slice(gt + 1, end));
  const kind = landmarkKind(tags);
  if (!kind) continue;
  const p = localM(lat, lon);
  kits.push({
    x: p.x,
    z: p.y,
    kind,
    heading: headingOf(p.x, p.y),
    scale: scaleOf(kind, tags),
    name: tags.name,
  });
}

const wayStartRe = /<way\s+id="(\d+)">/g;
let wayMatch: RegExpExecArray | null;
while ((wayMatch = wayStartRe.exec(buf)) !== null) {
  const wayStart = wayMatch.index;
  const wayEnd = buf.indexOf("</way>", wayStart);
  if (wayEnd === -1) continue;
  const wayStr = buf.slice(wayStart, wayEnd + 6);
  const tags = parseTags(wayStr);
  const nds = wayNodes(wayStr, nodeMap);
  if (nds.length === 0) continue;

  const sport = sportOf(tags);
  if (sport) {
    const ring = uniqueRing(nds);
    const span = spanM(ring);
    if (ring.length >= 3 && span >= 8 && span <= 220) {
      const tris = triangulateRing(ring);
      if (tris.length >= 6) {
        pitches.push({ sport, t: tris, r: downsampleRing(ring, sport === "playground" ? 12 : 24) });
      }
    }
    continue;
  }

  const kind = landmarkKind(tags);
  if (!kind) continue;
  const c = centroid(nds);
  kits.push({
    x: c.x,
    z: c.y,
    kind,
    heading: headingOf(c.x, c.y, nds),
    scale: scaleOf(kind, tags),
    name: tags.name,
  });
}

const kept: Kit[] = [];
for (const kit of kits) {
  if (kept.some((k) => k.kind === kit.kind && Math.hypot(k.x - kit.x, k.z - kit.z) < 12)) continue;
  kept.push(kit);
}

const sports: Record<string, number> = {};
for (const p of pitches) sports[p.sport] = (sports[p.sport] ?? 0) + 1;
const counts: Record<string, number> = {};
for (const k of kept) counts[k.kind] = (counts[k.kind] ?? 0) + 1;

writeFileSync(OUT, JSON.stringify({ pitches, kits: kept }));
mkdirSync(path.dirname(GAME_OUT), { recursive: true });
copyFileSync(OUT, GAME_OUT);
console.log(`Wrote ${OUT} (${pitches.length} pitches, ${kept.length} landmarks)`, { sports, landmarks: counts });
