import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { SOUTH, WEST, NORTH, EAST, localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const AADF_CACHE = `${DATA_DIR}/aadf-portsmouth.json`;
const CGN_ODS = `${DATA_DIR}/cgn0504.ods`;
const CGN_JSON = `${DATA_DIR}/cgn-delay.json`;
const OUT = `${DATA_DIR}/portsmouth-traffic.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");


const LA = { portsmouth: 82, hampshire: 65 } as const;
const UA = "easeupmush/simpompey (traffic)";
const CGN_ODS_URL = "https://assets.publishing.service.gov.uk/media/6aba3a70fceb6fb3a6501273/cgn0504.ods";
const SKIP_HW = new Set([
  "pedestrian", "footway", "path", "track", "steps", "cycleway", "bridleway",
  "corridor", "platform", "construction", "proposed", "raceway", "elevator",
  "services", "bus_stop", "crossing",
]);

type Pt = { x: number; y: number };
type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number };
type Count = {
  id: number;
  road: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
  flow: number;
  year: number;
  la: number;
  delay: number;
};
type Way = {
  pts: Pt[];
  refs: string[];
  kind: string;
  half: number;
  flow: number;
  delay: number;
  local: boolean;
};


function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function normRef(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "").split(/[;,/]/)[0] ?? "";
}

function refsOf(raw: string): string[] {
  return raw
    .split(/[;,/]/)
    .map((p) => p.toUpperCase().replace(/\s+/g, ""))
    .filter((p) => /^[AM]\d+[A-Z]?$/.test(p));
}

function roadWidth(kind: string, tags: Record<string, string>): number {
  const tagged = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 2 && tagged <= 24) return tagged;
  const lanes = Number.parseFloat(tags.lanes ?? "");
  if (Number.isFinite(lanes) && lanes >= 1) return Math.min(24, Math.max(3.2, lanes * 3.15 + 0.4));
  switch (kind) {
    case "motorway":
    case "motorway_link":
    case "trunk":
    case "trunk_link":
      return 10.5;
    case "primary":
    case "primary_link":
      return 8.5;
    case "secondary":
    case "secondary_link":
      return 7.6;
    case "tertiary":
    case "tertiary_link":
      return 6.8;
    case "unclassified":
      return 5.7;
    case "residential":
    case "living_street":
      return 5.5;
    default:
      return 5.5;
  }
}

function distToSeg(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return { t, d: Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) };
}

function wayDist(x: number, y: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y).d;
    if (d < best) best = d;
  }
  return best;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function paged(url: string): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  for (;;) {
    const sep = url.includes("?") ? "&" : "?";
    const data = await getJson(`${url}${sep}page[size]=200&page[number]=${page}`);
    const rows = (data?.data ?? []) as any[];
    out.push(...rows);
    const last = Number(data?.last_page ?? page);
    process.stdout.write(`    page ${page}/${last} (+${rows.length})\n`);
    if (page >= last || rows.length === 0) break;
    page++;
  }
  return out;
}

function inBbox(lat: number, lon: number) {
  return inBox(lat, lon);
}

async function fetchAadf(): Promise<Count[]> {
  if (existsSync(AADF_CACHE)) {
    const cached = JSON.parse(readFileSync(AADF_CACHE, "utf8")) as Count[];
    console.log(`  AADF cache: ${cached.length}`);
    return cached;
  }
  const latest = new Map<number, Count>();
  const take = (row: any) => {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    const flow = Number(row.all_motor_vehicles);
    const year = Number(row.year ?? row.aadf_year);
    const id = Number(row.count_point_id ?? row.id);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon)) return;
    if (!Number.isFinite(flow) || flow < 50) return;
    const prev = latest.get(id);
    if (prev && prev.year >= year) return;
    const { x, y } = localM(lat, lon);
    latest.set(id, {
      id,
      road: normRef(String(row.road_name ?? "")),
      lat,
      lon,
      x,
      z: y,
      flow,
      year,
      la: Number(row.local_authority_id),
      delay: 0,
    });
  };

  console.log("  Portsmouth AADF (all years, keep latest)");
  for (const row of await paged(`https://roadtraffic.dft.gov.uk/api/average-annual-daily-flow?filter[local_authority_id]=${LA.portsmouth}`)) {
    take(row);
  }
  console.log("  Hampshire AADF 2025 in bbox");
  for (const row of await paged(`https://roadtraffic.dft.gov.uk/api/average-annual-daily-flow?filter[local_authority_id]=${LA.hampshire}&filter[year]=2025`)) {
    take(row);
  }
  const counts = [...latest.values()];
  writeFileSync(AADF_CACHE, JSON.stringify(counts));
  console.log(`  count points in bbox: ${counts.length}`);
  return counts;
}

