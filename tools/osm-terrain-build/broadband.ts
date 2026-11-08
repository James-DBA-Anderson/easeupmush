import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const POST_CACHE = `${DATA_DIR}/postcodes-po.json`;
const OFCOM_DIR = `${DATA_DIR}/ofcom`;
const COVER_ZIP = `${OFCOM_DIR}/202507_fixed_broadband_coverage_r01.zip`;
const COVER_INNER = `${OFCOM_DIR}/202507_fixed_pc_coverage_r01.zip`;
const COVER_CSV = `${OFCOM_DIR}/202507_fixed_pc_coverage_r01_PO.csv`;
const PERF_ZIP = `${OFCOM_DIR}/202305_fixed_postcode_performance_r01.zip`;
const PERF_CSV = `${OFCOM_DIR}/202305_fixed_pc_performance_r01_PO.csv`;
const CELL_GZ = `${DATA_DIR}/cell_towers.csv.gz`;
const CELL_CACHE = `${DATA_DIR}/opencellid-portsmouth.json`;
const WTR_CSV = `${DATA_DIR}/WTR.csv`;
const WTR_CACHE = `${DATA_DIR}/wtr-portsmouth.json`;
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
const UA = "easeupmush/simpompey (broadband)";
const WANT_OUT = new Set(["PO1", "PO2", "PO3", "PO4", "PO5", "PO6", "PO12", "PO13"]);
const COVER_URL =
  "https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/multi-sector/infrastructure-research/connected-nations-2025/202507_fixed_broadband_coverage_r01.zip?v=407830";
const PERF_URL =
  "https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/multi-sector/infrastructure-research/connected-nations-2023/data-downloads/202305_fixed_postcode_performance_r01.zip?v=194397";
const WTR_URL = "https://static.ofcom.org.uk/static/radiolicensing/html/register/WTR.csv";
const CELL_URL = "https://huggingface.co/datasets/yuiseki/opencellid/resolve/main/raw/2026-10-06/cell_towers.csv.gz";
const MNC: Record<number, string> = {
  10: "O2",
  11: "O2",
  15: "Vodafone",
  20: "Three",
  30: "EE",
  31: "EE",
  32: "EE",
  33: "EE",
  34: "EE",
  55: "Three",
  91: "Vodafone",
};

type ZoneFile = { cell: number; originX: number; originZ: number; cols: number; rows: number };
type Geo = Record<string, { lat: number; lon: number }>;
type CoverRow = { postcode: string; gigabit: number; superfast: number; slow: number };
type SpeedRow = { postcode: string; down: number; up: number };
type Site = { lat: number; lon: number; name: string; kind: "osm" | "cell" | "licence"; detail: string };

function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function outcode(pc: string) {
  return pc.replace(/\s+/g, "").toUpperCase().slice(0, -3);
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
  if (existsSync(dest) && (path.extname(dest) !== ".csv" || readFileSync(dest).byteLength > 1000)) {
    console.log(`  cache ${path.basename(dest)}`);
    return;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`  downloading ${path.basename(dest)}`);
  execFileSync("curl", ["-fL", "--retry", "3", "-A", UA, "-o", dest, url], { stdio: "inherit" });
}

function extract(zip: string, member: string, dest: string) {
  if (existsSync(dest)) {
    console.log(`  cache ${path.basename(dest)}`);
    return;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, execFileSync("unzip", ["-p", zip, member], { maxBuffer: 40 * 1024 * 1024 }));
}

function parseCsvLine(line: string): string[] {
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

async function geocode(postcodes: string[]): Promise<Geo> {
  const out: Geo = existsSync(POST_CACHE) ? JSON.parse(readFileSync(POST_CACHE, "utf8")) : {};
  const missing = postcodes.filter((p) => !out[p]);
  console.log(`  postcodes ${postcodes.length}, cached ${postcodes.length - missing.length}, lookup ${missing.length}`);
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ postcodes: batch }),
    });
    if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
    const data = (await res.json()) as { result: Array<{ query: string; result: { latitude: number; longitude: number } | null }> };
    for (const row of data.result ?? []) {
      if (row.result) out[row.query] = { lat: row.result.latitude, lon: row.result.longitude };
    }
    if ((i / 100) % 5 === 0) console.log(`  geocoded ${Math.min(i + 100, missing.length)}/${missing.length}`);
  }
  writeFileSync(POST_CACHE, JSON.stringify(out));
  return out;
}

