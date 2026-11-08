import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const CRIME_CACHE = `${DATA_DIR}/crime-portsmouth.json`;
const OUT = `${DATA_DIR}/portsmouth-crime.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");

const SOUTH = 50.76;
const WEST = -1.17;
const NORTH = 50.835;
const EAST = -1.02;
const R_EARTH = 6_371_000;
const MID_LAT = (SOUTH + NORTH) / 2;
const SCALE_X = (Math.PI / 180) * R_EARTH * Math.cos((MID_LAT * Math.PI) / 180);
const SCALE_Y = (Math.PI / 180) * R_EARTH;
const POLY = `${SOUTH},${WEST}:${SOUTH},${EAST}:${NORTH},${EAST}:${NORTH},${WEST}`;
const MONTHS = 12;
const SPLAT_M = 90;
const UA = "easeupmush/simpompey (crime)";

export const CRIME_LAYERS = ["all", "violence", "asb", "burglary", "drugs", "theft"] as const;
export type CrimeLayer = (typeof CRIME_LAYERS)[number];

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number };
type RawCrime = { category: string; lat: number; lon: number; streetId: number; street: string; month: string };
type StreetAgg = { name: string; x: number; z: number; n: number; cats: Record<CrimeLayer, number> };

function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function streetName(raw: string): string {
  return raw.replace(/^On or near /i, "").trim() || "Street";
}

function layerOf(category: string): CrimeLayer | null {
  switch (category) {
    case "violent-crime":
    case "violence-and-sexual-offences":
    case "robbery":
    case "possession-of-weapons":
      return "violence";
    case "anti-social-behaviour":
    case "public-order":
      return "asb";
    case "burglary":
      return "burglary";
    case "drugs":
      return "drugs";
    case "other-theft":
    case "bicycle-theft":
    case "shoplifting":
    case "theft-from-the-person":
    case "vehicle-crime":
      return "theft";
    default:
      return null;
  }
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchMonth(date: string, poly: string): Promise<any[]> {
  const url = `https://data.police.uk/api/crimes-street/all-crime?date=${date}&poly=${poly}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 503) return [];
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function splitPoly(poly: string): string[] {
  const pts = poly.split(":").map((p) => p.split(",").map(Number));
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const s = Math.min(...lats);
  const n = Math.max(...lats);
  const w = Math.min(...lons);
  const e = Math.max(...lons);
  const midLat = (s + n) / 2;
  const midLon = (w + e) / 2;
  const box = (a: number, b: number, c: number, d: number) => `${a},${b}:${a},${d}:${c},${d}:${c},${b}`;
  return [box(s, w, midLat, midLon), box(s, midLon, midLat, e), box(midLat, w, n, midLon), box(midLat, midLon, n, e)];
}

async function fetchMonthSafe(date: string): Promise<any[]> {
  const all = await fetchMonth(date, POLY);
  if (all.length) return all;
  const parts: any[] = [];
  for (const poly of splitPoly(POLY)) {
    await sleep(250);
    const rows = await fetchMonth(date, poly);
    parts.push(...rows);
  }
  return parts;
}

async function fetchCrimes(): Promise<RawCrime[]> {
  if (existsSync(CRIME_CACHE)) {
    const cached = JSON.parse(readFileSync(CRIME_CACHE, "utf8")) as RawCrime[];
    console.log(`  crime cache: ${cached.length}`);
    return cached;
  }
  const dates = ((await getJson("https://data.police.uk/api/crimes-street-dates")) as Array<{ date: string }>)
    .map((d) => d.date)
    .slice(0, MONTHS);
  console.log(`  months ${dates[dates.length - 1]}–${dates[0]}`);
  const out: RawCrime[] = [];
  const seen = new Set<number>();
  for (const date of dates) {
    const rows = await fetchMonthSafe(date);
    let kept = 0;
    for (const row of rows) {
      const lat = Number(row.location?.latitude);
      const lon = Number(row.location?.longitude);
      const id = Number(row.id);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST) continue;
      if (Number.isFinite(id) && seen.has(id)) continue;
      if (Number.isFinite(id)) seen.add(id);
      out.push({
        category: String(row.category ?? ""),
        lat,
        lon,
        streetId: Number(row.location?.street?.id ?? 0),
        street: streetName(String(row.location?.street?.name ?? "")),
        month: String(row.month ?? date),
      });
      kept++;
    }
    console.log(`  ${date}: ${rows.length} raw, ${kept} in bbox (total ${out.length})`);
    await sleep(200);
  }
  writeFileSync(CRIME_CACHE, JSON.stringify(out));
  return out;
}

