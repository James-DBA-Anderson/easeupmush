import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT = `${DATA_DIR}/portsmouth-coast.json`;
const GAME_OUT = path.resolve("../../apps/simpompey/public/models/portsmouth-coast.json");

type Pt = { x: number; y: number };

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function uniqueRing(nodes: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === n[0] && prev[1] === n[1]) continue;
    out.push(n);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

function samePt(a: Pt, b: Pt, eps = 1.5) {
  return Math.hypot(a.x - b.x, a.y - b.y) < eps;
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function stitchCoastlines(lines: Pt[][]): Pt[][] {
  const unused = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings: Pt[][] = [];
  while (unused.length) {
    const chain = unused.pop()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = unused.length - 1; i >= 0; i--) {
        const other = unused[i];
        if (samePt(chain[chain.length - 1], other[0])) {
          chain.push(...other.slice(1));
        } else if (samePt(chain[chain.length - 1], other[other.length - 1])) {
          chain.push(...other.slice(0, -1).reverse());
        } else if (samePt(chain[0], other[other.length - 1])) {
          chain.unshift(...other.slice(0, -1));
        } else if (samePt(chain[0], other[0])) {
          chain.unshift(...other.slice(1).reverse());
        } else continue;
        unused.splice(i, 1);
        grew = true;
      }
    }
    if (chain.length >= 12) rings.push(chain);
  }
  return rings;
}

function chaikinClosed(pts: Pt[], iterations = 2) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 4) break;
    const np: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      np.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    p = np;
  }
  return p;
}

function densify(pts: Pt[], maxLen = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(0, Math.ceil(len / maxLen) - 1);
    for (let s = 1; s <= n; s++) {
      const t = s / (n + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function pack(pts: Pt[]): number[] {
  const out: number[] = [];
  for (const p of pts) {
    out.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
  }
  return out;
}

function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  const nodeMap = new Map<number, [number, number]>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (inBox(lat, lon)) {
      nodeMap.set(Number(m[1]), [lat, lon]);
    }
  }

  const coastLines: Pt[][] = [];
  const beaches: Pt[][] = [];
  const muds: Pt[][] = [];
  const marsh: Pt[][] = [];
  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);
    const tags = parseTags(wayStr);
    const ndRe = /<nd\s+ref="(\d+)"/g;
    const nodes: [number, number][] = [];
    let ndCount = 0;
    let ndMatch: RegExpExecArray | null;
    while ((ndMatch = ndRe.exec(wayStr)) !== null) {
      ndCount++;
      const n = nodeMap.get(Number(ndMatch[1]));
      if (n) nodes.push(n);
    }
    if (ndCount === 0 || nodes.length !== ndCount) continue;
    const closed = ndCount >= 4 && nodes[0][0] === nodes[ndCount - 1][0] && nodes[0][1] === nodes[ndCount - 1][1];
    const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
    if (tags.natural === "coastline" && pts.length >= 2) {
      if (!/hayling/i.test(tags.name ?? "")) coastLines.push(pts);
      continue;
    }
    if (pts.length < 3 || !closed) continue;
    if (tags.natural === "beach" || tags.natural === "shingle" || tags.natural === "dune" || tags.natural === "sand") {
      beaches.push(pts);
      continue;
    }
    const wetland = tags.wetland ?? "";
    if (wetland === "saltmarsh") {
      marsh.push(pts);
      continue;
    }
    if (tags.natural === "mud" || wetland === "tidalflat" || wetland === "mud") {
      muds.push(pts);
    }
  }

  const coasts = stitchCoastlines(coastLines)
    .map((ring) => {
      if (ring.length > 2 && samePt(ring[0], ring[ring.length - 1], 8)) ring.pop();
      return densify(chaikinClosed(ring, 2), 7);
    })
    .filter((ring) => ring.length >= 16 && Math.abs(signedArea(ring)) > 2000)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));

  const keepPoly = (r: Pt[]) => r.length >= 4 && Math.abs(signedArea(r)) > 80;
  const payload = {
    coasts: coasts.map(pack),
    beaches: beaches.filter(keepPoly).map(pack),
    muds: muds.filter(keepPoly).map(pack),
    marsh: marsh.filter(keepPoly).map(pack),
  };
  writeFileSync(OUT, JSON.stringify(payload));
  mkdirSync(path.dirname(GAME_OUT), { recursive: true });
  copyFileSync(OUT, GAME_OUT);
  console.log(
    `Coast rings ${coasts.length}, beaches ${payload.beaches.length}, muds ${payload.muds.length}, marsh ${payload.marsh.length}`,
  );
}

main();