function splat(
  n: number,
  cols: number,
  rows: number,
  cell: number,
  originX: number,
  originZ: number,
  points: Array<{ x: number; y: number; v: number }>,
  radius: number,
  fillPasses = 8,
) {
  const sumV = new Float64Array(n);
  const sumW = new Float64Array(n);
  const rCells = Math.ceil(radius / cell);
  let used = 0;
  for (const p of points) {
    const col = Math.floor((p.x - originX) / cell);
    const row = Math.floor((p.y - originZ) / cell);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    used++;
    for (let dr = -rCells; dr <= rCells; dr++) {
      for (let dc = -rCells; dc <= rCells; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const dist = Math.hypot(dc * cell, dr * cell);
        if (dist > radius) continue;
        const t = 1 - dist / radius;
        const w = t * t;
        const i = r * cols + c;
        sumV[i] += w * p.v;
        sumW[i] += w;
      }
    }
  }
  const field = new Float32Array(n);
  const has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (sumW[i] > 0) {
      field[i] = sumV[i] / sumW[i];
      has[i] = 1;
    }
  }
  const next = new Float32Array(n);
  for (let pass = 0; pass < fillPasses; pass++) {
    next.set(field);
    for (let i = 0; i < n; i++) {
      if (has[i]) continue;
      const c = i % cols;
      const r = (i / cols) | 0;
      let v = 0;
      let w = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const j = rr * cols + cc;
          if (!has[j] && pass === 0) continue;
          if (!has[j] && field[j] === 0) continue;
          const ww = dc && dr ? 0.7 : 1;
          v += field[j] * ww;
          w += ww;
        }
      }
      if (w > 0) {
        next[i] = v / w;
        has[i] = 1;
      }
    }
    field.set(next);
  }
  return { field, has, used };
}

function packPct(field: Float32Array, has: Uint8Array): Uint8Array {
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!has[i]) continue;
    out[i] = 1 + Math.round(Math.max(0, Math.min(100, field[i])) * 2.54);
  }
  return out;
}

function packHeat(field: Float32Array, has: Uint8Array, lo: number, hi: number): Uint8Array {
  const span = Math.max(1e-6, hi - lo);
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    if (!has[i]) continue;
    const t = Math.max(0, Math.min(1, (field[i] - lo) / span));
    out[i] = Math.max(1, Math.round(t * 255));
  }
  return out;
}

function readCover(): CoverRow[] {
  const lines = readFileSync(COVER_CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  const col = (label: string) => {
    const i = head.findIndex((h) => h === label);
    if (i < 0) throw new Error(`coverage missing ${label}`);
    return i;
  };
  const iPc = col("postcode_space");
  const iGig = col("Gigabit availability (% premises)");
  const iSfbb = col("SFBB availability (% premises)");
  const iSlow = col("% of premises unable to receive 30Mbit/s");
  const out: CoverRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const postcode = (row[iPc] || row[0] || "").trim().toUpperCase();
    if (!WANT_OUT.has(outcode(postcode.replace(/\s+/g, "")))) continue;
    const gigabit = Number(row[iGig]);
    const superfast = Number(row[iSfbb]);
    const slow = Number(row[iSlow]);
    if (![gigabit, superfast, slow].every(Number.isFinite)) continue;
    out.push({ postcode, gigabit, superfast, slow });
  }
  return out;
}

function readSpeeds(): SpeedRow[] {
  const lines = readFileSync(PERF_CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  const col = (label: string) => {
    const i = head.findIndex((h) => h === label);
    if (i < 0) throw new Error(`speeds missing ${label}`);
    return i;
  };
  const iPc = col("postcode_space");
  const iDown = col("Median download speed (Mbit/s)");
  const iUp = col("Median upload speed (Mbit/s)");
  const out: SpeedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const postcode = (row[iPc] || row[0] || "").trim().toUpperCase();
    if (!WANT_OUT.has(outcode(postcode.replace(/\s+/g, "")))) continue;
    const down = Number(row[iDown]);
    const up = Number(row[iUp]);
    if (!Number.isFinite(down) || down <= 0) continue;
    out.push({ postcode, down, up: Number.isFinite(up) && up > 0 ? up : 0 });
  }
  return out;
}

