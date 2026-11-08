import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import earcut from "earcut";
import { fromArrayBuffer } from "geotiff";
import { SOUTH, WEST, NORTH, EAST, SCALE_X, SCALE_Y, localM, inBox, isHayling } from "./bbox.ts";

/* ------------------------------------------------------------------ */
/*  Streaming OSM → glTF pipeline — constant memory                   */
/* ------------------------------------------------------------------ */

const DATA_DIR = "./data";
const DEM_PATH = `${DATA_DIR}/N50W002.tif`;
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT_BIN = `${DATA_DIR}/portsmouth-terrain.bin`;
const OUT_GLTF = `${DATA_DIR}/portsmouth-terrain.gltf`;
const OUT_LABELS = `${DATA_DIR}/portsmouth-labels.json`;
const OUT_HARBOUR = `${DATA_DIR}/portsmouth-harbour.json`;
const OUT_POWER = `${DATA_DIR}/portsmouth-power.json`;
const OUT_BARRIERS = `${DATA_DIR}/portsmouth-barriers.json`;
const OS_BUILDINGS = `${DATA_DIR}/portsmouth-os-buildings.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");


const TERRAIN_COLOUR = [0.353, 0.541, 0.353, 1]; // #5a8a5a
const WATER_COLOUR = [0.22, 0.47, 0.54, 1];        // inland lakes, opaque over terrain
const ROAD_COLOUR = [0.22, 0.215, 0.205, 1];       // weathered UK tarmac
const KERB_COLOUR = [0.76, 0.74, 0.70, 1];
const PAVEMENT_COLOUR = [0.64, 0.62, 0.58, 1];
const CYCLE_COLOUR = [0.52, 0.34, 0.32, 1];
const MARK_COLOUR = [0.90, 0.88, 0.80, 1];
const PIER_COLOUR = [0.55, 0.48, 0.38, 1];
const PONTOON_COLOUR = [0.62, 0.58, 0.50, 1];
const WALL_COLOUR = [0.50, 0.48, 0.45, 1];
const SLIP_COLOUR = [0.58, 0.56, 0.52, 1];
const BRIDGE_COLOUR = [0.56, 0.54, 0.50, 1];
const PARAPET_COLOUR = [0.74, 0.73, 0.70, 1];
const POWER_YARD_COLOUR = [0.66, 0.64, 0.60, 1];
const FENCE_COLOUR = [0.42, 0.40, 0.36, 1];
const BARRIER_WALL_COLOUR = [0.58, 0.56, 0.52, 1];
const HEDGE_COLOUR = [0.30, 0.44, 0.28, 1];
const RETAIN_COLOUR = [0.52, 0.50, 0.46, 1];
const BALLAST_COLOUR = [0.89, 0.86, 0.81, 1];
const SLEEPER_COLOUR = [0.80, 0.69, 0.54, 1];
const STEEL_COLOUR = [0.95, 0.96, 0.97, 1];

/* ------------------------------------------------------------------ */
/*  1. DEM — same as before                                           */
/* ------------------------------------------------------------------ */

async function loadDem() {
  const buf = readFileSync(DEM_PATH);
  const tif = await fromArrayBuffer(buf.buffer);
  const image = await tif.getImage();
  const bbox = image.getBoundingBox();
  const [tileWest, tileSouth, tileEast, tileNorth] = bbox;
  const w = image.getWidth();
  const h = image.getHeight();
  const data = (await image.readRasters())[0] as Float32Array;

  const lonToCol = (lon: number) => Math.round(((lon - tileWest) / (tileEast - tileWest)) * w);
  const latToRow = (lat: number) => Math.round(((tileNorth - lat) / (tileNorth - tileSouth)) * h);

  const col0 = Math.max(0, lonToCol(WEST));
  const col1 = Math.min(w - 1, lonToCol(EAST));
  const row0 = Math.max(0, latToRow(NORTH));
  const row1 = Math.min(h - 1, latToRow(SOUTH));

  const subW = Math.max(1, col1 - col0 + 1);
  const subH = Math.max(1, row1 - row0 + 1);
  const grid = new Float32Array(subH * subW);
  for (let r = 0; r < subH; r++) {
    for (let c = 0; c < subW; c++) {
      grid[r * subW + c] = data[(row0 + r) * w + (col0 + c)];
    }
  }

  const localLonToCol = (lon: number) => ((lon - WEST) / (EAST - WEST)) * (subW - 1);
  const localLatToRow = (lat: number) => ((NORTH - lat) / (NORTH - SOUTH)) * (subH - 1);

  const sample = (lat: number, lon: number): number => {
    const cc = localLonToCol(lon);
    const rr = localLatToRow(lat);
    const c = Math.max(0, Math.min(subW - 2, Math.floor(cc)));
    const r = Math.max(0, Math.min(subH - 2, Math.floor(rr)));
    const fc = cc - c;
    const fr = rr - r;
    const i00 = r * subW + c;
    const i10 = i00 + 1;
    const i01 = i00 + subW;
    const i11 = i01 + 1;
    return (
      grid[i00] * (1 - fc) * (1 - fr) +
      grid[i10] * fc * (1 - fr) +
      grid[i01] * (1 - fc) * fr +
      grid[i11] * fc * fr
    );
  };

  return { rows: subH, cols: subW, sample };
}

/* ------------------------------------------------------------------ */
/*  2. Streaming binary writer                                        */
/* ------------------------------------------------------------------ */

type Mesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  colour: number[];
  colors?: Float32Array;
};

type MapLabel = {
  kind: "road" | "building" | "area";
  name: string;
  x: number;
  y: number;
  z: number;
};

class LabelWriter {
  private labels: MapLabel[] = [];

  add(
    kind: MapLabel["kind"],
    name: string | undefined,
    pts: { x: number; y: number }[],
    y: number,
    place: "centroid" | "path" = "centroid",
  ) {
    const text = name?.trim();
    if (!text || text.length < 2 || pts.length === 0) return;
    let x = 0;
    let z = 0;
    if (place === "path" && pts.length >= 2) {
      let total = 0;
      const dist = [0];
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        dist.push(total);
      }
      if (total < 1e-6) {
        x = pts[0].x;
        z = pts[0].y;
      } else {
        const half = total * 0.5;
        let i = 1;
        while (i < dist.length && dist[i] < half) i++;
        const a = pts[i - 1];
        const b = pts[Math.min(i, pts.length - 1)];
        const span = dist[i] - dist[i - 1] || 1;
        const t = (half - dist[i - 1]) / span;
        x = a.x + (b.x - a.x) * t;
        z = a.y + (b.y - a.y) * t;
      }
    } else {
      for (const p of pts) {
        x += p.x;
        z += p.y;
      }
      x /= pts.length;
      z /= pts.length;
    }
    this.labels.push({ kind, name: text, x, y, z });
  }

  flush(path: string) {
    const kept: MapLabel[] = [];
    const seen = new Map<string, MapLabel[]>();
    for (const label of this.labels) {
      const key = `${label.kind}:${label.name.toLowerCase()}`;
      const prev = seen.get(key) ?? [];
      if (prev.some((p) => Math.hypot(p.x - label.x, p.z - label.z) < 80)) continue;
      prev.push(label);
      seen.set(key, prev);
      kept.push(label);
    }
    writeFileSync(path, JSON.stringify(kept));
    console.log(`Wrote ${path} (${kept.length} labels)`);
  }
}

class BinWriter {
  private meshes: Mesh[] = [];

  push(
    name: string,
    pos: Float32Array,
    norm: Float32Array,
    idx: Uint16Array | Uint32Array,
    colour: number[],
    colors?: Float32Array,
  ) {
    this.meshes.push({ name, positions: pos, normals: norm, indices: idx, colour, colors });
  }

  private mergeByName(): Mesh[] {
    const groups = new Map<string, Mesh[]>();
    for (const m of this.meshes) {
      const k = m.name;
      const list = groups.get(k);
      if (list) list.push(m);
      else groups.set(k, [m]);
    }

    const merged: Mesh[] = [];
    for (const list of groups.values()) {
      let vCount = 0;
      let iCount = 0;
      for (const m of list) {
        vCount += m.positions.length / 3;
        iCount += m.indices.length;
      }
      const positions = new Float32Array(vCount * 3);
      const normals = new Float32Array(vCount * 3);
      const hasColors = list.every((m) => m.colors && m.colors.length === m.positions.length);
      const colors = hasColors ? new Float32Array(vCount * 3) : undefined;
      const indices = new Uint32Array(iCount);
      let vOff = 0;
      let iOff = 0;
      let vertBase = 0;
      for (const m of list) {
        positions.set(m.positions, vOff);
        normals.set(m.normals, vOff);
        if (colors && m.colors) colors.set(m.colors, vOff);
        for (let i = 0; i < m.indices.length; i++) indices[iOff++] = m.indices[i] + vertBase;
        vertBase += m.positions.length / 3;
        vOff += m.positions.length;
      }
      merged.push({ name: list[0].name, positions, normals, indices, colour: list[0].colour, colors });
    }
    return merged;
  }

  flush(gltfPath: string, binPath: string) {
    this.meshes = this.mergeByName();
    const nodes: number[] = [];
    const meshes: any[] = [];
    const materials: any[] = [];
    const accessors: any[] = [];
    const bufferViews: any[] = [];
    const parts: Buffer[] = [];
    let bufOff = 0;
    let matIdx = 0;
    const matMap = new Map<string, number>();

    function matKey(c: number[]) {
      return `${c[0]},${c[1]},${c[2]},${c[3]}`;
    }
    function getMat(c: number[]): number {
      const k = matKey(c);
      const ex = matMap.get(k);
      if (ex !== undefined) return ex;
      const i = matIdx++;
      matMap.set(k, i);
      materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: c,
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        alphaMode: c[3] < 1 ? "BLEND" : "OPAQUE",
      });
      return i;
    }

    const pad4 = () => {
      while (bufOff % 4 !== 0) {
        bufOff++;
        parts.push(Buffer.alloc(1));
      }
    };

    for (const m of this.meshes) {
      const pos = Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength);
      const norm = Buffer.from(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength);
      const idx = Buffer.from(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength);

      pad4();
      const posBV = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bufOff, byteLength: pos.length });
      bufOff += pos.length; parts.push(pos);

      pad4();
      const normBV = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bufOff, byteLength: norm.length });
      bufOff += norm.length; parts.push(norm);

      let colBV = -1;
      if (m.colors && m.colors.length === m.positions.length) {
        const col = Buffer.from(m.colors.buffer, m.colors.byteOffset, m.colors.byteLength);
        pad4();
        colBV = bufferViews.length;
        bufferViews.push({ buffer: 0, byteOffset: bufOff, byteLength: col.length });
        bufOff += col.length; parts.push(col);
      }

      pad4();
      const idxBV = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bufOff, byteLength: idx.length, target: 34963 });
      bufOff += idx.length; parts.push(idx);

      const posAcc = accessors.length;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
        minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      }
      accessors.push({
        bufferView: posBV,
        componentType: 5126,
        count: m.positions.length / 3,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      });
      const normAcc = accessors.length;
      accessors.push({ bufferView: normBV, componentType: 5126, count: m.normals.length / 3, type: "VEC3" });
      const idxAcc = accessors.length;
      const idxType = m.indices instanceof Uint32Array ? 5125 : 5123; // UNSIGNED_INT : UNSIGNED_SHORT
      accessors.push({ bufferView: idxBV, componentType: idxType, count: m.indices.length, type: "SCALAR" });
      const attributes: Record<string, number> = { POSITION: posAcc, NORMAL: normAcc };
      if (colBV >= 0 && m.colors) {
        const colAcc = accessors.length;
        accessors.push({ bufferView: colBV, componentType: 5126, count: m.colors.length / 3, type: "VEC3" });
        attributes.COLOR_0 = colAcc;
      }

      meshes.push({
        name: m.name,
        primitives: [{ attributes, indices: idxAcc, material: getMat(m.colour) }],
      });
      nodes.push({ name: m.name, mesh: meshes.length - 1 });
    }

    const merged = Buffer.concat(parts);
    writeFileSync(binPath, merged);

    const gltf = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: nodes.map((_, i) => i) }],
      nodes,
      meshes,
      materials,
      accessors,
      bufferViews,
      buffers: [{ uri: "portsmouth-terrain.bin", byteLength: merged.length }],
    };

    writeFileSync(gltfPath, JSON.stringify(gltf));

    console.log(`Wrote ${binPath} + ${gltfPath} (${(merged.length / 1024 / 1024).toFixed(1)} MB buffer)`);
  }
}

/* ------------------------------------------------------------------ */
/*  3. Helpers                                                          */
/* ------------------------------------------------------------------ */

function triangulate(pts: { x: number; y: number }[]): number[] {
  if (pts.length < 3) return [];
  const flat: number[] = [];
  for (const p of pts) {
    flat.push(p.x, p.y);
  }
  return earcut(flat, undefined, 2);
}

function triangulateHoles(outer: { x: number; y: number }[], holes: { x: number; y: number }[][]): { verts: { x: number; y: number }[]; idx: number[] } {
  const verts = outer.slice();
  const holeStart: number[] = [];
  for (const hole of holes) {
    if (hole.length < 3) continue;
    holeStart.push(verts.length);
    verts.push(...hole);
  }
  const flat: number[] = [];
  for (const p of verts) flat.push(p.x, p.y);
  const idx = earcut(flat, holeStart.length ? holeStart : undefined, 2);
  return { verts, idx };
}

function pointInRing(x: number, y: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    const xi = pts[i].x, xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function ringSpan(pts: { x: number; y: number }[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function ringArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return Math.abs(a) * 0.5;
}

function closedNodes(nodes: [number, number][]): boolean {
  if (nodes.length < 4) return false;
  const a = nodes[0];
  const b = nodes[nodes.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function stitchPolylines(parts: { x: number; y: number }[][]): { x: number; y: number }[][] {
  const chains = parts.filter((p) => p.length >= 2).map((p) => p.slice());
  const rings: { x: number; y: number }[][] = [];
  while (chains.length) {
    const ring = chains.pop()!;
    for (let guard = 0; guard < 48; guard++) {
      const start = ring[0];
      const end = ring[ring.length - 1];
      if (Math.hypot(start.x - end.x, start.y - end.y) < 1.2 && ring.length >= 4) break;
      let found = -1;
      let rev = false;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        const cs = c[0];
        const ce = c[c.length - 1];
        if (Math.hypot(end.x - cs.x, end.y - cs.y) < 1.2) {
          found = i;
          rev = false;
          break;
        }
        if (Math.hypot(end.x - ce.x, end.y - ce.y) < 1.2) {
          found = i;
          rev = true;
          break;
        }
      }
      if (found < 0) break;
      const add = chains.splice(found, 1)[0];
      if (rev) add.reverse();
      ring.push(...add.slice(1));
    }
    const closed: { x: number; y: number }[] = [];
    for (const p of ring) {
      const prev = closed[closed.length - 1];
      if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.15) continue;
      closed.push(p);
    }
    if (closed.length > 1) {
      const a = closed[0];
      const b = closed[closed.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1.2) closed.pop();
    }
    if (closed.length >= 3) rings.push(closed);
  }
  return rings;
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

function ringSpanM(pts: { x: number; y: number }[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** Neighbourhood-sized building=yes blobs (grey fans). Long terraces/warehouses are kept. */
function isGiantBuilding(pts: { x: number; y: number }[]): boolean {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return w * h > 40_000;
}

class Occupied {
  private cell = 8;
  private cells = new Set<string>();
  private key(x: number, y: number) {
    return `${Math.round(x / this.cell)},${Math.round(y / this.cell)}`;
  }
  addRing(pts: { x: number; y: number }[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      this.cells.add(this.key(p.x, p.y));
    }
    for (let x = minX; x <= maxX; x += this.cell) {
      for (let y = minY; y <= maxY; y += this.cell) {
        if (pointInPoly(x, y, pts)) this.cells.add(this.key(x, y));
      }
    }
  }
  has(x: number, y: number) {
    return this.cells.has(this.key(x, y));
  }
}

type MsHeight = { x: number; y: number; h: number; pts: { x: number; y: number }[] };

class HeightIndex {
  private cell = 24;
  private bins = new Map<string, MsHeight[]>();
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  add(pts: { x: number; y: number }[], h?: number) {
    if (!h || h < 2.5 || h > 120) return;
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const k = this.key(x, y);
    const bin = this.bins.get(k);
    const hit = { x, y, h, pts };
    if (bin) bin.push(hit);
    else this.bins.set(k, [hit]);
  }
  lookup(x: number, y: number): number | undefined {
    let insideH: number | undefined;
    let insideD = Infinity;
    let nearH: number | undefined;
    let nearD = Infinity;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const hit of bin) {
          const d = Math.hypot(hit.x - x, hit.y - y);
          if (pointInPoly(x, y, hit.pts)) {
            if (d < insideD) {
              insideD = d;
              insideH = hit.h;
            }
          } else if (d < 12 && d < nearD) {
            nearD = d;
            nearH = hit.h;
          }
        }
      }
    }
    return insideH ?? nearH;
  }
}

function parseOsmHeight(tags: Record<string, string>): number | undefined {
  const raw = tags["height"] || tags["building:height"];
  if (raw) {
    const m = /([0-9]+(?:\.[0-9]+)?)/.exec(raw);
    if (m) {
      let h = Number(m[1]);
      if (/ft|feet/i.test(raw)) h *= 0.3048;
      if (h >= 2.5 && h <= 120) return h;
    }
  }
  const lvRaw = tags["building:levels"];
  if (lvRaw) {
    const n = Number(String(lvRaw).split(/[;/-]/)[0]);
    if (Number.isFinite(n) && n >= 1 && n <= 40) return n * 3.2;
  }
  return undefined;
}

function eaveHeight(explicit?: number, fallback?: number): number {
  const h = explicit ?? fallback ?? 6;
  return Math.max(3, Math.min(80, h));
}

function hash01(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

type RoofKind = "flat" | "gabled" | "hipped";
type RoofSpec = {
  kind: RoofKind;
  cx: number;
  cy: number;
  ax: number;
  az: number;
  half: number;
  rise: number;
};

const roofStats = { flat: 0, gabled: 0, hipped: 0 };

function isDomesticBuilding(type?: string): boolean {
  if (!type) return false;
  return /^(terrace|house|detached|semidetached_house|semidetached|bungalow|allotment_house|static_caravan|cabin|residential)$/.test(
    type,
  );
}

type FacadeKind = "house" | "flat" | "industrial" | "civic" | "retail";

const HOUSE_WALLS: number[][] = [
  [0.66, 0.38, 0.30],
  [0.66, 0.38, 0.30],
  [0.58, 0.32, 0.26],
  [0.84, 0.78, 0.66],
  [0.84, 0.78, 0.66],
  [0.90, 0.88, 0.82],
  [0.76, 0.71, 0.62],
  [0.74, 0.60, 0.42],
  [0.86, 0.76, 0.72],
];
const FLAT_WALLS: number[][] = [
  [0.78, 0.74, 0.68],
  [0.72, 0.72, 0.70],
  [0.82, 0.80, 0.74],
  [0.68, 0.70, 0.69],
  [0.62, 0.58, 0.54],
];
const WORKS_WALLS: number[][] = [
  [0.48, 0.50, 0.52],
  [0.55, 0.56, 0.54],
  [0.58, 0.38, 0.32],
  [0.44, 0.46, 0.45],
];
const CIVIC_WALLS: number[][] = [
  [0.78, 0.76, 0.70],
  [0.60, 0.34, 0.28],
  [0.82, 0.80, 0.74],
  [0.70, 0.68, 0.62],
];
const SHOP_WALLS: number[][] = [
  [0.88, 0.86, 0.82],
  [0.84, 0.80, 0.72],
  [0.70, 0.70, 0.68],
  [0.64, 0.38, 0.32],
];
const SLATE_ROOFS: number[][] = [
  [0.22, 0.24, 0.27],
  [0.26, 0.28, 0.32],
  [0.20, 0.22, 0.26],
  [0.24, 0.26, 0.29],
  [0.18, 0.21, 0.24],
];
const FELT_ROOFS: number[][] = [
  [0.16, 0.16, 0.17],
  [0.20, 0.19, 0.18],
  [0.14, 0.15, 0.16],
  [0.18, 0.18, 0.19],
];
const METAL_ROOFS: number[][] = [
  [0.36, 0.38, 0.39],
  [0.32, 0.36, 0.34],
  [0.40, 0.38, 0.34],
];

function facadeKind(type: string | undefined, roof: RoofKind, area: number): FacadeKind {
  const t = (type ?? "").toLowerCase();
  if (isDomesticBuilding(t)) return "house";
  if (/^(apartments|apartment|dormitory)$/.test(t)) return "flat";
  if (/^(industrial|warehouse|hangar|manufacture|factory|garage|garages|service|shed)$/.test(t)) return "industrial";
  if (/^(church|cathedral|chapel|public|school|university|college|hospital|civic|train_station|transportation)$/.test(t)) {
    return "civic";
  }
  if (/^(retail|commercial|shop|supermarket|office|hotel|kiosk)$/.test(t)) return "retail";
  if (roof !== "flat" && area < 1400) return "house";
  if (area > 900 || roof === "flat") return "flat";
  return "house";
}

function pickRgb(cx: number, cy: number, palette: number[][]): number[] {
  const i = Math.floor(hash01(cx, cy) * palette.length) % palette.length;
  const j = 0.9 + hash01(cx * 3.17, cy * 7.91) * 0.18;
  const c = palette[i];
  return [c[0] * j, c[1] * j, c[2] * j];
}

function wallColour(cx: number, cy: number, type: string | undefined, roof: RoofKind, area: number): number[] {
  switch (facadeKind(type, roof, area)) {
    case "house":
      return pickRgb(cx, cy, HOUSE_WALLS);
    case "flat":
      return pickRgb(cx, cy, FLAT_WALLS);
    case "industrial":
      return pickRgb(cx, cy, WORKS_WALLS);
    case "civic":
      return pickRgb(cx, cy, CIVIC_WALLS);
    case "retail":
      return pickRgb(cx, cy, SHOP_WALLS);
  }
}

function roofColour(cx: number, cy: number, type: string | undefined, roof: RoofKind, area: number): number[] {
  const kind = facadeKind(type, roof, area);
  if (roof === "flat") return pickRgb(cx + 11, cy, FELT_ROOFS);
  if (kind === "industrial") return pickRgb(cx + 11, cy, METAL_ROOFS);
  return pickRgb(cx + 11, cy, SLATE_ROOFS);
}

function plinthTint(rgb: number[], y: number, groundY: number): number[] {
  const t = Math.max(0, Math.min(1, 1 - (y - groundY) / 1.4));
  const k = 1 - 0.3 * t;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

type FootprintAxes = {
  cx: number;
  cy: number;
  ax: number;
  az: number;
  minS: number;
  maxS: number;
  area: number;
  fill: number;
  minAlong: number;
  maxAlong: number;
  minAcross: number;
  maxAcross: number;
};

function footprintAxes(pts: { x: number; y: number }[]): FootprintAxes {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let xx = 0, zz = 0, xz = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    const dx = p.x - cx;
    const dz = p.y - cy;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  const area = Math.abs(signedArea(pts));
  const bw = maxX - minX;
  const bd = maxY - minY;
  const minS = Math.min(bw, bd);
  const maxS = Math.max(bw, bd);
  const fill = bw * bd > 1 ? area / (bw * bd) : 0;
  const theta = 0.5 * Math.atan2(2 * xz, xx - zz);
  let ax = Math.cos(theta);
  let az = Math.sin(theta);
  let minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity;
  for (const p of pts) {
    const dx = p.x - cx;
    const dz = p.y - cy;
    const along = dx * ax + dz * az;
    const across = dx * -az + dz * ax;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }
  if (maxAlong - minAlong < maxAcross - minAcross) {
    const t = ax;
    ax = -az;
    az = t;
    const tmp0 = minAlong;
    const tmp1 = maxAlong;
    minAlong = minAcross;
    maxAlong = maxAcross;
    minAcross = tmp0;
    maxAcross = tmp1;
  }
  return { cx, cy, ax, az, minS, maxS, area, fill, minAlong, maxAlong, minAcross, maxAcross };
}

function classifyRoof(
  pts: { x: number; y: number }[],
  shape?: string,
  building?: string,
  rowAxis?: { ax: number; az: number },
): RoofSpec {
  const n = pts.length;
  const tagged = (shape ?? "").toLowerCase();
  const axes = footprintAxes(pts);
  let { cx, cy, ax, az, minS, maxS, area, fill, minAlong, maxAlong, minAcross, maxAcross } = axes;
  const aspect = maxS / Math.max(minS, 0.4);
  const jitter = 0.9 + hash01(cx, cy) * 0.22;

  if (rowAxis) {
    ax = rowAxis.ax;
    az = rowAxis.az;
    minAlong = Infinity;
    maxAlong = -Infinity;
    minAcross = Infinity;
    maxAcross = -Infinity;
    for (const p of pts) {
      const dx = p.x - cx;
      const dz = p.y - cy;
      const along = dx * ax + dz * az;
      const across = dx * -az + dz * ax;
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
      minAcross = Math.min(minAcross, across);
      maxAcross = Math.max(maxAcross, across);
    }
  }
  const half = Math.max(0.4, (maxAcross - minAcross) * 0.5);

  let kind: RoofKind = "flat";
  if (tagged === "flat") kind = "flat";
  else if (tagged === "gabled" || tagged === "gambrel" || tagged === "skillion") kind = "gabled";
  else if (tagged === "hipped" || tagged === "hip" || tagged === "pyramidal") kind = "hipped";
  else if (area > 1800 || minS > 24) kind = "flat";
  else if (n > 18 && fill < 0.52) kind = "flat";
  else if (isDomesticBuilding(building) || (aspect >= 1.18 && minS < 16 && area < 1400)) kind = "gabled";
  else if (area < 280 && minS < 14) kind = "gabled";
  else if (area < 420 && fill > 0.5) kind = "hipped";
  else if (n <= 8 && minS < 16) kind = "gabled";

  let rise = 0;
  if (kind === "gabled") rise = Math.min(6.2, Math.max(1.8, half * 0.75)) * jitter;
  else if (kind === "hipped") {
    let maxD = 0.01;
    for (const p of pts) maxD = Math.max(maxD, Math.hypot(p.x - cx, p.y - cy));
    rise = Math.min(4.4, Math.max(1.2, maxD * 0.42)) * jitter;
  }
  roofStats[kind]++;
  return { kind, cx, cy, ax, az, half, rise };
}

type PendingBuilding = {
  nodes: [number, number][];
  pts: { x: number; y: number }[];
  name?: string;
  height?: number;
  roofShape?: string;
  buildingType?: string;
  rowAxis?: { ax: number; az: number };
};

type TerraceHouse = {
  i: number;
  pts: { x: number; y: number }[];
  cx: number;
  cy: number;
  sx: number;
  sz: number;
  halfShort: number;
  minS: number;
  maxS: number;
  area: number;
};

class HouseIndex {
  private cell = 16;
  private bins = new Map<string, TerraceHouse[]>();
  add(h: TerraceHouse) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of h.pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        const k = `${xi},${yi}`;
        const b = this.bins.get(k);
        if (b) {
          if (!b.includes(h)) b.push(h);
        } else this.bins.set(k, [h]);
      }
    }
  }
  hit(x: number, y: number, ignore: TerraceHouse): TerraceHouse | null {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const h of bin) {
          if (h === ignore) continue;
          if (pointInPoly(x, y, h.pts)) return h;
        }
      }
    }
    return null;
  }
}

function neighborAlong(h: TerraceHouse, sign: number, index: HouseIndex): TerraceHouse | null {
  for (const extra of [0.35, 0.8, 1.15]) {
    const d = h.halfShort + extra;
    const hit = index.hit(h.cx + h.sx * sign * d, h.cy + h.sz * sign * d, h);
    if (hit) return hit;
  }
  return null;
}

function assignTerraceRidges(pending: PendingBuilding[]): number {
  const houses: TerraceHouse[] = [];
  for (let i = 0; i < pending.length; i++) {
    const pts = pending[i].pts;
    if (pts.length < 3) continue;
    const a = footprintAxes(pts);
    houses.push({
      i,
      pts,
      cx: a.cx,
      cy: a.cy,
      sx: -a.az,
      sz: a.ax,
      halfShort: Math.max(0.4, (a.maxAcross - a.minAcross) * 0.5),
      minS: a.minS,
      maxS: a.maxS,
      area: a.area,
    });
  }
  const index = new HouseIndex();
  for (const h of houses) index.add(h);

  let n = 0;
  for (const h of houses) {
    if (h.area > 1800 || h.minS > 24) continue;
    if (h.maxS > 16 && h.maxS > h.minS * 1.65) continue;
    const left = neighborAlong(h, 1, index);
    const right = neighborAlong(h, -1, index);
    if (!left && !right) continue;
    let dx: number;
    let dz: number;
    if (left && right) {
      dx = right.cx - left.cx;
      dz = right.cy - left.cy;
    } else {
      const other = left ?? right!;
      dx = other.cx - h.cx;
      dz = other.cy - h.cy;
    }
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    pending[h.i].rowAxis = { ax: dx / len, az: dz / len };
    n++;
  }
  return n;
}

type ExtraBuilding = { nodes: [number, number][]; h?: number };

function loadExtraBuildings(): ExtraBuilding[] {
  if (!existsSync(OS_BUILDINGS)) return [];
  const raw = JSON.parse(readFileSync(OS_BUILDINGS, "utf8")) as Array<
    [number, number][] | { nodes: [number, number][]; h?: number }
  >;
  const out: ExtraBuilding[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) out.push({ nodes: item });
    else if (item?.nodes) out.push(item);
  }
  return out;
}

function computeNormals(pos: Float32Array, idx: Uint16Array | Uint32Array, outNorm: Float32Array) {
  outNorm.fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3;
    const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
    const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const j of [i0, i1, i2]) {
      outNorm[j] += nx; outNorm[j + 1] += ny; outNorm[j + 2] += nz;
    }
  }
  for (let i = 0; i < outNorm.length; i += 3) {
    const len = Math.hypot(outNorm[i], outNorm[i + 1], outNorm[i + 2]) || 1;
    outNorm[i] /= len; outNorm[i + 1] /= len; outNorm[i + 2] /= len;
  }
}

/* ------------------------------------------------------------------ */
/*  4. Feature builders — emit one mesh at a time                       */
/* ------------------------------------------------------------------ */

function sampleAtLocal(sample: (lat: number, lon: number) => number, x: number, z: number): number {
  const lon = WEST + x / SCALE_X;
  const lat = NORTH + z / SCALE_Y;
  let ele = sample(lat, lon);
  if (!Number.isFinite(ele) || ele < 0.15) ele = 0.15;
  if (ele > 160) ele = 160;
  return ele;
}

const ROAD_LIFT = 0.12;
/** OSM E-W centerlines sit a bit north of the building corridor. */
const ROAD_SOUTH_NUDGE = 0.25;
const RAIL_LIFT = 0.28;
const WATER_LIFT = 0.16;

class TerrainIndex {
  private readonly fallback: (x: number, z: number) => number;
  private readonly cell = 24;
  private xs: number[] = [];
  private ys: number[] = [];
  private zs: number[] = [];
  private tris: number[] = [];
  private originX = 0;
  private originZ = 0;
  private cols = 0;
  private rows = 0;
  private bins: number[][] = [];
  private minX = Infinity;
  private maxX = -Infinity;
  private minZ = Infinity;
  private maxZ = -Infinity;

  constructor(fallback: (x: number, z: number) => number) {
    this.fallback = fallback;
  }

  addMesh(positions: Float32Array, indices: Uint32Array) {
    const base = this.xs.length;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      this.xs.push(x);
      this.ys.push(positions[i + 1]);
      this.zs.push(z);
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (z < this.minZ) this.minZ = z;
      if (z > this.maxZ) this.maxZ = z;
    }
    for (let i = 0; i < indices.length; i++) this.tris.push(indices[i] + base);
  }

  build() {
    if (!this.tris.length) return;
    const pad = this.cell;
    this.originX = this.minX - pad;
    this.originZ = this.minZ - pad;
    this.cols = Math.max(1, Math.ceil((this.maxX - this.minX + pad * 2) / this.cell));
    this.rows = Math.max(1, Math.ceil((this.maxZ - this.minZ + pad * 2) / this.cell));
    this.bins = Array.from({ length: this.cols * this.rows }, () => []);
    for (let t = 0; t < this.tris.length; t += 3) {
      const a = this.tris[t], b = this.tris[t + 1], c = this.tris[t + 2];
      const minX = Math.min(this.xs[a], this.xs[b], this.xs[c]);
      const maxX = Math.max(this.xs[a], this.xs[b], this.xs[c]);
      const minZ = Math.min(this.zs[a], this.zs[b], this.zs[c]);
      const maxZ = Math.max(this.zs[a], this.zs[b], this.zs[c]);
      const x0 = Math.max(0, Math.floor((minX - this.originX) / this.cell));
      const x1 = Math.min(this.cols - 1, Math.floor((maxX - this.originX) / this.cell));
      const z0 = Math.max(0, Math.floor((minZ - this.originZ) / this.cell));
      const z1 = Math.min(this.rows - 1, Math.floor((maxZ - this.originZ) / this.cell));
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) this.bins[z * this.cols + x].push(t);
      }
    }
  }

  height(x: number, z: number): number {
    const dem = this.fallback(x, z);
    const hit = this.probe(x, z, 0, -1e-4);
    if (hit !== null) return Math.max(dem, hit);
    const near = this.probe(x, z, 1, -0.05);
    return near !== null ? Math.max(dem, near) : dem;
  }

  private probe(x: number, z: number, ring: number, baryMin: number): number | null {
    if (!this.bins.length) return null;
    const cx = Math.floor((x - this.originX) / this.cell);
    const cz = Math.floor((z - this.originZ) / this.cell);
    let best: number | null = null;
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.rows) continue;
        const bin = this.bins[iz * this.cols + ix];
        for (const t of bin) {
          const y = this.triHeight(t, x, z, baryMin);
          if (y === null) continue;
          if (best === null || y > best) best = y;
        }
      }
    }
    return best;
  }

  private triHeight(t: number, px: number, pz: number, baryMin: number): number | null {
    const a = this.tris[t], b = this.tris[t + 1], c = this.tris[t + 2];
    const ax = this.xs[a], az = this.zs[a];
    const bx = this.xs[b], bz = this.zs[b];
    const cx = this.xs[c], cz = this.zs[c];
    const v0x = bx - ax, v0z = bz - az;
    const v1x = cx - ax, v1z = cz - az;
    const v2x = px - ax, v2z = pz - az;
    const den = v0x * v1z - v1x * v0z;
    if (Math.abs(den) < 1e-12) return null;
    const u = (v2x * v1z - v1x * v2z) / den;
    const v = (v0x * v2z - v2x * v0z) / den;
    const w = 1 - u - v;
    if (u < baryMin || v < baryMin || w < baryMin) return null;
    return w * this.ys[a] + u * this.ys[b] + v * this.ys[c];
  }
}

function samePt(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1.5) {
  return Math.hypot(a.x - b.x, a.y - b.y) < eps;
}

function stitchCoastlines(lines: { x: number; y: number }[][]): { x: number; y: number }[][] {
  const unused = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings: { x: number; y: number }[][] = [];
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
    if (chain.length >= 16) rings.push(chain);
  }
  return rings;
}

function emitLandRing(
  ring: { x: number; y: number }[],
  holes: { x: number; y: number }[][],
  sample: (lat: number, lon: number) => number,
  writer: BinWriter,
  ground?: TerrainIndex,
) {
  const outer = ensureWinding(chaikinClosed(ring, 3), true);
  const inner = holes
    .map((h) => ensureWinding(chaikinClosed(h, 3), false))
    .filter((h) => h.length >= 8 && Math.abs(signedArea(h)) > 1500);
  const all = [outer, ...inner];
  const holeStarts: number[] = [];
  const flat: number[] = [];
  let cursor = 0;
  for (let r = 0; r < all.length; r++) {
    if (r > 0) holeStarts.push(cursor);
    for (const p of all[r]) {
      flat.push(p.x, p.y);
      cursor++;
    }
  }
  const seed = earcut(flat, holeStarts, 2);
  if (seed.length < 3) return;

  const land = all.flat();
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const p of land) {
    xs.push(p.x);
    zs.push(p.y);
    ys.push(sampleAtLocal(sample, p.x, p.y));
  }

  const maxEdge = 24;
  const max2 = maxEdge * maxEdge;
  const split = new Map<string, number>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const dist2 = (a: number, b: number) => {
    const dx = xs[a] - xs[b];
    const dz = zs[a] - zs[b];
    return dx * dx + dz * dz;
  };
  const midpoint = (a: number, b: number) => {
    const k = edgeKey(a, b);
    let m = split.get(k);
    if (m !== undefined) return m;
    m = xs.length;
    const x = (xs[a] + xs[b]) * 0.5;
    const z = (zs[a] + zs[b]) * 0.5;
    xs.push(x);
    zs.push(z);
    ys.push(sampleAtLocal(sample, x, z));
    split.set(k, m);
    return m;
  };

  const pending: number[] = seed.slice();
  const out: number[] = [];
  while (pending.length) {
    const c = pending.pop()!;
    const b = pending.pop()!;
    const a = pending.pop()!;
    const ab = dist2(a, b);
    const bc = dist2(b, c);
    const ca = dist2(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= max2 || longest < 1) {
      out.push(a, b, c);
      continue;
    }
    if (ab === longest) {
      const m = midpoint(a, b);
      pending.push(a, m, c, m, b, c);
    } else if (bc === longest) {
      const m = midpoint(b, c);
      pending.push(a, b, m, a, m, c);
    } else {
      const m = midpoint(c, a);
      pending.push(a, b, m, m, b, c);
    }
  }

  const tVerts = new Float32Array(xs.length * 3);
  const tNorms = new Float32Array(tVerts.length);
  for (let i = 0; i < xs.length; i++) {
    tVerts[i * 3] = xs[i];
    tVerts[i * 3 + 1] = ys[i];
    tVerts[i * 3 + 2] = zs[i];
  }
  const idx = new Uint32Array(out);
  computeNormals(tVerts, idx, tNorms);
  writer.push("terrain", tVerts, tNorms, idx, TERRAIN_COLOUR);
  ground?.addMesh(tVerts, idx);
}

function buildTerrain(
  rows: number,
  cols: number,
  sample: (lat: number, lon: number) => number,
  writer: BinWriter,
  coastlines: { x: number; y: number }[][],
  ground?: TerrainIndex,
) {
  const stitched = stitchCoastlines(coastlines)
    .map((ring) => {
      if (ring.length > 2 && samePt(ring[0], ring[ring.length - 1], 8)) ring.pop();
      return ring;
    })
    .filter((ring) => ring.length >= 16 && Math.abs(signedArea(ring)) > 8000)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));

  if (stitched.length) {
    const used = new Set<number>();
    for (let i = 0; i < stitched.length; i++) {
      if (used.has(i)) continue;
      const outer = stitched[i];
      const holes: { x: number; y: number }[][] = [];
      for (let j = i + 1; j < stitched.length; j++) {
        if (used.has(j)) continue;
        if (!pointInPoly(stitched[j][0].x, stitched[j][0].y, outer)) continue;
        used.add(j);
        holes.push(stitched[j]);
      }
      emitLandRing(outer, holes, sample, writer, ground);
    }
    return;
  }

  // Fallback: smoothed DEM land contour if OSM coastline is missing
  const verts = new Float32Array(rows * cols * 3);
  const elev = new Float32Array(rows * cols);
  let vi = 0;
  for (let r = 0; r < rows; r++) {
    const fracR = r / (rows - 1);
    const lat = NORTH - fracR * (NORTH - SOUTH);
    for (let c = 0; c < cols; c++) {
      const fracC = c / (cols - 1);
      const lon = WEST + fracC * (EAST - WEST);
      const { x, y: z } = localM(lat, lon);
      let ele = sample(lat, lon);
      if (!Number.isFinite(ele) || ele < 0) ele = 0;
      if (ele > 160) ele = 160;
      elev[r * cols + c] = ele;
      verts[vi++] = x; verts[vi++] = ele; verts[vi++] = z;
    }
  }
  const rings = marchingSquares(elev, rows, cols, verts, 0.15)
    .map((ring) => chaikinClosed(ring, 4))
    .filter((ring) => ring.length >= 16 && Math.abs(signedArea(ring)) > 20000)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
    .slice(0, 6);
  for (const ring of rings) emitLandRing(ring, [], sample, writer, ground);
}

function buildBuilding(
  nodes: [number, number][],
  sample: (lat: number, lon: number) => number,
  writer: BinWriter,
  labels: LabelWriter,
  name?: string,
  occupied?: Occupied,
  explicitHeight?: number,
  msHeights?: HeightIndex,
  roofShape?: string,
  buildingType?: string,
  rowAxis?: { ax: number; az: number },
): boolean {
  nodes = uniqueRing(nodes);
  if (nodes.length < 3) return false;
  const pts = nodes.map(([lat, lon]) => localM(lat, lon));
  if (isGiantBuilding(pts)) return false;
  const heights = nodes.map(([lat, lon]) => {
    let h = sample(lat, lon);
    if (!Number.isFinite(h) || h < 0) h = 0;
    if (h > 12) h = 12;
    return h;
  });
  const maxH = heights.reduce((a, b) => Math.max(a, b), 0);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const bldgH = eaveHeight(explicitHeight, msHeights?.lookup(cx, cy));
  const eaveY = maxH + bldgH;
  const roof = classifyRoof(pts, roofShape, buildingType, rowAxis);
  const area = Math.abs(signedArea(pts));
  const wallRgb = wallColour(cx, cy, buildingType, roof.kind, area);
  const roofRgb = roofColour(cx, cy, buildingType, roof.kind, area);
  const n = pts.length;
  const pos: number[] = [];
  const cols: number[] = [];
  const inds: number[] = [];
  const push = (x: number, y: number, z: number, rgb: number[]) => {
    pos.push(x, y, z);
    cols.push(rgb[0], rgb[1], rgb[2]);
    return pos.length / 3 - 1;
  };
  const wallQuad = (
    x0: number, z0: number, y0b: number, y0t: number,
    x1: number, z1: number, y1b: number, y1t: number,
  ) => {
    const i = push(x0, y0b, z0, plinthTint(wallRgb, y0b, y0b));
    push(x1, y1b, z1, plinthTint(wallRgb, y1b, y1b));
    push(x0, y0t, z0, plinthTint(wallRgb, y0t, y0b));
    push(x1, y1t, z1, plinthTint(wallRgb, y1t, y1b));
    inds.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  };
  const roofTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    rx: number, ry: number, rz: number,
  ) => {
    const abx = bx - ax, abz = bz - az;
    const acx = rx - ax, acz = rz - az;
    if (abz * acx - abx * acz < 0) {
      const tx = bx, ty = by, tz = bz;
      bx = rx; by = ry; bz = rz;
      rx = tx; ry = ty; rz = tz;
    }
    const i = push(ax, ay, az, roofRgb);
    push(bx, by, bz, roofRgb);
    push(rx, ry, rz, roofRgb);
    inds.push(i, i + 1, i + 2);
  };

  if (roof.kind === "gabled") {
    const nx = -roof.az;
    const nz = roof.ax;
    const acrossOf = (p: { x: number; y: number }) =>
      (p.x - roof.cx) * nx + (p.y - roof.cy) * nz;
    const ridgeOf = (p: { x: number; y: number }) => {
      const along = (p.x - roof.cx) * roof.ax + (p.y - roof.cy) * roof.az;
      return { x: roof.cx + roof.ax * along, y: roof.cy + roof.az * along };
    };
    const peak = eaveY + roof.rise;
    const slopeY = (ac: number) =>
      eaveY + roof.rise * (1 - Math.min(1, Math.abs(ac) / roof.half));
    const ring: { x: number; y: number }[] = [];
    const ground: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      ring.push(a);
      ground.push(heights[i]);
      const aa = acrossOf(a);
      const ab = acrossOf(b);
      if (aa * ab < 0 && Math.abs(aa - ab) > 1e-5) {
        const t = Math.abs(aa) / (Math.abs(aa) + Math.abs(ab));
        ring.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        ground.push(heights[i] + (heights[(i + 1) % n] - heights[i]) * t);
      }
    }
    const m = ring.length;
    for (let i = 0; i < m; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % m];
      const aa = acrossOf(a);
      const ab = acrossOf(b);
      wallQuad(a.x, a.y, ground[i], slopeY(aa), b.x, b.y, ground[(i + 1) % m], slopeY(ab));
      if (Math.abs(aa) < 0.05 && Math.abs(ab) < 0.05) continue;
      const ra = ridgeOf(a);
      const rb = ridgeOf(b);
      const area =
        Math.abs((b.x - a.x) * (rb.y - a.y) - (b.y - a.y) * (rb.x - a.x)) +
        Math.abs((rb.x - a.x) * (ra.y - a.y) - (rb.y - a.y) * (ra.x - a.x));
      if (area < 0.5) continue;
      roofTri(a.x, slopeY(aa), a.y, b.x, slopeY(ab), b.y, rb.x, peak, rb.y);
      roofTri(a.x, slopeY(aa), a.y, rb.x, peak, rb.y, ra.x, peak, ra.y);
    }
  } else if (roof.kind === "hipped") {
    const peak = eaveY + roof.rise;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      wallQuad(pts[i].x, pts[i].y, heights[i], eaveY, pts[j].x, pts[j].y, heights[j], eaveY);
      roofTri(pts[i].x, eaveY, pts[i].y, pts[j].x, eaveY, pts[j].y, roof.cx, peak, roof.cy);
    }
  } else {
    const tris = triangulate(pts);
    if (tris.length < 3) return false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      wallQuad(pts[i].x, pts[i].y, heights[i], eaveY, pts[j].x, pts[j].y, heights[j], eaveY);
    }
    for (let t = 0; t < tris.length; t += 3) {
      const a = pts[tris[t]];
      const b = pts[tris[t + 1]];
      const c = pts[tris[t + 2]];
      roofTri(a.x, eaveY, a.y, b.x, eaveY, b.y, c.x, eaveY, c.y);
    }
  }

  if (inds.length < 3) return false;
  const verts = new Float32Array(pos);
  const norms = new Float32Array(verts.length);
  const idx = inds.length > 65535 ? new Uint32Array(inds) : new Uint16Array(inds);
  computeNormals(verts, idx, norms);
  writer.push("buildings", verts, norms, idx, [1, 1, 1, 1], new Float32Array(cols));
  labels.add("building", name, pts, eaveY + roof.rise + 4);
  occupied?.addRing(pts);
  return true;
}

function dedupePolyline(pts: { x: number; y: number }[], heights: number[], minDist = 0.8) {
  const outPts: { x: number; y: number }[] = [pts[0]];
  const outH: number[] = [heights[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = outPts[outPts.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) < minDist) continue;
    outPts.push(pts[i]);
    outH.push(heights[i]);
  }
  return { pts: outPts, heights: outH };
}

function signedArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function ensureWinding(pts: { x: number; y: number }[], ccw: boolean) {
  const pos = signedArea(pts) > 0;
  if (pos !== ccw) pts.reverse();
  return pts;
}

function pointInPoly(x: number, y: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    const xi = pts[i].x, xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function chaikinClosed(pts: { x: number; y: number }[], iterations = 3) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 4) break;
    const np: { x: number; y: number }[] = [];
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
  const out: { x: number; y: number }[] = [];
  for (const q of p) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < 0.4) continue;
    out.push(q);
  }
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.4) out.pop();
  }
  return out;
}

function keyPt(p: { x: number; y: number }) {
  return `${p.x.toFixed(2)}:${p.y.toFixed(2)}`;
}

function stitchRings(segments: { a: { x: number; y: number }; b: { x: number; y: number } }[]): { x: number; y: number }[][] {
  const adj = new Map<string, string[]>();
  const pts = new Map<string, { x: number; y: number }>();
  const add = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    const kp = keyPt(p);
    const kq = keyPt(q);
    pts.set(kp, p);
    pts.set(kq, q);
    const list = adj.get(kp);
    if (list) list.push(kq);
    else adj.set(kp, [kq]);
  };
  for (const s of segments) {
    add(s.a, s.b);
    add(s.b, s.a);
  }

  const used = new Set<string>();
  const rings: { x: number; y: number }[][] = [];
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const start of adj.keys()) {
    if ((adj.get(start)?.length ?? 0) < 2) continue;
    const firstN = adj.get(start)![0];
    const seed = edgeKey(start, firstN);
    if (used.has(seed)) continue;

    const ringKeys: string[] = [start];
    let prev = start;
    let cur = firstN;
    used.add(seed);
    let guard = 0;
    while (cur !== start && guard++ < 200000) {
      ringKeys.push(cur);
      const nbrs = adj.get(cur) ?? [];
      const next = nbrs.find((n) => n !== prev && !used.has(edgeKey(cur, n))) ?? nbrs.find((n) => n !== prev);
      if (!next) break;
      used.add(edgeKey(cur, next));
      prev = cur;
      cur = next;
    }
    if (ringKeys.length >= 6) {
      rings.push(ringKeys.map((k) => pts.get(k)!).filter(Boolean));
    }
  }
  return rings;
}

function marchingSquares(
  values: Float32Array,
  rows: number,
  cols: number,
  verts: Float32Array,
  thresh: number,
): { x: number; y: number }[][] {
  const pt = (i: number) => ({ x: verts[i * 3], y: verts[i * 3 + 2] });
  const lerp = (ia: number, ib: number) => {
    const ea = values[ia];
    const eb = values[ib];
    const t = Math.abs(eb - ea) < 1e-6 ? 0.5 : (thresh - ea) / (eb - ea);
    const u = Math.min(1, Math.max(0, t));
    const a = pt(ia);
    const b = pt(ib);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const segments: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      const idx =
        (values[i00] > thresh ? 1 : 0) |
        (values[i10] > thresh ? 2 : 0) |
        (values[i11] > thresh ? 4 : 0) |
        (values[i01] > thresh ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const e: { x: number; y: number }[] = new Array(4);
      e[0] = lerp(i00, i10);
      e[1] = lerp(i10, i11);
      e[2] = lerp(i01, i11);
      e[3] = lerp(i00, i01);
      const emit = (a: number, b: number) => segments.push({ a: e[a], b: e[b] });
      switch (idx) {
        case 1: case 14: emit(3, 0); break;
        case 2: case 13: emit(0, 1); break;
        case 3: case 12: emit(3, 1); break;
        case 4: case 11: emit(1, 2); break;
        case 6: case 9: emit(0, 2); break;
        case 7: case 8: emit(3, 2); break;
        case 5: emit(3, 0); emit(1, 2); break;
        case 10: emit(0, 1); emit(3, 2); break;
      }
    }
  }
  return stitchRings(segments);
}

function gridBoundaryRings(
  mask: Uint8Array,
  rows: number,
  cols: number,
  verts: Float32Array,
): { x: number; y: number }[][] {
  const inlandQuad = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < rows - 1 && c < cols - 1 &&
    mask[r * cols + c] && mask[r * cols + c + 1] &&
    mask[(r + 1) * cols + c] && mask[(r + 1) * cols + c + 1];
  const pt = (i: number) => ({ x: verts[i * 3], y: verts[i * 3 + 2] });
  const segments: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!inlandQuad(r, c)) continue;
      const i00 = r * cols + c;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      if (!inlandQuad(r - 1, c)) segments.push({ a: pt(i00), b: pt(i10) });
      if (!inlandQuad(r, c + 1)) segments.push({ a: pt(i10), b: pt(i11) });
      if (!inlandQuad(r + 1, c)) segments.push({ a: pt(i11), b: pt(i01) });
      if (!inlandQuad(r, c - 1)) segments.push({ a: pt(i01), b: pt(i00) });
    }
  }
  return stitchRings(segments);
}

function chaikin(pts: { x: number; y: number }[], heights: number[], iterations = 2) {
  let p = pts;
  let h = heights;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 2) break;
    const np: { x: number; y: number }[] = [p[0]];
    const nh: number[] = [h[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      np.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
      nh.push(h[i] * 0.75 + h[i + 1] * 0.25, h[i] * 0.25 + h[i + 1] * 0.75);
    }
    np.push(p[p.length - 1]);
    nh.push(h[h.length - 1]);
    p = np;
    h = nh;
  }
  return { pts: p, heights: h };
}

function roadDeckHeight(tags?: Record<string, string>): number {
  if (!tags) return 0;
  if (tags["tunnel"] && tags["tunnel"] !== "no") return Number.NaN;
  return 0;
}

function isBridge(tags?: Record<string, string>): boolean {
  if (!tags) return false;
  if (tags["tunnel"] && tags["tunnel"] !== "no") return false;
  if (tags["bridge"] && tags["bridge"] !== "no") return true;
  return tags["man_made"] === "bridge";
}

function bridgeHeights(
  pts: RoadPt[],
  ground: TerrainIndex,
  tags?: Record<string, string>,
): number[] {
  const n = pts.length;
  const ys = new Array<number>(n);
  if (n === 0) return ys;
  const y0 = ground.height(pts[0].x, pts[0].y);
  const y1 = ground.height(pts[n - 1].x, pts[n - 1].y);
  const len = polylineLength(pts);
  const layer = Number(tags?.layer);
  const storey = Number.isFinite(layer) && layer > 0 ? layer : 1;
  let rise = 4.8;
  if (len < 10) rise = 1.5;
  else if (len < 18) rise = 3.1;
  else if (len > 90) rise = 5.6;
  if (storey >= 2) rise += (storey - 1) * 4.2;
  const hw = tags?.highway ?? "";
  if (hw === "footway" || hw === "path" || hw === "cycleway" || hw === "steps" || hw === "pedestrian") {
    rise = Math.min(rise, 4.1);
  }
  if (tags?.bridge === "boardwalk") rise = Math.min(rise, 1.7);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const t = len > 1e-4 ? acc / len : 0;
    ys[i] = y0 + (y1 - y0) * t + rise * Math.sin(Math.PI * t) + ROAD_LIFT;
  }
  return ys;
}

type RoadPt = { x: number; y: number };
type RoadNorm = { ux: number; uz: number; miter: number };

function roadNormals(pts: RoadPt[]): RoadNorm[] {
  const n = pts.length;
  const out: RoadNorm[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.y - prev.y;
    const tlen = Math.hypot(tx, tz) || 1;
    tx /= tlen;
    tz /= tlen;
    let ux = -tz;
    let uz = tx;
    let miter = 1;
    if (i > 0 && i < n - 1) {
      const ax = pts[i].x - pts[i - 1].x;
      const az = pts[i].y - pts[i - 1].y;
      const bx = pts[i + 1].x - pts[i].x;
      const bz = pts[i + 1].y - pts[i].y;
      const al = Math.hypot(ax, az) || 1;
      const bl = Math.hypot(bx, bz) || 1;
      const nax = -az / al, naz = ax / al;
      const nbx = -bz / bl, nbz = bx / bl;
      ux = nax + nbx;
      uz = naz + nbz;
      const nlen = Math.hypot(ux, uz) || 1;
      ux /= nlen;
      uz /= nlen;
      miter = Math.min(4, 1 / Math.max(0.25, ux * nax + uz * naz));
    }
    out[i] = { ux, uz, miter };
  }
  return out;
}

function offsetSide(pts: RoadPt[], norms: RoadNorm[], dist: number, maxMiter = 4): RoadPt[] {
  return pts.map((p, i) => {
    const n = norms[i];
    const d = dist * Math.min(n.miter, maxMiter);
    return { x: p.x + n.ux * d, y: p.y + n.uz * d };
  });
}

function distToSeg(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

class CarriageIndex {
  private cell = 16;
  private bins = new Map<string, Array<{ id: number; ax: number; ay: number; bx: number; by: number; half: number }>>();
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  add(id: number, pts: RoadPt[], half: number) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      const pad = half + 4;
      const x0 = Math.floor((Math.min(ax, bx) - pad) / this.cell);
      const x1 = Math.floor((Math.max(ax, bx) + pad) / this.cell);
      const y0 = Math.floor((Math.min(ay, by) - pad) / this.cell);
      const y1 = Math.floor((Math.max(ay, by) + pad) / this.cell);
      const seg = { id, ax, ay, bx, by, half };
      for (let xi = x0; xi <= x1; xi++) {
        for (let yi = y0; yi <= y1; yi++) {
          const k = `${xi},${yi}`;
          const bin = this.bins.get(k);
          if (bin) bin.push(seg);
          else this.bins.set(k, [seg]);
        }
      }
    }
  }
  nearest(x: number, y: number, ignoreId?: number): { id: number; dist: number; half: number } | null {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best: { id: number; dist: number; half: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const s of bin) {
          if (s.id === ignoreId) continue;
          const d = distToSeg(x, y, s.ax, s.ay, s.bx, s.by);
          if (!best || d < best.dist) best = { id: s.id, dist: d, half: s.half };
        }
      }
    }
    return best;
  }
  distanceTo(x: number, y: number, id: number): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const s of bin) {
          if (s.id !== id) continue;
          const d = distToSeg(x, y, s.ax, s.ay, s.bx, s.by);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

function ribbonY(
  i: number,
  pt: RoadPt,
  ground: TerrainIndex,
  lift: number,
  heights?: number[],
) {
  return heights ? heights[Math.min(i, heights.length - 1)] : ground.height(pt.x, pt.y) + lift;
}

function pushRibbon(
  writer: BinWriter,
  mesh: string,
  left: RoadPt[],
  right: RoadPt[],
  ground: TerrainIndex,
  lift: number,
  colour: number[],
  heights?: number[],
): number {
  const n = left.length;
  if (n < 2) return 0;
  const verts = new Float32Array(n * 2 * 3);
  const norms = new Float32Array(verts.length);
  const idx = new Uint32Array((n - 1) * 6);
  let v = 0;
  let midY = 0;
  for (let i = 0; i < n; i++) {
    const yL = ribbonY(i, left[i], ground, lift, heights);
    const yR = ribbonY(i, right[i], ground, lift, heights);
    verts[v++] = left[i].x; verts[v++] = yL; verts[v++] = left[i].y;
    verts[v++] = right[i].x; verts[v++] = yR; verts[v++] = right[i].y;
    if (i === (n >> 1)) midY = (yL + yR) * 0.5;
  }
  for (let i = 0; i < n; i++) {
    norms[i * 6 + 1] = 1;
    norms[i * 6 + 4] = 1;
  }
  let ii = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx[ii++] = a; idx[ii++] = a + 2; idx[ii++] = a + 1;
    idx[ii++] = a + 1; idx[ii++] = a + 2; idx[ii++] = a + 3;
  }
  writer.push(mesh, verts, norms, idx, colour);
  return midY;
}

function emitQuad(
  pos: number[],
  nrm: number[],
  idx: number[],
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = dx - ax, vy = dy - ay, vz = dz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const b = pos.length / 3;
  pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
  for (let i = 0; i < 4; i++) nrm.push(nx, ny, nz);
  idx.push(b, b + 1, b + 3, b + 1, b + 2, b + 3);
}

function pushWall(
  writer: BinWriter,
  mesh: string,
  left: RoadPt[],
  right: RoadPt[],
  ground: TerrainIndex,
  topLift: number,
  colour: number[],
  bottomLift = 0,
): number {
  const n = left.length;
  if (n < 2) return 0;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const yL = (i: number, lift: number) => ground.height(left[i].x, left[i].y) + lift;
  const yR = (i: number, lift: number) => ground.height(right[i].x, right[i].y) + lift;
  for (let i = 0; i < n - 1; i++) {
    const ytl = yL(i, topLift), ytr = yR(i, topLift);
    const ynl = yL(i + 1, topLift), ynr = yR(i + 1, topLift);
    const ybl = yL(i, bottomLift), ybr = yR(i, bottomLift);
    const ynbl = yL(i + 1, bottomLift), ynbr = yR(i + 1, bottomLift);
    emitQuad(pos, nrm, idx,
      left[i].x, ytl, left[i].y, left[i + 1].x, ynl, left[i + 1].y,
      right[i + 1].x, ynr, right[i + 1].y, right[i].x, ytr, right[i].y);
    emitQuad(pos, nrm, idx,
      left[i].x, ybl, left[i].y, left[i + 1].x, ynbl, left[i + 1].y,
      left[i + 1].x, ynl, left[i + 1].y, left[i].x, ytl, left[i].y);
    emitQuad(pos, nrm, idx,
      right[i].x, ytr, right[i].y, right[i + 1].x, ynr, right[i + 1].y,
      right[i + 1].x, ynbr, right[i + 1].y, right[i].x, ybr, right[i].y);
  }
  emitQuad(pos, nrm, idx,
    left[0].x, yL(0, topLift), left[0].y, right[0].x, yR(0, topLift), right[0].y,
    right[0].x, yR(0, bottomLift), right[0].y, left[0].x, yL(0, bottomLift), left[0].y);
  const e = n - 1;
  emitQuad(pos, nrm, idx,
    right[e].x, yR(e, topLift), right[e].y, left[e].x, yL(e, topLift), left[e].y,
    left[e].x, yL(e, bottomLift), left[e].y, right[e].x, yR(e, bottomLift), right[e].y);
  writer.push(mesh, new Float32Array(pos), new Float32Array(nrm), new Uint32Array(idx), colour);
  return (yL(n >> 1, topLift) + yR(n >> 1, topLift)) * 0.5;
}

function pushDeck(
  writer: BinWriter,
  mesh: string,
  pts: { x: number; y: number }[],
  ground: TerrainIndex,
  topLift: number,
  colour: number[],
  thickness: number,
): number {
  if (pts.length < 3) return 0;
  const samples = pts.map((p) => ground.height(p.x, p.y)).sort((a, b) => a - b);
  const base = samples[samples.length >> 1];
  const yTop = base + topLift;
  const yBot = yTop - Math.max(0.25, Math.min(thickness, topLift));
  const { verts: meshPts, idx: tris } = triangulateHoles(pts, []);
  if (tris.length < 3) return base;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const topOff = 0;
  for (const p of meshPts) {
    pos.push(p.x, yTop, p.y);
    nrm.push(0, 1, 0);
  }
  for (let i = 0; i < tris.length; i += 3) {
    idx.push(topOff + tris[i], topOff + tris[i + 1], topOff + tris[i + 2]);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    emitQuad(pos, nrm, idx, a.x, yBot, a.y, b.x, yBot, b.y, b.x, yTop, b.y, a.x, yTop, a.y);
  }
  writer.push(mesh, new Float32Array(pos), new Float32Array(nrm), new Uint32Array(idx), colour);
  return yTop;
}

function pushBox(
  writer: BinWriter,
  mesh: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour: number[],
) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  emitQuad(pos, nrm, idx, x - hx, y + hy, z - hz, x + hx, y + hy, z - hz, x + hx, y + hy, z + hz, x - hx, y + hy, z + hz);
  emitQuad(pos, nrm, idx, x - hx, y - hy, z + hz, x + hx, y - hy, z + hz, x + hx, y - hy, z - hz, x - hx, y - hy, z - hz);
  emitQuad(pos, nrm, idx, x - hx, y - hy, z - hz, x + hx, y - hy, z - hz, x + hx, y + hy, z - hz, x - hx, y + hy, z - hz);
  emitQuad(pos, nrm, idx, x + hx, y - hy, z + hz, x - hx, y - hy, z + hz, x - hx, y + hy, z + hz, x + hx, y + hy, z + hz);
  emitQuad(pos, nrm, idx, x - hx, y - hy, z + hz, x - hx, y - hy, z - hz, x - hx, y + hy, z - hz, x - hx, y + hy, z + hz);
  emitQuad(pos, nrm, idx, x + hx, y - hy, z - hz, x + hx, y - hy, z + hz, x + hx, y + hy, z + hz, x + hx, y + hy, z - hz);
  writer.push(mesh, new Float32Array(pos), new Float32Array(nrm), new Uint32Array(idx), colour);
}

function pushPiles(
  writer: BinWriter,
  pts: RoadPt[],
  ground: TerrainIndex,
  topLift: number,
  colour: number[],
) {
  let acc = 0;
  let next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dz = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      const x = pts[i].x + dx * t;
      const z = pts[i].y + dz * t;
      const bot = ground.height(x, z);
      const top = bot + topLift;
      pushBox(writer, "harbour-piers", x, (bot + top) * 0.5, z, 0.34, Math.max(0.6, top - bot), 0.34, colour);
      next += 9;
    }
    acc += len;
  }
}

function pushCamberedRoad(
  writer: BinWriter,
  centre: RoadPt[],
  left: RoadPt[],
  right: RoadPt[],
  ground: TerrainIndex,
  lift: number,
  heights?: number[],
): number {
  const n = centre.length;
  if (n < 2) return 0;
  const verts = new Float32Array(n * 3 * 3);
  const norms = new Float32Array(verts.length);
  const idx = new Uint32Array((n - 1) * 12);
  let v = 0;
  let midY = 0;
  for (let i = 0; i < n; i++) {
    const yL = ribbonY(i, left[i], ground, lift, heights);
    const yR = ribbonY(i, right[i], ground, lift, heights);
    const yC = (yL + yR) * 0.5 + 0.045;
    verts[v++] = left[i].x; verts[v++] = yL; verts[v++] = left[i].y;
    verts[v++] = centre[i].x; verts[v++] = yC; verts[v++] = centre[i].y;
    verts[v++] = right[i].x; verts[v++] = yR; verts[v++] = right[i].y;
    if (i === (n >> 1)) midY = yC;
  }
  for (let i = 0; i < n * 3; i++) norms[i * 3 + 1] = 1;
  let ii = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 3;
    const b = a + 3;
    idx[ii++] = a; idx[ii++] = b; idx[ii++] = a + 1;
    idx[ii++] = a + 1; idx[ii++] = b; idx[ii++] = b + 1;
    idx[ii++] = a + 1; idx[ii++] = b + 1; idx[ii++] = a + 2;
    idx[ii++] = a + 2; idx[ii++] = b + 1; idx[ii++] = b + 2;
  }
  writer.push("roads", verts, norms, idx, ROAD_COLOUR);
  return midY;
}

function pointAlong(pts: RoadPt[], dist: number): { p: RoadPt; ux: number; uz: number } | null {
  if (pts.length < 2) return null;
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i + 1].x - pts[i].x;
    const az = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(ax, az) || 1e-6;
    if (d + len >= dist) {
      const t = (dist - d) / len;
      const tx = ax / len;
      const tz = az / len;
      return {
        p: { x: pts[i].x + ax * t, y: pts[i].y + az * t },
        ux: -tz,
        uz: tx,
      };
    }
    d += len;
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const ax = last.x - prev.x;
  const az = last.y - prev.y;
  const len = Math.hypot(ax, az) || 1;
  return { p: last, ux: -az / len, uz: ax / len };
}

function polylineLength(pts: RoadPt[]): number {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return d;
}

function buildBridgeStructure(
  writer: BinWriter,
  pts: RoadPt[],
  norms: RoadNorm[],
  ys: number[],
  width: number,
  ground: TerrainIndex,
  foot: boolean,
) {
  const n = pts.length;
  if (n < 2 || ys.length !== n) return;
  const half = Math.max(0.55, width / 2);
  const left = offsetSide(pts, norms, half + 0.1, 2.2);
  const right = offsetSide(pts, norms, -(half + 0.1), 2.2);
  const slab = foot ? 0.42 : 0.72;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const ytl = ys[i], ytr = ys[i], ynl = ys[i + 1], ynr = ys[i + 1];
    const ybl = ytl - slab, ybr = ytr - slab, ynbl = ynl - slab, ynbr = ynr - slab;
    emitQuad(pos, nrm, idx,
      left[i].x, ybl, left[i].y, left[i + 1].x, ynbl, left[i + 1].y,
      right[i + 1].x, ynbr, right[i + 1].y, right[i].x, ybr, right[i].y);
    emitQuad(pos, nrm, idx,
      left[i].x, ybl, left[i].y, left[i + 1].x, ynbl, left[i + 1].y,
      left[i + 1].x, ynl, left[i + 1].y, left[i].x, ytl, left[i].y);
    emitQuad(pos, nrm, idx,
      right[i].x, ytr, right[i].y, right[i + 1].x, ynr, right[i + 1].y,
      right[i + 1].x, ynbr, right[i + 1].y, right[i].x, ybr, right[i].y);
  }
  writer.push("bridge-decks", new Float32Array(pos), new Float32Array(nrm), new Uint32Array(idx), BRIDGE_COLOUR);

  const railH = foot ? 0.85 : 1.05;
  const railW = foot ? 0.14 : 0.22;
  const cap = 1.8;
  const leftOut = offsetSide(pts, norms, half + 0.1 + railW, cap);
  const rightOut = offsetSide(pts, norms, -(half + 0.1 + railW), cap);
  const railYs = ys.map((y) => y + railH);
  pushRibbon(writer, "bridge-rails", leftOut, left, ground, 0, PARAPET_COLOUR, railYs);
  pushRibbon(writer, "bridge-rails", right, rightOut, ground, 0, PARAPET_COLOUR, railYs);
  const len = polylineLength(pts);
  if (len < 18) return;
  const step = Math.max(12, Math.min(20, len / Math.max(2, Math.round(len / 16))));
  let acc = 0;
  let next = step;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dz = pts[i + 1].y - pts[i].y;
    const seg = Math.hypot(dx, dz);
    if (seg < 1e-4) continue;
    while (next <= acc + seg) {
      const t = (next - acc) / seg;
      const x = pts[i].x + dx * t;
      const z = pts[i].y + dz * t;
      const yTop = ys[i] + (ys[i + 1] - ys[i]) * t;
      const yBot = ground.height(x, z);
      if (yTop - yBot >= 2.1 && next > 7 && next < len - 7) {
        const pierW = foot ? 0.45 : Math.min(1.15, 0.45 + width * 0.08);
        pushBox(writer, "bridge-decks", x, (yBot + yTop - slab) * 0.5, z, pierW, Math.max(0.8, yTop - slab - yBot), pierW, BRIDGE_COLOUR);
      }
      next += step;
    }
    acc += seg;
  }
}

function pushCentreDashes(
  writer: BinWriter,
  pts: RoadPt[],
  ground: TerrainIndex,
  lift: number,
  parentId: number,
  roads: CarriageIndex,
) {
  const total = polylineLength(pts);
  if (total < 8) return;
  const dash = 3.0;
  const gap = 6.0;
  const half = 0.08;
  const pos: number[] = [];
  const idx: number[] = [];
  let d = 1.5;
  while (d + 1.2 < total) {
    const a = pointAlong(pts, d);
    const b = pointAlong(pts, Math.min(total, d + dash));
    const mid = pointAlong(pts, Math.min(total, d + dash * 0.5));
    d += dash + gap;
    if (!a || !b) continue;
    if (mid) {
      const other = roads.nearest(mid.p.x, mid.p.y, parentId);
      if (other && other.dist < other.half + 1.1) continue;
    }
    const yA = ground.height(a.p.x, a.p.y) + lift + 0.025;
    const yB = ground.height(b.p.x, b.p.y) + lift + 0.025;
    const base = pos.length / 3;
    pos.push(
      a.p.x + a.ux * half, yA, a.p.y + a.uz * half,
      a.p.x - a.ux * half, yA, a.p.y - a.uz * half,
      b.p.x + b.ux * half, yB, b.p.y + b.uz * half,
      b.p.x - b.ux * half, yB, b.p.y - b.uz * half,
    );
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  if (idx.length < 3) return;
  const verts = new Float32Array(pos);
  const norms = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) norms[i + 1] = 1;
  writer.push("road-marks", verts, norms, new Uint32Array(idx), MARK_COLOUR);
}

function pavementSides(kind: string, tags?: Record<string, string>): { left: boolean; right: boolean } {
  const raw = (tags?.sidewalk ?? tags?.["sidewalk:both"] ?? "").toLowerCase();
  if (raw === "no" || raw === "none" || raw === "separate") return { left: false, right: false };
  if (raw === "left") return { left: true, right: false };
  if (raw === "right") return { left: false, right: true };
  if (raw === "both" || raw === "yes") return { left: true, right: true };
  if (["residential", "living_street", "tertiary", "unclassified", "primary", "secondary"].includes(kind)) {
    return { left: true, right: true };
  }
  return { left: false, right: false };
}

const UNPAVED_WALK = new Set(["ground", "dirt", "grass", "gravel", "sand", "mud", "earth", "unpaved", "woodchip"]);
const PAVED_WALK = new Set([
  "asphalt",
  "paving_stones",
  "concrete",
  "sett",
  "cobblestone",
  "paved",
  "pebblestone",
  "metal",
  "wood",
  "concrete:plates",
  "grass_paver",
  "bricks",
  "fine_gravel",
]);
const SKIP_FOOTWAY = new Set(["crossing", "access_aisle", "traffic_island"]);

function walkKind(tags: Record<string, string>): "walk" | "cycle" | "steps" | null {
  const hw = tags.highway;
  if (!hw) return null;
  if (tags.area === "yes") return null;
  if (tags.tunnel && tags.tunnel !== "no") return null;
  if (hw === "steps") return "steps";
  if (hw === "cycleway") return "cycle";
  if (hw === "pedestrian") return "walk";
  const foot = tags.footway ?? "";
  if (SKIP_FOOTWAY.has(foot)) return null;
  if (tags.crossing && tags.crossing !== "no") return null;
  const surf = (tags.surface ?? "").toLowerCase().split(";")[0].trim();
  if (hw === "footway") return "walk";
  if (hw === "path") {
    if (!surf || UNPAVED_WALK.has(surf)) return null;
    if (!PAVED_WALK.has(surf) && tags.paved !== "yes") return null;
    return tags.bicycle === "designated" ? "cycle" : "walk";
  }
  return null;
}

function walkWidth(kind: "walk" | "cycle" | "steps", tags: Record<string, string>): number {
  const tagged = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 0.8 && tagged <= 8) return tagged;
  if (kind === "cycle") return 2.2;
  if (kind === "steps") return 1.15;
  if (tags.footway === "sidewalk") return 1.85;
  if (tags.highway === "pedestrian") return 3.4;
  return 1.55;
}

function sideHasMappedSidewalk(
  pts: RoadPt[],
  norms: RoadNorm[],
  half: number,
  sign: 1 | -1,
  sidewalks: CarriageIndex,
): boolean {
  if (pts.length === 0) return false;
  const offset = half + 1.7;
  let hits = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(pts.length / 8));
  for (let i = 0; i < pts.length; i += step) {
    samples++;
    const x = pts[i].x + norms[i].ux * offset * sign;
    const y = pts[i].y + norms[i].uz * offset * sign;
    const hit = sidewalks.nearest(x, y);
    if (hit && hit.dist < 3.4) hits++;
  }
  return samples > 0 && hits >= Math.max(1, Math.ceil(samples * 0.35));
}

function pushSleepers(writer: BinWriter, pts: RoadPt[], ground: TerrainIndex, lift: number) {
  const total = polylineLength(pts);
  if (total < 2) return;
  const spacing = 0.7;
  const halfLen = 1.28;
  const halfW = 0.12;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let d = 0.25; d < total; d += spacing) {
    const a = pointAlong(pts, d);
    if (!a) continue;
    const tx = a.uz;
    const tz = -a.ux;
    const y = ground.height(a.p.x, a.p.y) + lift + 0.04;
    const lx = a.ux * halfLen;
    const lz = a.uz * halfLen;
    const wx = tx * halfW;
    const wz = tz * halfW;
    const base = pos.length / 3;
    pos.push(
      a.p.x + lx - wx, y, a.p.y + lz - wz,
      a.p.x + lx + wx, y, a.p.y + lz + wz,
      a.p.x - lx - wx, y, a.p.y - lz - wz,
      a.p.x - lx + wx, y, a.p.y - lz + wz,
    );
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  if (idx.length < 3) return;
  const verts = new Float32Array(pos);
  const nrm = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) nrm[i + 1] = 1;
  writer.push("rail-sleepers", verts, nrm, new Uint32Array(idx), SLEEPER_COLOUR);
}

function buildTrack(
  pts: RoadPt[],
  norms: RoadNorm[],
  ground: TerrainIndex,
  writer: BinWriter,
  deck: number,
  kind: string,
  heights?: number[],
  tags?: Record<string, string>,
) {
  const lift = RAIL_LIFT + deck;
  const ballastW = kind === "tram" || kind === "light_rail" ? 2.6 : kind === "miniature" ? 1.4 : 4.6;
  const half = ballastW / 2;
  pushRibbon(writer, "rails", offsetSide(pts, norms, half), offsetSide(pts, norms, -half), ground, lift, BALLAST_COLOUR, heights);
  if (kind === "tram" || kind === "miniature") {
    if (heights) buildBridgeStructure(writer, pts, norms, heights, ballastW, ground, false);
    return;
  }
  const gauge = 1.435 / 2;
  const head = 0.08;
  const steelLift = lift + 0.07;
  const steelYs = heights?.map((y) => y + 0.07);
  pushRibbon(
    writer,
    "rail-steel",
    offsetSide(pts, norms, gauge + head),
    offsetSide(pts, norms, gauge - head),
    ground,
    steelLift,
    STEEL_COLOUR,
    steelYs,
  );
  pushRibbon(
    writer,
    "rail-steel",
    offsetSide(pts, norms, -(gauge - head)),
    offsetSide(pts, norms, -(gauge + head)),
    ground,
    steelLift,
    STEEL_COLOUR,
    steelYs,
  );
  if (!heights) pushSleepers(writer, pts, ground, lift);
  if (heights) buildBridgeStructure(writer, pts, norms, heights, ballastW, ground, false);
}

type LaidRoad = {
  pts: RoadPt[];
  norms: RoadNorm[];
  width: number;
  kind: string;
  tags?: Record<string, string>;
  name?: string;
  deck: number;
  bridge: boolean;
  mesh: "roads" | "rails";
};

function layoutRoad(
  nodes: [number, number][],
  width: number,
  name: string | undefined,
  tags: Record<string, string> | undefined,
  mesh: "roads" | "rails",
  southNudge = 0,
): LaidRoad | null {
  if (nodes.length < 2) return null;
  const deck = roadDeckHeight(tags);
  if (!Number.isFinite(deck)) return null;
  let pts = nodes.map(([lat, lon]) => localM(lat, lon));
  let heights = pts.map(() => 0);
  ({ pts, heights } = dedupePolyline(pts, heights));
  if (pts.length < 2) return null;
  ({ pts, heights } = chaikin(pts, heights, 2));
  ({ pts, heights } = dedupePolyline(pts, heights, 0.35));
  if (pts.length < 2) return null;
  if (southNudge) {
    for (const p of pts) p.y -= southNudge;
  }
  return {
    pts,
    norms: roadNormals(pts),
    width,
    kind: tags?.highway ?? "",
    tags,
    name,
    deck,
    bridge: isBridge(tags),
    mesh,
  };
}

function edgeKeep(
  x: number,
  y: number,
  parentId: number,
  roads: CarriageIndex,
  pad: number,
): boolean {
  const other = roads.nearest(x, y, parentId);
  if (!other) return true;
  return other.dist >= other.half + pad;
}

function closeKeep(keep: boolean[], maxHole: number) {
  let i = 0;
  while (i < keep.length) {
    if (keep[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < keep.length && !keep[i]) i++;
    if (start > 0 && i < keep.length && i - start <= maxHole) {
      for (let j = start; j < i; j++) keep[j] = true;
    }
  }
}

function pushClippedRibbon(
  writer: BinWriter,
  mesh: string,
  left: RoadPt[],
  right: RoadPt[],
  ground: TerrainIndex,
  lift: number,
  colour: number[],
  parentId: number,
  roads: CarriageIndex,
  pad: number,
) {
  const n = left.length;
  if (n < 2 || right.length !== n) return;
  const keep = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    keep[i] = edgeKeep(
      (left[i].x + right[i].x) * 0.5,
      (left[i].y + right[i].y) * 0.5,
      parentId,
      roads,
      pad,
    );
  }
  closeKeep(keep, 5);
  let i = 0;
  while (i < n) {
    while (i < n && !keep[i]) i++;
    const start = i;
    while (i < n && keep[i]) i++;
    if (i - start < 2) continue;
    pushRibbon(writer, mesh, left.slice(start, i), right.slice(start, i), ground, lift, colour);
  }
}

function buildRoad(
  road: LaidRoad,
  id: number,
  roads: CarriageIndex,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
  sidewalks?: CarriageIndex,
) {
  const { pts, norms, width, kind, tags, name, deck, mesh, bridge } = road;
  const lift = ROAD_LIFT + deck;
  const ys = bridge ? bridgeHeights(pts, ground, tags) : undefined;

  if (mesh === "rails") {
    buildTrack(pts, norms, ground, writer, deck, tags?.railway ?? "rail", ys, tags);
    return;
  }

  const half = width / 2;
  const left = offsetSide(pts, norms, half);
  const right = offsetSide(pts, norms, -half);
  const midY = pushCamberedRoad(writer, pts, left, right, ground, lift, ys);
  labels.add("road", name, pts, midY + 6, "path");
  if (ys) buildBridgeStructure(writer, pts, norms, ys, width, ground, false);

  if (width >= 3.6 && !bridge) {
    const kerb = 0.22;
    const kerbLift = lift + 0.1;
    const cap = 1.35;
    const kerbL = offsetSide(pts, norms, half + kerb, cap);
    const kerbR = offsetSide(pts, norms, -(half + kerb), cap);
    pushClippedRibbon(writer, "road-kerbs", kerbL, left, ground, kerbLift, KERB_COLOUR, id, roads, 0.3);
    pushClippedRibbon(writer, "road-kerbs", right, kerbR, ground, kerbLift, KERB_COLOUR, id, roads, 0.3);
    if (deck === 0) {
      const sides = pavementSides(kind, tags);
      if (sidewalks) {
        if (sides.left && sideHasMappedSidewalk(pts, norms, half, 1, sidewalks)) sides.left = false;
        if (sides.right && sideHasMappedSidewalk(pts, norms, half, -1, sidewalks)) sides.right = false;
      }
      const pave = 1.35;
      const paveLift = lift + 0.08;
      if (sides.left) {
        pushClippedRibbon(
          writer,
          "road-pavements",
          offsetSide(pts, norms, half + kerb + pave, cap),
          offsetSide(pts, norms, half + kerb, cap),
          ground,
          paveLift,
          PAVEMENT_COLOUR,
          id,
          roads,
          0.5,
        );
      }
      if (sides.right) {
        pushClippedRibbon(
          writer,
          "road-pavements",
          offsetSide(pts, norms, -(half + kerb + pave), cap),
          offsetSide(pts, norms, -(half + kerb), cap),
          ground,
          paveLift,
          PAVEMENT_COLOUR,
          id,
          roads,
          0.5,
        );
      }
    }
  }

  if (
    width >= 6.4 &&
    ["primary", "secondary", "tertiary", "trunk", "motorway", "unclassified"].includes(kind)
  ) {
    pushCentreDashes(writer, pts, ground, lift, id, roads);
  }
}

function buildWalk(
  road: LaidRoad,
  roads: CarriageIndex,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
) {
  const { pts, norms, width, kind, tags, name, deck, bridge } = road;
  const lift = ROAD_LIFT + deck + (kind === "steps" ? 0.11 : 0.08);
  const half = Math.max(0.45, width / 2);
  const mesh = kind === "cycleway" ? "road-cycleways" : "road-pavements";
  const colour = kind === "cycleway" ? CYCLE_COLOUR : PAVEMENT_COLOUR;
  const ys = bridge ? bridgeHeights(pts, ground, tags) : undefined;
  if (ys) {
    pushRibbon(
      writer,
      mesh,
      offsetSide(pts, norms, half, 1.6),
      offsetSide(pts, norms, -half, 1.6),
      ground,
      lift,
      colour,
      ys,
    );
    buildBridgeStructure(writer, pts, norms, ys, width, ground, true);
  } else {
    pushClippedRibbon(
      writer,
      mesh,
      offsetSide(pts, norms, half, 1.6),
      offsetSide(pts, norms, -half, 1.6),
      ground,
      lift,
      colour,
      -1,
      roads,
      0.35,
    );
  }
  if (name) labels.add("road", name, pts, (ys ? ys[ys.length >> 1] : lift) + 6, "path");
}

type PendingBridge = {
  nodes: [number, number][];
  name?: string;
  tags: Record<string, string>;
  closed: boolean;
};

type HarbourKind = "pier" | "wall" | "slip";
type PendingHarbour = {
  nodes: [number, number][];
  kind: HarbourKind;
  name?: string;
  tags: Record<string, string>;
  closed: boolean;
};
type MarkKind = "buoy" | "beacon" | "light" | "mooring";
type PendingMark = {
  lat: number;
  lon: number;
  kind: MarkKind;
  colour: "red" | "green" | "yellow" | "white";
  name?: string;
};
type PowerKitKind = "solar" | "kiosk" | "transformer";
type PendingPowerKit = {
  lat: number;
  lon: number;
  kind: PowerKitKind;
  name?: string;
};
type PendingPowerYard = {
  nodes: [number, number][];
  name?: string;
  tags: Record<string, string>;
};
type PendingSolarRing = {
  nodes: [number, number][];
};
type PendingPower = {
  kits: PendingPowerKit[];
  yards: PendingPowerYard[];
  solar: PendingSolarRing[];
};
type BarrierLineKind = "fence" | "wall" | "hedge" | "retaining";
type BarrierKitKind = "bollard" | "gate" | "cycle" | "lift";
type PendingBarrierLine = {
  nodes: [number, number][];
  kind: BarrierLineKind;
  tags: Record<string, string>;
  closed: boolean;
};
type PendingBarrierKit = {
  lat?: number;
  lon?: number;
  x?: number;
  z?: number;
  kind: BarrierKitKind;
  heading?: number;
};
type PendingBarriers = {
  lines: PendingBarrierLine[];
  kits: PendingBarrierKit[];
};

function harbourKind(tags: Record<string, string>): HarbourKind | null {
  const mm = tags["man_made"];
  if (mm === "pier" || mm === "jetty") return "pier";
  if (mm === "breakwater" || mm === "groyne" || mm === "quay") return "wall";
  if (mm === "slipway" || tags["leisure"] === "slipway") return "slip";
  return null;
}

function harbourWidth(kind: HarbourKind, tags: Record<string, string>): number {
  const tagged = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 0.8 && tagged <= 40) return tagged;
  if (kind === "pier") return tags.floating === "yes" || tags.mooring === "pontoon" ? 3.2 : 5.8;
  if (tags.man_made === "groyne") return 2.0;
  if (tags.man_made === "breakwater") return 7.5;
  if (tags.man_made === "quay") return 4.2;
  if (kind === "slip") return 6.5;
  return 4;
}

function harbourTopLift(kind: HarbourKind, tags: Record<string, string>, floating: boolean): number {
  if (kind === "slip") return 0.4;
  if (kind === "wall") {
    if (tags.man_made === "groyne") return 1.65;
    if (tags.man_made === "quay") return 2.3;
    return 3.2;
  }
  return floating ? 0.85 : 2.35;
}

function harbourMeshName(kind: HarbourKind): string {
  if (kind === "wall") return "harbour-walls";
  if (kind === "slip") return "harbour-slips";
  return "harbour-piers";
}

function harbourColour(kind: HarbourKind, floating: boolean): number[] {
  if (kind === "wall") return WALL_COLOUR;
  if (kind === "slip") return SLIP_COLOUR;
  return floating ? PONTOON_COLOUR : PIER_COLOUR;
}

function seamarkKind(tags: Record<string, string>): MarkKind | null {
  const t = tags["seamark:type"] ?? "";
  if (t.startsWith("buoy_")) return "buoy";
  if (t.startsWith("beacon_")) return "beacon";
  if (t === "light_minor") return "light";
  if (t === "mooring" || t === "pile") return "mooring";
  if (tags.man_made === "lighthouse") return "light";
  if (tags.man_made === "beacon") return "beacon";
  return null;
}

function isSolarGenerator(tags: Record<string, string>): boolean {
  if (tags.power !== "generator") return false;
  const src = (tags["generator:source"] ?? "").toLowerCase();
  const method = (tags["generator:method"] ?? "").toLowerCase();
  if (src && src !== "solar") return false;
  if (method && method !== "photovoltaic") return false;
  return true;
}

function powerKitKind(tags: Record<string, string>): PowerKitKind | null {
  if (isSolarGenerator(tags)) return "solar";
  if (tags.power === "transformer") return "transformer";
  if (tags.power === "substation") return "kiosk";
  return null;
}

function fillRing(
  pts: { x: number; y: number }[],
  stepX: number,
  stepZ: number,
  pad: number,
  maxN: number,
): { x: number; y: number }[] {
  if (pts.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const inside = (x: number, y: number) =>
    pointInPoly(x, y, pts) &&
    pointInPoly(x + pad, y, pts) &&
    pointInPoly(x - pad, y, pts) &&
    pointInPoly(x, y + pad, pts) &&
    pointInPoly(x, y - pad, pts);
  const out: { x: number; y: number }[] = [];
  for (let y = minY + stepZ * 0.5; y <= maxY; y += stepZ) {
    for (let x = minX + stepX * 0.5; x <= maxX; x += stepX) {
      if (!inside(x, y)) continue;
      out.push({ x, y });
      if (out.length >= maxN) return out;
    }
  }
  return out;
}

function roofLift(x: number, y: number, occupied: Occupied, heights: HeightIndex): number {
  return heights.lookup(x, y) ?? (occupied.has(x, y) ? 6 : 0);
}

function nearKit(
  kits: Array<{ x: number; z: number }>,
  x: number,
  z: number,
  dist: number,
): boolean {
  return kits.some((k) => Math.hypot(k.x - x, k.z - z) < dist);
}

function buildPower(
  pending: PendingPower,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
  occupied: Occupied,
  heights: HeightIndex,
): Array<{ x: number; z: number; y: number; kind: PowerKitKind; heading?: number; name?: string }> {
  const kits: Array<{ x: number; z: number; y: number; kind: PowerKitKind; heading?: number; name?: string }> = [];
  const pushKit = (
    x: number,
    z: number,
    kind: PowerKitKind,
    name?: string,
    heading = 0,
    extraLift = 0,
  ) => {
    if (nearKit(kits, x, z, kind === "solar" ? 1.6 : 4.5)) return;
    if (kind !== "solar" && occupied.has(x, z)) return;
    const y = ground.height(x, z) + (kind === "solar" ? roofLift(x, z, occupied, heights) : 0.16) + extraLift;
    kits.push({ x, z, y, kind, heading, name });
  };

  for (const ring of pending.solar) {
    const pts = uniqueRing(ring.nodes).map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3 || ringArea(pts) < 4) continue;
    const area = ringArea(pts);
    const step = area > 400 ? 2.35 : 2.05;
    for (const p of fillRing(pts, step, 1.2, 0.45, 600)) {
      pushKit(p.x, p.y, "solar", undefined, 0, 0.05);
    }
  }

  for (const item of pending.yards) {
    const pts = uniqueRing(item.nodes).map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3) continue;
    const area = ringArea(pts);
    if (area < 4 || area > 12_000 || ringSpan(pts) > 280) continue;
    const lift = area >= 80 ? 0.22 : 0.14;
    pushDeck(writer, "power-yards", pts, ground, lift, POWER_YARD_COLOUR, lift);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const major = item.tags.substation === "distribution" || area >= 200;
    if (major) {
      const spots = fillRing(pts, 11, 11, 2.2, 8);
      for (const p of spots.length ? spots : [{ x: cx, y: cz }]) {
        pushKit(p.x, p.y, "transformer", undefined, 0, lift);
      }
    } else {
      pushKit(cx, cz, "kiosk", undefined, 0, lift);
    }
    if (item.name) labels.add("area", item.name, pts, ground.height(cx, cz) + 8);
  }

  for (const kit of pending.kits) {
    const p = localM(kit.lat, kit.lon);
    const skip = kit.kind === "solar" ? 2.4 : 7;
    if (nearKit(kits, p.x, p.y, skip)) continue;
    pushKit(p.x, p.y, kit.kind, kit.name);
  }
  return kits;
}

function barrierLineKind(tags: Record<string, string>): BarrierLineKind | null {
  const b = tags.barrier;
  if (b === "fence") return "fence";
  if (b === "hedge") return "hedge";
  if (b === "retaining_wall") return "retaining";
  if (b === "wall" || b === "city_wall") return "wall";
  return null;
}

function barrierKitKind(tags: Record<string, string>): BarrierKitKind | null {
  const b = tags.barrier;
  if (b === "bollard") return "bollard";
  if (b === "cycle_barrier") return "cycle";
  if (b === "lift_gate") return "lift";
  if (b === "gate" || b === "kissing_gate" || b === "swing_gate") return "gate";
  return null;
}

function parseBarrierHeight(tags: Record<string, string>, fallback: number): number {
  const raw = tags.height ?? tags["height:barrier"] ?? "";
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(raw);
  if (m) {
    let h = Number(m[1]);
    if (/ft|feet/i.test(raw)) h *= 0.3048;
    if (h >= 0.35 && h <= 8) return h;
  }
  return fallback;
}

function barrierWidth(kind: BarrierLineKind): number {
  if (kind === "fence") return 0.1;
  if (kind === "hedge") return 0.42;
  if (kind === "retaining") return 0.5;
  return 0.28;
}

function barrierDefaultHeight(kind: BarrierLineKind, tags: Record<string, string>): number {
  if (kind === "fence") return 1.15;
  if (kind === "hedge") return 1.25;
  if (kind === "retaining") return 1.45;
  return tags.barrier === "city_wall" ? 3.2 : 1.55;
}

function barrierMeshName(kind: BarrierLineKind): string {
  if (kind === "fence") return "barrier-fences";
  if (kind === "hedge") return "barrier-hedges";
  if (kind === "retaining") return "barrier-retaining";
  return "barrier-walls";
}

function barrierColour(kind: BarrierLineKind): number[] {
  if (kind === "fence") return FENCE_COLOUR;
  if (kind === "hedge") return HEDGE_COLOUR;
  if (kind === "retaining") return RETAIN_COLOUR;
  return BARRIER_WALL_COLOUR;
}

function sampleLine(
  pts: { x: number; y: number }[],
  spacing: number,
): Array<{ x: number; y: number; heading: number }> {
  if (pts.length < 2) return [];
  const out: Array<{ x: number; y: number; heading: number }> = [];
  let acc = 0;
  let next = spacing * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const heading = Math.atan2(dx, dy);
    while (next <= acc + len + 1e-6) {
      const t = (next - acc) / len;
      out.push({ x: pts[i].x + dx * t, y: pts[i].y + dy * t, heading });
      next += spacing;
    }
    acc += len;
  }
  return out;
}

function buildBarriers(
  pending: PendingBarriers,
  writer: BinWriter,
  ground: TerrainIndex,
  occupied: Occupied,
): Array<{ x: number; z: number; y: number; kind: BarrierKitKind; heading: number }> {
  const kits: Array<{ x: number; z: number; y: number; kind: BarrierKitKind; heading: number }> = [];
  const pushKit = (x: number, z: number, kind: BarrierKitKind, heading: number) => {
    if (kind === "bollard" && occupied.has(x, z)) return;
    if (kits.some((k) => k.kind === kind && Math.hypot(k.x - x, k.z - z) < 1.2)) return;
    kits.push({ x, z, y: ground.height(x, z) + 0.02, kind, heading });
  };

  for (const item of pending.lines) {
    const width = barrierWidth(item.kind);
    const laid = layoutRoad(item.nodes, width, undefined, item.tags, "roads");
    if (!laid || laid.pts.length < 2) continue;
    let pts = laid.pts;
    let norms = laid.norms;
    if (item.closed && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) > 0.4) {
      pts = [...pts, pts[0]];
      norms = [...norms, norms[0]];
    }
    if (ringSpan(pts) > 1800) continue;
    const left = offsetSide(pts, norms, width / 2, 2);
    const right = offsetSide(pts, norms, -width / 2, 2);
    const height = parseBarrierHeight(item.tags, barrierDefaultHeight(item.kind, item.tags));
    pushWall(writer, barrierMeshName(item.kind), left, right, ground, height, barrierColour(item.kind), 0);
  }

  for (const kit of pending.kits) {
    let x = kit.x;
    let z = kit.z;
    if (x === undefined || z === undefined) {
      if (kit.lat === undefined || kit.lon === undefined) continue;
      const p = localM(kit.lat, kit.lon);
      x = p.x;
      z = p.y;
    }
    pushKit(x, z, kit.kind, kit.heading ?? 0);
  }
  return kits;
}

function seamarkColour(tags: Record<string, string>): PendingMark["colour"] {
  const blob = [
    tags["seamark:buoy_lateral:colour"],
    tags["seamark:buoy_special_purpose:colour"],
    tags["seamark:beacon_lateral:colour"],
    tags["seamark:beacon_special_purpose:colour"],
    tags["seamark:light:colour"],
    tags["seamark:buoy_lateral:category"],
    tags["seamark:beacon_lateral:category"],
    tags["seamark:type"],
  ].filter(Boolean).join(" ").toLowerCase();
  if (blob.includes("green") || blob.includes("starboard")) return "green";
  if (blob.includes("red") || blob.includes("port")) return "red";
  if (blob.includes("yellow") || blob.includes("special")) return "yellow";
  return "white";
}

function buildSlip(
  nodes: [number, number][],
  width: number,
  tags: Record<string, string>,
  name: string | undefined,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
) {
  const laid = layoutRoad(nodes, width, name, tags, "roads");
  if (!laid) return;
  const { pts, norms } = laid;
  const y0 = ground.height(pts[0].x, pts[0].y);
  const y1 = ground.height(pts[pts.length - 1].x, pts[pts.length - 1].y);
  const waterFirst = y0 <= y1;
  const left = offsetSide(pts, norms, width / 2, 1.8);
  const right = offsetSide(pts, norms, -width / 2, 1.8);
  const n = pts.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const liftAt = (i: number) => {
    const t = n < 2 ? 0 : i / (n - 1);
    return waterFirst ? 0.12 + 1.55 * t : 1.67 - 1.55 * t;
  };
  for (let i = 0; i < n - 1; i++) {
    const ytl = ground.height(left[i].x, left[i].y) + liftAt(i);
    const ytr = ground.height(right[i].x, right[i].y) + liftAt(i);
    const ynl = ground.height(left[i + 1].x, left[i + 1].y) + liftAt(i + 1);
    const ynr = ground.height(right[i + 1].x, right[i + 1].y) + liftAt(i + 1);
    emitQuad(pos, nrm, idx,
      left[i].x, ytl, left[i].y, left[i + 1].x, ynl, left[i + 1].y,
      right[i + 1].x, ynr, right[i + 1].y, right[i].x, ytr, right[i].y);
  }
  writer.push("harbour-slips", new Float32Array(pos), new Float32Array(nrm), new Uint32Array(idx), SLIP_COLOUR);
  if (name) labels.add("area", name, pts, 4, "path");
}

function buildStandaloneBridge(
  item: PendingBridge,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
) {
  if (item.closed) {
    const ring = uniqueRing(item.nodes).map(([lat, lon]) => localM(lat, lon));
    if (ring.length < 3 || ringSpan(ring) < 4 || ringArea(ring) > 20_000) return;
    const midY = pushDeck(writer, "bridge-decks", ring, ground, 4.6, BRIDGE_COLOUR, 0.7);
    if (item.name) labels.add("area", item.name, ring, midY + 6);
    return;
  }
  const laid = layoutRoad(item.nodes, 5.2, item.name, item.tags, "roads");
  if (!laid) return;
  const ys = bridgeHeights(laid.pts, ground, item.tags);
  pushRibbon(
    writer,
    "bridge-decks",
    offsetSide(laid.pts, laid.norms, laid.width / 2, 2),
    offsetSide(laid.pts, laid.norms, -laid.width / 2, 2),
    ground,
    0,
    BRIDGE_COLOUR,
    ys,
  );
  buildBridgeStructure(writer, laid.pts, laid.norms, ys, laid.width, ground, false);
  if (item.name) labels.add("area", item.name, laid.pts, ys[ys.length >> 1] + 6, "path");
}

function buildHarbour(
  item: PendingHarbour,
  writer: BinWriter,
  labels: LabelWriter,
  ground: TerrainIndex,
) {
  const floating = item.tags.floating === "yes" || item.tags.mooring === "pontoon";
  const width = harbourWidth(item.kind, item.tags);
  const mesh = harbourMeshName(item.kind);
  const colour = harbourColour(item.kind, floating);
  const topLift = harbourTopLift(item.kind, item.tags, floating);

  if (item.closed) {
    const ring = uniqueRing(item.nodes).map(([lat, lon]) => localM(lat, lon));
    if (ring.length < 3) return;
    if (ringSpan(ring) > 700 || ringArea(ring) > 30_000) return;
    const midY = pushDeck(writer, mesh, ring, ground, topLift, colour, floating ? 0.4 : topLift);
    if (item.name) labels.add("area", item.name, ring, midY + 6);
    return;
  }
  if (item.kind === "slip") {
    buildSlip(item.nodes, width, item.tags, item.name, writer, labels, ground);
    return;
  }
  const laid = layoutRoad(item.nodes, width, item.name, item.tags, "roads");
  if (!laid) return;
  const left = offsetSide(laid.pts, laid.norms, width / 2, 2.2);
  const right = offsetSide(laid.pts, laid.norms, -width / 2, 2.2);
  const botLift = floating ? Math.max(0, topLift - 0.4) : 0;
  const midY = pushWall(writer, mesh, left, right, ground, topLift, colour, botLift);
  if (!floating && item.kind === "pier") pushPiles(writer, laid.pts, ground, topLift, colour);
  if (item.name) labels.add("area", item.name, laid.pts, midY + 6, "path");
}

type PendingWater = {
  outer: { x: number; y: number }[];
  holes?: { x: number; y: number }[][];
  name?: string;
};

function buildWater(item: PendingWater, ground: TerrainIndex, writer: BinWriter, labels: LabelWriter) {
  const outer = item.outer;
  if (outer.length < 3) return;
  if (ringSpan(outer) > 1800) return;
  const holes = (item.holes ?? []).filter((h) => h.length >= 3);
  const samples = outer.map((p) => ground.height(p.x, p.y)).sort((a, b) => a - b);
  const waterY = samples[samples.length >> 1] + WATER_LIFT;
  const { verts: meshPts, idx: tris } = triangulateHoles(outer, holes);
  if (tris.length < 3) return;
  const verts = new Float32Array(meshPts.length * 3);
  const norms = new Float32Array(verts.length);
  for (let i = 0; i < meshPts.length; i++) {
    verts[i * 3] = meshPts[i].x;
    verts[i * 3 + 1] = waterY;
    verts[i * 3 + 2] = meshPts[i].y;
    norms[i * 3 + 1] = 1;
  }
  const idx = meshPts.length > 65535 || tris.length > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
  writer.push("water", verts, norms, idx, WATER_COLOUR);
  labels.add("area", item.name, outer, waterY + 4);
}

/* ------------------------------------------------------------------ */
/*  5. Stream-parse OSM XML — one pass, no DOM                       */
/* ------------------------------------------------------------------ */

import { createReadStream } from "node:fs";

type PendingRoad = {
  nodes: [number, number][];
  width: number;
  name?: string;
  tags: Record<string, string>;
  mesh: "roads" | "rails";
};

type PendingWalk = {
  nodes: [number, number][];
  width: number;
  kind: "walk" | "cycle" | "steps";
  name?: string;
  tags: Record<string, string>;
};

function parseOsmTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(block)) !== null) tags[tagMatch[1]] = tagMatch[2];
  return tags;
}

function inlineLatLonRing(block: string): { x: number; y: number }[] {
  const nodes: [number, number][] = [];
  const ndRe = /lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = ndRe.exec(block)) !== null) nodes.push([Number(m[1]), Number(m[2])]);
  if (nodes.length < 3) return [];
  return uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
}

function assembleWaterRelation(
  members: { role: string; pts: { x: number; y: number }[] }[],
  name?: string,
): PendingWater[] {
  const outerParts = members.filter((m) => m.role !== "inner" && m.pts.length >= 2).map((m) => m.pts);
  const innerParts = members.filter((m) => m.role === "inner" && m.pts.length >= 2).map((m) => m.pts);
  const outers = stitchPolylines(outerParts.length ? outerParts : innerParts.length ? [] : members.map((m) => m.pts));
  const inners = stitchPolylines(innerParts);
  const out: PendingWater[] = [];
  for (const outer of outers) {
    if (outer.length < 3) continue;
    const holes = inners.filter((h) => {
      const hx = h.reduce((s, p) => s + p.x, 0) / h.length;
      const hy = h.reduce((s, p) => s + p.y, 0) / h.length;
      return pointInRing(hx, hy, outer);
    });
    out.push({ outer, holes, name });
  }
  return out;
}

async function streamOsm(
  xmlPath: string,
  dem: { sample: (lat: number, lon: number) => number },
  writer: BinWriter,
  labels: LabelWriter,
  coasts: { x: number; y: number }[][],
  labelsOnly = false,
  pendingRoads?: PendingRoad[],
  occupied?: Occupied,
  msHeights?: HeightIndex,
  pendingWater?: PendingWater[],
  pendingBuildings?: PendingBuilding[],
  pendingWalks?: PendingWalk[],
  pendingHarbour?: PendingHarbour[],
  pendingMarks?: PendingMark[],
  pendingBridges?: PendingBridge[],
  pendingPower?: PendingPower,
  pendingBarriers?: PendingBarriers,
) {
  let buildings = 0, waters = 0, roads = 0, rails = 0, areas = 0, coastways = 0, walks = 0, harbours = 0, bridges = 0, power = 0, barriers = 0;

  let currentNode: { id: number; lat: number; lon: number } | null = null;
  let currentWay: { nodes: [number, number][]; tags: Record<string, string> } | null = null;
  const nodeMap = new Map<number, [number, number]>();

  const buf = readFileSync(xmlPath, "utf8");
  console.log(`XML size: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  // Node pass — first scan all nodes
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const id = Number(m[1]);
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (inBox(lat, lon)) nodeMap.set(id, [lat, lon]);
    if (!labelsOnly && inBox(lat, lon) && (pendingMarks || pendingPower || pendingBarriers)) {
      const gt = buf.indexOf(">", m.index);
      if (gt !== -1 && buf[gt - 1] !== "/") {
        const end = buf.indexOf("</node>", gt);
        if (end !== -1) {
          const tags = parseOsmTags(buf.slice(gt + 1, end));
          const kind = pendingMarks ? seamarkKind(tags) : null;
          if (kind && pendingMarks) {
            pendingMarks.push({
              lat,
              lon,
              kind,
              colour: seamarkColour(tags),
              name: tags["seamark:name"] || tags["name"],
            });
          }
          const powerKind = pendingPower ? powerKitKind(tags) : null;
          if (powerKind && pendingPower) {
            pendingPower.kits.push({
              lat,
              lon,
              kind: powerKind,
              name: tags["name"],
            });
            power++;
          }
          const barrierKind = pendingBarriers ? barrierKitKind(tags) : null;
          if (barrierKind && pendingBarriers) {
            pendingBarriers.kits.push({ lat, lon, kind: barrierKind });
            barriers++;
          }
        }
      }
    }
  }
  console.log(`  nodes in bbox: ${nodeMap.size}`);

  const relOuterWayIds = new Set<number>();
  const relNeedWays = new Set<number>();
  type PendingRel = {
    name?: string;
    members: { ref: number; role: string; pts: { x: number; y: number }[] }[];
  };
  const pendingRels: PendingRel[] = [];
  const relStartRe = /<relation\s+id="(\d+)"[^>]*>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relStartRe.exec(buf)) !== null) {
    const relStart = relMatch.index;
    const relEnd = buf.indexOf("</relation>", relStart);
    if (relEnd === -1) continue;
    const relStr = buf.slice(relStart, relEnd + 11);
    const tags = parseOsmTags(relStr);
    if (!isInlandWater(tags)) continue;
    const members: PendingRel["members"] = [];
    const memberRe = /<member\s+type="(\w+)"\s+ref="(\d+)"\s+role="([^"]*)"/g;
    let mem: RegExpExecArray | null;
    while ((mem = memberRe.exec(relStr)) !== null) {
      if (mem[1] !== "way") continue;
      const ref = Number(mem[2]);
      const role = mem[3];
      const memStart = mem.index;
      const nextMem = relStr.indexOf("<member ", memStart + 1);
      const nextTag = relStr.indexOf("<tag ", memStart + 1);
      let memEnd = relStr.length;
      if (nextMem !== -1) memEnd = Math.min(memEnd, nextMem);
      if (nextTag !== -1) memEnd = Math.min(memEnd, nextTag);
      const pts = inlineLatLonRing(relStr.slice(memStart, memEnd));
      members.push({ ref, role, pts });
      if (role !== "inner") relOuterWayIds.add(ref);
      if (pts.length < 2) relNeedWays.add(ref);
    }
    if (members.length === 0) continue;
    if (members.every((m) => m.pts.length >= 2)) {
      const lakes = assembleWaterRelation(members, tags["name"]);
      if (labelsOnly) {
        for (const lake of lakes) labels.add("area", lake.name, lake.outer, 6);
      } else {
        pendingWater?.push(...lakes);
      }
      waters += lakes.length;
    } else {
      pendingRels.push({ name: tags["name"], members });
    }
  }

  // Way pass — scan ways, resolve nodes, and emit immediately
  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);

    const tags: Record<string, string> = {};
    const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(wayStr)) !== null) {
      tags[tagMatch[1]] = tagMatch[2];
    }

    const ndRe = /<nd\s+ref="(\d+)"/g;
    const nodes: [number, number][] = [];
    let ndMatch: RegExpExecArray | null;
    let ndCount = 0;
    while ((ndMatch = ndRe.exec(wayStr)) !== null) {
      ndCount++;
      const n = nodeMap.get(Number(ndMatch[1]));
      if (n) nodes.push(n);
    }
    const name = tags["name"];

    if (!labelsOnly && tags["natural"] === "coastline" && nodes.length >= 2) {
      const haylingName = /hayling/i.test(name ?? tags["name"] ?? "");
      const pts = nodes.filter(([lat, lon]) => !isHayling(lat, lon)).map(([lat, lon]) => localM(lat, lon));
      if (!haylingName && pts.length >= 2) {
        coasts.push(pts);
        coastways++;
      }
    }

    // Skip ways that leave the bbox — missing nodes collapse geometry toward origin
    if (ndCount === 0 || nodes.length !== ndCount) continue;

    const wayId = Number(wayMatch[1]);
    if (relNeedWays.has(wayId) && nodes.length >= 2) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      for (const rel of pendingRels) {
        for (const mem of rel.members) {
          if (mem.ref === wayId && mem.pts.length < 2) mem.pts = pts;
        }
      }
    }

    if (tags["building"] && tags["building"] !== "no" && nodes.length >= 3) {
      const ring = uniqueRing(nodes);
      const pts = ring.map(([lat, lon]) => localM(lat, lon));
      if (pts.length >= 3 && !isGiantBuilding(pts)) {
        const shipHull = tags["historic"] === "ship" || tags["building"] === "ship";
        if (labelsOnly) {
          if (!shipHull) labels.add("building", name, pts, 12);
        } else if (shipHull) {
          // Hull kits sit in these footprints — keep the ground occupied so OS
          // extras do not refill the dry dock, but do not extrude the block.
          occupied?.addRing(pts);
        } else {
          occupied?.addRing(pts);
          const height = parseOsmHeight(tags);
          if (height) msHeights?.add(pts, height);
          pendingBuildings?.push({
            nodes: ring,
            pts,
            name,
            height,
            roofShape: tags["roof:shape"],
            buildingType: tags["building"],
          });
        }
      }
      buildings++;
    } else if (isInlandWater(tags) && nodes.length >= 3 && !relOuterWayIds.has(Number(wayMatch[1]))) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      if (labelsOnly) labels.add("area", name, pts, 6);
      else pendingWater?.push({ outer: pts, name });
      waters++;
    } else if (harbourKind(tags) && nodes.length >= 2) {
      const kind = harbourKind(tags)!;
      if (labelsOnly) {
        const pts = nodes.map(([lat, lon]) => localM(lat, lon));
        labels.add("area", name, pts, 8, "path");
      } else {
        pendingHarbour?.push({ nodes, kind, name, tags, closed: closedNodes(nodes) });
      }
      harbours++;
    } else if (tags["highway"] && nodes.length >= 2) {
      if (tags["tunnel"] && tags["tunnel"] !== "no") {
        // skip
      } else {
        const walk = walkKind(tags);
        if (walk) {
          if (!labelsOnly) {
            pendingWalks?.push({ nodes, width: walkWidth(walk, tags), kind: walk, name, tags });
          } else if (name) {
            labels.add("road", name, nodes.map(([lat, lon]) => localM(lat, lon)), 8, "path");
          }
          walks++;
        } else if (
          !["pedestrian", "footway", "path", "track", "steps", "construction", "proposed", "cycleway", "corridor"].some(
            (p) => tags["highway"].startsWith(p),
          )
        ) {
          if (labelsOnly) {
            const pts = nodes.map(([lat, lon]) => localM(lat, lon));
            labels.add("road", name, pts, 8, "path");
          } else {
            pendingRoads?.push({ nodes, width: roadWidth(tags["highway"], tags), name, tags, mesh: "roads" });
          }
          roads++;
        }
      }
    } else if (isRailway(tags) && nodes.length >= 2) {
      if (tags["tunnel"] && tags["tunnel"] !== "no") continue;
      if (!labelsOnly) {
        pendingRoads?.push({ nodes, width: railWidth(tags["railway"]), name, tags, mesh: "rails" });
      }
      rails++;
    } else if (tags["man_made"] === "bridge" && nodes.length >= 2) {
      if (labelsOnly) {
        const pts = nodes.map(([lat, lon]) => localM(lat, lon));
        labels.add("area", name, pts, 10, "path");
      } else {
        pendingBridges?.push({ nodes, name, tags, closed: closedNodes(nodes) });
      }
      bridges++;
    } else if (tags["power"] === "substation" && nodes.length >= 3 && (!tags["building"] || tags["building"] === "no")) {
      if (labelsOnly) {
        const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
        labels.add("area", name, pts, 8);
      } else {
        pendingPower?.yards.push({ nodes, name, tags });
      }
      power++;
    } else if (isSolarGenerator(tags) && nodes.length >= 3 && closedNodes(nodes)) {
      if (!labelsOnly) pendingPower?.solar.push({ nodes });
      power++;
    } else if (!labelsOnly && tags["barrier"] && nodes.length >= 2) {
      const line = barrierLineKind(tags);
      const kit = barrierKitKind(tags);
      if (line) {
        pendingBarriers?.lines.push({ nodes, kind: line, tags, closed: closedNodes(nodes) });
        barriers++;
      } else if (kit === "bollard") {
        const pts = nodes.map(([lat, lon]) => localM(lat, lon));
        for (const p of sampleLine(pts, 2.4)) {
          pendingBarriers?.kits.push({ x: p.x, z: p.y, kind: "bollard", heading: p.heading });
        }
        barriers++;
      } else if (kit === "gate" || kit === "lift") {
        const pts = nodes.map(([lat, lon]) => localM(lat, lon));
        const a = pts[0];
        const b = pts[pts.length - 1];
        pendingBarriers?.kits.push({
          x: (a.x + b.x) * 0.5,
          z: (a.y + b.y) * 0.5,
          kind: kit,
          heading: Math.atan2(b.x - a.x, b.y - a.y) + Math.PI / 2,
        });
        barriers++;
      }
    } else if (isNamedArea(tags) && nodes.length >= 3) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      labels.add("area", name, pts, 8);
      areas++;
    }
  }

  for (const rel of pendingRels) {
    const ready = rel.members.filter((m) => m.pts.length >= 2);
    if (ready.length === 0) continue;
    const lakes = assembleWaterRelation(ready, rel.name);
    if (labelsOnly) {
      for (const lake of lakes) labels.add("area", lake.name, lake.outer, 6);
    } else {
      pendingWater?.push(...lakes);
    }
    waters += lakes.length;
  }

  console.log(`  buildings: ${buildings}`);
  console.log(`  water:     ${waters}`);
  console.log(`  roads:     ${roads}`);
  console.log(`  rails:     ${rails}`);
  console.log(`  walks:     ${walks}`);
  console.log(`  harbour:   ${harbours}`);
  console.log(`  seamarks:  ${pendingMarks?.length ?? 0}`);
  console.log(`  bridges:   ${bridges}`);
  console.log(`  power:     ${power}`);
  console.log(`  barriers:  ${barriers}`);
  console.log(`  areas:     ${areas}`);
  console.log(`  coastways: ${coastways}`);
}

