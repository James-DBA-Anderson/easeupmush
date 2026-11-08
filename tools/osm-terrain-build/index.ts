import { readFileSync, writeFileSync } from "node:fs";
import { fromArrayBuffer } from "geotiff";
import { DOMParser } from "@xmldom/xmldom";
import * as THREE from "three";
import { SOUTH, WEST, NORTH, EAST, SCALE_X, SCALE_Y, localM } from "./bbox.ts";

// Shared materials — reused across meshes so GLTF export deduplicates them
  const TERRAIN_MAT = new THREE.MeshStandardMaterial({ color: 0x5a8a5a });
const BUILDING_MAT = new THREE.MeshStandardMaterial({ color: 0x8899aa, flatShading: true });
  const WATER_MAT = new THREE.MeshStandardMaterial({ color: 0x336677, transparent: true, opacity: 0.8 });
  const ROAD_MAT = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true, side: THREE.DoubleSide });

/** Portsea is flat; Portsdown in PO6 rises to ~130 m. */
const MIN_ELE = 0;
const MAX_ELE = 160;
const VERT_SCALE = 1.0; // 1:1 metres

/** Road width by highway kind (metres). */
function roadWidth(kind: string): number {
  switch (kind) {
    case "motorway":
    case "trunk":
      return 11;
    case "primary":
      return 9;
    case "secondary":
      return 8;
    case "tertiary":
      return 7;
    case "residential":
    case "living_street":
      return 5.5;
    case "service":
      return 3.5;
    default:
      return 5;
  }
}

/* ------------------------------------------------------------------ */
/*  Portsmouth terrain mesh builder — SRTM DEM + OSM data → GLB       */
/* ------------------------------------------------------------------ */

const DATA_DIR = "./data";
const DEM_PATH = `${DATA_DIR}/N50W002.tif`;
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OUT_PATH = `${DATA_DIR}/portsmouth-terrain.gltf`;


/* ------------------------------------------------------------------ */
/*  1. Read SRTM DEM GeoTIFF                                          */
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
  console.log(`DEM tile: ${w}x${h}  bbox [${tileWest}, ${tileSouth}, ${tileEast}, ${tileNorth}]`);

  // Find pixel bounds inside our area of interest
  const lonToCol = (lon: number) => Math.round(((lon - tileWest) / (tileEast - tileWest)) * w);
  const latToRow = (lat: number) => Math.round(((tileNorth - lat) / (tileNorth - tileSouth)) * h);

  const col0 = Math.max(0, lonToCol(WEST));
  const col1 = Math.min(w - 1, lonToCol(EAST));
  const row0 = Math.max(0, latToRow(NORTH));
  const row1 = Math.min(h - 1, latToRow(SOUTH));

  const subW = Math.max(1, col1 - col0 + 1);
  const subH = Math.max(1, row1 - row0 + 1);

  // Build a grid we can sample
  const rows = subH;
  const cols = subW;
  const grid = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcR = row0 + r;
      const srcC = col0 + c;
      grid[r * cols + c] = data[srcR * w + srcC];
    }
  }

  // sample at lat/lon in our bbox (relative pixels)
  const localLonToCol = (lon: number) => ((lon - WEST) / (EAST - WEST)) * (cols - 1);
  const localLatToRow = (lat: number) => ((NORTH - lat) / (NORTH - SOUTH)) * (rows - 1);

  const sample = (lat: number, lon: number): number => {
    const cc = localLonToCol(lon);
    const rr = localLatToRow(lat);
    const c = Math.max(0, Math.min(cols - 2, Math.floor(cc)));
    const r = Math.max(0, Math.min(rows - 2, Math.floor(rr)));
    const fracC = cc - c;
    const fracR = rr - r;
    const i00 = r * cols + c;
    const i10 = r * cols + (c + 1);
    const i01 = (r + 1) * cols + c;
    const i11 = (r + 1) * cols + (c + 1);
    const z00 = grid[i00] ?? 0;
    const z10 = grid[i10] ?? 0;
    const z01 = grid[i01] ?? 0;
    const z11 = grid[i11] ?? 0;
    return (
      z00 * (1 - fracC) * (1 - fracR) +
      z10 * fracC * (1 - fracR) +
      z01 * (1 - fracC) * fracR +
      z11 * fracC * fracR
    );
  };

  return { rows, cols, sample, col0, row0, subW, subH };
}

