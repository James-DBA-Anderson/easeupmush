import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { SOUTH, WEST, NORTH, EAST, SCALE_X, SCALE_Y, localM } from "./bbox.ts";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4893 +units=m +no_defs",
);

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const NO2_CSV = `${DATA_DIR}/mapno22024.csv`;
const PM25_CSV = `${DATA_DIR}/mappm252024g.csv`;
const SHP_ZIP = `${DATA_DIR}/aqd2023_baseyear_shapefile_2023.zip`;
const ROADS_JSON = `${DATA_DIR}/pcm-roadside-portsmouth.json`;
const OUT = `${DATA_DIR}/portsmouth-pollution.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");

const UA = "easeupmush/simpompey (pollution)";
const NO2_URL = "https://uk-air.defra.gov.uk/datastore/pcm/mapno22024.csv";
const PM25_URL = "https://uk-air.defra.gov.uk/datastore/pcm/mappm252024g.csv";
const SHP_URL = "https://uk-air.defra.gov.uk/datastore/pcm/aqd2023_baseyear_shapefile_2023.zip";
const NOISE_DIR = `${DATA_DIR}/noise`;
const NOISE_NODATA = -96;
const NOISE_FLOOR = 40;
const ROAD_NOISE = {
  wcs: "https://environment.data.gov.uk/geoservices/datasets/562c9d56-7c2d-4d42-83bb-578d6e97a517/wcs",
  coverage: "562c9d56-7c2d-4d42-83bb-578d6e97a517__Road_Noise_Lden_England_Round_4_All",
  file: "road-lden.tif",
};
const RAIL_NOISE = {
  wcs: "https://environment.data.gov.uk/geoservices/datasets/3fb3c2d7-292c-4e0a-bd5b-d8e4e1fe2947/wcs",
  coverage: "3fb3c2d7-292c-4e0a-bd5b-d8e4e1fe2947__Rail_Noise_Lden_England_Round_4_All",
  file: "rail-lden.tif",
};

type NoiseRaster = { data: Float32Array; w: number; h: number; minX: number; minY: number; maxX: number; maxY: number };

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number; zones: string };
type Pt = { x: number; y: number };
type Road = { road: string; no2: number; pts: Pt[] };

function localToWgs(x: number, z: number) {
  return { lon: WEST + x / SCALE_X, lat: NORTH + z / SCALE_Y };
}

function osgbToLocal(e: number, n: number): Pt {
  const [lon, lat] = proj4("EPSG:27700", "EPSG:4326", [e, n]) as [number, number];
  return localM(lat, lon);
}

function localToOsgb(x: number, z: number) {
  const { lat, lon } = localToWgs(x, z);
  const [e, n] = proj4("EPSG:4326", "EPSG:27700", [lon, lat]) as [number, number];
  return { e, n };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function b64Bytes(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

function download(url: string, dest: string) {
  if (existsSync(dest)) {
    console.log(`  cache ${path.basename(dest)}`);
    return;
  }
  console.log(`  downloading ${path.basename(dest)}`);
  const buf = execFileSync("curl", ["-fsSL", "-A", UA, url], { maxBuffer: 80 * 1024 * 1024 });
  writeFileSync(dest, buf);
}

function parsePcmCsv(file: string, valueKey: string): Map<string, number> {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const out = new Map<string, number>();
  let header = -1;
  let xi = 1;
  let yi = 2;
  let vi = 3;
  const sw = localToOsgb(0, (SOUTH - NORTH) * SCALE_Y);
  const ne = localToOsgb((EAST - WEST) * SCALE_X, 0);
  const e0 = Math.min(sw.e, ne.e) - 1500;
  const e1 = Math.max(sw.e, ne.e) + 1500;
  const n0 = Math.min(sw.n, ne.n) - 1500;
  const n1 = Math.max(sw.n, ne.n) + 1500;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (header < 0 && line.startsWith("gridcode,")) {
      const cols = line.split(",");
      xi = cols.indexOf("x");
      yi = cols.indexOf("y");
      vi = cols.findIndex((c) => c === valueKey || c.toLowerCase().startsWith(valueKey.slice(0, 4)));
      header = i;
      continue;
    }
    if (header < 0) continue;
    const cols = line.split(",");
    const e = Number(cols[xi]);
    const n = Number(cols[yi]);
    const v = Number(cols[vi]);
    if (!Number.isFinite(e) || !Number.isFinite(n) || !Number.isFinite(v)) continue;
    if (e < e0 || e > e1 || n < n0 || n > n1) continue;
    out.set(`${e},${n}`, v);
  }
  console.log(`  ${path.basename(file)}: ${out.size} cells in bbox`);
  return out;
}

function sampleGrid(grid: Map<string, number>, e: number, n: number): number {
  const x0 = Math.floor((e - 500) / 1000) * 1000 + 500;
  const y0 = Math.floor((n - 500) / 1000) * 1000 + 500;
  const x1 = x0 + 1000;
  const y1 = y0 + 1000;
  const v00 = grid.get(`${x0},${y0}`);
  const v10 = grid.get(`${x1},${y0}`);
  const v01 = grid.get(`${x0},${y1}`);
  const v11 = grid.get(`${x1},${y1}`);
  const known = [v00, v10, v01, v11].filter((v): v is number => v !== undefined);
  if (known.length === 0) return 0;
  if (known.length < 4) return known.reduce((a, b) => a + b, 0) / known.length;
  const tx = (e - x0) / 1000;
  const ty = (n - y0) / 1000;
  const a = v00! * (1 - tx) + v10! * tx;
  const b = v01! * (1 - tx) + v11! * tx;
  return a * (1 - ty) + b * ty;
}

function extractRoads(): Array<{ road: string; no2: number; e: number[]; n: number[] }> {
  if (existsSync(ROADS_JSON)) {
    const cached = JSON.parse(readFileSync(ROADS_JSON, "utf8"));
    console.log(`  roadside cache: ${cached.length}`);
    return cached;
  }
  if (!existsSync(SHP_ZIP)) throw new Error(`Missing ${SHP_ZIP}`);
  const sw = localToOsgb(0, (SOUTH - NORTH) * SCALE_Y);
  const ne = localToOsgb((EAST - WEST) * SCALE_X, 0);
  const e0 = Math.min(sw.e, ne.e) - 400;
  const e1 = Math.max(sw.e, ne.e) + 400;
  const n0 = Math.min(sw.n, ne.n) - 400;
  const n1 = Math.max(sw.n, ne.n) + 400;
  const py = `
