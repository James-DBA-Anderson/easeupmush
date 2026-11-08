import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const SEA_CACHE = `${DATA_DIR}/flood-sea.json`;
const SW_CACHE = `${DATA_DIR}/flood-surface.json`;
const OUT = `${DATA_DIR}/portsmouth-flood.json`;
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
const UA = "easeupmush/simpompey (flood)";
const PAGE = 2000;
const BAND: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
const SEA_URL =
  "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/RiskOfFloodingFromRiversAndSea/FeatureServer/0/query";
const SW_URL = {
  3: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/RoFSWExtent1in30/FeatureServer/0/query",
  2: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/RoFSWExtent1in100/FeatureServer/0/query",
  1: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/RoFSWExtent1in1000/FeatureServer/0/query",
} as const;

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number; zones: string };
type Ring = Array<{ x: number; y: number }>;
type Poly = { band: number; rings: Ring[] };

function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function b64Bytes(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function ringsOf(geom: { type: string; coordinates: any }): number[][][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates as number[][][];
  if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][]).flat();
  return [];
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function queryPage(url: string, extra: Record<string, string>, offset: number, orderBy: string | null) {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${WEST},${SOUTH},${EAST},${NORTH}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: String(PAGE),
    resultOffset: String(offset),
    ...extra,
  });
  if (orderBy) params.set("orderByFields", orderBy);
  return getJson(`${url}?${params.toString()}`);
}

async function fetchLayer(url: string, extra: Record<string, string>, cache: string, bandOf: (feat: any) => number): Promise<Poly[]> {
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, "utf8")) as Poly[];
    console.log(`  cache ${path.basename(cache)}: ${cached.length}`);
    return cached;
  }
  const out: Poly[] = [];
  let offset = 0;
  let orderBy: string | null = "objectid";
  for (;;) {
    let data: any;
    try {
      data = await queryPage(url, extra, offset, orderBy);
    } catch (err) {
      if (orderBy === "objectid") {
        orderBy = "OBJECTID";
        data = await queryPage(url, extra, offset, orderBy);
      } else if (orderBy) {
        orderBy = null;
        data = await queryPage(url, extra, offset, orderBy);
      } else {
        throw err;
      }
    }
    if (data?.error) {
      if (orderBy === "objectid") {
        orderBy = "OBJECTID";
        continue;
      }
      if (orderBy) {
        orderBy = null;
        continue;
      }
      throw new Error(JSON.stringify(data.error));
    }
    const feats = (data?.features ?? []) as any[];
    for (const feat of feats) {
      const band = bandOf(feat);
      if (!band) continue;
      const groups = feat.geometry?.type === "MultiPolygon"
        ? (feat.geometry.coordinates as number[][][][])
        : [ringsOf(feat.geometry)];
      for (const rings of groups) {
        const local: Ring[] = [];
        for (const ring of rings) {
          const pts: Ring = [];
          for (const c of ring) {
            if (!Array.isArray(c) || c.length < 2) continue;
            pts.push(localM(c[1], c[0]));
          }
          if (pts.length >= 3) local.push(pts);
        }
        if (local.length) out.push({ band, rings: local });
      }
    }
    console.log(`    ${path.basename(cache)} offset ${offset}: +${feats.length} (kept ${out.length})`);
    if (!data?.properties?.exceededTransferLimit || feats.length === 0) break;
    offset += PAGE;
    await sleep(200);
  }
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

function paint(polys: Poly[], cols: number, rows: number, cell: number, originX: number, originZ: number, land: Uint8Array) {
  const field = new Uint8Array(cols * rows);
  let n = 0;
  for (const poly of polys) {
    n++;
    if (n % 2000 === 0) console.log(`    painted ${n}/${polys.length}`);
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const ring of poly.rings) {
      for (const p of ring) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.y);
        maxZ = Math.max(maxZ, p.y);
      }
    }
    if (!Number.isFinite(minX)) continue;
    const c0 = Math.max(0, Math.floor((minX - originX) / cell) - 1);
    const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cell) + 1);
    const r0 = Math.max(0, Math.floor((minZ - originZ) / cell) - 1);
    const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / cell) + 1);
    const tiny = maxX - minX < cell * 2 && maxZ - minZ < cell * 2;
    const h = cell * 0.5;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (!land[i] || field[i] >= poly.band) continue;
        const x = originX + (c + 0.5) * cell;
        const z = originZ + (r + 0.5) * cell;
        if (tiny) {
          const x0 = originX + c * cell;
          const z0 = originZ + r * cell;
          if (x0 + cell >= minX && x0 <= maxX && z0 + cell >= minZ && z0 <= maxZ) field[i] = poly.band;
          continue;
        }
        if (
          inPoly(x, z, poly.rings) ||
          inPoly(x - h, z - h, poly.rings) ||
          inPoly(x + h, z - h, poly.rings) ||
          inPoly(x - h, z + h, poly.rings) ||
          inPoly(x + h, z + h, poly.rings)
        ) {
          field[i] = poly.band;
        }
      }
    }
  }
  return field;
}

function encode(field: Uint8Array): Uint8Array {
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!field[i]) continue;
    out[i] = Math.round((field[i] / 3) * 255);
  }
  return out;
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const land = b64Bytes(zones.zones);
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    const sea = await fetchLayer(SEA_URL, { outFields: "prob_4band" }, SEA_CACHE, (f) => BAND[String(f.properties?.prob_4band ?? "")] ?? 0);
    const swParts: Poly[] = [];
    if (existsSync(SW_CACHE)) {
      const cached = JSON.parse(readFileSync(SW_CACHE, "utf8")) as Poly[];
      console.log(`  cache ${path.basename(SW_CACHE)}: ${cached.length}`);
      swParts.push(...cached);
    } else {
      for (const [band, url] of Object.entries(SW_URL)) {
        const part = await fetchLayer(url, { outFields: "objectid" }, `${DATA_DIR}/flood-sw${band}.json`, () => Number(band));
        swParts.push(...part);
      }
      writeFileSync(SW_CACHE, JSON.stringify(swParts));
    }

    console.log(`  raster sea ${sea.length} polys`);
    const seaField = paint(sea, cols, rows, cell, originX, originZ, land);
    console.log(`  raster surface ${swParts.length} polys`);
    const swField = paint(swParts, cols, rows, cell, originX, originZ, land);

    const counts = (field: Uint8Array) => {
      let n = [0, 0, 0, 0];
      for (let i = 0; i < field.length; i++) n[field[i]]++;
      return { low: n[1], medium: n[2], high: n[3] };
    };
    console.log("  sea cells", counts(seaField));
    console.log("  surface cells", counts(swField));

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      source: {
        sea: "Environment Agency Risk of Flooding from Rivers and Sea, 4-band likelihood, defences included. OGL.",
        surface: "Environment Agency Risk of Flooding from Surface Water extents (1 in 30 / 100 / 1,000). OGL.",
      },
      sea: b64(encode(seaField)),
      surface: b64(encode(swField)),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-flood.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-flood.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