/* ------------------------------------------------------------------ */
/*  2. Parse OSM XML — keep ways with buildings / water / roads       */
/* ------------------------------------------------------------------ */

type OsmNode = { lat: number; lon: number; tags: Record<string, string> };
type OsmWay = {
  nodes: [lat: number, lon: number][];
  tags: Record<string, string>;
};

function parseOsm(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodeMap = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];

  const nodes = doc.getElementsByTagName("node");
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes.item(i)!;
    const id = Number(n.getAttribute("id"));
    const lat = Number(n.getAttribute("lat"));
    const lon = Number(n.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tags: Record<string, string> = {};
    const children = n.childNodes;
    for (let j = 0; j < children.length; j++) {
      const child = children.item(j);
      if (child.nodeName === "tag") {
        const k = (child as Element).getAttribute("k") ?? "";
        const v = (child as Element).getAttribute("v") ?? "";
        tags[k] = v;
      }
    }
    nodeMap.set(id, { lat, lon, tags });
  }

  const waysEl = doc.getElementsByTagName("way");
  for (let i = 0; i < waysEl.length; i++) {
    const w = waysEl.item(i)!;
    const tags: Record<string, string> = {};
    const refNodes: [number, number][] = [];
    const children = w.childNodes;
    for (let j = 0; j < children.length; j++) {
      const child = children.item(j);
      if (child.nodeName === "tag") {
        const k = (child as Element).getAttribute("k") ?? "";
        const v = (child as Element).getAttribute("v") ?? "";
        tags[k] = v;
      } else if (child.nodeName === "nd") {
        const ref = Number((child as Element).getAttribute("ref"));
        const n = nodeMap.get(ref);
        if (n) refNodes.push([n.lat, n.lon]);
      }
    }
    if (refNodes.length >= 2) ways.push({ nodes: refNodes, tags });
  }

  // Also handle relation members with geometry from overpass `out geom`
  const rels = doc.getElementsByTagName("relation");
  for (let i = 0; i < rels.length; i++) {
    const r = rels.item(i)!;
    const tags: Record<string, string> = {};
    const membersNodes: [number, number][] = [];
    const children = r.childNodes;
    for (let j = 0; j < children.length; j++) {
      const child = children.item(j);
      if (child.nodeName === "tag") {
        const k = (child as Element).getAttribute("k") ?? "";
        const v = (child as Element).getAttribute("v") ?? "";
        tags[k] = v;
      } else if (child.nodeName === "member") {
        const type = (child as Element).getAttribute("type");
        if (type === "way" || type === "node") {
          // Overpass `out geom` embeds lat/lon on nd-like geometry nodes, or we skip
          // For simplicity, we'll use the outer ways we already parsed and match by tags
        }
      }
    }
    // Relations for buildings are rare; skip for now
  }

  return ways;
}

/* ------------------------------------------------------------------ */
/*  3. Convert lat/lon to local metres (equirectangular approx)       */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  4. Build flat terrain mesh (Portsmouth is ~flat)                */
/* ------------------------------------------------------------------ */

