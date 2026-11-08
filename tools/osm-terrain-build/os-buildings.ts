import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OS_DIR = `${DATA_DIR}/os`;
const GZ = `${OS_DIR}/ms-uk-031313132.csv.gz`;
const OUT = `${DATA_DIR}/portsmouth-os-buildings.json`;
const URL =
  "https://bfppub.z5.web.core.windows.net/2026-08-13/global-buildings.geojsonl/RegionName=UnitedKingdom/quadkey=031313132/part-00169-110f5303-ff85-4c71-a2bf-c6070024fec8.c000.csv.gz";

export type ExtraBuilding = { nodes: [number, number][]; h?: number };

function ensureGz() {
  if (existsSync(GZ)) return;
  mkdirSync(OS_DIR, { recursive: true });
  console.log("Downloading Microsoft UK building footprints…");
  execSync(`curl -L --fail -A easeupmush-simpompey/0.1 -o "${GZ}" "${URL}"`, { stdio: "inherit" });
}

function ringFromGeom(geom: { type?: string; coordinates?: unknown }): [number, number][] | null {
  if (!geom?.coordinates) return null;
  let ring: number[][] | undefined;
  if (geom.type === "Polygon") ring = (geom.coordinates as number[][][])[0];
  else if (geom.type === "MultiPolygon") ring = (geom.coordinates as number[][][][])[0]?.[0];
  if (!ring || ring.length < 4) return null;
  const nodes: [number, number][] = [];
  for (const p of ring) {
    const lat = Math.round(p[1] * 1e6) / 1e6;
    const lon = Math.round(p[0] * 1e6) / 1e6;
    const prev = nodes[nodes.length - 1];
    if (prev && prev[0] === lat && prev[1] === lon) continue;
    nodes.push([lat, lon]);
  }
  if (nodes.length > 1) {
    const f = nodes[0];
    const l = nodes[nodes.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) nodes.pop();
  }
  return nodes.length >= 3 ? nodes : null;
}

async function main() {
  ensureGz();
  const kept: ExtraBuilding[] = [];
  let total = 0;
  const rl = createInterface({
    input: createReadStream(GZ).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    total++;
    let feat: { geometry?: { type?: string; coordinates?: unknown }; properties?: { height?: number } };
    try {
      feat = JSON.parse(line);
    } catch {
      continue;
    }
    const nodes = ringFromGeom(feat.geometry ?? {});
    if (!nodes) continue;
    const lat = nodes.reduce((s, p) => s + p[0], 0) / nodes.length;
    const lon = nodes.reduce((s, p) => s + p[1], 0) / nodes.length;
    if (!inBox(lat, lon)) continue;
    const h = feat.properties?.height;
    kept.push(Number.isFinite(h) && (h as number) >= 2.5 ? { nodes, h: Math.round((h as number) * 10) / 10 } : { nodes });
  }

  writeFileSync(OUT, JSON.stringify(kept));
  const caris = kept.filter((b) => {
    const lat = b.nodes.reduce((s, p) => s + p[0], 0) / b.nodes.length;
    const lon = b.nodes.reduce((s, p) => s + p[1], 0) / b.nodes.length;
    return lat >= 50.7947 && lat <= 50.7963 && lon >= -1.0668 && lon <= -1.0608;
  });
  console.log(`Read ${total} footprints, kept ${kept.length} in bbox → ${OUT}`);
  console.log(`  Carisbrooke block: ${caris.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