import json, struct, sys, zipfile
zip_path, out_path, e0, n0, e1, n1 = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:])
z = zipfile.ZipFile(zip_path)
dbf = z.read("aqd2023_baseyear_shapefile_2023.dbf")
shp = z.read("aqd2023_baseyear_shapefile_2023.shp")
nrec = struct.unpack_from("<I", dbf, 4)[0]
hlen = struct.unpack_from("<H", dbf, 8)[0]
rlen = struct.unpack_from("<H", dbf, 10)[0]
fields = []
off = 32
while off < hlen - 1:
    raw = dbf[off:off+32]
    if raw[0] == 0x0d:
        break
    name = raw[:11].split(b"\\x00", 1)[0].decode("latin1").strip()
    fields.append((name, raw[16]))
    off += 32
def rec_vals(rec):
    p = 1
    out = {}
    for name, length in fields:
        out[name] = rec[p:p+length].decode("latin1", "replace").strip()
        p += length
    return out
pos = 100
dbf_pos = hlen
links = []
for i in range(nrec):
    recno, clen = struct.unpack(">ii", shp[pos:pos+8])
    body = pos + 8
    st = struct.unpack_from("<i", shp, body)[0]
    vals = rec_vals(dbf[dbf_pos:dbf_pos+rlen])
    dbf_pos += rlen
    if st == 3:
        xmin, ymin, xmax, ymax = struct.unpack_from("<4d", shp, body+4)
        if xmax >= e0 and xmin <= e1 and ymax >= n0 and ymin <= n1:
            nparts, npts = struct.unpack_from("<ii", shp, body+36)
            parts = struct.unpack_from("<" + "i"*nparts, shp, body+44)
            pts_off = body + 44 + 4*nparts
            pts = []
            for k in range(npts):
                x, y = struct.unpack_from("<dd", shp, pts_off + k*16)
                if e0 <= x <= e1 and n0 <= y <= n1:
                    pts.append((round(x, 1), round(y, 1)))
            if len(pts) >= 2:
                try:
                    no2 = float(vals.get("rno22023") or 0)
                except ValueError:
                    no2 = 0.0
                if no2 > 0:
                    links.append({"road": vals.get("ROADNUMBER") or "", "no2": no2, "e": [p[0] for p in pts], "n": [p[1] for p in pts]})
    pos += 8 + clen * 2