function isNamedArea(tags: Record<string, string>): boolean {
  if (!tags["name"]) return false;
  return Boolean(
    tags["leisure"] ||
    tags["landuse"] ||
    tags["amenity"] ||
    tags["place"] ||
    tags["tourism"] ||
    tags["natural"] ||
    tags["shop"] ||
    tags["historic"],
  );
}

function isInlandWater(tags: Record<string, string>): boolean {
  if (tags["tidal"] === "yes") return false;
  if (tags["natural"] === "coastline") return false;
  if (tags["waterway"] === "dock") return false;
  if (tags["leisure"] === "marina") return false;
  if (tags["harbour"] && tags["harbour"] !== "no") return false;
  const water = tags["water"];
  if (water === "harbour" || water === "bay" || water === "strait" || water === "sea" || water === "ocean") {
    return false;
  }
  if (tags["natural"] === "water") return true;
  if (tags["landuse"] === "reservoir" || tags["landuse"] === "basin") return true;
  if (tags["leisure"] === "swimming_pool") return true;
  if (water && water !== "no") return true;
  return tags["waterway"] === "riverbank";
}

function collectOsBuildings(
  extras: ExtraBuilding[],
  occupied: Occupied,
  pending: PendingBuilding[],
) {
  if (extras.length === 0) {
    console.log("  no extra building footprints (run npm run os-buildings)");
    return;
  }
  let added = 0;
  let skipped = 0;
  for (const item of extras) {
    const nodes = item.nodes;
    if (!nodes || nodes.length < 3) continue;
    const ring = uniqueRing(nodes);
    const pts = ring.map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3 || isGiantBuilding(pts)) {
      skipped++;
      continue;
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (occupied.has(cx, cy)) {
      skipped++;
      continue;
    }
    occupied.addRing(pts);
    pending.push({ nodes: ring, pts, height: item.h });
    added++;
  }
  console.log(`  extra footprints: ${added} (skipped ${skipped} already in OSM / giant)`);
}