function fetchCgn(): Record<string, Record<string, number>> {
  if (existsSync(CGN_JSON)) {
    const cached = JSON.parse(readFileSync(CGN_JSON, "utf8")) as Record<string, Record<string, number>>;
    console.log(`  CGN cache: ${Object.keys(cached).length} authorities`);
    return cached;
  }
  if (!existsSync(CGN_ODS)) {
    console.log("  downloading CGN0504");
    const res = execFileSync("curl", ["-fsSL", "-A", UA, CGN_ODS_URL]);
    writeFileSync(CGN_ODS, res);
  }
  const py = `
import json, sys, zipfile, xml.etree.ElementTree as ET
ods, out = sys.argv[1], sys.argv[2]
root = ET.parse(zipfile.ZipFile(ods).open("content.xml")).getroot()
NS = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0"}
T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
def text(cell):
    return " ".join((t.text or "") for t in cell.findall(".//{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p")).strip()
def cells(row, n=16):
    out = []
    for cell in row.findall(T + "table-cell"):
        k = int(cell.get(T + "number-columns-repeated") or "1")
        val = text(cell)
        k = min(k, n - len(out))
        out.extend([val] * max(k, 0))
        if len(out) >= n: break
    return out
keep = {"Portsmouth", "Hampshire"}
delay = {k: {} for k in keep}
for table in root.findall(".//" + T + "table"):
    if table.get(T + "name") != "CGN0504e":
        continue
    header = None
    year_i = -1
    for row in table.findall(T + "table-row"):
        c = cells(row)
        if not any(c):
            continue
        if header is None and "Road Name" in c:
            header = c
            years = [(i, col) for i, col in enumerate(c) if col[:4].isdigit()]
            year_i = years[-1][0] if years else -1
            continue
        if header is None or year_i < 0 or len(c) <= year_i:
            continue
        la, road, raw = c[2], c[4].upper().replace(" ", ""), c[year_i]
        if la not in keep:
            continue
        try:
            delay[la][road] = float(raw)
        except ValueError:
            pass
    break
json.dump(delay, open(out, "w"))
print("  CGN roads", {k: len(v) for k, v in delay.items()})
`;
  execFileSync("python3", ["-c", py, CGN_ODS, CGN_JSON], { stdio: "inherit" });
  return JSON.parse(readFileSync(CGN_JSON, "utf8")) as Record<string, Record<string, number>>;
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function parseRoads(): Way[] {
  const buf = readFileSync(OSM_PATH, "utf8");
  const nodeMap = new Map<number, [number, number]>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  let nm: RegExpExecArray | null;
  while ((nm = nodeRe.exec(buf)) !== null) {
    const lat = Number(nm[2]);
    const lon = Number(nm[3]);
    if (lat >= SOUTH - 0.01 && lat <= NORTH + 0.01 && lon >= WEST - 0.01 && lon <= EAST + 0.01) {
      nodeMap.set(Number(nm[1]), [lat, lon]);
    }
  }
  const ways: Way[] = [];
  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);
    const tags = parseTags(wayStr);
    const hw = tags.highway ?? "";
    if (!hw || tags.area === "yes" || SKIP_HW.has(hw) || hw.startsWith("footway") || hw.startsWith("path")) continue;
    const ndRe = /<nd\s+ref="(\d+)"/g;
    const pts: Pt[] = [];
    let nd: RegExpExecArray | null;
    while ((nd = ndRe.exec(wayStr)) !== null) {
      const ll = nodeMap.get(Number(nd[1]));
      if (ll) pts.push(localM(ll[0], ll[1]));
    }
    if (pts.length < 2) continue;
    ways.push({
      pts,
      refs: refsOf(tags.ref ?? ""),
      kind: hw,
      half: roadWidth(hw, tags) / 2,
      flow: 0,
      delay: 0,
      local: false,
    });
  }
  console.log(`  OSM roads: ${ways.length}`);
  return ways;
}

function delayFor(count: Count, cgn: Record<string, Record<string, number>>): number {
  const la = count.la === LA.portsmouth ? "Portsmouth" : "Hampshire";
  return cgn[la]?.[count.road] ?? cgn.Portsmouth?.[count.road] ?? cgn.Hampshire?.[count.road] ?? 0;
}

function assign(ways: Way[], counts: Count[], cgn: Record<string, Record<string, number>>) {
  for (const c of counts) c.delay = delayFor(c, cgn);
  const byRef = new Map<string, Count[]>();
  for (const c of counts) {
    if (!c.road) continue;
    const list = byRef.get(c.road);
    if (list) list.push(c);
    else byRef.set(c.road, [c]);
  }

  for (const way of ways) {
    const matched: Count[] = [];
    for (const ref of way.refs) {
      const list = byRef.get(ref);
      if (list) matched.push(...list);
    }
    if (matched.length) {
      let v = 0;
      let w = 0;
      let delay = 0;
      let dw = 0;
      for (const c of matched) {
        const d = Math.max(12, wayDist(c.x, c.z, way.pts));
        const ww = 1 / (d * d);
        v += c.flow * ww;
        w += ww;
        if (c.delay > 0) {
          delay += c.delay * ww;
          dw += ww;
        }
      }
      way.flow = w > 0 ? v / w : 0;
      way.delay = dw > 0 ? delay / dw : (cgn.Portsmouth?.[way.refs[0]] ?? 0);
      continue;
    }
    const reach =
      way.kind.startsWith("motorway") || way.kind.startsWith("trunk") || way.kind.startsWith("primary") ? 140
      : way.kind.startsWith("secondary") || way.kind.startsWith("tertiary") ? 110
      : 90;
    let best: Count | null = null;
    let bestD = reach;
    for (const c of counts) {
      const d = wayDist(c.x, c.z, way.pts);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      way.flow = best.flow;
      way.delay = best.delay;
      way.local = true;
      continue;
    }
    for (const ref of way.refs) {
      const dly = cgn.Portsmouth?.[ref] ?? cgn.Hampshire?.[ref] ?? 0;
      if (dly > 0) way.delay = dly;
    }
  }
}

