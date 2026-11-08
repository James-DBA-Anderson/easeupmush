import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { collectCarriageways } from "./carriageway.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT = `${DATA_DIR}/portsmouth-furniture.json`;
const GAME_OUT = path.resolve("../../apps/simpompey/public/models/portsmouth-furniture.json");

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

type Kind = "bench" | "bin" | "postbox" | "phone" | "rack" | "bus" | "signal" | "table" | "pub" | "memorial";
type Kit = { x: number; z: number; kind: Kind; heading: number };

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function classify(tags: Record<string, string>): Kind | null {
  if (tags.disused === "yes" || tags.abandoned === "yes" || tags.indoor === "yes") return null;
  const a = tags.amenity;
  if (a === "bench") return "bench";
  if (a === "waste_basket" || a === "recycling") return "bin";
  if (a === "post_box") return "postbox";
  if (a === "telephone") return "phone";
  if (a === "bicycle_parking") return "rack";
  if (a === "grit_bin") return "bin";
  if (a === "pub") return "pub";
  if (tags.leisure === "picnic_table") return "table";
  if (tags.highway === "bus_stop") return "bus";
  if (tags.highway === "traffic_signals") return "signal";
  if (tags.historic === "memorial" || tags.historic === "monument") {
    if ((tags.memorial ?? "").toLowerCase() === "plaque") return null;
    return "memorial";
  }
  return null;
}

function hash01(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function pointInPoly(x: number, y: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    const xi = pts[i].x, xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function fillRing(pts: { x: number; y: number }[], step: number, maxN: number): { x: number; y: number }[] {
  if (pts.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const out: { x: number; y: number }[] = [];
  for (let y = minY + step * 0.5; y <= maxY; y += step) {
    for (let x = minX + step * 0.5; x <= maxX; x += step) {
      if (!pointInPoly(x, y, pts)) continue;
      out.push({ x, y });
      if (out.length >= maxN) return out;
    }
  }
  return out;
}

function headingOf(x: number, z: number): number {
  return hash01(x, z) * Math.PI * 2;
}

const buf = readFileSync(OSM_PATH, "utf8");
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
  const kind = classify(parseTags(buf.slice(gt + 1, end)));
  if (!kind) continue;
  const p = localM(lat, lon);
  kits.push({ x: p.x, z: p.y, kind, heading: headingOf(p.x, p.y) });
}

const wayStartRe = /<way\s+id="(\d+)">/g;
let wayMatch: RegExpExecArray | null;
while ((wayMatch = wayStartRe.exec(buf)) !== null) {
  const wayStart = wayMatch.index;
  const wayEnd = buf.indexOf("</way>", wayStart);
  if (wayEnd === -1) continue;
  const wayStr = buf.slice(wayStart, wayEnd + 6);
  const kind = classify(parseTags(wayStr));
  if (!kind) continue;
  const nds: { x: number; y: number }[] = [];
  const ndRe = /<nd\s+ref="(\d+)"/g;
  let nd: RegExpExecArray | null;
  while ((nd = ndRe.exec(wayStr)) !== null) {
    const ll = nodeMap.get(Number(nd[1]));
    if (!ll) continue;
    const p = localM(ll[0], ll[1]);
    nds.push(p);
  }
  if (nds.length === 0) continue;
  if (kind === "rack" && nds.length >= 3) {
    const spots = fillRing(nds, 2.8, 8);
    for (const p of spots.length ? spots : [nds[0]]) {
      kits.push({ x: p.x, z: p.y, kind, heading: headingOf(p.x, p.y) });
    }
    continue;
  }
  let sx = 0, sy = 0;
  for (const p of nds) {
    sx += p.x;
    sy += p.y;
  }
  const x = sx / nds.length;
  const z = sy / nds.length;
  kits.push({ x, z, kind, heading: headingOf(x, z) });
}

const roads = collectCarriageways(buf, nodeMap, localM);
const placed: Kit[] = [];
let nudged = 0;
let dropped = 0;
for (const kit of kits) {
  const extra = kit.kind === "signal" ? 1.55 : kit.kind === "bus" ? 1.7 : 1.1;
  if (!roads.covers(kit.x, kit.z, 0.15)) {
    placed.push(kit);
    continue;
  }
  const off = roads.nudge(kit.x, kit.z, extra);
  if (!off) {
    dropped++;
    continue;
  }
  kit.x = off.x;
  kit.z = off.y;
  if (kit.kind === "signal" || kit.kind === "bus") kit.heading = off.heading;
  nudged++;
  placed.push(kit);
}

const kept: Kit[] = [];
for (const kit of placed) {
  const gap = kit.kind === "pub" || kit.kind === "memorial" ? 10 : 1.6;
  if (kept.some((k) => k.kind === kit.kind && Math.hypot(k.x - kit.x, k.z - kit.z) < gap)) continue;
  kept.push(kit);
}

const counts: Record<string, number> = {};
for (const k of kept) counts[k.kind] = (counts[k.kind] ?? 0) + 1;
writeFileSync(OUT, JSON.stringify({ kits: kept }));
mkdirSync(path.dirname(GAME_OUT), { recursive: true });
copyFileSync(OUT, GAME_OUT);
console.log(`Wrote ${OUT} (${kept.length} kits)`, counts, `(nudged ${nudged} off-road, dropped ${dropped})`);