function buildTerrain(
  rows: number,
  cols: number,
  sample: (lat: number, lon: number) => number,
) {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const fracR = r / (rows - 1);
    const lat = NORTH - fracR * (NORTH - SOUTH);
    for (let c = 0; c < cols; c++) {
      const fracC = c / (cols - 1);
      const lon = WEST + fracC * (EAST - WEST);
      const { x, y: z } = localM(lat, lon);
      let elevation = sample(lat, lon) * VERT_SCALE;
      // Clamp to realistic Portsmouth range (0–12 m)
      if (!Number.isFinite(elevation) || elevation < MIN_ELE) elevation = MIN_ELE;
      if (elevation > MAX_ELE) elevation = MAX_ELE;
      vertices.push(x, elevation, z);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i0 = r * cols + c;
      const i1 = i0 + cols;
      const i2 = i0 + 1;
      const i3 = i1 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, TERRAIN_MAT);
}

/* ------------------------------------------------------------------ */
/*  5. Extract building polygons and extrude them                     */
/* ------------------------------------------------------------------ */

function triangulatePoly(points2d: [number, number][]) {
  // Simple fan triangulation — assumes convex or near-convex
  const tris: number[] = [];
  for (let i = 2; i < points2d.length; i++) {
    tris.push(0, i - 1, i);
  }
  return tris;
}

function extrudeBuilding(way: OsmWay, dem: { sample: (lat: number, lon: number) => number }) {
  const close = !way.tags["area"] && way.nodes.length > 2;
  const pts = way.nodes.map(([lat, lon]) => localM(lat, lon));
  const heights = way.nodes.map(([lat, lon]) => {
    let h = dem.sample(lat, lon) * VERT_SCALE;
    if (!Number.isFinite(h) || h < MIN_ELE) h = MIN_ELE;
    if (h > MAX_ELE) h = MAX_ELE;
    return h;
  });
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  let bldgHeight = 5; // default 5m / ~1.6 floors
  if (way.tags["height"]) {
    const match = /([0-9.]+)/.exec(way.tags["height"]);
    if (match) bldgHeight = Number(match[1]) * 3;
  } else if (way.tags["building:levels"]) {
    const lvls = Number(way.tags["building:levels"]);
    if (Number.isFinite(lvls)) bldgHeight = lvls * 3;
  }

  const verts: number[] = [];
  const inds: number[] = [];

  // Side walls
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % (close ? pts.length : pts.length - 1);
    if (!close && j === 0) break;
    const { x: x0, y: z0 } = pts[i];
    const { x: x1, y: z1 } = pts[j];
    const h0 = heights[i];
    const h1 = heights[j];
    const v0 = verts.length / 3;
    verts.push(x0, h0, z0);
    verts.push(x1, h1, z1);
    verts.push(x0, h0 + bldgHeight, z0);
    verts.push(x1, h1 + bldgHeight, z1);
    inds.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
  }

  // Roof
  if (close && pts.length >= 3) {
    const roofStart = verts.length / 3;
    for (const { x, y: z } of pts) {
      verts.push(x, avgHeight + bldgHeight, z);
    }
    const tris = triangulatePoly(pts.map(({ x, y: z }) => [x, z]));
    for (const t of tris) inds.push(roofStart + t);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(inds);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, BUILDING_MAT);
}

/* ------------------------------------------------------------------ */
/*  5b. Roads — thin extruded ribbons                                  */
/* ------------------------------------------------------------------ */

function buildRoad(way: OsmWay, dem: { sample: (lat: number, lon: number) => number }) {
  const pts = way.nodes.map(([lat, lon]) => localM(lat, lon));
  const heights = way.nodes.map(([lat, lon]) => {
    let h = dem.sample(lat, lon) * VERT_SCALE;
    if (!Number.isFinite(h) || h < MIN_ELE) h = MIN_ELE;
    if (h > MAX_ELE) h = MAX_ELE;
    return h;
  });
  const width = roadWidth(way.tags["highway"] ?? "");
  const h = 2; // thickness so it's visible from above

  const verts: number[] = [];
  const inds: number[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const { x: x0, y: z0 } = pts[i];
    const { x: x1, y: z1 } = pts[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);

    const v = verts.length / 3;
    const y0 = heights[i];
    const y1 = heights[i + 1];

    // top face
    verts.push(x0 + nx, y0 + h, z0 + nz);
    verts.push(x0 - nx, y0 + h, z0 - nz);
    verts.push(x1 + nx, y1 + h, z1 + nz);
    verts.push(x1 - nx, y1 + h, z1 - nz);

    inds.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }

  if (verts.length < 6) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(inds);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, ROAD_MAT);
}

