import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WEST, NORTH, SCALE_X, SCALE_Y, localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT = `${DATA_DIR}/portsmouth-ships.json`;
const GAME_OUT = path.resolve("../../apps/simpompey/public/models/portsmouth-ships.json");
const AIS_CANDIDATES = [
  process.env.SOLENT_AIS ?? "",
  "/tmp/solent-ais.csv",
  `${DATA_DIR}/ais/SolentAIS_20160111_083249.csv`,
];


type Hull = "boat" | "ferry" | "cargo" | "hovercraft" | "warship";
type Pt = { x: number; z: number };
type Historic = { name: string; kind: Hull; x: number; z: number; heading: number; length: number; beam: number };

function historicKind(tags: Record<string, string>): Hull {
  const t = `${tags["ship:type"] ?? ""} ${tags.name ?? ""}`.toLowerCase();
  if (/holland/.test(t)) return "boat";
  return "warship";
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function pathLen(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return n;
}

function uniquePts(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - p.x, prev.z - p.z) < 0.2) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.4) out.pop();
  }
  return out;
}

/** Long-axis pose of a hull outline. Bow is the more-northerly end. */
function hullAxes(pts: Pt[]): { x: number; z: number; heading: number; length: number; beam: number } {
  const ring = uniquePts(pts);
  if (ring.length === 0) return { x: 0, z: 0, heading: 0, length: 70, beam: 12 };
  if (ring.length < 3) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    let ax = b.x - a.x;
    let az = b.z - a.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len;
    az /= len;
    if (az < 0) {
      ax = -ax;
      az = -az;
    }
    return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5, heading: Math.atan2(ax, az), length: len, beam: 12 };
  }
  const n = ring.length;
  let cx = 0;
  let cz = 0;
  for (const p of ring) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const p of ring) {
    const dx = p.x - cx;
    const dz = p.z - cz;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  const theta = 0.5 * Math.atan2(2 * xz, xx - zz);
  let ax = Math.cos(theta);
  let az = Math.sin(theta);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minAcross = Infinity;
  let maxAcross = -Infinity;
  for (const p of ring) {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const along = dx * ax + dz * az;
    const across = dx * -az + dz * ax;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }
  let length = maxAlong - minAlong;
  let beam = maxAcross - minAcross;
  if (length < beam) {
    const t = ax;
    ax = -az;
    az = t;
    const tmp = length;
    length = beam;
    beam = tmp;
  }
  if (az < 0) {
    ax = -ax;
    az = -az;
  }
  return { x: cx, z: cz, heading: Math.atan2(ax, az), length, beam };
}

function classifyFerry(name: string, operator: string): { kind: Hull; speed: number; keep: boolean } {
  const blob = `${name} ${operator}`.toLowerCase();
  if (/terminal|hoverport|international port/.test(blob)) return { kind: "ferry", speed: 0, keep: false };
  if (/hover/.test(blob)) return { kind: "hovercraft", speed: 18, keep: true };
  if (/gosport/.test(blob)) return { kind: "ferry", speed: 5.2, keep: true };
  if (/hayling|waterbus/.test(blob)) return { kind: "boat", speed: 4, keep: true };
  if (/fishbourne|fastcat|ryde|wightlink/.test(blob)) return { kind: "ferry", speed: 8.5, keep: true };
  if (/brittany|santander|bilbao|ouistreham|saint-malo|cherbourg|condor|jersey|guernsey/.test(blob)) {
    return { kind: "cargo", speed: 7, keep: true };
  }
  return { kind: "ferry", speed: 6, keep: true };
}

function hullFromSog(sog: number): Hull {
  if (sog >= 28) return "hovercraft";
  if (sog >= 14) return "ferry";
  if (sog >= 7) return "cargo";
  return "boat";
}

