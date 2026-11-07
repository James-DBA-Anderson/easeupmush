import * as THREE from "three";

type CoastData = {
  coasts: number[][];
  beaches: number[][];
  muds?: number[][];
  marsh?: number[][];
};

type Pt = { x: number; z: number };

const DRY = [
  [0.84, 0.82, 0.76],
  [0.78, 0.77, 0.72],
  [0.86, 0.84, 0.78],
  [0.74, 0.74, 0.70],
];
const WET = [
  [0.58, 0.58, 0.56],
  [0.50, 0.51, 0.50],
  [0.62, 0.61, 0.58],
];
const FOAM = [0.90, 0.86, 0.80];
const MUD = [0.86, 0.82, 0.74];
const MARSH = [0.46, 0.50, 0.38];
const SHALLOW = [0.38, 0.55, 0.58];

function unpack(flat: number[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], z: flat[i + 1] });
  return pts;
}

function closedRing(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev && prev.x === p.x && prev.z === p.z) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a.x === b.x && a.z === b.z) out.pop();
  }
  return out;
}

function pointInPoly(x: number, z: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const zi = pts[i].z, zj = pts[j].z;
    const xi = pts[i].x, xj = pts[j].x;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, z: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function hash01(x: number, z: number, salt = 0): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 17.13) * 43758.5453;
  return n - Math.floor(n);
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function nearPoly(x: number, z: number, rings: Pt[][], pad = 14): boolean {
  for (const b of rings) {
    if (pointInPoly(x, z, b) || distToRing(x, z, b) < pad) return true;
  }
  return false;
}

function rightNormal(ring: Pt[], i: number): Pt {
  const n = ring.length;
  const prev = ring[(i + n - 1) % n];
  const next = ring[(i + 1) % n];
  let tx = next.x - prev.x;
  let tz = next.z - prev.z;
  const tl = Math.hypot(tx, tz) || 1;
  return { x: tz / tl, z: -tx / tl };
}

function seaSignFor(ring: Pt[], land: Pt[]): number {
  let inside = 0;
  let tested = 0;
  const step = Math.max(1, Math.floor(ring.length / 24));
  for (let i = 0; i < ring.length; i += step) {
    const nrm = rightNormal(ring, i);
    const p = ring[i];
    if (pointInPoly(p.x + nrm.x * 12, p.z + nrm.z * 12, land)) inside++;
    tested++;
  }
  return inside * 2 > tested ? -1 : 1;
}

function pick(list: number[][], x: number, z: number, salt: number): number[] {
  const i = Math.floor(hash01(x, z, salt) * list.length) % list.length;
  const c = list[i];
  const j = (hash01(x, z, salt + 3) - 0.5) * 0.08;
  return [c[0] + j, c[1] + j, c[2] + j * 0.6];
}

function addBand(
  pos: number[],
  col: number[],
  idx: number[],
  ring: Pt[],
  seaSign: number,
  d0: number,
  d1: number,
  y0: number,
  y1: number,
  colourAt: (x: number, z: number, t: number) => number[],
  keep: boolean[],
) {
  const n = ring.length;
  const base = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const prev = ring[(i + n - 1) % n];
    const next = ring[(i + 1) % n];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const ox = tz * seaSign;
    const oz = -tx * seaSign;
    const x0 = a.x + ox * d0;
    const z0 = a.z + oz * d0;
    const x1 = a.x + ox * d1;
    const z1 = a.z + oz * d1;
    pos.push(x0, y0, z0, x1, y1, z1);
    const c0 = colourAt(x0, z0, 0);
    const c1 = colourAt(x1, z1, 1);
    col.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2]);
  }
  for (let i = 0; i < n; i++) {
    if (!keep[i] && !keep[(i + 1) % n]) continue;
    const a = base + i * 2;
    const b = base + ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}

function addFills(
  pos: number[],
  col: number[],
  idx: number[],
  rings: Pt[][],
  y: number,
  colourAt: (x: number, z: number) => number[],
) {
  for (const raw of rings) {
    const pts = closedRing(raw);
    if (pts.length < 3) continue;
    const wind = signedArea(pts) < 0 ? pts.slice().reverse() : pts;
    const shape = new THREE.Shape();
    shape.moveTo(wind[0].x, wind[0].z);
    for (let i = 1; i < wind.length; i++) shape.lineTo(wind[i].x, wind[i].z);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const attr = geo.getAttribute("position");
    const index = geo.getIndex();
    if (!attr || !index || index.count < 3) {
      geo.dispose();
      continue;
    }
    const base = pos.length / 3;
    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i);
      const z = attr.getY(i);
      pos.push(x, y, z);
      const c = colourAt(x, z);
      col.push(c[0], c[1], c[2]);
    }
    for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    geo.dispose();
  }
}

function waterNormalTex() {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = Math.sin(x * 0.21) + 0.55 * Math.sin(y * 0.37 + x * 0.08) + 0.3 * Math.sin((x + y) * 0.61);
      const n2 = Math.cos(y * 0.19) + 0.55 * Math.cos(x * 0.33 - y * 0.11) + 0.3 * Math.cos((x - y) * 0.57);
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, Math.max(0, (0.5 + n1 * 0.2) * 255));
      d[i + 1] = Math.min(255, Math.max(0, (0.5 + n2 * 0.2) * 255));
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function meshOf(pos: number[], col: number[], idx: number[], name: string, extra?: THREE.MeshLambertMaterialParameters) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const norms = new Float32Array(pos.length);
  for (let i = 1; i < norms.length; i += 3) norms[i] = 1;
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    ...extra,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