function isRailway(tags: Record<string, string>): boolean {
  const r = tags["railway"];
  if (!r || r === "no") return false;
  if (
    r === "abandoned" ||
    r === "dismantled" ||
    r === "proposed" ||
    r === "construction" ||
    r === "platform" ||
    r === "station" ||
    r === "halt" ||
    r === "tram_stop" ||
    r === "crossing" ||
    r === "level_crossing" ||
    r === "switch" ||
    r === "buffer_stop" ||
    r === "signal"
  ) {
    return false;
  }
  return (
    r === "rail" ||
    r === "light_rail" ||
    r === "tram" ||
    r === "miniature" ||
    r === "narrow_gauge" ||
    r === "subway" ||
    r === "disused"
  );
}

function railWidth(kind: string): number {
  switch (kind) {
    case "tram":
    case "light_rail":
      return 2.6;
    case "miniature":
      return 1.4;
    default:
      return 4.6;
  }
}

function roadWidth(kind: string, tags?: Record<string, string>): number {
  const tagged = Number.parseFloat(tags?.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 2 && tagged <= 24) return tagged;
  const lanes = Number.parseFloat(tags?.lanes ?? "");
  if (Number.isFinite(lanes) && lanes >= 1) return Math.min(24, Math.max(3.2, lanes * 3.15 + 0.4));
  switch (kind) {
    case "motorway":
    case "trunk":
      return 10.5;
    case "primary":
      return 8.5;
    case "secondary":
      return 7.6;
    case "tertiary":
      return 6.8;
    case "unclassified":
      return 5.7;
    case "residential":
    case "living_street":
      return 5.5;
    case "service":
    case "alley":
      return 3.4;
    default:
      return 5.5;
  }
}

