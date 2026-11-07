import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type LandmarkKind = "tower" | "chimney" | "tank" | "crane";
type Pitch = { sport: string; t: number[]; r: number[] };
type LandmarkKit = { x: number; z: number; y?: number; kind: LandmarkKind; heading?: number; scale?: number; name?: string };
type PlacesData = { pitches?: Pitch[]; kits?: LandmarkKit[] };

const LANDMARKS: LandmarkKind[] = ["tower", "chimney", "tank", "crane"];
const PITCH_LIFT = 0.72;
const MARK_LIFT = 0.86;

function pitchColour(sport: string): number {
  const s = sport.split(";")[0].toLowerCase();
  if (s === "playground") return 0xd4a070;
  if (s === "tennis") return 0x3f8f6a;
  if (s === "soccer" || s === "football") return 0x4d9a4a;
  if (s.includes("basket")) return 0xb56a38;
  if (s.includes("bowl")) return 0x58aa52;
  if (s.includes("cricket")) return 0x6ab05a;
  if (s.includes("rugby")) return 0x478a42;
  if (s.includes("hockey")) return 0x3a7a68;
  if (s.includes("netball") || s.includes("multi")) return 0xc45a3a;
  if (s.includes("athlet") || s === "running") return 0xb45a48;
  if (s === "skateboard" || s === "bmx") return 0x8a8680;
  return 0x5a9650;
}

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!found && mesh.isMesh) found = mesh;
  });
  return found;
}

function drape(
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  x: number,
  z: number,
  lift = 0,
): THREE.Vector3 | null {
  const probe = new THREE.Vector3(x, 40, z);
  mapScene.localToWorld(probe);
  const ground = sampleGround(probe.x, probe.z);
  if (ground === null) return null;
  const at = new THREE.Vector3(probe.x, ground + lift, probe.z);
  mapScene.worldToLocal(at);
  return at;
}

function tessellate(xz: number[], maxEdge = 48): number[] {
  const queue: number[][] = [];
  for (let i = 0; i + 5 < xz.length; i += 6) queue.push(xz.slice(i, i + 6));
  const out: number[] = [];
  while (queue.length) {
    const t = queue.pop()!;
    const [ax, az, bx, bz, cx, cz] = t;
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    const longest = Math.max(ab, bc, ca);
    if (longest <= maxEdge || queue.length > 40_000) {
      out.push(ax, az, bx, bz, cx, cz);
      continue;
    }
    if (ab >= bc && ab >= ca) {
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      queue.push([ax, az, mx, mz, cx, cz], [mx, mz, bx, bz, cx, cz]);
    } else if (bc >= ca) {
      const mx = (bx + cx) * 0.5;
      const mz = (bz + cz) * 0.5;
      queue.push([ax, az, bx, bz, mx, mz], [ax, az, mx, mz, cx, cz]);
    } else {
      const mx = (cx + ax) * 0.5;
      const mz = (cz + az) * 0.5;
      queue.push([ax, az, bx, bz, mx, mz], [mx, mz, bx, bz, cx, cz]);
    }
  }
  return out;
}