/* ------------------------------------------------------------------ */
/*  6. Main pipeline                                                    */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("Loading DEM…");
  const dem = await loadDem();

  console.log("Parsing OSM…");
  const xml = readFileSync(OSM_PATH, "utf8");
  const ways = parseOsm(xml);
  console.log(`  ${ways.length} ways total`);

  // Keep relevant ways
  const buildings = ways.filter(
    (w) =>
      w.tags["building"] &&
      w.tags["building"] !== "no" &&
      w.nodes.length >= 3,
  );
  // Simple water: natural=water / waterway=*
  const waterWays = ways.filter(
    (w) =>
      (w.tags["natural"] === "water" || w.tags["waterway"] || w.tags["landuse"] === "reservoir") &&
      w.nodes.length >= 3,
  );

  // Roads
  const roads = ways.filter(
    (w) =>
      w.tags["highway"] &&
      !w.tags["highway"].startsWith("pedestrian") &&
      !w.tags["highway"].startsWith("footway") &&
      !w.tags["highway"].startsWith("path") &&
      !w.tags["highway"].startsWith("track") &&
      w.nodes.length >= 2,
  );
  console.log(`  buildings: ${buildings.length}`);
  console.log(`  water:     ${waterWays.length}`);
  console.log(`  roads:     ${roads.length}`);

  console.log("Building terrain mesh…");
  const terrain = buildTerrain(dem.rows, dem.cols, dem.sample);

  console.log("Building extrusions…");
  const buildingMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < buildings.length && i < 5000; i++) {
    try {
      buildingMeshes.push(extrudeBuilding(buildings[i], dem));
    } catch {
      // degenerate poly, skip
    }
  }

  console.log("Building roads…");
  const roadMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < roads.length && i < 15000; i++) {
    const m = buildRoad(roads[i], dem);
    if (m) roadMeshes.push(m);
  }

  // Water — flattened polygons at sea level
  const waterMeshes: THREE.Mesh[] = [];
  for (const w of waterWays.slice(0, 2000)) {
    const pts = w.nodes.map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3) continue;
    const twoD = pts.map(({ x, y: z }) => [x, z]); // [swapped for triangulation]
    const tris = triangulatePoly(twoD.map(([x]) => [x, 0]));
    const verts: number[] = [];
    for (const { x, y: z } of pts) verts.push(x, 0, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(tris);
    waterMeshes.push(new THREE.Mesh(geo, WATER_MAT));
  }

  // Assemble scene
  const scene = new THREE.Scene();
  scene.add(terrain);
  for (const m of roadMeshes) scene.add(m);
  for (const m of buildingMeshes) scene.add(m);
  for (const m of waterMeshes) scene.add(m);

  console.log("Exporting GLTF JSON…");
  saveAsGltfJson(scene, OUT_PATH);
}

/* ------------------------------------------------------------------ */
/*  7a. Save scene as a simple .gltf JSON (embedded data URI buffer) */
/*  GLTFExporter binary needs FileReader — not available in Node.    */
/* ------------------------------------------------------------------ */