function emptyCats(): Record<CrimeLayer, number> {
  return { all: 0, violence: 0, asb: 0, burglary: 0, drugs: 0, theft: 0 };
}

function encodeLayer(field: Float32Array, has: Uint8Array): Uint8Array {
  const samples: number[] = [];
  for (let i = 0; i < field.length; i++) {
    if (has[i] && field[i] > 0) samples.push(Math.log1p(field[i]));
  }
  samples.sort((a, b) => a - b);
  const lo = percentile(samples, 0.06);
  const hi = percentile(samples, 0.94);
  const span = Math.max(1e-6, hi - lo);
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!has[i] || field[i] <= 0) continue;
    const t = Math.max(0, Math.min(1, (Math.log1p(field[i]) - lo) / span));
    out[i] = Math.max(1, Math.round(t * 255));
  }
  return out;
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    const crimes = await fetchCrimes();
    const fields = Object.fromEntries(CRIME_LAYERS.map((k) => [k, new Float32Array(n)])) as Record<CrimeLayer, Float32Array>;
    const hits = Object.fromEntries(CRIME_LAYERS.map((k) => [k, new Uint8Array(n)])) as Record<CrimeLayer, Uint8Array>;
    const streets = new Map<number, StreetAgg>();
    const rCells = Math.ceil(SPLAT_M / cell);
    const byCat: Record<string, number> = {};
    let used = 0;

    for (const crime of crimes) {
      const { x, y } = localM(crime.lat, crime.lon);
      const col = Math.floor((x - originX) / cell);
      const row = Math.floor((y - originZ) / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      used++;
      byCat[crime.category] = (byCat[crime.category] ?? 0) + 1;
      const group = layerOf(crime.category);
      const layers: CrimeLayer[] = group ? ["all", group] : ["all"];
      for (let dr = -rCells; dr <= rCells; dr++) {
        for (let dc = -rCells; dc <= rCells; dc++) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const dist = Math.hypot(dc * cell, dr * cell);
          if (dist > SPLAT_M) continue;
          const t = 1 - dist / SPLAT_M;
          const w = t * t;
          const i = r * cols + c;
          for (const layer of layers) {
            fields[layer][i] += w;
            hits[layer][i] = 1;
          }
        }
      }
      const key = crime.streetId || (Math.round(x / 40) * 1_000_000 + Math.round(y / 40));
      let street = streets.get(key);
      if (!street) {
        street = { name: crime.street, x, z: y, n: 1, cats: emptyCats() };
        streets.set(key, street);
      } else {
        street.n++;
        street.x += (x - street.x) / street.n;
        street.z += (y - street.z) / street.n;
        if (!street.name || street.name === "Street") street.name = crime.street;
      }
      street.cats.all++;
      if (group) street.cats[group]++;
    }

    console.log(`  crimes on grid: ${used}`);
    console.log(`  categories`, byCat);

    const layers: Record<string, string> = {};
    for (const layer of CRIME_LAYERS) {
      const encoded = encodeLayer(fields[layer], hits[layer]);
      let cells = 0;
      for (let i = 0; i < n; i++) if (encoded[i]) cells++;
      layers[layer] = b64(encoded);
      console.log(`  ${layer} cells: ${cells}`);
    }

    const months = [...new Set(crimes.map((c) => c.month))].sort();
    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      from: months[0] ?? "",
      to: months[months.length - 1] ?? "",
      total: used,
      source: "police.uk street-level crime, Hampshire Constabulary, 12-month rollup. Locations are approximate. OGL.",
      layers,
      streets: [...streets.values()].map((s) => ({
          name: s.name,
          x: Math.round(s.x),
          z: Math.round(s.z),
          n: s.n,
          cats: s.cats,
        })),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-crime.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-crime.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
