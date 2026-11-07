import * as THREE from "three";

const FRAME = 0xc5c0b4;
const GLASS = 0x24355a;
const BACK = 0x2a2e33;
const KIOSK = 0x2f6b45;
const KIOSK_CAP = 0x245538;
const DOOR = 0x1e1e1c;
const TANK = 0x6d7178;
const PAD = 0xb8b3a8;
const BUSH = 0xe8e4d8;
const FIN = 0x5a5e64;

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

/** Rooftop PV module, ~1.7 m, tilted south toward −Z. */
export function buildSolarGeometry(): THREE.BufferGeometry {
  const tilt = -0.48;
  const frame = box(1.68, 0.07, 1.02, 0, 0.22, 0, FRAME);
  const glass = box(1.56, 0.035, 0.9, 0, 0.26, 0, GLASS);
  const back = box(1.6, 0.03, 0.94, 0, 0.18, 0, BACK);
  for (const p of [frame, glass, back]) p.rotateX(tilt);
  return sitOnGround(merge([frame, glass, back]));
}

/** Green GRP feeder pillar, ~1.6 m. */
export function buildKioskGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.18, 1.48, 0.72, 0, 0.74, 0, KIOSK),
      box(1.26, 0.08, 0.8, 0, 1.52, 0, KIOSK_CAP),
      box(0.52, 1.05, 0.06, 0, 0.72, 0.38, DOOR),
      box(0.16, 0.08, 0.08, 0.18, 0.72, 0.42, FRAME),
    ]),
  );
}

/** Ground-mounted distribution transformer, ~2.1 m. */
export function buildTransformerGeometry(): THREE.BufferGeometry {
  return sitOnGround(
    merge([
      box(1.85, 0.16, 1.22, 0, 0.08, 0, PAD),
      box(1.28, 1.12, 0.82, 0, 0.72, 0, TANK),
      box(0.12, 1.0, 0.7, 0.72, 0.72, 0, FIN),
      box(0.12, 1.0, 0.7, -0.72, 0.72, 0, FIN),
      cyl(0.07, 0.09, 0.42, -0.32, 1.48, 0, BUSH, 6),
      cyl(0.07, 0.09, 0.42, 0, 1.48, 0, BUSH, 6),
      cyl(0.07, 0.09, 0.42, 0.32, 1.48, 0, BUSH, 6),
      box(0.22, 0.18, 0.22, 0.48, 0.28, 0.38, FIN),
    ]),
  );
}

export function powerMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}
