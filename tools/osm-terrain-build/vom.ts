import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4893 +units=m +no_defs",
);

const WCS =
  "https://environment.data.gov.uk/geoservices/datasets/ecae3bef-1e1d-4051-887b-9dc613c928ec/wcs";
const COVERAGE = "ecae3bef-1e1d-4051-887b-9dc613c928ec__Vegetation_Object_Model_Elevation_2022";
const TILE = 2000;
const PEAK_R = 6;
const MIN_H = 2.5;
const MAX_H = 32;

export type VomPeak = { x: number; z: number; h: number };

export function wgs84ToOsgb(lat: number, lon: number) {
  const [e, n] = proj4("EPSG:4326", "EPSG:27700", [lon, lat]) as [number, number];
  return { e, n };
}

export function osgbToWgs84(e: number, n: number) {
  const [lon, lat] = proj4("EPSG:27700", "EPSG:4326", [e, n]) as [number, number];
  return { lat, lon };
}

function tileName(e0: number, n0: number) {
  return `vom-E${e0}-N${n0}.tif`;
}

function isTiff(buf: Buffer) {
  return (buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d);
}

async function downloadTile(cacheDir: string, e0: number, n0: number): Promise<string> {
  const dest = path.join(cacheDir, tileName(e0, n0));
  if (existsSync(dest)) return dest;
  const e1 = e0 + TILE;
  const n1 = n0 + TILE;
  const url =
    `${WCS}?service=WCS&version=2.0.1&request=GetCoverage` +
    `&coverageid=${COVERAGE}&format=image/tiff` +
    `&subset=E(${e0},${e1})&subset=N(${n0},${n1})`;
  console.log(`  VOM tile ${e0},${n0}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "EaseUpMush SimPompey vegetation (OGL reuse)" },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isTiff(buf)) {
    const hint = buf.subarray(0, 280).toString("utf8").replace(/\s+/g, " ");
    throw new Error(`VOM WCS failed ${res.status} for ${e0},${n0}: ${hint}`);
  }
  writeFileSync(dest, buf);
  return dest;
}

function peakPick(data: Float32Array, w: number, h: number): Array<{ c: number; r: number; v: number }> {
  const out: Array<{ c: number; r: number; v: number }> = [];
  const at = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= h || c >= w) return 0;
    const v = data[r * w + c];
    return Number.isFinite(v) && v >= MIN_H ? v : 0;
  };
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = at(r, c);
      if (v < MIN_H || v > MAX_H) continue;
      let peak = true;
      for (let dr = -PEAK_R; dr <= PEAK_R && peak; dr++) {
        for (let dc = -PEAK_R; dc <= PEAK_R; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (at(r + dr, c + dc) > v) {
            peak = false;
            break;
          }
        }
      }
      if (peak) out.push({ c, r, v });
    }
  }
  return out;
}

export async function extractVomPeaks(opts: {
  south: number;
  west: number;
  north: number;
  east: number;
  localM: (lat: number, lon: number) => { x: number; y: number };
  cacheDir: string;
}): Promise<VomPeak[]> {
  mkdirSync(opts.cacheDir, { recursive: true });
  const corners = [
    wgs84ToOsgb(opts.south, opts.west),
    wgs84ToOsgb(opts.south, opts.east),
    wgs84ToOsgb(opts.north, opts.west),
    wgs84ToOsgb(opts.north, opts.east),
  ];
  const minE = Math.min(...corners.map((c) => c.e)) - 50;
  const maxE = Math.max(...corners.map((c) => c.e)) + 50;
  const minN = Math.min(...corners.map((c) => c.n)) - 50;
  const maxN = Math.max(...corners.map((c) => c.n)) + 50;
  const e0 = Math.floor(minE / TILE) * TILE;
  const n0 = Math.floor(minN / TILE) * TILE;

  const peaks: VomPeak[] = [];
  for (let e = e0; e < maxE; e += TILE) {
    for (let n = n0; n < maxN; n += TILE) {
      const file = await downloadTile(opts.cacheDir, e, n);
      const raw = readFileSync(file);
      const tif = await fromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      const image = await tif.getImage();
      const rasters = await image.readRasters();
      const data = rasters[0] as Float32Array;
      const w = image.getWidth();
      const h = image.getHeight();
      const bbox = image.getBoundingBox();
      const resX = (bbox[2] - bbox[0]) / w;
      const resY = (bbox[3] - bbox[1]) / h;
      const found = peakPick(data, w, h);
      for (const p of found) {
        const easting = bbox[0] + (p.c + 0.5) * resX;
        const northing = bbox[3] - (p.r + 0.5) * resY;
        const { lat, lon } = osgbToWgs84(easting, northing);
        if (lat < opts.south || lat > opts.north || lon < opts.west || lon > opts.east) continue;
        const { x, y: z } = opts.localM(lat, lon);
        peaks.push({ x, z, h: p.v });
      }
      console.log(`    ${found.length} peaks in tile ${e},${n}`);
    }
  }
  return peaks;
}
