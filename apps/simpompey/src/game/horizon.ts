import * as THREE from "three";
import { SOUTH, WEST, NORTH, EAST, osmLocal } from "./geo";

const IOW_RING: Array<[number, number]> = [
  [50.662, -1.589],
  [50.672, -1.546],
  [50.706, -1.499],
  [50.722, -1.456],
  [50.738, -1.392],
  [50.754, -1.338],
  [50.766, -1.301],
  [50.751, -1.268],
  [50.739, -1.211],
  [50.737, -1.161],
  [50.721, -1.118],
  [50.692, -1.082],
  [50.678, -1.068],
  [50.666, -1.096],
  [50.652, -1.148],
  [50.627, -1.173],
  [50.611, -1.176],
  [50.594, -1.206],
  [50.586, -1.248],
  [50.575, -1.297],
  [50.596, -1.322],
  [50.618, -1.358],
  [50.641, -1.408],
  [50.652, -1.468],
  [50.662, -1.518],
];

const HILLS: Array<[number, number, number, number]> = [
  [50.603, -1.231, 210, 3800],
  [50.586, -1.297, 160, 2800],
  [50.668, -1.545, 140, 2500],
  [50.651, -1.38, 90, 4500],
  [50.68, -1.22, 55, 5000],
];

function hillHeight(lat: number, lon: number): number {
  let h = 5;
  for (const [plat, plon, peak, radius] of HILLS) {
    const dx = (lon - plon) * 70300;
    const dy = (lat - plat) * 111195;
    const t = Math.hypot(dx, dy) / radius;
    if (t < 2.4) h += peak * Math.exp(-t * t);
  }
  return h * 1.35;
}

function inIsle(lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = IOW_RING.length - 1; i < IOW_RING.length; j = i++) {
    const yi = IOW_RING[i][0], yj = IOW_RING[j][0];
    const xi = IOW_RING[i][1], xj = IOW_RING[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function buildIsleOfWight(): THREE.Group {
  const south = 50.57;
  const north = 50.772;
  const west = -1.6;
  const east = -1.055;
  const cols = 72;
  const rows = 48;
  const verts: number[] = [];
  const idx: number[] = [];
  const indexAt: number[] = new Array((rows + 1) * (cols + 1)).fill(-1);

  for (let r = 0; r <= rows; r++) {
    const lat = north - (r / rows) * (north - south);
    for (let c = 0; c <= cols; c++) {
      const lon = west + (c / cols) * (east - west);
      if (!inIsle(lat, lon)) continue;
      const p = osmLocal(lat, lon);
      indexAt[r * (cols + 1) + c] = verts.length / 3;
      verts.push(p.x, hillHeight(lat, lon), p.y);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = indexAt[r * (cols + 1) + c];
      const b = indexAt[r * (cols + 1) + c + 1];
      const d = indexAt[(r + 1) * (cols + 1) + c];
      const e = indexAt[(r + 1) * (cols + 1) + c + 1];
      if (a < 0 || b < 0 || d < 0 || e < 0) continue;
      idx.push(a, d, b, b, d, e);
    }
  }

  const cap = new THREE.BufferGeometry();
  cap.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  cap.setIndex(idx);
  cap.computeVertexNormals();

  const n = IOW_RING.length;
  const wPos: number[] = [];
  const wIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const [alat, alon] = IOW_RING[i];
    const [blat, blon] = IOW_RING[(i + 1) % n];
    const a = osmLocal(alat, alon);
    const b = osmLocal(blat, blon);
    const ha = hillHeight(alat, alon);
    const hb = hillHeight(blat, blon);
    const base = wPos.length / 3;
    wPos.push(a.x, 0, a.y, b.x, 0, b.y, a.x, ha, a.y, b.x, hb, b.y);
    wIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute("position", new THREE.Float32BufferAttribute(wPos, 3));
  walls.setIndex(wIdx);
  walls.computeVertexNormals();

  const land = new THREE.MeshLambertMaterial({ color: 0x6a7a58, side: THREE.DoubleSide });
  const cliff = new THREE.MeshLambertMaterial({ color: 0x8a8478, side: THREE.DoubleSide });
  const shingle = new THREE.MeshLambertMaterial({ color: 0xa89880, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = "isle-of-wight";
  const top = new THREE.Mesh(cap, land);
  const side = new THREE.Mesh(walls, cliff);
  top.receiveShadow = true;
  side.receiveShadow = true;

  const sPos: number[] = [];
  const sIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const [alat, alon] = IOW_RING[i];
    const [blat, blon] = IOW_RING[(i + 1) % n];
    const a = osmLocal(alat, alon);
    const b = osmLocal(blat, blon);
    const tx = b.x - a.x;
    const tz = b.y - a.y;
    const tl = Math.hypot(tx, tz) || 1;
    const ox = (-tz / tl) * 28;
    const oz = (tx / tl) * 28;
    const base = sPos.length / 3;
    sPos.push(a.x, 0.08, a.y, b.x, 0.08, b.y, a.x + ox, 0.04, a.y + oz, b.x + ox, 0.04, b.y + oz);
    sIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const shore = new THREE.BufferGeometry();
  shore.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
  shore.setIndex(sIdx);
  shore.computeVertexNormals();
  const beach = new THREE.Mesh(shore, shingle);
  beach.receiveShadow = true;

  group.add(top, side, beach);
  return group;
}

const SOLENT_COLOR = 0x3a6570;
const SOLENT_SPECULAR = 0x8eb8c4;
const SOLENT_SHININESS = 22;

export function solentMaterial(extra?: THREE.MeshPhongMaterialParameters) {
  return new THREE.MeshPhongMaterial({
    color: SOLENT_COLOR,
    specular: SOLENT_SPECULAR,
    shininess: SOLENT_SHININESS,
    side: THREE.DoubleSide,
    ...extra,
  });
}

export function addHorizon(scene: THREE.Scene, mapScene: THREE.Object3D) {
  scene.fog = new THREE.Fog(0x8aa4ae, 28000, 72000);
  scene.background = new THREE.Color(0x87a8b4);

  const sw = osmLocal(SOUTH - 0.22, WEST - 0.38);
  const ne = osmLocal(NORTH + 0.08, EAST + 0.18);
  const seaW = Math.abs(ne.x - sw.x);
  const seaH = Math.abs(ne.y - sw.y);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(seaW, seaH, 32, 32), solentMaterial());
  sea.geometry.rotateX(-Math.PI / 2);
  sea.position.set((sw.x + ne.x) * 0.5, 0.03, (sw.y + ne.y) * 0.5);
  sea.name = "solent";
  sea.receiveShadow = false;
  sea.frustumCulled = false;
  sea.renderOrder = -2;
  mapScene.add(sea);
  mapScene.add(buildIsleOfWight());
}