function saveAsGltfJson(scene: THREE.Scene, path: string) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });

  const nodes: any[] = [];
  const accessors: any[] = [];
  const bufferViews: any[] = [];
  const materialsJson: any[] = [];
  const meshesJson: any[] = [];
  let bufOffset = 0;

  const parts: Buffer[] = [];
  let matIndex = 0;
  const matMap = new Map<THREE.Material, number>();

  function addMat(m: THREE.MeshStandardMaterial) {
    const existing = matMap.get(m);
    if (existing !== undefined) return existing;
    const idx = matIndex++;
    matMap.set(m, idx);
    const c = m.color;
    materialsJson.push({
      pbrMetallicRoughness: {
        baseColorFactor: [c.r, c.g, c.b, m.opacity ?? 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      alphaMode: m.transparent ? "BLEND" : "OPAQUE",
      doubleSided: m.side === THREE.DoubleSide,
    });
    return idx;
  }

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const normAttr = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const indexAttr = geo.getIndex();

    const verts = new Float32Array(posAttr.array.buffer, posAttr.array.byteOffset, posAttr.count * 3);
    const norms = normAttr ? new Float32Array(normAttr.array.buffer, normAttr.array.byteOffset, normAttr.count * 3) : null;
    const indices = indexAttr ? new Uint16Array(indexAttr.array.buffer, indexAttr.array.byteOffset, indexAttr.count) : null;

    const needs32 = indices && posAttr.count > 65535;
    const idxArr = indices ? (needs32 ? new Uint32Array(indices) : new Uint16Array(indices)) : null;

    const vertBytes = Buffer.from(verts.buffer, verts.byteOffset, verts.byteLength);
    const normBytes = norms ? Buffer.from(norms.buffer, norms.byteOffset, norms.byteLength) : null;
    const idxBytes = idxArr ? Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength) : null;

    const vertBV = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: bufOffset, byteLength: vertBytes.length });
    bufOffset += vertBytes.length;
    parts.push(vertBytes);

    let normBV = -1;
    if (normBytes) {
      normBV = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bufOffset, byteLength: normBytes.length });
      bufOffset += normBytes.length;
      parts.push(normBytes);
    }

    let idxBV = -1;
    if (idxBytes) {
      while (bufOffset % 4 !== 0) {
        bufOffset++;
        parts.push(Buffer.alloc(1));
      }
      idxBV = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: bufOffset,
        byteLength: idxBytes.length,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      });
      bufOffset += idxBytes.length;
      parts.push(idxBytes);
    }

    const posAcc = accessors.length;
    accessors.push({
      bufferView: vertBV,
      componentType: 5126, // FLOAT
      count: posAttr.count,
      type: "VEC3",
      max: [verts[0], verts[1], verts[2]],
      min: [verts[0], verts[1], verts[2]],
    });

    const normAcc = normBV >= 0 ? accessors.length : -1;
    if (normBV >= 0) {
      accessors.push({
        bufferView: normBV,
        componentType: 5126,
        count: posAttr.count,
        type: "VEC3",
      });
    }

    let idxAcc = -1;
    if (idxBV >= 0) {
      idxAcc = accessors.length;
      accessors.push({
        bufferView: idxBV,
        componentType: needs32 ? 5125 : 5123,
        count: idxArr!.length,
        type: "SCALAR",
      });
    }

    const prim: any = {
      attributes: { POSITION: posAcc },
      mode: 4, // TRIANGLES
    };
    if (normAcc >= 0) prim.attributes.NORMAL = normAcc;
    if (idxAcc >= 0) {
      prim.indices = idxAcc;
    }
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      prim.material = addMat(mesh.material);
    }

    meshesJson.push({ primitives: [prim] });
    nodes.push({ mesh: meshesJson.length - 1 });
  }

  const merged = Buffer.concat(parts);
  const dataUri = "data:application/octet-stream;base64," + merged.toString("base64");

  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes,
    meshes: meshesJson,
    materials: materialsJson,
    accessors: accessors,
    bufferViews: bufferViews,
    buffers: [{ uri: dataUri, byteLength: merged.length }],
  };

  writeFileSync(path, JSON.stringify(gltf));
  console.log(`Wrote ${path} (${(merged.length / 1024 / 1024).toFixed(1)} MB buffer)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