export async function addShore(mapScene: THREE.Object3D) {
  const data = (await fetch("./models/portsmouth-coast.json?v=2").then((r) => {
    if (!r.ok) throw new Error(`coast json ${r.status}`);
    return r.json();
  })) as CoastData;

  const beaches = (data.beaches ?? []).map(unpack);
  const muds = (data.muds ?? []).map(unpack);
  const marsh = (data.marsh ?? []).map(unpack);
  const rings = (data.coasts ?? []).map(unpack).filter((r) => r.length >= 8);
  const land = rings[0] ?? [];
  const group = new THREE.Group();
  group.name = "shore";

  const beachPos: number[] = [];
  const beachCol: number[] = [];
  const beachIdx: number[] = [];
  const mudPos: number[] = [];
  const mudCol: number[] = [];
  const mudIdx: number[] = [];
  const marshPos: number[] = [];
  const marshCol: number[] = [];
  const marshIdx: number[] = [];
  const wetPos: number[] = [];
  const wetCol: number[] = [];
  const wetIdx: number[] = [];
  const foamPos: number[] = [];
  const foamCol: number[] = [];
  const foamIdx: number[] = [];
  const shallowPos: number[] = [];
  const shallowCol: number[] = [];
  const shallowIdx: number[] = [];
  const tidePos: number[] = [];
  const tideCol: number[] = [];
  const tideIdx: number[] = [];

  addFills(mudPos, mudCol, mudIdx, muds, 0.04, (x, z) => {
    const n = (hash01(x, z, 5) - 0.5) * 0.05;
    return [MUD[0] + n, MUD[1] + n, MUD[2] + n * 0.6];
  });
  addFills(tidePos, tideCol, tideIdx, muds, 0.10, () => [0.23, 0.4, 0.44]);
  addFills(marshPos, marshCol, marshIdx, marsh, 0.06, (x, z) => {
    const n = (hash01(x, z, 7) - 0.5) * 0.05;
    return [MARSH[0] + n, MARSH[1] + n, MARSH[2] + n];
  });
  addFills(beachPos, beachCol, beachIdx, beaches, 0.11, (x, z) => pick(DRY, x, z, 1));

  for (const ring of rings) {
    const seaSign = land.length ? seaSignFor(ring, land) : signedArea(ring) > 0 ? 1 : -1;
    const beachKeep = ring.map((p) => nearPoly(p.x, p.z, beaches, 16));
    const mudKeep = ring.map((p) => nearPoly(p.x, p.z, muds, 18) || nearPoly(p.x, p.z, marsh, 18));
    const edgeKeep = beachKeep.map((v, i) => v || mudKeep[i]);

    addBand(wetPos, wetCol, wetIdx, ring, seaSign, 0.2, 10, 0.09, 0.05, (x, z) => pick(WET, x, z, 2), beachKeep);
    addBand(foamPos, foamCol, foamIdx, ring, seaSign, 9, 13.5, 0.055, 0.048, () => FOAM, edgeKeep);
    addBand(shallowPos, shallowCol, shallowIdx, ring, seaSign, 12, 28, 0.042, 0.036, (x, z) => {
      const n = hash01(x, z, 4) * 0.05;
      return [SHALLOW[0] + n, SHALLOW[1] + n, SHALLOW[2] + n];
    }, beachKeep);
  }

  if (mudIdx.length) {
    const mud = meshOf(mudPos, mudCol, mudIdx, "shore-mud");
    mud.renderOrder = 1;
    group.add(mud);
  }
  if (tideIdx.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(tidePos, 3));
    geo.setIndex(tideIdx);
    const nVert = tidePos.length / 3;
    const uv = new Float32Array(nVert * 2);
    for (let i = 0; i < nVert; i++) {
      uv[i * 2] = tidePos[i * 3] * 0.02;
      uv[i * 2 + 1] = tidePos[i * 3 + 2] * 0.02;
    }
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const ripple = waterNormalTex();
    const mat = new THREE.MeshPhongMaterial({
      color: 0x3a6570,
      specular: 0xc5e4ee,
      shininess: 58,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -20,
      polygonOffsetUnits: -20,
    });
    if (ripple) {
      mat.normalMap = ripple;
      mat.normalScale = new THREE.Vector2(0.55, 0.55);
    }
    const tide = new THREE.Mesh(geo, mat);
    tide.name = "shore-tide";
    tide.receiveShadow = false;
    tide.castShadow = false;
    tide.renderOrder = 4;
    if (ripple) {
      tide.onBeforeRender = () => {
        const t = performance.now() * 0.00007;
        ripple.offset.set(t, t * 0.62);
      };
    }
    group.add(tide);
  }
  if (marshIdx.length) group.add(meshOf(marshPos, marshCol, marshIdx, "shore-marsh"));
  if (beachIdx.length) group.add(meshOf(beachPos, beachCol, beachIdx, "shore-shingle"));
  if (wetIdx.length) group.add(meshOf(wetPos, wetCol, wetIdx, "shore-wet"));
  if (foamIdx.length) group.add(meshOf(foamPos, foamCol, foamIdx, "shore-foam"));
  if (shallowIdx.length) {
    group.add(
      meshOf(shallowPos, shallowCol, shallowIdx, "shore-shallows", {
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
  }

  mapScene.add(group);
}
