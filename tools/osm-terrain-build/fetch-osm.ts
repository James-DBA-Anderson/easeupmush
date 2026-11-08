import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { SOUTH, WEST, NORTH, EAST } from "./bbox.ts";

const OUT = "./data/portsmouth.osm";
const URL = `https://overpass-api.de/api/map?bbox=${WEST},${SOUTH},${EAST},${NORTH}`;

async function main() {
  mkdirSync("./data", { recursive: true });
  if (existsSync(OUT)) unlinkSync(OUT);
  console.log(`Fetching OSM ${WEST},${SOUTH},${EAST},${NORTH}`);
  console.log(URL);
  const res = await fetch(URL, {
    headers: { "User-Agent": "easeupmush/simpompey (osm-fetch)" },
  });
  if (!res.ok || !res.body) throw new Error(`OSM fetch ${res.status}`);
  const out = createWriteStream(OUT);
  const reader = res.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out.write(Buffer.from(value));
    if (bytes % (8 << 20) < value.byteLength) console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });
  if (!existsSync(OUT) || bytes < 1_000_000) throw new Error(`OSM write failed (${bytes} bytes)`);
  console.log(`Wrote ${OUT} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
