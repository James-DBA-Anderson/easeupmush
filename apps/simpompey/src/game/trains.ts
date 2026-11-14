import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Kind = "swr" | "southern" | "gwr";
type TrainData = {
  trains: Array<{ id: string; kind: Kind; name: string; samples: number[] }>;
};

/** Wall-clock multiplier, same idea as AIS_RATE on ships. Samples are already ~35 mph. */
const REPLAY_RATE = 1.5;
const CAR_Z = [-20.4, 0, 20.4];
/** Bodies are 19.2 m; the GLB leaves a 1.2 m gap that opens further on curves. */
const CAR_PITCH = 19.45;
const BOGIE = 7.4;
const WHEEL_LIFT = 0.08;

type PathPt = { t: number; x: number; z: number; y: number; dist: number };
type Car = { obj: THREE.Group; restZ: number };
type TrainRun = {
  obj: THREE.Object3D;
  cars: Car[];
  path: PathPt[];
  duration: number;
};

function cloneTrain(proto: THREE.Object3D): THREE.Object3D {
  const obj = proto.clone(true);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return obj;
}

function splitCars(root: THREE.Object3D): Car[] {
  const cars: Car[] = CAR_Z.map((restZ) => {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    g.userData.restZ = restZ;
    return { obj: g, restZ };
  });
  let source = root;
  if (root.children.length === 1 && !(root.children[0] as THREE.Mesh).isMesh) {
    source = root.children[0];
  }
  const kids = [...source.children];
  for (const child of kids) {
    let best = 0;
    let bestD = Infinity;
    const z = child.position.z;
    for (let i = 0; i < CAR_Z.length; i++) {
      const d = Math.abs(z - CAR_Z[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    child.position.z -= CAR_Z[best];
    cars[best].obj.add(child);
  }
  return cars;
}

type BedPt = { x: number; y: number; z: number };
type BedSeg = { ax: number; ay: number; az: number; bx: number; by: number; bz: number };

const BED_CELL = 8;
const MATCH_REACH = 10;
const MAX_CANDS = 10;
const OFF_RAIL = 1e6;

function addSeg(bins: Map<string, BedSeg[]>, seg: BedSeg) {
  const minX = Math.min(seg.ax, seg.bx);
  const maxX = Math.max(seg.ax, seg.bx);
  const minZ = Math.min(seg.az, seg.bz);
  const maxZ = Math.max(seg.az, seg.bz);
  const x0 = Math.floor(minX / BED_CELL);
  const x1 = Math.floor(maxX / BED_CELL);
  const z0 = Math.floor(minZ / BED_CELL);
  const z1 = Math.floor(maxZ / BED_CELL);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const k = `${cx},${cz}`;
      const bin = bins.get(k);
      if (bin) bin.push(seg);
      else bins.set(k, [seg]);
    }
  }
}

function extractBed(mesh: THREE.Mesh): Map<string, BedSeg[]> {
  const pos = mesh.geometry.getAttribute("position");
  const bins = new Map<string, BedSeg[]>();
  if (!pos || pos.count < 4 || pos.count % 2 !== 0) return bins;
  const mid = (i: number): BedPt => ({
    x: (pos.getX(i) + pos.getX(i + 1)) * 0.5,
    y: (pos.getY(i) + pos.getY(i + 1)) * 0.5,
    z: (pos.getZ(i) + pos.getZ(i + 1)) * 0.5,
  });
  const idx = mesh.geometry.getIndex();
  if (!idx) return bins;
  // Ribbon quads are (a, a+2, a+1) over L/R pairs; straight OSM ways can span 100 m+.
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const a = idx.getX(t);
    if (a % 2 !== 0 || idx.getX(t + 1) !== a + 2 || idx.getX(t + 2) !== a + 1) continue;
    const p = mid(a);
    const q = mid(a + 2);
    if (Math.hypot(q.x - p.x, q.z - p.z) < 0.35) continue;
    addSeg(bins, { ax: p.x, ay: p.y, az: p.z, bx: q.x, by: q.y, bz: q.z });
  }
  return bins;
}

function projectSeg(x: number, z: number, s: BedSeg): BedPt & { d: number } {
  const abx = s.bx - s.ax;
  const abz = s.bz - s.az;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * abx + (z - s.az) * abz) / len2));
  const px = s.ax + abx * t;
  const pz = s.az + abz * t;
  const py = s.ay + (s.by - s.ay) * t;
  return { x: px, y: py, z: pz, d: Math.hypot(x - px, z - pz) };
}

type Cand = BedPt & { d: number };