function extendToward(pts: Pt[], lat: number, lon: number): Pt[] {
  const dest = localM(lat, lon);
  const last = pts[pts.length - 1];
  const dx = dest.x - last.x;
  const dz = dest.y - last.z;
  const len = Math.hypot(dx, dz) || 1;
  const step = 180;
  const out = pts.slice();
  let x = last.x;
  let z = last.z;
  for (let d = step; d < Math.min(len, 9000); d += step) {
    x = last.x + (dx / len) * d;
    z = last.z + (dz / len) * d;
    const lon2 = WEST + x / SCALE_X;
    const lat2 = NORTH + z / SCALE_Y;
    if (!inBox(lat2, lon2)) break;
    out.push({ x, z });
  }
  return out;
}

function extractOsm(buf: string) {
  const ferries: Array<{ id: string; name: string; kind: Hull; speed: number; pts: number[] }> = [];
  const historic: Historic[] = [];
  const seen = new Set<string>();
  let warriorJetty: ReturnType<typeof hullAxes> | null = null;

  const wayRe = /<way\s+id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g;
  let m: RegExpExecArray | null;
  while ((m = wayRe.exec(buf)) !== null) {
    const tags = parseTags(m[2]);
    const nds = [...m[2].matchAll(/<nd\s+ref="\d+"(?:\s+lat="([^"]+)"\s+lon="([^"]+)")?/g)];
    const pts: Pt[] = [];
    for (const nd of nds) {
      if (!nd[1] || !nd[2]) continue;
      const { x, y } = localM(Number(nd[1]), Number(nd[2]));
      pts.push({ x, z: y });
    }
    if (/hms warrior jetty/i.test(tags.name ?? "") && pts.length >= 2) {
      warriorJetty = hullAxes(pts);
      continue;
    }
    if (tags.historic === "ship" || tags.building === "ship" || /hms (victory|warrior)/i.test(tags.name ?? "")) {
      if (/jetty|pier|pontoon|berth/i.test(tags.name ?? "")) continue;
      if (pts.length === 0) continue;
      const hull = hullAxes(pts);
      historic.push({
        name: tags.name ?? "Historic ship",
        kind: historicKind(tags),
        x: hull.x,
        z: hull.z,
        heading: hull.heading,
        length: hull.length,
        beam: Math.max(3, hull.beam),
      });
      continue;
    }
    if (tags.route !== "ferry" && tags.ferry !== "yes") continue;
    if (pts.length < 2) continue;
    const { kind, speed, keep } = classifyFerry(tags.name ?? "", tags.operator ?? "");
    if (!keep) continue;
    const len = pathLen(pts);
    if (len < 40 && pts.length < 3) continue;
    let use = pts;
    if (kind === "hovercraft" && len < 900) use = extendToward(pts, 50.736, -1.161);
    const key = `${kind}:${Math.round(use[0].x / 40)}:${Math.round(use[0].z / 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (kind === "hovercraft") {
      const other = ferries.findIndex((f) => f.kind === "hovercraft");
      if (other >= 0) {
        if (ferries[other].pts.length / 2 >= use.length) continue;
        ferries.splice(other, 1);
      }
    }
    if (kind === "cargo" && ferries.filter((f) => f.kind === "cargo").length >= 2) continue;
    ferries.push({
      id: m[1],
      name: tags.name ?? tags.operator ?? "Ferry",
      kind,
      speed,
      pts: use.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]),
    });
  }

  const nodeRe = /<node\s+id="(\d+)"([^>]*)>([\s\S]*?)<\/node>/g;
  while ((m = nodeRe.exec(buf)) !== null) {
    const tags = parseTags(m[3]);
    if (tags.historic !== "ship" && !/hms (victory|warrior)/i.test(tags.name ?? "")) continue;
    if (/jetty|pier|pontoon|berth/i.test(tags.name ?? "")) continue;
    const lat = /lat="([\d.\-]+)"/.exec(m[0])?.[1];
    const lon = /lon="([\d.\-]+)"/.exec(m[0])?.[1];
    if (!lat || !lon) continue;
    const { x, y } = localM(Number(lat), Number(lon));
    const name = tags.name ?? "Historic ship";
    if (historic.some((h) => Math.hypot(h.x - x, h.z - y) < 40 || h.name === name)) continue;
    const warrior = /warrior/i.test(name);
    historic.push({
      name,
      kind: historicKind(tags),
      x,
      z: y,
      heading: warrior && warriorJetty ? warriorJetty.heading : warrior ? 1.13 : 2.6,
      length: warrior ? 127 : /holland/i.test(name) ? 19.5 : 70,
      beam: warrior ? 17.8 : /holland/i.test(name) ? 3.6 : 12,
    });
  }

  return { ferries, historic };
}

function loadAis(): string | null {
  for (const p of AIS_CANDIDATES) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function extractAis(csvPath: string) {
  const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
  type Sample = { t: number; x: number; z: number; hdg: number; sog: number };
  const by = new Map<string, Sample[]>();
  let t0 = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 6) continue;
    const lat = Number(parts[2]);
    const lon = Number(parts[3]);
    if (!Number.isFinite(lat) || !inBox(lat, lon)) continue;
    const t = Date.parse(parts[0]);
    if (!Number.isFinite(t)) continue;
    if (!t0) t0 = t;
    const { x, y } = localM(lat, lon);
    const hdg = Number(parts[4]) || 0;
    const sog = Number(parts[5]) || 0;
    const mmsi = parts[1].trim();
    const list = by.get(mmsi);
    const sample: Sample = { t: (t - t0) / 1000, x, z: y, hdg, sog };
    if (!list) by.set(mmsi, [sample]);
    else {
      const prev = list[list.length - 1];
      if (sample.t - prev.t < 4) {
        prev.t = sample.t;
        prev.x = sample.x;
        prev.z = sample.z;
        prev.hdg = sample.hdg;
        prev.sog = sample.sog;
      } else list.push(sample);
    }
  }

  const tracks: Array<{ mmsi: string; kind: Hull; samples: number[] }> = [];
  const ranked: Array<{ mmsi: string; kind: Hull; samples: Sample[]; score: number }> = [];
  for (const [mmsi, samples] of by) {
    if (samples.length < 6) continue;
    let maxSog = 0;
    let moving = 0;
    for (const s of samples) {
      if (s.sog > maxSog) maxSog = s.sog;
      if (s.sog >= 1) moving++;
    }
    if (maxSog < 1.2 || moving < 5) continue;
    ranked.push({
      mmsi,
      kind: hullFromSog(maxSog),
      samples,
      score: maxSog * moving,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  for (const t of ranked.slice(0, 42)) {
    tracks.push({
      mmsi: t.mmsi,
      kind: t.kind,
      samples: t.samples.flatMap((s) => [
        Math.round(s.t),
        Math.round(s.x * 10) / 10,
        Math.round(s.z * 10) / 10,
        Math.round(s.hdg),
      ]),
    });
  }
  return tracks;
}

function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  const { ferries, historic } = extractOsm(buf);
  const aisPath = loadAis();
  const ais = aisPath ? extractAis(aisPath) : [];
  const payload = {
    ferries,
    historic,
    ais,
    meta: {
      ferryRoutes: ferries.length,
      historic: historic.length,
      aisTracks: ais.length,
      aisSource: aisPath ? path.basename(aisPath) : null,
      note: "OSM ferry rails (not drawn) + Solent AIS 2016 replay; no path overlays",
    },
  };
  writeFileSync(OUT, JSON.stringify(payload));
  mkdirSync(path.dirname(GAME_OUT), { recursive: true });
  copyFileSync(OUT, GAME_OUT);
  console.log(`ferries ${ferries.length}, historic ${historic.length}, ais ${ais.length}`);
  for (const f of ferries) console.log(`  ${f.kind.padEnd(10)} ${f.name}  pts=${f.pts.length / 2}  ${f.speed} m/s`);
  for (const h of historic) console.log(`  historic ${h.name}`);
}

main();
