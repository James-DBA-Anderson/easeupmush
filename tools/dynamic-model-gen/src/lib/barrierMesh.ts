import * as THREE from "three";

const BLACK = 0x2a2a28;
const WHITE = 0xe8e4d8;
const STEEL = 0x6a6e72;
const TIMBER = 0x6b5340;
const RED = 0xc43b3b;

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

/** Street bollard, ~0.95 m. */
export function buildBollardGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.11, 0.13, 0.82, 0, 0.41, 0, BLACK, 8),
      cyl(0.12, 0.12, 0.12, 0, 0.62, 0, WHITE, 8),
      cyl(0.08, 0.1, 0.08, 0, 0.86, 0, BLACK, 8),
    ]),
  );
}

/** Park / field gate, ~1.2 m high, 2 m wide. */
export function buildGateGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(0.1, 1.22, 0.1, -0.95, 0.61, 0, TIMBER),
      box(0.1, 1.22, 0.1, 0.95, 0.61, 0, TIMBER),
      box(1.86, 0.07, 0.06, 0, 0.22, 0, TIMBER),
      box(1.86, 0.07, 0.06, 0, 0.52, 0, TIMBER),
      box(1.86, 0.07, 0.06, 0, 0.82, 0, TIMBER),
      box(1.86, 0.07, 0.06, 0, 1.1, 0, TIMBER),
    ]),
  );
}

/** Cycle chicane, ~1.1 m. */
export function buildCycleGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      cyl(0.04, 0.05, 1.05, -0.42, 0.52, -0.18, STEEL, 6),
      cyl(0.04, 0.05, 1.05, -0.42, 0.52, 0.18, STEEL, 6),
      box(0.08, 0.08, 0.44, -0.42, 1.02, 0, STEEL),
      cyl(0.04, 0.05, 1.05, 0.42, 0.52, -0.18, STEEL, 6),
      cyl(0.04, 0.05, 1.05, 0.42, 0.52, 0.18, STEEL, 6),
      box(0.08, 0.08, 0.44, 0.42, 1.02, 0, STEEL),
    ]),
  );
}

/** Car-park lift gate, ~2.6 m arm. */
export function buildLiftGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(0.28, 1.15, 0.28, 0, 0.58, 0, STEEL),
      box(2.45, 0.1, 0.1, 1.22, 1.08, 0, WHITE),
      box(0.42, 0.12, 0.12, 0.55, 1.08, 0, RED),
      box(0.42, 0.12, 0.12, 1.4, 1.08, 0, RED),
      box(0.42, 0.12, 0.12, 2.22, 1.08, 0, RED),
    ]),
  );
}

export function barrierMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}
