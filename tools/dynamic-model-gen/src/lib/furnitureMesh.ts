import * as THREE from "three";

const TIMBER = 0x6b5340;
const SEAT = 0x8a6a4a;
const BLACK = 0x2a2a28;
const GREY = 0x6a6e72;
const RED = 0xc8102e;
const WHITE = 0xe8e4d8;
const NAVY = 0x1e3a5f;
const GREEN = 0x2f8a4a;
const AMBER = 0xd6b23a;

function colored(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute("position").count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return colored(geo, hex);
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: number, seg = 8) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  geo.translate(x, y, z);
  return colored(geo, hex);
}

function merge(parts: THREE.BufferGeometry[]) {
  let v = 0;
  let i = 0;
  for (const p of parts) {
    v += p.getAttribute("position").count;
    i += p.index ? p.index.count : p.getAttribute("position").count;
  }
  const pos = new Float32Array(v * 3);
  const nrm = new Float32Array(v * 3);
  const col = new Float32Array(v * 3);
  const idx = new Uint32Array(i);
  let vo = 0;
  let io = 0;
  let base = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    const pa = p.getAttribute("position").array as Float32Array;
    const na = p.getAttribute("normal")
      ? (p.getAttribute("normal").array as Float32Array)
      : null;
    const ca = p.getAttribute("color").array as Float32Array;
    pos.set(pa, vo);
    col.set(ca, vo);
    if (na) nrm.set(na, vo);
    const count = pa.length / 3;
    if (p.index) {
      const ia = p.index.array;
      for (let k = 0; k < ia.length; k++) idx[io++] = ia[k] + base;
    } else {
      for (let k = 0; k < count; k++) idx[io++] = k + base;
    }
    vo += pa.length;
    base += count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

function sitOnGround(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const minY = geo.boundingBox?.min.y ?? 0;
  geo.translate(0, -minY, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function buildBenchGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.55, 0.08, 0.48, 0, 0.46, 0, SEAT),
      box(1.55, 0.42, 0.07, 0, 0.72, -0.22, SEAT),
      box(0.08, 0.46, 0.46, -0.68, 0.23, 0, TIMBER),
      box(0.08, 0.46, 0.46, 0.68, 0.23, 0, TIMBER),
    ]),
  );
}

export function buildBinGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.22, 0.24, 0.78, 0, 0.4, 0, BLACK, 8),
      cyl(0.24, 0.24, 0.08, 0, 0.82, 0, GREY, 8),
    ]),
  );
}

export function buildPostboxGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.28, 0.3, 1.35, 0, 0.68, 0, RED, 10),
      cyl(0.3, 0.3, 0.1, 0, 1.4, 0, RED, 10),
      box(0.22, 0.08, 0.06, 0, 1.12, 0.28, BLACK),
    ]),
  );
}

export function buildPhoneGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(0.92, 2.35, 0.92, 0, 1.18, 0, RED),
      box(0.7, 1.15, 0.06, 0, 1.35, 0.47, 0x7ec8e3),
      box(0.78, 0.12, 0.96, 0, 2.38, 0, RED),
    ]),
  );
}

export function buildRackGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.035, 0.04, 0.82, -0.35, 0.41, 0, GREY, 6),
      cyl(0.035, 0.04, 0.82, 0.35, 0.41, 0, GREY, 6),
      box(0.78, 0.07, 0.07, 0, 0.82, 0, GREY),
    ]),
  );
}

export function buildBusGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.045, 0.055, 3.15, 0, 1.58, 0, GREY, 6),
      box(0.72, 0.48, 0.06, 0.38, 2.85, 0, NAVY),
      box(0.62, 0.12, 0.07, 0.38, 2.85, 0, WHITE),
    ]),
  );
}

export function buildSignalGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.05, 0.06, 3.2, 0, 1.6, 0, GREY, 6),
      box(0.28, 0.72, 0.22, 0, 3.15, 0.12, BLACK),
      cyl(0.06, 0.06, 0.04, 0, 3.38, 0.24, RED, 6),
      cyl(0.06, 0.06, 0.04, 0, 3.15, 0.24, AMBER, 6),
      cyl(0.06, 0.06, 0.04, 0, 2.92, 0.24, GREEN, 6),
    ]),
  );
}

export function buildTableGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.7, 0.08, 0.72, 0, 0.74, 0, SEAT),
      box(0.08, 0.74, 0.08, -0.7, 0.37, -0.26, TIMBER),
      box(0.08, 0.74, 0.08, 0.7, 0.37, 0.26, TIMBER),
      box(1.7, 0.07, 0.28, 0, 0.42, -0.72, SEAT),
      box(1.7, 0.07, 0.28, 0, 0.42, 0.72, SEAT),
    ]),
  );
}

const CREAM = 0xe8e0c8;
const GOLD = 0xc9a45c;
const STONE = 0xc9c3b4;

/** Hanging pub sign on a post, ~3.2 m. */
export function buildPubGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.05, 0.06, 3.15, 0, 1.58, 0, BLACK, 6),
      box(0.08, 0.08, 0.72, 0.32, 3.05, 0, BLACK),
      box(0.62, 0.52, 0.06, 0.62, 2.72, 0, 0x1e3a2a),
      box(0.52, 0.4, 0.05, 0.62, 2.72, 0.02, CREAM),
      box(0.38, 0.05, 0.05, 0.62, 2.78, 0.04, GOLD),
    ]),
  );
}

/** Stone war-memorial obelisk, ~3.4 m. */
export function buildMemorialGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.35, 0.22, 1.35, 0, 0.11, 0, STONE),
      box(1.05, 0.28, 1.05, 0, 0.36, 0, 0xb8b3a4),
      box(0.48, 2.45, 0.48, 0, 1.72, 0, STONE),
      box(0.22, 0.22, 0.22, 0, 3.02, 0, GOLD),
    ]),
  );
}

export function furnitureMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}