function fillMesh(
  sport: string,
  xz: number[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
): THREE.Mesh | null {
  if (xz.length < 6) return null;
  const pos: number[] = [];
  const draped = tessellate(xz);
  for (let i = 0; i + 5 < draped.length; i += 6) {
    const pts = [
      drape(mapScene, sampleGround, draped[i], draped[i + 1], PITCH_LIFT),
      drape(mapScene, sampleGround, draped[i + 2], draped[i + 3], PITCH_LIFT),
      drape(mapScene, sampleGround, draped[i + 4], draped[i + 5], PITCH_LIFT),
    ];
    const good = pts.filter((p): p is THREE.Vector3 => p !== null);
    if (good.length === 0) continue;
    if (good.length < 3) {
      const y = good.reduce((s, p) => s + p.y, 0) / good.length;
      if (!pts[0]) pts[0] = new THREE.Vector3(draped[i], y, draped[i + 1]);
      if (!pts[1]) pts[1] = new THREE.Vector3(draped[i + 2], y, draped[i + 3]);
      if (!pts[2]) pts[2] = new THREE.Vector3(draped[i + 4], y, draped[i + 5]);
    }
    const [a, b, c] = pts as THREE.Vector3[];
    if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > 24) continue;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const norms = new Float32Array(pos.length);
  for (let i = 1; i < norms.length; i += 3) norms[i] = 1;
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  const mat = new THREE.MeshLambertMaterial({
    color: pitchColour(sport),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -56,
    polygonOffsetUnits: -56,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `pitch-${sport}`;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

function markMesh(
  ring: number[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
): THREE.Mesh | null {
  if (ring.length < 4) return null;
  const half = 0.38;
  const pos: number[] = [];
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[((i + 1) % n) * 2];
    const bz = ring[((i + 1) % n) * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const a = drape(mapScene, sampleGround, ax + nx, az + nz, MARK_LIFT);
    const b = drape(mapScene, sampleGround, ax - nx, az - nz, MARK_LIFT);
    const c = drape(mapScene, sampleGround, bx - nx, bz - nz, MARK_LIFT);
    const d = drape(mapScene, sampleGround, bx + nx, bz + nz, MARK_LIFT);
    if (!a || !b || !c || !d) continue;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const norms = new Float32Array(pos.length);
  for (let i = 1; i < norms.length; i += 3) norms[i] = 1;
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      color: 0xe8e8e0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -64,
      polygonOffsetUnits: -64,
    }),
  );
  mesh.name = "pitch-marks";
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

function instanceLandmarks(
  kind: LandmarkKind,
  proto: THREE.Mesh,
  kits: LandmarkKit[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): THREE.InstancedMesh | null {
  if (kits.length === 0) return null;
  const dummy = new THREE.Object3D();
  const placed: Array<{ at: THREE.Vector3; heading: number; scale: number; name?: string }> = [];
  for (const kit of kits) {
    const local = new THREE.Vector3(kit.x, kit.y ?? 0, kit.z);
    if (kit.y === undefined) {
      const probe = new THREE.Vector3(kit.x, 40, kit.z);
      mapScene.localToWorld(probe);
      const ground = sampleGround(probe.x, probe.z);
      if (ground === null) {
        local.set(kit.x, 0, kit.z);
      } else {
        local.set(probe.x, ground, probe.z);
        mapScene.worldToLocal(local);
      }
    }
    placed.push({ at: local, heading: kit.heading ?? 0, scale: kit.scale ?? 1, name: kit.name });
  }
  if (placed.length === 0) return null;

  const srcMat = proto.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  const hasColors = Boolean(proto.geometry.getAttribute("color"));
  const mat = new THREE.MeshLambertMaterial({
    color: hasColors ? 0xffffff : srcMat.color,
    vertexColors: hasColors,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(proto.geometry, mat, placed.length);
  mesh.name = `landmark-${kind}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  const labelH = { tower: 18, chimney: 32, tank: 9, crane: 24 };
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    dummy.position.copy(p.at);
    dummy.rotation.set(0, p.heading, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (p.name) {
      labels.push({
        kind: "building",
        name: p.name,
        x: p.at.x,
        y: p.at.y + labelH[kind] * p.scale,
        z: p.at.z,
      });
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export async function addPlaces(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  cover: THREE.Object3D,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "landmarks";
  const [data, ...gltfs] = await Promise.all([
    fetch("./models/portsmouth-places.json?v=1").then((r) => {
      if (!r.ok) throw new Error(`places json ${r.status}`);
      return r.json() as Promise<PlacesData>;
    }),
    ...LANDMARKS.map((kind) => loader.loadAsync(`./models/landmark-${kind}.glb`)),
  ]);

  const bySport = new Map<string, number[]>();
  for (const pitch of data.pitches ?? []) {
    const key = pitch.sport || "pitch";
    const bucket = bySport.get(key);
    if (bucket) bucket.push(...pitch.t);
    else bySport.set(key, pitch.t.slice());
  }
  for (const [sport, tris] of bySport) {
    const fill = fillMesh(sport, tris, mapScene, sampleGround);
    if (fill) cover.add(fill);
  }

  const markPos: number[] = [];
  for (const pitch of data.pitches ?? []) {
    if (pitch.sport === "playground" || !pitch.r || pitch.r.length < 4) continue;
    const mesh = markMesh(pitch.r, mapScene, sampleGround);
    if (!mesh) continue;
    const attr = mesh.geometry.getAttribute("position");
    for (let i = 0; i < attr.count; i++) {
      markPos.push(attr.getX(i), attr.getY(i), attr.getZ(i));
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  if (markPos.length >= 9) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(markPos, 3));
    const norms = new Float32Array(markPos.length);
    for (let i = 1; i < norms.length; i += 3) norms[i] = 1;
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
    const marks = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        color: 0xe8e8e0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -64,
        polygonOffsetUnits: -64,
      }),
    );
    marks.name = "pitch-marks";
    marks.receiveShadow = false;
    marks.castShadow = false;
    cover.add(marks);
  }

  const proto: Record<LandmarkKind, THREE.Mesh | null> = { tower: null, chimney: null, tank: null, crane: null };
  LANDMARKS.forEach((kind, i) => {
    proto[kind] = firstMesh(gltfs[i].scene);
  });
  const byKind: Record<LandmarkKind, LandmarkKit[]> = { tower: [], chimney: [], tank: [], crane: [] };
  for (const kit of data.kits ?? []) {
    if (byKind[kit.kind]) byKind[kit.kind].push(kit);
  }
  for (const kind of LANDMARKS) {
    const src = proto[kind];
    if (!src) continue;
    const mesh = instanceLandmarks(kind, src, byKind[kind], mapScene, sampleGround, labels);
    if (mesh) group.add(mesh);
  }
  mapScene.add(group);
  return group;
}