/** Every distinct rail centre within reach of (x, z), one per nearby segment. */
function candidates(bins: Map<string, BedSeg[]>, x: number, z: number, reach: number): Cand[] {
  const cx = Math.floor(x / BED_CELL);
  const cz = Math.floor(z / BED_CELL);
  const ring = Math.ceil(reach / BED_CELL);
  const seen = new Set<BedSeg>();
  const out: Cand[] = [];
  for (let dz = -ring; dz <= ring; dz++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const bin = bins.get(`${cx + dx},${cz + dz}`);
      if (!bin) continue;
      for (const s of bin) {
        if (seen.has(s)) continue;
        seen.add(s);
        const p = projectSeg(x, z, s);
        if (p.d > reach) continue;
        if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.8)) continue;
        out.push(p);
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, MAX_CANDS);
}

function densifySamples(samples: number[], spacing = 4): Array<{ t: number; x: number; z: number; anchor: boolean }> {
  const out: Array<{ t: number; x: number; z: number; anchor: boolean }> = [];
  for (let i = 0; i + 7 < samples.length; i += 4) {
    const t0 = samples[i];
    const x0 = samples[i + 1];
    const z0 = samples[i + 2];
    const t1 = samples[i + 4];
    const x1 = samples[i + 5];
    const z1 = samples[i + 6];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < n; s++) {
      const u = s / n;
      out.push({ t: t0 + (t1 - t0) * u, x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u, anchor: s === 0 });
    }
  }
  const last = samples.length - 4;
  if (last >= 0) out.push({ t: samples[last], x: samples[last + 1], z: samples[last + 2], anchor: true });
  return out;
}

function rebuildDist(pts: PathPt[]) {
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].dist = dist;
  }
}

function smoothPath(pts: PathPt[], passes: number) {
  if (pts.length < 3) return;
  for (let p = 0; p < passes; p++) {
    const xs = pts.map((q) => q.x);
    const zs = pts.map((q) => q.z);
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i].x = xs[i] * 0.5 + xs[i - 1] * 0.25 + xs[i + 1] * 0.25;
      pts[i].z = zs[i] * 0.5 + zs[i - 1] * 0.25 + zs[i + 1] * 0.25;
    }
  }
}

/**
 * Darwin samples are ~80 m chords between OSM nodes that the route graph merged across
 * neighbouring lines, so match the whole run at once: hopping sideways to a parallel
 * line is expensive, drifting along one line is cheap.
 */
function matchPath(dense: ReturnType<typeof densifySamples>, bed: Map<string, BedSeg[]>): BedPt[] {
  const n = dense.length;
  const cands: Cand[][] = [];
  for (let i = 0; i < n; i++) {
    const p = dense[i];
    const c = candidates(bed, p.x, p.z, MATCH_REACH);
    cands.push(c.length ? c : [{ x: p.x, y: NaN, z: p.z, d: OFF_RAIL }]);
  }
  const emit = (i: number, c: Cand) => {
    if (c.d >= OFF_RAIL) return 12;
    return c.d * (dense[i].anchor ? 0.9 : 0.06);
  };
  let cost = cands[0].map((c) => emit(0, c));
  const back: Int16Array[] = [new Int16Array(cands[0].length).fill(-1)];
  for (let i = 1; i < n; i++) {
    let hx = dense[i].x - dense[i - 1].x;
    let hz = dense[i].z - dense[i - 1].z;
    const step = Math.hypot(hx, hz);
    if (step > 1e-3) {
      hx /= step;
      hz /= step;
    }
    const cur = cands[i];
    const prevC = cands[i - 1];
    const next = new Array<number>(cur.length);
    const bp = new Int16Array(cur.length);
    for (let k = 0; k < cur.length; k++) {
      let best = Infinity;
      let arg = 0;
      for (let j = 0; j < prevC.length; j++) {
        const vx = cur[k].x - prevC[j].x;
        const vz = cur[k].z - prevC[j].z;
        let trans = 0;
        if (step > 1e-3) {
          const along = vx * hx + vz * hz;
          const lat = Math.abs(vx * -hz + vz * hx);
          trans = Math.abs(Math.hypot(vx, vz) - step) * 0.5 + lat * lat * 1.6 + (along < 0 ? 6 : 0);
        } else {
          trans = Math.hypot(vx, vz) * 2;
        }
        const total = cost[j] + trans;
        if (total < best) {
          best = total;
          arg = j;
        }
      }
      next[k] = best + emit(i, cur[k]);
      bp[k] = arg;
    }
    cost = next;
    back.push(bp);
  }
  let k = 0;
  for (let j = 1; j < cost.length; j++) if (cost[j] < cost[k]) k = j;
  const out: BedPt[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = cands[i][k];
    k = back[i][k];
  }
  let lastY = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(out[i].y)) lastY = out[i].y;
    else out[i] = { x: out[i].x, y: lastY, z: out[i].z };
  }
  return out;
}

