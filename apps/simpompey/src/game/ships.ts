import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Hull = "boat" | "ferry" | "cargo" | "hovercraft" | "warship";
type ShipData = {
  ferries: Array<{ id: string; name: string; kind: Hull; speed: number; pts: number[] }>;
  historic: Array<{ name: string; kind: Hull; x: number; z: number; heading: number; length?: number; beam?: number }>;
  ais: Array<{ mmsi: string; kind: Hull; samples: number[] }>;
};

const AIS_RATE = 1.5;
const FERRY_SPEED = 0.5;
const WATER_Y = 0.35;
const HULL_LEN: Record<Hull, number> = {
  boat: 10,
  ferry: 38,
  cargo: 160,
  hovercraft: 28,
  warship: 70,
};
const HULL_BEAM: Record<Hull, number> = {
  boat: 2.6,
  ferry: 9.4,
  cargo: 24,
  hovercraft: 12,
  warship: 12,
};

type FerryRun = {
  obj: THREE.Object3D;
  pts: number[];
  speed: number;
  length: number;
  hull: number;
  beam: number;
  t: number;
  yaw: number;
  moving: boolean;
};
type AisRun = {
  obj: THREE.Object3D;
  samples: number[];
  duration: number;
  hull: number;
  beam: number;
  yaw: number;
  moving: boolean;
};
type Moored = {
  obj: THREE.Object3D;
  hull: number;
  beam: number;
};

function cloneHull(proto: THREE.Object3D): THREE.Object3D {
  const obj = proto.clone(true);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return obj;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}

function along(pts: number[], dist: number, look = 12) {
  const segs = pts.length / 2 - 1;
  const at = (d: number) => {
    let remain = Math.max(0, d);
    for (let i = 0; i < segs; i++) {
      const x0 = pts[i * 2];
      const z0 = pts[i * 2 + 1];
      const x1 = pts[i * 2 + 2];
      const z1 = pts[i * 2 + 3];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1e-6;
      if (remain <= len) {
        const u = remain / len;
        return { x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u };
      }
      remain -= len;
    }
    const n = pts.length;
    return { x: pts[n - 2], z: pts[n - 1] };
  };
  const p = at(dist);
  const a = at(dist + look);
  const back = at(Math.max(0, dist - look));
  let dx = a.x - p.x;
  let dz = a.z - p.z;
  if (dx * dx + dz * dz < 1) {
    dx = p.x - back.x;
    dz = p.z - back.z;
  }
  return { x: p.x, z: p.z, yaw: Math.atan2(dx, dz) };
}

function pathLength(pts: number[]) {
  let n = 0;
  for (let i = 2; i < pts.length; i += 2) n += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return n;
}

export class HarbourTraffic {
  group = new THREE.Group();
  private ferries: FerryRun[] = [];
  private ais: AisRun[] = [];
  private moored: Moored[] = [];
  private clock = 0;
  private push = new THREE.Vector3();

  constructor() {
    this.group.name = "ships";
  }

  async load(
    loader: GLTFLoader,
    mapScene: THREE.Object3D,
    sampleGround: (x: number, z: number) => number | null,
  ) {
    const [data, ferryG, cargoG, boatG, hoverG, warG] = await Promise.all([
      fetch("./models/portsmouth-ships.json?v=hull2").then((r) => {
        if (!r.ok) throw new Error(`ships json ${r.status}`);
        return r.json() as Promise<ShipData>;
      }),
      loader.loadAsync("./models/ship-ferry.glb"),
      loader.loadAsync("./models/ship-cargo.glb"),
      loader.loadAsync("./models/ship-boat.glb"),
      loader.loadAsync("./models/ship-hovercraft.glb"),
      loader.loadAsync("./models/ship-warship.glb"),
    ]);
    const proto: Record<Hull, THREE.Object3D> = {
      ferry: ferryG.scene,
      cargo: cargoG.scene,
      boat: boatG.scene,
      hovercraft: hoverG.scene,
      warship: warG.scene,
    };

    const toWorld = (x: number, z: number, y: number) => {
      const p = new THREE.Vector3(x, y, z);
      mapScene.localToWorld(p);
      return p;
    };

    for (const h of data.historic ?? []) {
      const kind = h.kind ?? "warship";
      const obj = cloneHull(proto[kind] ?? proto.warship);
      const probe = toWorld(h.x, h.z, 40);
      const ground = sampleGround(probe.x, probe.z);
      const at = new THREE.Vector3(h.x, WATER_Y, h.z);
      if (ground !== null) {
        at.set(probe.x, ground, probe.z);
        mapScene.worldToLocal(at);
      }
      const hull = h.length ?? HULL_LEN[kind];
      const beam = h.beam ?? HULL_BEAM[kind];
      const sx = beam / HULL_BEAM[kind];
      const sz = hull / HULL_LEN[kind];
      obj.position.copy(at);
      obj.rotation.y = h.heading;
      obj.scale.set(sx, Math.min(sx, sz), sz);
      obj.userData.label = h.name;
      this.group.add(obj);
      this.moored.push({ obj, hull, beam });
    }

    for (const f of data.ferries ?? []) {
      if (f.pts.length < 4) continue;
      const obj = cloneHull(proto[f.kind] ?? proto.ferry);
      const length = pathLength(f.pts);
      if (length < 30) continue;
      const hull = HULL_LEN[f.kind] ?? 20;
      this.ferries.push({
        obj,
        pts: f.pts,
        speed: Math.max(1.2, f.speed * FERRY_SPEED),
        length,
        hull,
        beam: HULL_BEAM[f.kind] ?? 6,
        t: Math.random() * 180,
        yaw: 0,
        moving: false,
      });
      this.group.add(obj);
    }

    for (const track of data.ais ?? []) {
      if (track.samples.length < 8) continue;
      const kind = track.kind ?? "boat";
      const obj = cloneHull(proto[kind] ?? proto.boat);
      const duration = track.samples[track.samples.length - 4] || 1;
      this.ais.push({
        obj,
        samples: track.samples,
        duration: Math.max(30, duration),
        hull: HULL_LEN[kind] ?? 10,
        beam: HULL_BEAM[kind] ?? 3,
        yaw: (track.samples[3] ?? 0) * (Math.PI / 180),
        moving: false,
      });
      this.group.add(obj);
    }

    mapScene.add(this.group);
    this.update(0);
  }