function parseOsmMasts(): Site[] {
  if (!existsSync(OSM_PATH)) return [];
  const out: Site[] = [];
  const buf = readFileSync(OSM_PATH, "utf8");
  let i = 0;
  while (i < buf.length) {
    const start = buf.indexOf("<node ", i);
    if (start < 0) break;
    const endOpen = buf.indexOf(">", start);
    if (endOpen < 0) break;
    const head = buf.slice(start, endOpen + 1);
    i = endOpen + 1;
    if (head.endsWith("/>")) continue;
    const end = buf.indexOf("</node>", i);
    if (end < 0) break;
    const block = buf.slice(i, end);
    i = end + 7;
    if (!/man_made|tower:type|communication|telecom/.test(block)) continue;
    const tags: Record<string, string> = {};
    const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(block))) tags[t[1]] = t[2];
    const mm = tags.man_made ?? "";
    const tt = (tags["tower:type"] ?? "").toLowerCase();
    const comm = (tags.communication ?? "").toLowerCase();
    const tel = (tags.telecom ?? "").toLowerCase();
    const hit =
      mm === "mast" ||
      mm === "communications_tower" ||
      mm === "antenna" ||
      (mm === "tower" && /communication|cellular|mobile|radio|microwave/.test(tt)) ||
      comm === "mobile" ||
      comm === "mobile_phone" ||
      tel === "antenna" ||
      tel === "tower" ||
      tel === "mast";
    if (!hit) continue;
    const latM = /lat="([^"]+)"/.exec(head);
    const lonM = /lon="([^"]+)"/.exec(head);
    const lat = Number(latM?.[1]);
    const lon = Number(lonM?.[1]);
    if (!Number.isFinite(lat) || lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST) continue;
    out.push({
      lat,
      lon,
      name: tags.name || tags.operator || "Mast",
      kind: "osm",
      detail: [tags.operator, tt || mm].filter(Boolean).join(" · "),
    });
  }
  return out;
}

async function readCells(): Promise<Site[]> {
  if (existsSync(CELL_CACHE)) {
    const raw = JSON.parse(readFileSync(CELL_CACHE, "utf8")) as Array<Site | { lat: number; lon: number; radio?: string; net?: number; samples?: number }>;
    if (raw[0] && "kind" in raw[0]) return raw as Site[];
    return raw.map((row) => ({
      lat: row.lat,
      lon: row.lon,
      name: MNC[(row as { net?: number }).net ?? -1] || "Mobile cell",
      kind: "cell" as const,
      detail: [(row as { radio?: string }).radio, (row as { samples?: number }).samples ? `${(row as { samples: number }).samples} samples` : ""]
        .filter(Boolean)
        .join(" · "),
    }));
  }
  if (!existsSync(CELL_GZ)) return [];
  const sites: Site[] = [];
  const rl = createInterface({ input: createReadStream(CELL_GZ).pipe(createGunzip()) });
  let header = true;
  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    const parts = line.split(",");
    if (parts.length < 8) continue;
    const mcc = Number(parts[1]);
    const lon = Number(parts[6]);
    const lat = Number(parts[7]);
    if (mcc !== 234 || lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST) continue;
    const net = Number(parts[2]);
    const radio = parts[0];
    const samples = Number(parts[9] || 1);
    sites.push({
      lat,
      lon,
      name: MNC[net] || `MNC ${net}`,
      kind: "cell",
      detail: `${radio}${Number.isFinite(samples) ? ` · ${samples} samples` : ""}`,
    });
  }
  writeFileSync(CELL_CACHE, JSON.stringify(sites));
  return sites;
}

