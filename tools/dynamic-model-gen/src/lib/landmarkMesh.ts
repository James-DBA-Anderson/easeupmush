import * as THREE from "three";

const BRICK = 0x8a6a52;
const BRICK_DARK = 0x6e5342;
const STONE = 0xc9c3b4;
const PALE = 0xe8e4d8;
const GREY = 0x6d7178;
const STEEL = 0x4a4e54;
const YELLOW = 0xd6b23a;
const RUST = 0x8a4a32;
const BAND = 0xe4dcc8;
const DARK = 0x2a2a28;

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

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: number, seg = 10) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  geo.translate(x, y, z);
  return colored(geo, hex);
}

function cone(r: number, h: number, x: number, y: number, z: number, hex: number, seg = 8) {
  const geo = new THREE.ConeGeometry(r, h, seg);
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

/** Brick observation / comms tower, ~18 m. */
export function buildTowerGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(2.6, 15.2, 2.6, 0, 7.6, 0, BRICK),
      box(2.85, 0.28, 2.85, 0, 5.4, 0, BRICK_DARK),
      box(2.85, 0.28, 2.85, 0, 10.6, 0, BRICK_DARK),
      box(3.4, 0.42, 3.4, 0, 15.55, 0, STONE),
      box(1.35, 1.7, 1.35, 0, 16.7, 0, PALE),
      cone(0.95, 1.15, 0, 17.95, 0, BRICK_DARK, 8),
    ]),
  );
}

/** Factory / dockyard chimney, ~32 m. */
export function buildChimneyGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(1.15, 1.85, 30.4, 0, 15.2, 0, BRICK, 12),
      cyl(1.28, 1.32, 0.55, 0, 10.2, 0, BAND, 12),
      cyl(1.22, 1.26, 0.55, 0, 20.4, 0, BAND, 12),
      cyl(1.05, 1.18, 0.7, 0, 30.7, 0, DARK, 12),
    ]),
  );
}

/** Cylindrical storage tank, ~9 m. */
export function buildTankGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(3.35, 3.4, 0.28, 0, 0.14, 0, STEEL, 14),
      cyl(3.15, 3.2, 7.4, 0, 4.0, 0, GREY, 14),
      cyl(3.25, 3.25, 0.16, 0, 7.55, 0, YELLOW, 14),
      cyl(2.85, 3.15, 0.55, 0, 7.95, 0, STEEL, 14),
      cyl(0.22, 0.28, 1.1, 0, 8.7, 0, DARK, 8),
    ]),
  );
}

/** Dockside portal crane, ~24 m, jib along +Z. */
export function buildCraneGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.05, 16.4, 1.05, -3.4, 8.2, 0, STEEL),
      box(1.05, 16.4, 1.05, 3.4, 8.2, 0, STEEL),
      box(8.4, 0.7, 1.4, 0, 16.55, 0, STEEL),
      box(2.2, 1.6, 2.4, 0, 17.7, 0, YELLOW),
      box(0.55, 0.55, 18.5, 0, 18.35, 4.2, STEEL),
      box(0.7, 0.7, 3.2, 0, 18.35, -7.4, RUST),
      box(0.28, 4.2, 0.28, 0, 16.1, 12.8, STEEL),
      box(1.4, 0.22, 1.4, 0, 13.95, 12.8, YELLOW),
    ]),
  );
}

export function landmarkMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}
