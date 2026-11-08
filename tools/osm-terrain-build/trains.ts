import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localM as localXY } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT = `${DATA_DIR}/portsmouth-trains.json`;
const GAME_OUT = path.resolve("../../apps/simpompey/public/models/portsmouth-trains.json");
const HUXLEY = "https://huxley2.azurewebsites.net";

const PORTSEA = ["PMH", "PMS", "FTN", "HLS", "CSH"] as const;
const FALLBACK_CRS: Record<string, [number, number]> = {
  PMH: [50.79672, -1.10882],
  PMS: [50.7982, -1.09068],
  FTN: [50.79645, -1.07326],
  HLS: [50.82839, -1.05864],
  CSH: [50.8349, -1.0673],
};

type Pt = { x: number; z: number };
type Kind = "swr" | "southern" | "gwr";
type Call = { crs: string; t: number; name: string };

function localM(lat: number, lon: number): Pt {
  const p = localXY(lat, lon);
  return { x: p.x, z: p.y };
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

function along(pts: Pt[], dist: number): { x: number; z: number; yaw: number } {
  let remain = dist;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    if (remain <= len) {
      const t = remain / len;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    remain -= len;
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return { x: b.x, z: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

function kindOf(operator: string): Kind {
  const blob = operator.toLowerCase();
  if (blob.includes("southern") && !blob.includes("western")) return "southern";
  if (blob.includes("great western") || /\bgwr\b/.test(blob)) return "gwr";
  return "swr";
}

function shortOp(operator: string): string {
  const blob = operator.toLowerCase();
  if (blob.includes("southern") && !blob.includes("western")) return "Southern";
  if (blob.includes("great western") || /\bgwr\b/.test(blob)) return "GWR";
  if (blob.includes("south western")) return "SWR";
  return operator.split(/\s+/)[0] || "Train";
}

function parseClock(value: string | null | undefined, now: Date): number | null {
  if (!value || value === "On time" || value === "Delayed" || value === "Cancelled") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const t = new Date(now);
  t.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let sec = (t.getTime() - now.getTime()) / 1000;
  if (sec > 18 * 3600) sec -= 86400;
  if (sec < -18 * 3600) sec += 86400;
  return now.getTime() / 1000 + sec;
}

function callTime(p: { st?: string | null; et?: string | null; at?: string | null }, now: Date): number | null {
  return parseClock(p.at, now) ?? parseClock(p.et, now) ?? parseClock(p.st, now);
}

type DarwinService = {
  serviceID?: string;
  operator?: string;
  std?: string | null;
  etd?: string | null;
  sta?: string | null;
  eta?: string | null;
  isCancelled?: boolean;
  destination?: Array<{ locationName?: string; crs?: string }>;
  origin?: Array<{ locationName?: string; crs?: string }>;
  previousCallingPoints?: Array<{ callingPoint?: Array<{ crs?: string; locationName?: string; st?: string; et?: string; at?: string }> }>;
  subsequentCallingPoints?: Array<{ callingPoint?: Array<{ crs?: string; locationName?: string; st?: string; et?: string; at?: string }> }>;
};

async function fetchBoard(crs: string, board: "departures" | "arrivals"): Promise<DarwinService[]> {
  const url = `${HUXLEY}/${board}/${crs}/16?expand=true`;
  const res = await fetch(url, { headers: { "User-Agent": "easeupmush-simpompey" } });
  if (!res.ok) throw new Error(`${board} ${crs} ${res.status}`);
  const json = (await res.json()) as { trainServices?: DarwinService[] };
  return json.trainServices ?? [];
}

async function fetchDarwin(now: Date): Promise<Array<{ id: string; operator: string; dest: string; calls: Call[] }>> {
  const seen = new Map<string, { id: string; operator: string; dest: string; calls: Call[] }>();
  for (const crs of PORTSEA) {
    for (const board of ["departures", "arrivals"] as const) {
      let services: DarwinService[] = [];
      try {
        services = await fetchBoard(crs, board);
      } catch (err) {
        console.warn(`Darwin ${board} ${crs} failed:`, err);
        continue;
      }
      for (const s of services) {
        if (!s.serviceID || s.isCancelled) continue;
        const calls: Call[] = [];
        const prev = s.previousCallingPoints?.[0]?.callingPoint ?? [];
        for (const p of prev) {
          if (!p.crs) continue;
          const t = callTime(p, now);
          if (t == null) continue;
          calls.push({ crs: p.crs, t, name: p.locationName ?? p.crs });
        }
        const here = board === "departures"
          ? parseClock(s.etd, now) ?? parseClock(s.std, now)
          : parseClock(s.eta, now) ?? parseClock(s.sta, now);
        if (here != null) calls.push({ crs, t: here, name: crs });
        const next = s.subsequentCallingPoints?.[0]?.callingPoint ?? [];
        for (const p of next) {
          if (!p.crs) continue;
          const t = callTime(p, now);
          if (t == null) continue;
          calls.push({ crs: p.crs, t, name: p.locationName ?? p.crs });
        }
        const dest = s.destination?.[0]?.locationName ?? s.origin?.[0]?.locationName ?? "train";
        const prevBest = seen.get(s.serviceID);
        if (!prevBest || calls.length > prevBest.calls.length) {
          seen.set(s.serviceID, { id: s.serviceID, operator: s.operator ?? "Train", dest, calls });
        }
      }
    }
  }
  return [...seen.values()];
}

function extractStations(buf: string): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  const nodeRe = /<node\s+id="\d+"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    const gt = buf.indexOf(">", m.index);
    if (gt === -1 || buf[gt - 1] === "/") continue;
    const end = buf.indexOf("</node>", gt);
    if (end === -1) continue;
    const tags = parseTags(buf.slice(m.index, end));
    const crs = (tags["ref:crs"] ?? "").toUpperCase();
    if (!PORTSEA.includes(crs as (typeof PORTSEA)[number])) continue;
    if (tags.railway !== "station" && tags.public_transport !== "station") continue;
    out[crs] = localM(lat, lon);
  }
  for (const [crs, ll] of Object.entries(FALLBACK_CRS)) {
    if (!out[crs]) out[crs] = localM(ll[0], ll[1]);
  }
  return out;
}

function extractRails(buf: string): Pt[][] {
  const nodeMap = new Map<number, Pt>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let nm: RegExpExecArray | null;
  while ((nm = nodeRe.exec(buf)) !== null) {
    nodeMap.set(Number(nm[1]), localM(Number(nm[2]), Number(nm[3])));
  }
  const rails: Pt[][] = [];
  const wayRe = /<way\s+id="\d+"[^>]*>([\s\S]*?)<\/way>/g;
  let m: RegExpExecArray | null;
  while ((m = wayRe.exec(buf)) !== null) {
    const tags = parseTags(m[1]);
    if (tags.railway !== "rail") continue;
    if (tags.service && /siding|yard|crossover|spur/.test(tags.service)) continue;
    if (tags.railway === "abandoned" || tags.railway === "dismantled") continue;
    const pts: Pt[] = [];
    const ndRe = /<nd\s+ref="(\d+)"/g;
    let nd: RegExpExecArray | null;
    while ((nd = ndRe.exec(m[1])) !== null) {
      const p = nodeMap.get(Number(nd[1]));
      if (p) pts.push(p);
    }
    if (pts.length >= 2) rails.push(pts);
  }
  return rails;
}

class RailGraph {
  nodes: Pt[] = [];
  edges: Array<Array<{ to: number; w: number }>> = [];
  private key = new Map<string, number>();

  private id(p: Pt): number {
    const k = `${Math.round(p.x / 5) * 5},${Math.round(p.z / 5) * 5}`;
    const ex = this.key.get(k);
    if (ex !== undefined) return ex;
    const i = this.nodes.length;
    this.key.set(k, i);
    this.nodes.push(p);
    this.edges.push([]);
    return i;
  }

  addWays(ways: Pt[][]) {
    for (const way of ways) {
      let prev = -1;
      for (const p of way) {
        const i = this.id(p);
        if (prev >= 0 && prev !== i) {
          const w = Math.hypot(this.nodes[i].x - this.nodes[prev].x, this.nodes[i].z - this.nodes[prev].z);
          this.edges[prev].push({ to: i, w });
          this.edges[i].push({ to: prev, w });
        }
        prev = i;
      }
    }
  }

  nearest(p: Pt): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = (this.nodes[i].x - p.x) ** 2 + (this.nodes[i].z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  route(a: Pt, b: Pt): Pt[] | null {
    const start = this.nearest(a);
    const goal = this.nearest(b);
    const dist = new Float64Array(this.nodes.length).fill(Infinity);
    const prev = new Int32Array(this.nodes.length).fill(-1);
    const used = new Uint8Array(this.nodes.length);
    dist[start] = 0;
    for (let n = 0; n < this.nodes.length; n++) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        if (!used[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u < 0 || u === goal) break;
      used[u] = 1;
      for (const e of this.edges[u]) {
        const nd = dist[u] + e.w;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
        }
      }
    }
    if (!Number.isFinite(dist[goal])) return null;
    const pts: Pt[] = [];
    for (let i = goal; i !== -1; i = prev[i]) pts.push(this.nodes[i]);
    pts.reverse();
    return pts.length >= 2 ? pts : null;
  }
}

function sampleTrack(pts: Pt[], fromDist: number, headingSign: number, duration: number, speed: number): number[] {
  const len = pathLen(pts);
  const samples: number[] = [];
  const step = 5;
  for (let t = 0; t <= duration; t += step) {
    let d = fromDist + headingSign * speed * t;
    let yawAdd = 0;
    if (d < 0) {
      d = -d;
      yawAdd = Math.PI;
    }
    if (d > len) {
      d = len - (d - len);
      yawAdd = Math.PI;
      if (d < 0) d = 0;
    }
    const p = along(pts, Math.max(0, Math.min(len, d)));
    samples.push(t, Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(((p.yaw + yawAdd) * 180) / Math.PI));
  }
  return samples;
}

function fallbackTrains(graph: RailGraph, stations: Record<string, Pt>): Array<{ id: string; kind: Kind; name: string; samples: number[] }> {
  const path = graph.route(stations.PMH, stations.HLS);
  if (!path) return [];
  const len = pathLen(path);
  const out = [];
  const kinds: Kind[] = ["swr", "southern", "gwr", "swr"];
  const names = ["SWR to Waterloo", "Southern to Victoria", "GWR to Cardiff", "SWR to Harbour"];
  for (let i = 0; i < 4; i++) {
    const from = (len * (i + 0.12)) / 4.2;
    const sign = i % 2 === 0 ? 1 : -1;
    out.push({
      id: `fallback-${i}`,
      kind: kinds[i],
      name: names[i],
      samples: sampleTrack(path, from, sign, 480, 16),
    });
  }
  return out;
}

async function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  const stations = extractStations(buf);
  const rails = extractRails(buf);
  const graph = new RailGraph();
  graph.addWays(rails);
  console.log(`  stations ${Object.keys(stations).join(",")}  rail verts ${graph.nodes.length}`);

  const corridor: Record<string, Pt[]> = {};
  const keys = ["PMH", "PMS", "FTN", "HLS", "CSH"];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = stations[keys[i]];
    const b = stations[keys[i + 1]];
    const path = graph.route(a, b);
    if (path) {
      corridor[`${keys[i]}>${keys[i + 1]}`] = path;
      corridor[`${keys[i + 1]}>${keys[i]}`] = [...path].reverse();
    }
  }
  const spine = graph.route(stations.PMH, stations.HLS);

  const now = new Date();
  let services: Array<{ id: string; operator: string; dest: string; calls: Call[] }> = [];
  try {
    services = await fetchDarwin(now);
  } catch (err) {
    console.warn("Darwin snapshot failed:", err);
  }
  console.log(`  Darwin services ${services.length}`);

  const nowSec = now.getTime() / 1000;
  const trains: Array<{ id: string; kind: Kind; name: string; samples: number[] }> = [];
  const used = new Set<string>();
  const occupied: Pt[] = [];

  for (const s of services) {
    const local = s.calls.filter((c) => PORTSEA.includes(c.crs as (typeof PORTSEA)[number]));
    if (local.length < 1) continue;
    local.sort((a, b) => a.t - b.t);
    let from = local[0];
    let to = local[local.length - 1];
    for (let i = 0; i < local.length - 1; i++) {
      if (local[i].t <= nowSec && nowSec <= local[i + 1].t) {
        from = local[i];
        to = local[i + 1];
        break;
      }
    }
    if (nowSec < local[0].t - 180 || nowSec > local[local.length - 1].t + 180) continue;
    const key = `${from.crs}>${to.crs}`;
    let path = corridor[key];
    if (!path && from.crs === to.crs) {
      const stay = stations[from.crs];
      path = [stay, { x: stay.x + 8, z: stay.z + 8 }];
    }
    if (!path) path = graph.route(stations[from.crs], stations[to.crs]) ?? undefined;
    if (!path && spine) path = spine;
    if (!path) continue;
    const len = pathLen(path);
    const span = Math.max(20, to.t - from.t);
    const u = Math.min(1, Math.max(0, (nowSec - from.t) / span));
    const dist = from.crs === to.crs ? 4 : u * len;
    const at = along(path, dist);
    if (occupied.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 90)) continue;
    const samples = sampleTrack(path, dist, 1, 480, 15);
    if (samples.length < 8) continue;
    if (used.has(s.id)) continue;
    used.add(s.id);
    occupied.push(at);
    trains.push({
      id: s.id,
      kind: kindOf(s.operator),
      name: `${shortOp(s.operator)} to ${s.dest}`,
      samples,
    });
    if (trains.length >= 12) break;
  }

  const source = trains.length ? "National Rail Darwin (Huxley2 snapshot)" : "timetable fallback";
  const payloadTrains = trains.length ? trains : fallbackTrains(graph, stations);

  const payload = {
    trains: payloadTrains,
    meta: {
      captured: now.toISOString(),
      darwin: trains.length,
      source,
      note: "Darwin live boards snapped to OSM rails; replayed, not live",
    },
  };
  writeFileSync(OUT, JSON.stringify(payload));
  mkdirSync(path.dirname(GAME_OUT), { recursive: true });
  copyFileSync(OUT, GAME_OUT);
  console.log(`Wrote ${payloadTrains.length} trains (${source})`);
  for (const t of payloadTrains) console.log(`  ${t.kind.padEnd(9)} ${t.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