json.dump(links, open(out_path, "w"))
print("  roadside links", len(links))
`;
  execFileSync("python3", ["-c", py, SHP_ZIP, ROADS_JSON, String(e0), String(n0), String(e1), String(n1)], {
    stdio: "inherit",
  });
  return JSON.parse(readFileSync(ROADS_JSON, "utf8"));
}

function paintRoads(
  roads: Road[],
  cols: number,
  rows: number,
  cell: number,
  originX: number,
  originZ: number,
) {
  const field = new Float32Array(cols * rows);
  const has = new Uint8Array(cols * rows);
  const half = 26;
  const rCells = Math.ceil(half / cell);
  const set = (i: number, v: number) => {
    if (v > field[i]) field[i] = v;
    has[i] = 1;
  };
  for (const road of roads) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const a = road.pts[i];
      const b = road.pts[i + 1];
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
            set(r * cols + c, road.no2);
          }
        }
      }
    }
  }
  return { field, has };
}

function isTiff(buf: Buffer) {
  return (buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d);
}

async function downloadCoverage(
  spec: { wcs: string; coverage: string; file: string },
  e0: number,
  n0: number,
  e1: number,
  n1: number,
): Promise<string> {
  mkdirSync(NOISE_DIR, { recursive: true });
  const dest = path.join(NOISE_DIR, spec.file);
  if (existsSync(dest)) {
    console.log(`  cache ${spec.file}`);
    return dest;
  }
  const url =
    `${spec.wcs}?service=WCS&version=2.0.1&request=GetCoverage` +
    `&coverageid=${encodeURIComponent(spec.coverage)}&format=image/tiff` +
    `&subset=E(${e0},${e1})&subset=N(${n0},${n1})`;
  console.log(`  downloading ${spec.file}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/tiff" } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isTiff(buf)) {
    const hint = buf.subarray(0, 280).toString("utf8").replace(/\s+/g, " ");
    throw new Error(`noise WCS ${spec.file} ${res.status}: ${hint}`);
  }
  writeFileSync(dest, buf);
  return dest;
}

async function readNoiseRaster(file: string): Promise<NoiseRaster> {
  const raw = readFileSync(file);
  const tif = await fromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const image = await tif.getImage();
  const rasters = await image.readRasters();
  const data = rasters[0] as Float32Array;
  const bbox = image.getBoundingBox();
  return { data, w: image.getWidth(), h: image.getHeight(), minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] };
}

function sampleNoise(rasters: NoiseRaster[], e: number, n: number): number {
  let best = 0;
  for (const ras of rasters) {
    if (e < ras.minX || e > ras.maxX || n < ras.minY || n > ras.maxY) continue;
    const resX = (ras.maxX - ras.minX) / ras.w;
    const resY = (ras.maxY - ras.minY) / ras.h;
    const c = Math.floor((e - ras.minX) / resX);
    const r = Math.floor((ras.maxY - n) / resY);
    if (c < 0 || r < 0 || c >= ras.w || r >= ras.h) continue;
    const v = ras.data[r * ras.w + c];
    if (!Number.isFinite(v) || v <= NOISE_NODATA + 1 || v < NOISE_FLOOR) continue;
    if (v > best) best = v;
  }
  return best;
}