function readWtr(): Site[] {
  if (existsSync(WTR_CACHE)) {
    const raw = JSON.parse(readFileSync(WTR_CACHE, "utf8")) as Array<{
      lat: number;
      lon: number;
      product: string;
      company: string;
      freqHz: string;
      ngr: string;
    }>;
    const by = new Map<string, Site & { n: number; products: Set<string> }>();
    for (const row of raw) {
      const key = row.ngr || `${row.lat.toFixed(4)}_${row.lon.toFixed(4)}`;
      let site = by.get(key);
      if (!site) {
        site = {
          lat: row.lat,
          lon: row.lon,
          name: row.company || "Licensed transmitter",
          kind: "licence",
          detail: "",
          n: 0,
          products: new Set(),
        };
        by.set(key, site);
      }
      site.n++;
      if (row.product) site.products.add(row.product);
      const mhz = Number(row.freqHz) / 1e6;
      if (Number.isFinite(mhz) && mhz > 0 && !site.detail.includes("MHz")) {
        site.detail = `${mhz >= 1000 ? `${(mhz / 1000).toFixed(1)} GHz` : `${mhz.toFixed(mhz >= 100 ? 0 : 1)} MHz`}`;
      }
    }
    return [...by.values()].map((s) => ({
      lat: s.lat,
      lon: s.lon,
      name: s.name,
      kind: "licence" as const,
      detail: [s.name === "Licensed transmitter" ? "" : [...s.products].slice(0, 2).join(", "), s.detail]
        .filter(Boolean)
        .join(" · "),
    }));
  }
  return [];
}