function paintWays(
  ways: Way[],
  cols: number,
  rows: number,
  cell: number,
  originX: number,
  originZ: number,
) {
  const n = cols * rows;
  const flow = new Float32Array(n);
  const delay = new Float32Array(n);
  const has = new Uint8Array(n);
  const set = (i: number, f: number, dly: number) => {
    if (f > flow[i]) flow[i] = f;
    if (dly > delay[i]) delay[i] = dly;
    has[i] = 1;
  };
  for (const way of ways) {
    if (way.flow <= 0 && way.delay <= 0) continue;
    const half = Math.max(22, way.half + 14);
    const rCells = Math.ceil(half / cell);
    for (let i = 0; i < way.pts.length - 1; i++) {
      const a = way.pts[i];
      const b = way.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / (cell * 0.45)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.y + (b.y - a.y) * t;
        const col = Math.floor((x - originX) / cell);
        const row = Math.floor((z - originZ) / cell);
        for (let dr = -rCells; dr <= rCells; dr++) {
          for (let dc = -rCells; dc <= rCells; dc++) {
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            if (Math.hypot(dc * cell, dr * cell) > half) continue;
            set(r * cols + c, way.flow, way.delay);
          }
        }
      }
    }
  }
  return { flow, delay, has };
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    if (!existsSync(OSM_PATH)) throw new Error(`Missing ${OSM_PATH}`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    const counts = await fetchAadf();
    const cgn = fetchCgn();
    const ways = parseRoads();
    assign(ways, counts, cgn);
    const paintedWays = ways.filter((w) => w.flow > 0 || w.delay > 0).length;
    console.log(`  ways with traffic: ${paintedWays}`);

    const { flow, delay, has } = paintWays(ways, cols, rows, cell, originX, originZ);
    const flows: number[] = [];
    const delays: number[] = [];
    for (let i = 0; i < flow.length; i++) {
      if (!has[i]) continue;
      if (flow[i] > 0) flows.push(Math.log(flow[i]));
      if (delay[i] > 0) delays.push(delay[i]);
    }
    flows.sort((a, b) => a - b);
    delays.sort((a, b) => a - b);
    const flowLo = percentile(flows, 0.06);
    const flowHi = percentile(flows, 0.94);
    const delayLo = percentile(delays, 0.08) || 20;
    const delayHi = percentile(delays, 0.94) || 120;
    const flowSpan = Math.max(1e-6, flowHi - flowLo);
    const delaySpan = Math.max(1e-6, delayHi - delayLo);
    const flowIdx = new Uint8Array(flow.length);
    const delayIdx = new Uint8Array(delay.length);
    let cells = 0;
    for (let i = 0; i < flow.length; i++) {
      if (!has[i]) continue;
      cells++;
      if (flow[i] > 0) {
        const t = Math.max(0, Math.min(1, (Math.log(flow[i]) - flowLo) / flowSpan));
        flowIdx[i] = Math.max(1, Math.round(t * 255));
      }
      if (delay[i] > 0) {
        const t = Math.max(0, Math.min(1, (delay[i] - delayLo) / delaySpan));
        delayIdx[i] = Math.max(1, Math.round(t * 255));
      }
    }
    console.log(`  traffic cells: ${cells}  flow log ${flowLo.toFixed(2)}–${flowHi.toFixed(2)}  delay ${delayLo.toFixed(0)}–${delayHi.toFixed(0)}s`);

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      year: Math.max(...counts.map((c) => c.year)),
      flowLo,
      flowHi,
      delayLo,
      delayHi,
      source: {
        aadf: "DfT road traffic statistics, annual average daily flow. OGL.",
        cgn: "DfT CGN0504e average delay on local A-roads, 2025. Seconds per vehicle per mile. OGL.",
      },
      points: counts.map((c) => ({
        road: c.road,
        x: Math.round(c.x),
        z: Math.round(c.z),
        flow: Math.round(c.flow),
        delay: Math.round(c.delay),
        year: c.year,
      })),
      flow: b64(flowIdx),
      delay: b64(delayIdx),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-traffic.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-traffic.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
