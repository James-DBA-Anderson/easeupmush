import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { SOUTH, WEST, NORTH, EAST, localM } from "./bbox.ts";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const ZIP = `${DATA_DIR}/census2021-ts006.zip`;
const CSV = `${DATA_DIR}/census2021-ts006-oa.csv`;
const OA_CACHE = `${DATA_DIR}/oa-portsmouth.json`;
const OUT = `${DATA_DIR}/portsmouth-population.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");

const UA = "easeupmush/simpompey (density)";
const ZIP_URL = "https://www.nomisweb.co.uk/output/census/2021/census2021-ts006.zip";
const OA_URL =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Output_Areas_2021_EW_BGC_V2/FeatureServer/0/query";

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number; zones: string };
type Ring = Array<{ x: number; y: number }>;
type Area = { code: string; name: string; rings: Ring[]; density: number };

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

function ensureCsv() {
  if (existsSync(CSV)) {
    console.log(`  cache ${path.basename(CSV)}`);
    return;
  }
  if (!existsSync(ZIP)) throw new Error(`Missing ${ZIP}`);
  execFileSync("unzip", ["-o", "-j", ZIP, "census2021-ts006-oa.csv", "-d", DATA_DIR], { stdio: "inherit" });
}

function parseDensity(file: string) {
  const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const iCode = head.findIndex((h) => /geography code/i.test(h));
  const iVal = head.findIndex((h) => /population density/i.test(h) || /obs/i.test(h) || /value/i.test(h));
  if (iCode < 0 || iVal < 0) throw new Error(`Unexpected TS006 columns: ${head.join(" | ")}`);
  const byCode = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]);
    const code = cols[iCode];
    const density = Number(cols[iVal]);
    if (!code || !Number.isFinite(density)) continue;
    byCode.set(code, density);
  }
  console.log(`  density rows ${byCode.size}`);
  return byCode;
}

async function fetchOa(): Promise<Array<{ code: string; name: string; rings: Ring[] }>> {
  if (existsSync(OA_CACHE)) {
    const cached = JSON.parse(readFileSync(OA_CACHE, "utf8")) as Array<{ code: string; name: string; rings: Ring[] }>;
    console.log(`  cache ${path.basename(OA_CACHE)}: ${cached.length}`);
    return cached;
  }
  const out: Array<{ code: string; name: string; rings: Ring[] }> = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: `${WEST},${SOUTH},${EAST},${NORTH}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OA21CD,LSOA21CD,LSOA21NM",
      outSR: "4326",
      f: "geojson",
      resultRecordCount: "2000",
      resultOffset: String(offset),
    });
    const res = await fetch(`${OA_URL}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(`oa ${res.status}`);
    const data = (await res.json()) as { features?: any[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } };
    const feats = data.features ?? [];
    for (const feat of feats) {
      const code = String(feat.properties?.OA21CD ?? "");
      const name = String(feat.properties?.LSOA21NM ?? feat.properties?.LSOA21CD ?? code);
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
    offset += feats.length;
    const more = Boolean(data.exceededTransferLimit) || feats.length === 2000;
    if (!more || !feats.length) break;
  }
  writeFileSync(OA_CACHE, JSON.stringify(out));
  console.log(`  OAs ${out.length}`);
  return out;
}

function encodeLog(field: Float32Array, mask: Uint8Array) {
  const samples: number[] = [];
  for (let i = 0; i < field.length; i++) if (mask[i] && field[i] > 0) samples.push(Math.log(field[i]));
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor((samples.length - 1) * 0.06)] ?? 0;
  const hi = samples[Math.floor((samples.length - 1) * 0.94)] ?? 1;
  const span = Math.max(1e-6, hi - lo);
  const idx = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!mask[i] || field[i] <= 0) continue;
    const t = Math.max(0, Math.min(1, (Math.log(field[i]) - lo) / span));
    idx[i] = Math.max(1, Math.round(t * 255));
  }
  return { idx, lo: Math.exp(lo), hi: Math.exp(hi) };
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    const land = b64Bytes(zones.zones);
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    await download(ZIP_URL, ZIP);
    ensureCsv();
    const byCode = parseDensity(CSV);
    const shapes = await fetchOa();
    const areas: Area[] = [];
    for (const shape of shapes) {
      const density = byCode.get(shape.code);
      if (density === undefined) continue;
      areas.push({ code: shape.code, name: shape.name, rings: shape.rings, density });
    }
    console.log(`  matched OAs ${areas.length} / ${shapes.length}`);

    const index = new Uint16Array(n);
    const heat = new Float32Array(n);
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
          heat[i] = area.density;
        }
      }
    }

    const packed = encodeLog(heat, mask);
    let painted = 0;
    for (let i = 0; i < n; i++) if (index[i]) painted++;
    console.log(`  cells ${painted}  ${packed.lo.toFixed(0)}–${packed.hi.toFixed(0)} /km²`);

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      year: 2021,
      densityLo: packed.lo,
      densityHi: packed.hi,
      source: "ONS Census 2021 TS006 population density, Output Areas. Persons per km². OGL.",
      density: b64(packed.idx),
      index: b64u16(index),
      areas: areas.map((a) => ({ name: a.name, density: Math.round(a.density * 10) / 10 })),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-population.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-population.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
