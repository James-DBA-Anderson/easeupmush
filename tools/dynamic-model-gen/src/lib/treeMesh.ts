import * as THREE from "three";

const TRUNK = 0x6b4a2a;
const LEAF = 0x3f7a3a;
const PINE = 0x2f5c32;

function cylinder(r: number, h: number, y: number, color: number, radial = 6) {
  const geo = new THREE.CylinderGeometry(r * 0.85, r, h, radial);
  geo.translate(0, y, 0);
  return colored(geo, color);
}

function sphere(r: number, x: number, y: number, z: number, color: number, seg = 8) {
  const geo = new THREE.SphereGeometry(r, seg, 6);
  geo.translate(x, y, z);
  return colored(geo, color);
}

function cone(r: number, h: number, y: number, color: number, radial = 7) {
  const geo = new THREE.ConeGeometry(r, h, radial);
  geo.translate(0, y, 0);
  return colored(geo, color);
}

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

function merge(parts: THREE.BufferGeometry[]) {
  const merged = parts.length === 1 ? parts[0] : mergeManual(parts);
  merged.computeVertexNormals();
  return merged;
}

function mergeManual(parts: THREE.BufferGeometry[]) {
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
  return geo;
}

/** ~8 m tall broadleaf. Scale instances by height / 8. */
export function buildBroadleafGeometry(): THREE.BufferGeometry {
  const parts = [
    cylinder(0.22, 2.6, 1.3, TRUNK),
    sphere(2.15, 0, 4.15, 0, LEAF),
    sphere(1.45, 0.55, 5.05, 0.2, LEAF),
    sphere(1.25, -0.45, 4.85, -0.35, LEAF),
  ];
  for (const p of parts) p.computeVertexNormals();
  return merge(parts);
}

/** ~9 m tall pine. Scale instances by height / 9. */
export function buildPineGeometry(): THREE.BufferGeometry {
  const parts = [
    cylinder(0.18, 3.2, 1.6, TRUNK, 6),
    cone(2.1, 2.6, 3.6, PINE),
    cone(1.55, 2.2, 5.2, PINE),
    cone(1.05, 1.9, 6.6, PINE),
  ];
  for (const p of parts) p.computeVertexNormals();
  return merge(parts);
}

export function treeMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}
