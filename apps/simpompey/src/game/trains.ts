import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Kind = "swr" | "southern" | "gwr";
type TrainData = {
  trains: Array<{ id: string; kind: Kind; name: string; samples: number[] }>;
};

/** Wall-clock multiplier, same idea as AIS_RATE on ships. Samples are already ~35 mph. */
const REPLAY_RATE = 1.5;

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}

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

export class RailTraffic {
  group = new THREE.Group();
  private trains: Array<{ obj: THREE.Object3D; samples: number[]; duration: number; yaw: number }> = [];
  private clock = 0;
  private mapScene: THREE.Object3D | null = null;
  private sampleGround: ((x: number, z: number) => number | null) | null = null;

  constructor() {
    this.group.name = "trains";
  }

  async load(
    loader: GLTFLoader,
    mapScene: THREE.Object3D,
    sampleGround: (x: number, z: number) => number | null,
  ) {
    this.mapScene = mapScene;
    this.sampleGround = sampleGround;
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

    for (const track of data.trains ?? []) {
      if (track.samples.length < 8) continue;
      const obj = cloneTrain(proto[track.kind] ?? proto.swr);
      obj.userData.label = track.name;
      const duration = track.samples[track.samples.length - 4] || 1;
      this.trains.push({
        obj,
        samples: track.samples,
        duration: Math.max(30, duration),
        yaw: (track.samples[3] ?? 0) * (Math.PI / 180),
      });
      this.group.add(obj);
    }

    this.update(0);
    mapScene.add(this.group);
  }

  update(dt: number) {
    this.clock += dt;
    const sim = this.clock * REPLAY_RATE;
    const mapScene = this.mapScene;
    const sampleGround = this.sampleGround;
    for (const a of this.trains) {
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
      const u = Math.min(1, (t - t0) / Math.max(0.01, t1 - t0));
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      a.obj.position.x = x;
      a.obj.position.z = z;
      const step = Math.hypot(x1 - x0, z1 - z0);
      if (step > 0.4) {
        const want = Math.atan2(x1 - x0, z1 - z0);
        let d = want - a.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        // Dual-cab reverse: snap, don't pirouette through 180°.
        a.yaw = Math.abs(d) > Math.PI * 0.5 ? want : lerpAngle(a.yaw, want, dt === 0 ? 1 : 1 - Math.exp(-10 * dt));
      }
      a.obj.rotation.y = a.yaw;
      if (mapScene && sampleGround) {
        const probe = new THREE.Vector3(x, 40, z);
        mapScene.localToWorld(probe);
        const ground = sampleGround(probe.x, probe.z);
        if (ground !== null) {
          const at = new THREE.Vector3(probe.x, ground + 0.35, probe.z);
          mapScene.worldToLocal(at);
          a.obj.position.y = at.y;
        }
      }
    }
  }
}
