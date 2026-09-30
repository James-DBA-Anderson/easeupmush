import * as THREE from "three";
import type { FairyLightColor, FairyLightRun, XZ } from "../../level/types";
import { groundHeight } from "./terrain";

/** 12 ft poles. */
export const FAIRY_POLE_H = 12 * 0.3048;
/** Sag never drops more than 20% below the pole top. */
export const FAIRY_MAX_SAG_FRAC = 0.2;

let runs: FairyLightRun[] = [];

export function applyFairyLightRuns(next: FairyLightRun[]): void {
  runs = next.map((r) => ({
    color: r.color,
    points: r.points.map((p) => [p[0], p[1]] as XZ),
  }));
}

const POLE = new THREE.MeshStandardMaterial({
  color: 0x3a3e42,
  roughness: 0.75,
  metalness: 0.35,
});
const WIRE = new THREE.MeshStandardMaterial({
  color: 0x2a2a2e,
  roughness: 0.9,
  metalness: 0.2,
});

/** Unlit glass by day; emissive punches on after dark. */
const BULB_RED = new THREE.MeshStandardMaterial({
  color: 0x3a1818,
  emissive: 0xff1a28,
  emissiveIntensity: 0,
  roughness: 0.35,
  metalness: 0.05,
});
const BULB_BLUE = new THREE.MeshStandardMaterial({
  color: 0x141828,
  emissive: 0x1a5cff,
  emissiveIntensity: 0,
  roughness: 0.35,
  metalness: 0.05,
});

/**
 * Soft radial falloff for sprite halos — bright core, smooth fade to nothing.
 */
function glowTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.12, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(0.65, `rgba(${r},${g},${b},0.1)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GLOW_TEX_RED = glowTexture(255, 48, 64);
const GLOW_TEX_BLUE = glowTexture(64, 120, 255);

const GLOW_RED = new THREE.SpriteMaterial({
  map: GLOW_TEX_RED,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  opacity: 0,
  toneMapped: false,
});
const GLOW_BLUE = new THREE.SpriteMaterial({
  map: GLOW_TEX_BLUE,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  opacity: 0,
  toneMapped: false,
});

const glowSprites: THREE.Sprite[] = [];
/** Wire spots birds can sit on — filled when the strings are built. */
const perches: THREE.Vector3[] = [];
/** Perches grouped by pole-to-pole span (one “section” of lights). */
const sections: THREE.Vector3[][] = [];

/** Perches along the fairy-light wires (world space). */
export function fairyLightPerches(): readonly THREE.Vector3[] {
  return perches;
}

/** Each pole-to-pole wire as its own perch list. */
export function fairyLightSections(): readonly (readonly THREE.Vector3[])[] {
  return sections;
}

/**
 * `amount` 0 = day (bulbs off), 1 = deep night (bright strings).
 * Same night curve as window lights — stays fully dark until evening.
 */
export function lightFairyBulbs(amount: number): void {
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  // Ignore the first bit of dusk so midday / afternoon stays dark.
  const lit = a <= 0.08 ? 0 : THREE.MathUtils.smoothstep(a, 0.08, 1);
  const on = lit > 0.02;

  BULB_RED.emissiveIntensity = lit * 5.2;
  BULB_BLUE.emissiveIntensity = lit * 5.2;
  BULB_RED.color.setHex(on ? 0xff3344 : 0x3a1818);
  BULB_BLUE.color.setHex(on ? 0x4a88ff : 0x141828);

  const halo = lit * 0.95;
  GLOW_RED.opacity = halo;
  GLOW_BLUE.opacity = halo;
  const scale = 0.55 + lit * 0.95;
  for (const sprite of glowSprites) {
    sprite.visible = on;
    sprite.scale.setScalar(scale);
  }
}

function bulbMats(color: FairyLightColor): {
  bulb: THREE.MeshStandardMaterial;
  glow: THREE.SpriteMaterial;
} {
  return color === "red"
    ? { bulb: BULB_RED, glow: GLOW_RED }
    : { bulb: BULB_BLUE, glow: GLOW_BLUE };
}

/**
 * Parabolic sag depth. Scales with span for short runs, capped at 20% of
 * pole height so the wire never hangs more than that below the tops.
 */
function sagAmount(span: number): number {
  return Math.min(FAIRY_POLE_H * FAIRY_MAX_SAG_FRAC, span * 0.1);
}

interface PoleRec {
  group: THREE.Group;
  x: number;
  z: number;
  baseY: number;
  falling: boolean;
  fall: number;
  axis: THREE.Vector3;
}

interface SpanRec {
  a: number;
  b: number;
  tube: THREE.Mesh;
  bits: THREE.Object3D[];
  hinge: THREE.Group | null;
  swinging: boolean;
  fall: number;
  target: number;
  axis: THREE.Vector3;
}

const poles: PoleRec[] = [];
const spanRecs: SpanRec[] = [];
let poleKnocked = false;
let lightScene: THREE.Scene | null = null;

function placePole(scene: THREE.Scene, x: number, z: number, y0: number): number {
  const group = new THREE.Group();
  group.position.set(x, y0, z);
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, FAIRY_POLE_H, 8),
    POLE,
  );
  post.position.y = FAIRY_POLE_H / 2;
  post.castShadow = true;
  group.add(post);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), POLE);
  cap.position.y = FAIRY_POLE_H;
  group.add(cap);
  scene.add(group);
  poles.push({
    group,
    x,
    z,
    baseY: y0,
    falling: false,
    fall: 0,
    axis: new THREE.Vector3(1, 0, 0),
  });
  return poles.length - 1;
}

function placeBulb(
  scene: THREE.Scene,
  at: THREE.Vector3,
  color: FairyLightColor,
  recordPerch: boolean,
  spanPerches?: THREE.Vector3[],
): THREE.Object3D[] {
  const { bulb, glow } = bulbMats(color);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulb);
  glass.position.copy(at);
  scene.add(glass);

  const halo = new THREE.Sprite(glow);
  halo.position.copy(at);
  halo.scale.setScalar(0.55);
  halo.visible = false;
  halo.renderOrder = 2;
  scene.add(halo);
  glowSprites.push(halo);

  if (recordPerch) {
    const perch = at.clone();
    perches.push(perch);
    spanPerches?.push(perch);
  }
  return [glass, halo];
}

function placeSpan(
  scene: THREE.Scene,
  a: XZ,
  b: XZ,
  y0a: number,
  y0b: number,
  startColor: FairyLightColor,
  bulbIndex: { n: number },
  poleA: number,
  poleB: number,
): void {
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (span < 0.4) return;

  const sag = sagAmount(span);
  const samples = Math.max(8, Math.ceil(span / 0.9));
  const ya = y0a + FAIRY_POLE_H;
  const yb = y0b + FAIRY_POLE_H;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    const chord = ya + (yb - ya) * t;
    const y = chord - sag * 4 * t * (1 - t);
    pts.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, samples * 2, 0.012, 5, false),
    WIRE,
  );
  tube.castShadow = false;
  scene.add(tube);
  const bits: THREE.Object3D[] = [];

  // Tighter spacing so pigeons can line up along the string.
  const spacing = Math.max(0.35, span / 28);
  let travelled = 0;
  const spanPerches: THREE.Vector3[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    travelled += prev.distanceTo(cur);
    if (travelled < spacing) continue;
    travelled = 0;
    const alt = (bulbIndex.n + (startColor === "blue" ? 1 : 0)) % 2 === 0;
    // Most bulbs are perch spots so a flock can pack the wire.
    bits.push(
      ...placeBulb(scene, cur, alt ? "red" : "blue", bulbIndex.n % 2 === 0, spanPerches),
    );
    bulbIndex.n += 1;
  }
  if (spanPerches.length > 0) sections.push(spanPerches);
  spanRecs.push({
    a: poleA,
    b: poleB,
    tube,
    bits,
    hinge: null,
    swinging: false,
    fall: 0,
    target: 0,
    axis: new THREE.Vector3(1, 0, 0),
  });
}

function clearLightWreck(): void {
  if (lightScene) {
    for (const pole of poles) lightScene.remove(pole.group);
    for (const span of spanRecs) {
      if (span.hinge) lightScene.remove(span.hinge);
      else {
        lightScene.remove(span.tube);
        for (const bit of span.bits) lightScene.remove(bit);
      }
    }
  }
  poles.length = 0;
  spanRecs.length = 0;
  poleKnocked = false;
}

/** Poles at each node; sagging fairy-light wires between them. */
export function buildFairyLights(scene: THREE.Scene): void {
  clearLightWreck();
  lightScene = scene;
  glowSprites.length = 0;
  perches.length = 0;
  sections.length = 0;
  for (const run of runs) {
    if (run.points.length < 1) continue;
    const footing = run.points.map(([x, z]) => groundHeight(x, z));
    const first = poles.length;
    for (let i = 0; i < run.points.length; i++) {
      const p = run.points[i]!;
      placePole(scene, p[0], p[1], footing[i]!);
    }
    const bulbIndex = { n: 0 };
    for (let i = 0; i < run.points.length - 1; i++) {
      placeSpan(
        scene,
        run.points[i]!,
        run.points[i + 1]!,
        footing[i]!,
        footing[i + 1]!,
        run.color,
        bulbIndex,
        first + i,
        first + i + 1,
      );
    }
  }
  // Start unlit until the day-cycle / walk time slider drives them.
  lightFairyBulbs(0);
}

function pointSegDist(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 < 1e-6
      ? 0
      : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / len2));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

function hingeSpan(span: SpanRec, stand: PoleRec, falling: PoleRec): void {
  if (!lightScene || span.hinge) return;
  const pivot = new THREE.Vector3(stand.x, stand.baseY + FAIRY_POLE_H, stand.z);
  const toward = new THREE.Vector3(falling.x - stand.x, 0, falling.z - stand.z);
  const spanLen = Math.max(0.5, toward.length());
  toward.multiplyScalar(1 / spanLen);
  const axis = new THREE.Vector3(-toward.z, 0, toward.x);
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  axis.normalize();

  const hinge = new THREE.Group();
  hinge.position.copy(pivot);
  lightScene.add(hinge);

  lightScene.remove(span.tube);
  span.tube.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
  hinge.add(span.tube);
  for (const bit of span.bits) {
    lightScene.remove(bit);
    bit.position.sub(pivot);
    hinge.add(bit);
  }

  span.hinge = hinge;
  span.axis = axis;
  span.target = -Math.atan2(FAIRY_POLE_H * 0.92, spanLen);
  span.swinging = true;
}

/**
 * The first pole the wreck actually reaches goes over, and the strings
 * either side of it swing down from the poles that are still standing.
 */
export function knockFairyPoleAlong(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  vx: number,
  vz: number,
): void {
  if (poleKnocked || poles.length === 0) return;
  let best = -1;
  let bestD = 3.1;
  for (let i = 0; i < poles.length; i++) {
    const d = pointSegDist(poles[i]!.x, poles[i]!.z, x0, z0, x1, z1);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return;
  poleKnocked = true;
  const pole = poles[best]!;
  const dir = new THREE.Vector3(vx, 0, vz);
  if (dir.lengthSq() < 1e-4) dir.set(x1 - x0, 0, z1 - z0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  pole.axis.set(-dir.z, 0, dir.x).normalize();
  pole.falling = true;
  for (const span of spanRecs) {
    if (span.a !== best && span.b !== best) continue;
    const stand = poles[span.a === best ? span.b : span.a];
    const hit = poles[best];
    if (stand && hit) hingeSpan(span, stand, hit);
  }
}

export function updateFairyWreck(delta: number): void {
  for (const pole of poles) {
    if (!pole.falling || pole.fall >= 1) continue;
    pole.fall = Math.min(1, pole.fall + delta * 0.85);
    pole.group.quaternion.setFromAxisAngle(pole.axis, -pole.fall * Math.PI * 0.5);
  }
  for (const span of spanRecs) {
    if (!span.swinging || !span.hinge || span.fall >= 1) continue;
    span.fall = Math.min(1, span.fall + delta * 0.7);
    span.hinge.quaternion.setFromAxisAngle(span.axis, span.target * span.fall);
  }
}
