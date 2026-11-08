import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SOUTH, WEST, NORTH, EAST, localM } from "./bbox.ts";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const CSV = `${DATA_DIR}/imd-file7.csv`;
const LSOA_CACHE = `${DATA_DIR}/lsoa-portsmouth.json`;
const OUT = `${DATA_DIR}/portsmouth-deprivation.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");

const UA = "easeupmush/simpompey (imd)";
const CSV_URL =
  "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv";
const LSOA_URL =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V5/FeatureServer/0/query";
const DOMAINS = ["all", "income", "health", "living"] as const;
type Domain = (typeof DOMAINS)[number];

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number; zones: string };
type Ring = Array<{ x: number; y: number }>;
type Area = {
  code: string;
  name: string;
  rings: Ring[];
  rank: Record<Domain, number>;
  decile: Record<Domain, number>;
};

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function b64Bytes(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function b64u16(arr: Uint16Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

function pointInRing(x: number, z: number, pts: Ring): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y;
    const yj = pts[j].y;
    const xi = pts[i].x;
    const xj = pts[j].x;
    if ((yi > z) !== (yj > z) && x < ((xj - xi) * (z - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function inPoly(x: number, z: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (ring.length >= 3 && pointInRing(x, z, ring)) inside = !inside;
  }
  return inside;
}

function ringsOf(geom: { type: string; coordinates: any }): number[][][][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates as number[][][]];
  if (geom.type === "MultiPolygon") return geom.coordinates as number[][][][];
  return [];
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function download(url: string, dest: string) {
  if (existsSync(dest)) {
    console.log(`  cache ${path.basename(dest)}`);
    return;
  }
  console.log(`  downloading ${path.basename(dest)}`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function parseImd(file: string) {
  const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = splitCsv(lines[0]);
  const col = (label: string) => {
    const i = head.findIndex((h) => h === label);
    if (i < 0) throw new Error(`Missing column ${label}`);
    return i;
  };
  const iCode = col("LSOA code (2021)");
  const iName = col("LSOA name (2021)");
  const iImdR = col("Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)");
  const iImdD = col("Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)");
  const iIncR = col("Income Rank (where 1 is most deprived)");
  const iIncD = col("Income Decile (where 1 is most deprived 10% of LSOAs)");
  const iHeaR = col("Health Deprivation and Disability Rank (where 1 is most deprived)");
  const iHeaD = col("Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)");
  const iLivR = col("Living Environment Rank (where 1 is most deprived)");
  const iLivD = col("Living Environment Decile (where 1 is most deprived 10% of LSOAs)");
  const n = lines.length - 1;
  const byCode = new Map<
    string,
    { name: string; rank: Record<Domain, number>; decile: Record<Domain, number> }
  >();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]);
    const code = cols[iCode];
    if (!code) continue;
    byCode.set(code, {
      name: cols[iName],
      rank: { all: Number(cols[iImdR]), income: Number(cols[iIncR]), health: Number(cols[iHeaR]), living: Number(cols[iLivR]) },
      decile: { all: Number(cols[iImdD]), income: Number(cols[iIncD]), health: Number(cols[iHeaD]), living: Number(cols[iLivD]) },
    });
  }
  console.log(`  IMD rows ${byCode.size}`);
  return { n, byCode };
}

async function fetchLsoa(): Promise<Array<{ code: string; name: string; rings: Ring[] }>> {
  if (existsSync(LSOA_CACHE)) {
    const cached = JSON.parse(readFileSync(LSOA_CACHE, "utf8")) as Array<{ code: string; name: string; rings: Ring[] }>;
    console.log(`  cache ${path.basename(LSOA_CACHE)}: ${cached.length}`);
    return cached;
  }
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${WEST},${SOUTH},${EAST},${NORTH}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "LSOA21CD,LSOA21NM",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "2000",
  });
  const res = await fetch(`${LSOA_URL}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`lsoa ${res.status}`);
  const data = (await res.json()) as { features?: any[] };
  const out: Array<{ code: string; name: string; rings: Ring[] }> = [];
  for (const feat of data.features ?? []) {
    const code = String(feat.properties?.LSOA21CD ?? "");
    const name = String(feat.properties?.LSOA21NM ?? code);
    if (!code) continue;
    const groups = ringsOf(feat.geometry);
    const rings: Ring[] = [];
    for (const poly of groups) {
      for (const ring of poly) {
        const pts: Ring = [];
        for (const c of ring) {
          if (!Array.isArray(c) || c.length < 2) continue;
          pts.push(localM(c[1], c[0]));
        }
        if (pts.length >= 3) rings.push(pts);
      }
    }
    if (rings.length) out.push({ code, name, rings });
  }
  writeFileSync(LSOA_CACHE, JSON.stringify(out));
  console.log(`  LSOAs ${out.length}`);
  return out;
}

function encodeRank(field: Float32Array, mask: Uint8Array) {
  const samples: number[] = [];
  for (let i = 0; i < field.length; i++) if (mask[i]) samples.push(field[i]);
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor((samples.length - 1) * 0.06)] ?? 0;
  const hi = samples[Math.floor((samples.length - 1) * 0.94)] ?? 1;
  const span = Math.max(1e-6, hi - lo);
  const idx = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!mask[i]) continue;
    const t = Math.max(0, Math.min(1, (field[i] - lo) / span));
    idx[i] = Math.max(1, Math.round(t * 255));
  }
  return idx;
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    const land = b64Bytes(zones.zones);
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    await download(CSV_URL, CSV);
    const { n: englandN, byCode } = parseImd(CSV);
    const shapes = await fetchLsoa();
    const areas: Area[] = [];
    for (const shape of shapes) {
      const row = byCode.get(shape.code);
      if (!row) continue;
      areas.push({ code: shape.code, name: row.name, rings: shape.rings, rank: row.rank, decile: row.decile });
    }
    console.log(`  matched LSOAs ${areas.length} / ${shapes.length}`);

    const index = new Uint16Array(n);
    const heat: Record<Domain, Float32Array> = {
      all: new Float32Array(n),
      income: new Float32Array(n),
      health: new Float32Array(n),
      living: new Float32Array(n),
    };
    const mask = new Uint8Array(n);
    for (let a = 0; a < areas.length; a++) {
      const area = areas[a];
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const ring of area.rings) {
        for (const p of ring) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.y);
          maxZ = Math.max(maxZ, p.y);
        }
      }
      const c0 = Math.max(0, Math.floor((minX - originX) / cell) - 1);
      const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cell) + 1);
      const r0 = Math.max(0, Math.floor((minZ - originZ) / cell) - 1);
      const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / cell) + 1);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (!land[i] || index[i]) continue;
          const x = originX + (c + 0.5) * cell;
          const z = originZ + (r + 0.5) * cell;
          if (!inPoly(x, z, area.rings)) continue;
          index[i] = a + 1;
          mask[i] = 1;
          for (const domain of DOMAINS) {
            heat[domain][i] = englandN + 1 - area.rank[domain];
          }
        }
      }
    }

    const layers: Record<string, string> = {};
    for (const domain of DOMAINS) layers[domain] = b64(encodeRank(heat[domain], mask));
    let painted = 0;
    for (let i = 0; i < n; i++) if (index[i]) painted++;
    console.log(`  cells ${painted}`);

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      year: 2025,
      england: englandN,
      source: "MHCLG English Indices of Deprivation 2025, LSOA 2021. OGL.",
      layers,
      index: b64u16(index),
      areas: areas.map((a) => ({
        name: a.name,
        rank: a.rank,
        decile: a.decile,
      })),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-deprivation.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-deprivation.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