function encode(field: Float32Array, mask: Uint8Array): { idx: Uint8Array; lo: number; hi: number; cells: number } {
  const samples: number[] = [];
  for (let i = 0; i < field.length; i++) if (mask[i] && field[i] > 0) samples.push(field[i]);
  samples.sort((a, b) => a - b);
  const lo = percentile(samples, 0.06);
  const hi = percentile(samples, 0.94);
  const span = Math.max(1e-6, hi - lo);
  const idx = new Uint8Array(field.length);
  let cells = 0;
  for (let i = 0; i < field.length; i++) {
    if (!mask[i] || field[i] <= 0) continue;
    const t = Math.max(0, Math.min(1, (field[i] - lo) / span));
    idx[i] = Math.max(1, Math.round(t * 255));
    cells++;
  }
  return { idx, lo, hi, cells };
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    const land = b64Bytes(zones.zones);
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    download(NO2_URL, NO2_CSV);
    download(PM25_URL, PM25_CSV);
    download(SHP_URL, SHP_ZIP);

    const no2Grid = parsePcmCsv(NO2_CSV, "no22024");
    const pmGrid = parsePcmCsv(PM25_CSV, "pm252024g");
    const rawRoads = extractRoads();
    const roads: Road[] = rawRoads.map((r) => ({
      road: r.road,
      no2: r.no2,
      pts: r.e.map((e, i) => osgbToLocal(e, r.n[i])),
    }));
    console.log(`  roadside ways: ${roads.length}`);

    const no2 = new Float32Array(n);
    const pm25 = new Float32Array(n);
    const no2Has = new Uint8Array(n);
    const pmHas = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!land[i]) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = originX + (col + 0.5) * cell;
      const z = originZ + (row + 0.5) * cell;
      const { e, n: nn } = localToOsgb(x, z);
      const nv = sampleGrid(no2Grid, e, nn);
      const pv = sampleGrid(pmGrid, e, nn);
      if (nv > 0) {
        no2[i] = nv;
        no2Has[i] = 1;
      }
      if (pv > 0) {
        pm25[i] = pv;
        pmHas[i] = 1;
      }
    }

    const painted = paintRoads(roads, cols, rows, cell, originX, originZ);
    let roadCells = 0;
    for (let i = 0; i < n; i++) {
      if (!painted.has[i]) continue;
      if (painted.field[i] > no2[i]) no2[i] = painted.field[i];
      no2Has[i] = 1;
      roadCells++;
    }
    console.log(`  roadside cells: ${roadCells}`);

    const sw = localToOsgb(0, (SOUTH - NORTH) * SCALE_Y);
    const ne = localToOsgb((EAST - WEST) * SCALE_X, 0);
    const e0 = Math.floor((Math.min(sw.e, ne.e) - 200) / 10) * 10;
    const e1 = Math.ceil((Math.max(sw.e, ne.e) + 200) / 10) * 10;
    const n0 = Math.floor((Math.min(sw.n, ne.n) - 200) / 10) * 10;
    const n1 = Math.ceil((Math.max(sw.n, ne.n) + 200) / 10) * 10;
    const roadTif = await downloadCoverage(ROAD_NOISE, e0, n0, e1, n1);
    const railTif = await downloadCoverage(RAIL_NOISE, e0, n0, e1, n1);
    const noiseRasters = [await readNoiseRaster(roadTif), await readNoiseRaster(railTif)];
    const noise = new Float32Array(n);
    const noiseHas = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!land[i]) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = originX + (col + 0.5) * cell;
      const z = originZ + (row + 0.5) * cell;
      const os = localToOsgb(x, z);
      const db = sampleNoise(noiseRasters, os.e, os.n);
      if (db > 0) {
        noise[i] = db;
        noiseHas[i] = 1;
      }
    }

    const no2Enc = encode(no2, no2Has);
    const pmEnc = encode(pm25, pmHas);
    const noiseEnc = encode(noise, noiseHas);
    console.log(
      `  NO2 cells ${no2Enc.cells}  ${no2Enc.lo.toFixed(1)}–${no2Enc.hi.toFixed(1)} µg/m³  PM2.5 cells ${pmEnc.cells}  ${pmEnc.lo.toFixed(1)}–${pmEnc.hi.toFixed(1)} µg/m³  noise cells ${noiseEnc.cells}  ${noiseEnc.lo.toFixed(1)}–${noiseEnc.hi.toFixed(1)} dB Lden`,
    );

    const roadPts = roads
      .filter((r) => r.road && r.pts.length)
      .map((r) => {
        const mid = r.pts[(r.pts.length / 2) | 0];
        return { road: r.road, x: Math.round(mid.x), z: Math.round(mid.y), no2: Math.round(r.no2 * 10) / 10 };
      });

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      year: 2024,
      roadsideYear: 2023,
      no2Lo: no2Enc.lo,
      no2Hi: no2Enc.hi,
      pm25Lo: pmEnc.lo,
      pm25Hi: pmEnc.hi,
      noiseLo: noiseEnc.lo,
      noiseHi: noiseEnc.hi,
      source: {
        background: "Defra PCM modelled background annual mean, 2024, 1 km. OGL.",
        roadside: "Defra PCM roadside NO2 annual mean on urban A-roads, 2023. OGL.",
        noise: "Defra Round 4 strategic noise mapping, road + rail Lden, 10 m, 2022. OGL.",
      },
      no2: b64(no2Enc.idx),
      pm25: b64(pmEnc.idx),
      noise: b64(noiseEnc.idx),
      roads: roadPts,
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-pollution.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-pollution.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