  update(dt: number) {
    this.clock += dt;
    this.updateFerries(dt);
    this.updateAis(dt);
    this.separateDocked();
  }

  private updateFerries(dt: number) {
    for (const f of this.ferries) {
      const pad = Math.min(f.hull * 0.85 + 8, f.length * 0.4);
      const travel = Math.max(8, f.length - 2 * pad);
      const goT = travel / f.speed;
      const dwell = Math.max(7, Math.min(18, f.hull * 0.14));
      const turnT = Math.max(4, Math.min(10, f.hull * 0.07));
      const half = goT + dwell + turnT;
      const cycle = half * 2;
      f.t = (f.t + dt) % cycle;
      const cycleT = f.t;
      let u = cycleT;
      let dist = pad;
      let reverse = false;
      let turning = 0;
      if (u < goT) {
        dist = pad + (u / goT) * travel;
      } else if ((u -= goT) < dwell) {
        dist = pad + travel;
      } else if ((u -= dwell) < turnT) {
        dist = pad + travel;
        turning = u / turnT;
        reverse = true;
      } else if ((u -= turnT) < goT) {
        dist = pad + travel - (u / goT) * travel;
        reverse = true;
      } else if ((u -= goT) < dwell) {
        dist = pad;
        reverse = true;
      } else {
        u -= dwell;
        dist = pad;
        turning = u / turnT;
        reverse = false;
      }
      const p = along(f.pts, dist, 18);
      const want = reverse ? p.yaw + Math.PI : p.yaw;
      const from = reverse ? p.yaw : p.yaw + Math.PI;
      if (turning > 0) {
        f.yaw = lerpAngle(from, want, turning);
        f.moving = false;
      } else {
        f.yaw = dt === 0 ? want : lerpAngle(f.yaw, want, 1 - Math.exp(-5 * Math.max(dt, 1 / 60)));
        f.moving = cycleT < goT || (cycleT >= half && cycleT < half + goT);
      }
      f.obj.position.set(p.x, WATER_Y, p.z);
      f.obj.rotation.y = f.yaw;
    }
  }

  private updateAis(dt: number) {
    const sim = this.clock * AIS_RATE;
    const ease = 1 - Math.exp(-3.2 * Math.max(dt, 1 / 60));
    for (const a of this.ais) {
      const t = sim % a.duration;
      const s = a.samples;
      let i = 0;
      while (i + 8 <= s.length && s[i + 4] < t) i += 4;
      const t0 = s[i];
      const t1 = s[i + 4] ?? t0 + 1;
      const x0 = s[i + 1];
      const z0 = s[i + 2];
      const x1 = s[i + 5] ?? x0;
      const z1 = s[i + 6] ?? z0;
      const step = Math.hypot(x1 - x0, z1 - z0);
      const docked = step < Math.max(4, a.hull * 0.08);
      a.moving = !docked;
      if (docked) {
        a.obj.position.set(x0, WATER_Y, z0);
        a.obj.rotation.y = a.yaw;
        continue;
      }
      const u = Math.min(1, (t - t0) / Math.max(0.01, t1 - t0));
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      a.obj.position.set(x, WATER_Y, z);
      const want = Math.atan2(x1 - x0, z1 - z0);
      a.yaw = lerpAngle(a.yaw, want, ease);
      a.obj.rotation.y = a.yaw;
    }
  }

  private separateDocked() {
    const movers: Array<FerryRun | AisRun> = [];
    for (const f of this.ferries) if (!f.moving) movers.push(f);
    for (const a of this.ais) if (!a.moving) movers.push(a);
    if (movers.length === 0) return;
    const blockers: Array<{ obj: THREE.Object3D; beam: number; hull: number; solid: boolean }> = [
      ...this.moored.map((m) => ({ ...m, solid: true })),
      ...this.ferries.map((f) => ({ obj: f.obj, beam: f.beam, hull: f.hull, solid: false })),
      ...this.ais.map((a) => ({ obj: a.obj, beam: a.beam, hull: a.hull, solid: false })),
    ];
    for (let pass = 0; pass < 2; pass++) {
      for (const ship of movers) {
        for (const other of blockers) {
          if (other.obj === ship.obj) continue;
          const dx = ship.obj.position.x - other.obj.position.x;
          const dz = ship.obj.position.z - other.obj.position.z;
          const dist = Math.hypot(dx, dz);
          const min = Math.max((ship.beam + other.beam) * 0.7, Math.min(ship.hull, other.hull) * 0.42);
          if (dist >= min || dist < 1e-4) continue;
          const push = (min - dist) * (other.solid ? 1 : 0.55);
          this.push.set(dx / dist, 0, dz / dist).multiplyScalar(push);
          ship.obj.position.add(this.push);
        }
      }
    }
  }
}