function buildPath(samples: number[], bed: Map<string, BedSeg[]> | null): PathPt[] {
  const dense = densifySamples(samples, 4);
  const snapped = bed ? matchPath(dense, bed) : dense.map((p) => ({ x: p.x, y: 0, z: p.z }));
  const pts: PathPt[] = dense.map((p, i) => ({ t: p.t, x: snapped[i].x, z: snapped[i].z, y: snapped[i].y, dist: 0 }));
  smoothPath(pts, 1);
  rebuildDist(pts);
  return pts;
}

function atTime(path: PathPt[], t: number): PathPt {
  if (path.length === 0) return { t: 0, x: 0, z: 0, y: 0, dist: 0 };
  if (t <= path[0].t) return path[0];
  for (let i = 0; i < path.length - 1; i++) {
    if (t > path[i + 1].t) continue;
    const a = path[i];
    const b = path[i + 1];
    const u = (t - a.t) / Math.max(0.01, b.t - a.t);
    return {
      t,
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      y: a.y + (b.y - a.y) * u,
      dist: a.dist + (b.dist - a.dist) * u,
    };
  }
  return path[path.length - 1];
}

function atDist(path: PathPt[], dist: number): PathPt {
  if (path.length === 0) return { t: 0, x: 0, z: 0, y: 0, dist: 0 };
  const d = Math.max(path[0].dist, Math.min(path[path.length - 1].dist, dist));
  for (let i = 0; i < path.length - 1; i++) {
    if (d > path[i + 1].dist) continue;
    const a = path[i];
    const b = path[i + 1];
    const span = Math.max(0.01, b.dist - a.dist);
    const u = (d - a.dist) / span;
    return {
      t: a.t + (b.t - a.t) * u,
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      y: a.y + (b.y - a.y) * u,
      dist: d,
    };
  }
  return path[path.length - 1];
}

function tangentYaw(a: PathPt, b: PathPt): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export class RailTraffic {
  group = new THREE.Group();
  private trains: TrainRun[] = [];
  private clock = 0;

  constructor() {
    this.group.name = "trains";
  }

  async load(
    loader: GLTFLoader,
    mapScene: THREE.Object3D,
    _sampleGround: (x: number, z: number) => number | null,
    rails?: THREE.Object3D | null,
  ) {
    const [data, swr, southern, gwr] = await Promise.all([
      fetch("./models/portsmouth-trains.json").then((r) => {
        if (!r.ok) throw new Error(`trains json ${r.status}`);
        return r.json() as Promise<TrainData>;
      }),
      loader.loadAsync("./models/train-swr.glb"),
      loader.loadAsync("./models/train-southern.glb"),
      loader.loadAsync("./models/train-gwr.glb"),
    ]);
    const proto: Record<Kind, THREE.Object3D> = {
      swr: swr.scene,
      southern: southern.scene,
      gwr: gwr.scene,
    };
    const bed = rails instanceof THREE.Mesh ? extractBed(rails) : null;

    for (const track of data.trains ?? []) {
      if (track.samples.length < 8) continue;
      const cloned = cloneTrain(proto[track.kind] ?? proto.swr);
      const cars = splitCars(cloned);
      const obj = new THREE.Group();
      obj.userData.label = track.name;
      for (const car of cars) obj.add(car.obj);
      const duration = track.samples[track.samples.length - 4] || 1;
      this.trains.push({
        obj,
        cars,
        path: buildPath(track.samples, bed),
        duration: Math.max(30, duration),
      });
      this.group.add(obj);
    }

    this.update(0);
    mapScene.add(this.group);
  }

  update(dt: number) {
    this.clock += dt;
    const sim = this.clock * REPLAY_RATE;
    for (const a of this.trains) {
      if (a.path.length < 2) continue;
      const t = sim % a.duration;
      const mid = atTime(a.path, t);
      a.obj.position.set(mid.x, mid.y + WHEEL_LIFT, mid.z);
      for (const car of a.cars) {
        const here = atDist(a.path, mid.dist + Math.sign(car.restZ) * CAR_PITCH);
        const back = atDist(a.path, here.dist - BOGIE);
        const front = atDist(a.path, here.dist + BOGIE);
        const yaw = tangentYaw(back, front);
        const run = Math.hypot(front.x - back.x, front.z - back.z) || 1;
        const pitch = Math.atan2(front.y - back.y, run);
        car.obj.position.set(here.x - mid.x, here.y - mid.y, here.z - mid.z);
        car.obj.rotation.y = yaw;
        car.obj.rotation.x = -THREE.MathUtils.clamp(pitch, -0.35, 0.35);
      }
    }
  }
}
