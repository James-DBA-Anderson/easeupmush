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

function placePole(scene: THREE.Scene, x: number, z: number, y0: number): void {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, FAIRY_POLE_H, 8),
    POLE,
  );
  post.position.set(x, y0 + FAIRY_POLE_H / 2, z);
  post.castShadow = true;
  scene.add(post);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), POLE);
  cap.position.set(x, y0 + FAIRY_POLE_H, z);
  scene.add(cap);
}

function placeBulb(
  scene: THREE.Scene,
  at: THREE.Vector3,
  color: FairyLightColor,
  recordPerch: boolean,
  spanPerches?: THREE.Vector3[],
): void {
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
}

function placeSpan(
  scene: THREE.Scene,
  a: XZ,
  b: XZ,
  y0a: number,
  y0b: number,
  startColor: FairyLightColor,
  bulbIndex: { n: number },
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
  tube.castShadow = true;
  scene.add(tube);

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
    placeBulb(scene, cur, alt ? "red" : "blue", bulbIndex.n % 2 === 0, spanPerches);
    bulbIndex.n += 1;
  }
  if (spanPerches.length > 0) sections.push(spanPerches);
}

/** Poles at each node; sagging fairy-light wires between them. */
export function buildFairyLights(scene: THREE.Scene): void {
  glowSprites.length = 0;
  perches.length = 0;
  sections.length = 0;
  for (const run of runs) {
    if (run.points.length < 1) continue;
    const footing = run.points.map(([x, z]) => groundHeight(x, z));
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
      );
    }
  }
  // Start unlit until the day-cycle / walk time slider drives them.
  lightFairyBulbs(0);
}