function publish(name: string, json: object) {
  const out = path.join(DATA_DIR, name);
  writeFileSync(out, JSON.stringify(json));
  mkdirSync(GAME_MODELS, { recursive: true });
  mkdirSync(GAME_PUBLIC, { recursive: true });
  copyFileSync(out, path.join(GAME_MODELS, name));
  copyFileSync(out, path.join(GAME_PUBLIC, name));
  console.log(`Wrote ${out} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
}

function ensureSources() {
  mkdirSync(OFCOM_DIR, { recursive: true });
  download(COVER_URL, COVER_ZIP);
  download(PERF_URL, PERF_ZIP);
  if (!existsSync(COVER_INNER)) {
    extract(COVER_ZIP, "202507_fixed_coverage_r01/202507_fixed_pc_coverage_r01.zip", COVER_INNER);
  }
  extract(COVER_INNER, "202507_fixed_pc_coverage_r01/postcode_files/202507_fixed_pc_coverage_r01_PO.csv", COVER_CSV);
  extract(PERF_ZIP, "202305_fixed_pc_performance_r01/202305_fixed_pc_performance_r01_PO.csv", PERF_CSV);
  if (!existsSync(WTR_CACHE) && !existsSync(WTR_CSV)) download(WTR_URL, WTR_CSV);
  if (!existsSync(CELL_CACHE) && !existsSync(CELL_GZ)) {
    try {
      download(CELL_URL, CELL_GZ);
    } catch (err) {
      console.warn("  OpenCelliD dump skipped:", err);
    }
  }
}

function loadWtrCache() {
  if (existsSync(WTR_CACHE) || !existsSync(WTR_CSV)) return;
  const lines = readFileSync(WTR_CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  const idx = (label: string) => head.indexOf(label);
  const iLat = idx("Latitude(Deg)");
  const iLon = idx("Longitude(Deg)");
  const iCo = idx("Licencee Company");
  const iProd = idx("Product Description");
  const iFreq = idx("Frequency (Hz)");
  const iNgr = idx("NGR");
  const iEw = idx("SID_LONG_E_W");
  const rows: Array<{ lat: number; lon: number; product: string; company: string; freqHz: string; ngr: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    let lat = Number(row[iLat]);
    let lon = Number(row[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (row[iEw] === "W" && lon > 0) lon = -lon;
    if (lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST) continue;
    rows.push({
      lat,
      lon,
      product: row[iProd] || "",
      company: row[iCo] || "",
      freqHz: row[iFreq] || "",
      ngr: row[iNgr] || "",
    });
  }
  writeFileSync(WTR_CACHE, JSON.stringify(rows));
  console.log(`  WTR in bbox: ${rows.length}`);
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    ensureSources();
    loadWtrCache();
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    const cover = readCover();
    const speeds = readSpeeds();
    const codes = [...new Set([...cover.map((r) => r.postcode), ...speeds.map((r) => r.postcode)])];
    const geo = await geocode(codes);

    const pts = (rows: Array<{ postcode: string } & Record<string, number>>, key: string) => {
      const out: Array<{ x: number; y: number; v: number }> = [];
      for (const row of rows) {
        const g = geo[row.postcode];
        if (!g || g.lat < SOUTH || g.lat > NORTH || g.lon < WEST || g.lon > EAST) continue;
        const { x, y } = localM(g.lat, g.lon);
        out.push({ x, y, v: row[key] });
      }
      return out;
    };

    const gig = splat(n, cols, rows, cell, originX, originZ, pts(cover, "gigabit"), 110);
    const sfbb = splat(n, cols, rows, cell, originX, originZ, pts(cover, "superfast"), 110);
    const slow = splat(n, cols, rows, cell, originX, originZ, pts(cover, "slow"), 110);
    console.log(`  coverage postcodes ${gig.used}`);
    publish("portsmouth-broadband.json", {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      source: "Ofcom Connected Nations 2025, July snapshot, postcode coverage. OGL.",
      layers: {
        gigabit: b64(packPct(gig.field, gig.has)),
        superfast: b64(packPct(sfbb.field, sfbb.has)),
        slow: b64(packPct(slow.field, slow.has)),
      },
    });

    const downPts = pts(speeds, "down").map((p) => ({ ...p, v: Math.log(p.v) }));
    const upPts = pts(speeds, "up").filter((p) => p.v > 0).map((p) => ({ ...p, v: Math.log(p.v) }));
    const down = splat(n, cols, rows, cell, originX, originZ, downPts, 130);
    const up = splat(n, cols, rows, cell, originX, originZ, upPts, 130);
    const downVals = downPts.map((p) => p.v).sort((a, b) => a - b);
    const upVals = upPts.map((p) => p.v).sort((a, b) => a - b);
    const downLo = percentile(downVals, 0.06);
    const downHi = percentile(downVals, 0.94);
    const upLo = percentile(upVals, 0.06);
    const upHi = percentile(upVals, 0.94);
    console.log(`  speed postcodes ${down.used}  down ${Math.exp(downLo).toFixed(0)}–${Math.exp(downHi).toFixed(0)} Mbps`);
    publish("portsmouth-speeds.json", {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      downLo,
      downHi,
      upLo,
      upHi,
      source: "Ofcom Connected Nations 2023, May snapshot, postcode median speeds. Last street-level performance file. OGL.",
      down: b64(packHeat(down.field, down.has, downLo, downHi)),
      up: b64(packHeat(up.field, up.has, upLo, upHi)),
    });

    const osm = parseOsmMasts();
    const cells = await readCells();
    const licences = readWtr();
    const allSites = [...osm, ...licences, ...cells];
    const mastPts = allSites.map((s) => {
      const { x, y } = localM(s.lat, s.lon);
      return { x, y, v: s.kind === "osm" ? 1.4 : s.kind === "licence" ? 1 : 0.7 };
    });
    const masts = splat(n, cols, rows, cell, originX, originZ, mastPts, 180, 0);
    const heatVals: number[] = [];
    for (let i = 0; i < n; i++) if (masts.has[i]) heatVals.push(masts.field[i]);
    heatVals.sort((a, b) => a - b);
    const inspect = allSites
      .map((s) => {
        const { x, y } = localM(s.lat, s.lon);
        return { x: Math.round(x), z: Math.round(y), name: s.name, kind: s.kind, detail: s.detail };
      })
      .filter((s) => s.x > originX && s.z > originZ);
    console.log(`  masts OSM ${osm.length}  WTR ${licences.length}  cells ${cells.length}`);
    publish("portsmouth-masts.json", {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      source: {
        osm: "OpenStreetMap communication masts. ODbL.",
        wtr: "Ofcom Wireless Telegraphy Register licensed transmitters. Excludes most mobile-network block assignments. OGL.",
        cells: "OpenCelliD crowd cell locations, approximate. CC-BY-SA.",
      },
      density: b64(packHeat(masts.field, masts.has, percentile(heatVals, 0.08), percentile(heatVals, 0.92))),
      sites: inspect,
    });
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
