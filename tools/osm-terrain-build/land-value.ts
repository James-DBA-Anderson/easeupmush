import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const ZONES = `${DATA_DIR}/portsmouth-zones.json`;
const SALES_CACHE = `${DATA_DIR}/pp-portsmouth.json`;
const POST_CACHE = `${DATA_DIR}/postcodes-po.json`;
const OUT = `${DATA_DIR}/portsmouth-land-value.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");


const DISTRICTS = ["PORTSMOUTH", "GOSPORT", "FAREHAM"];
const SINCE = "2022-01-01";
const PAGE = 200;
const SPLAT_M = 220;

/** MHCLG land value estimates for policy appraisal 2023, £/ha. Portsmouth BUA / LA. */
const RATES = {
  none: 0,
  residential: 7_550_000,
  commercial: 2_610_000,
  industrial: 1_650_000,
  defence: 1_650_000,
  park: 27_000,
  civic: 930_000,
  harbour: 2_610_000,
  utilities: 1_650_000,
  cultural: 930_000,
  sports: 27_000,
  education: 930_000,
  parking: 1_650_000,
  nature: 27_000,
  church: 930_000,
  health: 930_000,
  police: 930_000,
  fire: 930_000,
  coastguard: 930_000,
} as const;

const RATE_LIST = [
  RATES.none,
  RATES.residential,
  RATES.commercial,
  RATES.industrial,
  RATES.defence,
  RATES.park,
  RATES.civic,
  RATES.harbour,
  RATES.utilities,
  RATES.cultural,
  RATES.sports,
  RATES.education,
  RATES.parking,
  RATES.nature,
  RATES.church,
  RATES.health,
  RATES.police,
  RATES.fire,
  RATES.coastguard,
];

type Sale = { price: number; postcode: string; date: string };
type ZoneFile = {
  cell: number;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  zones: string;
};


function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}


async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": "easeupmush/simpompey (land-value)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function outcode(pc: string) {
  return pc.replace(/\s+/g, "").toUpperCase().replace(/[0-9][A-Z]{2}$/, "");
}

function cacheHasFareham(sales: Sale[]) {
  return sales.some((s) => {
    const oc = outcode(s.postcode);
    return oc === "PO14" || oc === "PO15" || oc === "PO16" || oc === "PO17";
  });
}

async function fetchSales(): Promise<Sale[]> {
  const sales: Sale[] = existsSync(SALES_CACHE)
    ? (JSON.parse(readFileSync(SALES_CACHE, "utf8")) as Sale[])
    : [];
  const seen = new Set(sales.map((s) => `${s.postcode}:${s.price}:${s.date}`));
  const districts = sales.length === 0 ? DISTRICTS : cacheHasFareham(sales) ? [] : ["FAREHAM"];
  if (!districts.length) {
    console.log(`  sales cache: ${sales.length}`);
    return sales;
  }
  if (sales.length) console.log(`  sales cache: ${sales.length} (fetching ${districts.join(", ")})`);
  for (const district of districts) {
    let page = 0;
    for (;;) {
      const url =
        `https://landregistry.data.gov.uk/data/ppi/transaction-record.json` +
        `?propertyAddress.district=${encodeURIComponent(district)}` +
        `&min-transactionDate=${SINCE}&_pageSize=${PAGE}&_page=${page}`;
      const data = await getJson(url);
      const items = (data?.result?.items ?? []) as Array<any>;
      for (const item of items) {
        const price = Number(item.pricePaid);
        const postcode = String(item.propertyAddress?.postcode ?? "").trim().toUpperCase();
        const date = String(item.transactionDate ?? "");
        const id = String(item.transactionId ?? item._about ?? `${postcode}:${price}:${date}`);
        if (!postcode || !Number.isFinite(price) || price < 30_000 || price > 4_000_000) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        sales.push({ price, postcode, date });
      }
      console.log(`  ${district} page ${page}: +${items.length} (kept ${sales.length})`);
      if (items.length < PAGE) break;
      page++;
    }
  }
  writeFileSync(SALES_CACHE, JSON.stringify(sales));
  return sales;
}