/* ------------------------------------------------------------------ */
/*  6. Main                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  const labelsOnly = process.argv.includes("--labels");
  const labels = new LabelWriter();

  if (labelsOnly) {
    console.log("Parsing OSM for labels…");
    const dummyDem = { sample: () => 4, rows: 0, cols: 0 };
    const writer = new BinWriter();
    await streamOsm(OSM_PATH, dummyDem, writer, labels, [], true);
    labels.flush(OUT_LABELS);
    return;
  }

  console.log("Loading DEM…");
  const dem = await loadDem();
  console.log(`  tile ${dem.rows}×${dem.cols}`);

  console.log("Parsing OSM (streaming)…");
  const writer = new BinWriter();
  const coasts: { x: number; y: number }[][] = [];
  const pendingRoads: PendingRoad[] = [];
  const pendingWalks: PendingWalk[] = [];
  const pendingHarbour: PendingHarbour[] = [];
  const pendingMarks: PendingMark[] = [];
  const pendingBridges: PendingBridge[] = [];
  const pendingPower: PendingPower = { kits: [], yards: [], solar: [] };
  const pendingBarriers: PendingBarriers = { lines: [], kits: [] };
  const pendingWater: PendingWater[] = [];
  const occupied = new Occupied();
  const extras = loadExtraBuildings();
  const msHeights = new HeightIndex();
  let msWithH = 0;
  for (const b of extras) {
    const pts = uniqueRing(b.nodes).map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3) continue;
    msHeights.add(pts, b.h);
    if (b.h && b.h >= 2.5) msWithH++;
  }
  console.log(`  Microsoft footprints: ${extras.length} (${msWithH} with height)`);

  const pendingBuildings: PendingBuilding[] = [];
  await streamOsm(OSM_PATH, dem, writer, labels, coasts, false, pendingRoads, occupied, msHeights, pendingWater, pendingBuildings, pendingWalks, pendingHarbour, pendingMarks, pendingBridges, pendingPower, pendingBarriers);
  collectOsBuildings(extras, occupied, pendingBuildings);
  const terraceRows = assignTerraceRidges(pendingBuildings);
  console.log(`  terrace-row ridges: ${terraceRows} of ${pendingBuildings.length}`);
  for (const b of pendingBuildings) {
    buildBuilding(
      b.nodes,
      dem.sample,
      writer,
      labels,
      b.name,
      occupied,
      b.height,
      msHeights,
      b.roofShape,
      b.buildingType,
      b.rowAxis,
    );
  }

  console.log("Building terrain…");
  const ground = new TerrainIndex((x, z) => sampleAtLocal(dem.sample, x, z));
  buildTerrain(dem.rows, dem.cols, dem.sample, writer, coasts, ground);
  ground.build();

  console.log(`Draping ${pendingRoads.length} roads/rails…`);
  const laid: LaidRoad[] = [];
  for (const road of pendingRoads) {
    const built = layoutRoad(
      road.nodes,
      road.width,
      road.name,
      road.tags,
      road.mesh,
      road.mesh === "roads" ? ROAD_SOUTH_NUDGE : 0,
    );
    if (built) laid.push(built);
  }
  const carriages = new CarriageIndex();
  laid.forEach((road, id) => {
    if (!road.bridge && road.mesh === "roads") carriages.add(id, road.pts, road.width / 2);
  });
  const sidewalks = new CarriageIndex();
  const laidWalks: LaidRoad[] = [];
  for (const walk of pendingWalks) {
    const built = layoutRoad(walk.nodes, walk.width, walk.name, walk.tags, "roads", ROAD_SOUTH_NUDGE);
    if (!built) continue;
    laidWalks.push(built);
    if (walk.tags.footway === "sidewalk" && !built.bridge) {
      sidewalks.add(laidWalks.length, built.pts, built.width / 2);
    }
  }
  console.log(`Draping ${laidWalks.length} walk/cycle ways…`);
  for (let i = 0; i < laid.length; i++) {
    buildRoad(laid[i], i, carriages, writer, labels, ground, sidewalks);
  }
  for (const walk of laidWalks) {
    buildWalk(walk, carriages, writer, labels, ground);
  }

  console.log(`Draping ${pendingWater.length} inland lakes…`);
  for (const lake of pendingWater) buildWater(lake, ground, writer, labels);

  console.log(`Draping ${pendingHarbour.length} harbour structures…`);
  for (const item of pendingHarbour) buildHarbour(item, writer, labels, ground);
  console.log(`Draping ${pendingBridges.length} extra bridge outlines…`);
  for (const item of pendingBridges) buildStandaloneBridge(item, writer, labels, ground);
  const marks = pendingMarks.map((m) => {
    const p = localM(m.lat, m.lon);
    return { x: p.x, z: p.y, kind: m.kind, colour: m.colour, name: m.name };
  });
  writeFileSync(OUT_HARBOUR, JSON.stringify({ marks }));
  console.log(`  seamarks laid: ${marks.length}`);

  console.log(`Draping ${pendingPower.yards.length} substation yards…`);
  const powerKits = buildPower(pendingPower, writer, labels, ground, occupied, msHeights);
  writeFileSync(OUT_POWER, JSON.stringify({ kits: powerKits }));
  console.log(`  power kits: ${powerKits.length} (solar ${powerKits.filter((k) => k.kind === "solar").length}, kiosk ${powerKits.filter((k) => k.kind === "kiosk").length}, transformer ${powerKits.filter((k) => k.kind === "transformer").length})`);

  console.log(`Draping ${pendingBarriers.lines.length} barrier lines…`);
  const barrierKits = buildBarriers(pendingBarriers, writer, ground, occupied);
  writeFileSync(OUT_BARRIERS, JSON.stringify({ kits: barrierKits }));
  console.log(`  barrier kits: ${barrierKits.length}`);

  console.log(`  roofs gabled/hipped/flat: ${roofStats.gabled} / ${roofStats.hipped} / ${roofStats.flat}`);
  console.log("Writing glTF…");
  writer.flush(OUT_GLTF, OUT_BIN);
  labels.flush(OUT_LABELS);
  mkdirSync(GAME_MODELS, { recursive: true });
  copyFileSync(OUT_GLTF, path.join(GAME_MODELS, "portsmouth-terrain.gltf"));
  copyFileSync(OUT_BIN, path.join(GAME_MODELS, "portsmouth-terrain.bin"));
  copyFileSync(OUT_LABELS, path.join(GAME_MODELS, "portsmouth-labels.json"));
  copyFileSync(OUT_HARBOUR, path.join(GAME_MODELS, "portsmouth-harbour.json"));
  copyFileSync(OUT_POWER, path.join(GAME_MODELS, "portsmouth-power.json"));
  copyFileSync(OUT_BARRIERS, path.join(GAME_MODELS, "portsmouth-barriers.json"));
}

main().catch((e) => { console.error(e); process.exit(1); });