async function geocode(postcodes: string[]): Promise<Record<string, { lat: number; lon: number }>> {
  const out: Record<string, { lat: number; lon: number }> = existsSync(POST_CACHE)
    ? JSON.parse(readFileSync(POST_CACHE, "utf8"))
    : {};
  const missing = postcodes.filter((p) => !out[p]);
  console.log(`  postcodes ${postcodes.length}, cached ${postcodes.length - missing.length}, lookup ${missing.length}`);
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "easeupmush/simpompey (land-value)" },
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

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

function main() {
  void (async () => {
    if (!existsSync(ZONES)) throw new Error(`Missing ${ZONES} — run npm run zones first`);
    const zones = JSON.parse(readFileSync(ZONES, "utf8")) as ZoneFile;
    const { cell, originX, originZ, cols, rows } = zones;
    const n = cols * rows;
    const land = Uint8Array.from(Buffer.from(zones.zones, "base64"));
    console.log(`grid ${cols}×${rows} @ ${cell}m`);

    const sales = await fetchSales();
    const codes = [...new Set(sales.map((s) => s.postcode))];
    const geo = await geocode(codes);

    const sumV = new Float64Array(n);
    const sumW = new Float64Array(n);
    const rCells = Math.ceil(SPLAT_M / cell);
    let used = 0;
    const prices: number[] = [];
    for (const sale of sales) {
      const g = geo[sale.postcode];
      if (!g) continue;
      if (!inBox(g.lat, g.lon)) continue;
      const { x, y } = localM(g.lat, g.lon);
      const col = Math.floor((x - originX) / cell);
      const row = Math.floor((y - originZ) / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      const logp = Math.log(sale.price);
      prices.push(sale.price);
      used++;
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
          sumV[i] += w * logp;
          sumW[i] += w;
        }
      }
    }
    prices.sort((a, b) => a - b);
    console.log(`  sales in bbox: ${used}  p10 ${percentile(prices, 0.1).toFixed(0)}  p50 ${percentile(prices, 0.5).toFixed(0)}  p90 ${percentile(prices, 0.9).toFixed(0)}`);

    const field = new Float32Array(n);
    const filled: number[] = [];
    for (let i = 0; i < n; i++) {
      if (sumW[i] > 0) {
        field[i] = sumV[i] / sumW[i];
        filled.push(i);
      }
    }

    const next = new Float32Array(n);
    const has = new Uint8Array(n);
    for (const i of filled) has[i] = 1;
    for (let pass = 0; pass < 28; pass++) {
      next.set(field);
      for (let i = 0; i < n; i++) {
        if (has[i] || !land[i]) continue;
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
            if (field[j] === 0 && !has[j]) continue;
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

    const samples: number[] = [];
    for (let i = 0; i < n; i++) if (has[i] && field[i] > 0) samples.push(field[i]);
    samples.sort((a, b) => a - b);
    const lo = percentile(samples, 0.06);
    const hi = percentile(samples, 0.94);
    const span = Math.max(1e-6, hi - lo);
    const value = new Uint8Array(n);
    let painted = 0;
    for (let i = 0; i < n; i++) {
      if (!land[i] || !has[i] || field[i] <= 0) continue;
      const t = Math.max(0, Math.min(1, (field[i] - lo) / span));
      value[i] = Math.round(t * 255);
      painted++;
    }
    console.log(`  value cells: ${painted}  log-span ${lo.toFixed(2)}–${hi.toFixed(2)}`);

    const json = {
      v: 1,
      cell,
      originX,
      originZ,
      cols,
      rows,
      p10: Math.round(percentile(prices, 0.1)),
      p50: Math.round(percentile(prices, 0.5)),
      p90: Math.round(percentile(prices, 0.9)),
      rates: RATE_LIST,
      source: {
        prices: "HM Land Registry Price Paid Data, 2022–, districts Portsmouth, Gosport & Fareham. OGL.",
        rates: "MHCLG Land value estimates for policy appraisal 2023. Portsmouth £/ha.",
      },
      value: b64(value),
    };
    writeFileSync(OUT, JSON.stringify(json));
    mkdirSync(GAME_MODELS, { recursive: true });
    mkdirSync(GAME_PUBLIC, { recursive: true });
    copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-land-value.json"));
    copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-land-value.json"));
    console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(0)} KB)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
