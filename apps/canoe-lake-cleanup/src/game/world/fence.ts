import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PATH_SPURS } from "./lake";

/**
 * The Victorian iron railings along the road sides of the park: spear-topped
 * bars on a low stone kerb, running the length of St Helens Parade on the
 * north side and round the eastern boundary, with gate openings where the
 * paths come in off the pavement.
 */

const IRON = new THREE.MeshStandardMaterial({
  color: 0x1b231f,
  roughness: 0.55,
  metalness: 0.35,
});
const KERB = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 1 });

/** Heights and spacings, all in metres and all off the real thing. */
const HEIGHT = 1.35;
const BAR_GAP = 0.13;
const BAR = 0.028;
const POST_GAP = 2.4;
const POST = 0.1;
const RAIL_LOW = 0.28;
const RAIL_HIGH = 1.12;
const KERB_HEIGHT = 0.16;
const KERB_WIDTH = 0.34;
/** Wide enough that a 4m spur of paving clears the posts either side. */
const GATE_WIDTH = 8;

/** A stretch of railing, and the gaps in it. */
interface Run {
  from: THREE.Vector2;
  to: THREE.Vector2;
  /** Gate openings, as a distance along the run and a width. */
  gates?: readonly (readonly [number, number])[];
}

class Ironwork {
  private iron: THREE.BufferGeometry[] = [];
  private stone: THREE.BufferGeometry[] = [];

  /**
   * A box lying along the run: `at` is the distance from the start, `across`
   * the offset sideways, and the size is given as (along, up, across).
   */
  public piece(
    stone: boolean,
    size: [number, number, number],
    at: number,
    y: number,
    origin: THREE.Vector2,
    along: THREE.Vector2,
  ): void {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    // Local +X is the long axis; Three's Y-rotation maps it to (cos θ, 0, −sin θ).
    geometry.rotateY(Math.atan2(-along.y, along.x));
    geometry.translate(origin.x + along.x * at, y, origin.y + along.y * at);
    (stone ? this.stone : this.iron).push(geometry);
  }

  /** The cast spear head on top of every bar. */
  public spear(at: number, origin: THREE.Vector2, along: THREE.Vector2): void {
    const tip = new THREE.ConeGeometry(0.045, 0.13, 4);
    tip.translate(
      origin.x + along.x * at,
      HEIGHT + 0.065,
      origin.y + along.y * at,
    );
    this.iron.push(tip);
  }

  public build(scene: THREE.Scene): void {
    for (const [pile, material] of [
      [this.iron, IRON],
      [this.stone, KERB],
    ] as const) {
      const merged = mergeGeometries(pile, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

/** True if this point along the run falls in a gateway. */
function inGate(at: number, gates: Run["gates"]): boolean {
  if (!gates) return false;
  return gates.some(([start, width]) => at > start && at < start + width);
}

function railing(work: Ironwork, run: Run): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  const along = span.clone().normalize();
  const { from, gates } = run;

  // The kerb runs under the lot, broken only by the gateways.
  let kerbStart = 0;
  for (let at = 0; at <= length; at += 0.5) {
    const open = inGate(at, gates);
    const end = at >= length;
    if (!open && !end) continue;
    if (at - kerbStart > 0.5) {
      const width = at - kerbStart;
      work.piece(
        true,
        [width, KERB_HEIGHT, KERB_WIDTH],
        kerbStart + width / 2,
        KERB_HEIGHT / 2,
        from,
        along,
      );
    }
    // Skip to the far side of the opening.
    while (inGate(at, gates)) at += 0.5;
    kerbStart = at;
  }

  // Posts, with an extra one either side of each gateway.
  for (let at = 0; at <= length + 0.01; at += POST_GAP) {
    if (inGate(at, gates)) continue;
    work.piece(
      false,
      [POST, HEIGHT + 0.14, POST],
      at,
      (HEIGHT + 0.14) / 2,
      from,
      along,
    );
    work.piece(
      false,
      [POST + 0.06, 0.06, POST + 0.06],
      at,
      HEIGHT + 0.2,
      from,
      along,
    );
  }
  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      work.piece(
        false,
        [POST + 0.04, HEIGHT + 0.3, POST + 0.04],
        at,
        (HEIGHT + 0.3) / 2,
        from,
        along,
      );
      work.piece(
        false,
        [POST + 0.1, 0.08, POST + 0.1],
        at,
        HEIGHT + 0.34,
        from,
        along,
      );
    }
  }

  // Two horizontal rails and the bars between them.
  let bayStart = 0;
  for (let at = 0; at <= length; at += 0.5) {
    const open = inGate(at, gates);
    const end = at >= length;
    if (!open && !end) continue;
    const width = at - bayStart;
    if (width > 0.5) {
      for (const y of [RAIL_LOW, RAIL_HIGH]) {
        work.piece(
          false,
          [width, 0.05, 0.055],
          bayStart + width / 2,
          y,
          from,
          along,
        );
      }
      for (
        let bar = bayStart + BAR_GAP;
        bar < at - BAR_GAP / 2;
        bar += BAR_GAP
      ) {
        work.piece(
          false,
          [BAR, HEIGHT, BAR],
          bar,
          HEIGHT / 2 + KERB_HEIGHT * 0.5,
          from,
          along,
        );
        work.spear(bar, from, along);
      }
    }
    while (inGate(at, gates)) at += 0.5;
    bayStart = at;
  }
}

/**
 * Railings down the east side and along the north, meeting at the corner.
 * The park is open to the promenade on the south. Gate openings are worked
 * out from where the path spurs hit the railings, so the ironwork never
 * runs across the paving.
 */
const RUNS: readonly Run[] = (() => {
  // Railings sit well back from the water so the park reads at the real
  // Canoe Lake Gardens footprint — grass, play park and all — not just a
  // thin strip round the lake.
  const northFrom = new THREE.Vector2(-185, 118);
  const northTo = new THREE.Vector2(190, 118);
  const eastFrom = new THREE.Vector2(190, 118);
  const eastTo = new THREE.Vector2(190, -78);

  const gatesOn = (from: THREE.Vector2, to: THREE.Vector2): [number, number][] => {
    const span = new THREE.Vector2().subVectors(to, from);
    const length = span.length();
    const along = span.clone().normalize();
    // Outward normal of the run — away from the lake, so a spur hitting the
    // railing from inside the park has a positive dot with it.
    const outward = new THREE.Vector2(along.y, -along.x);
    if (outward.dot(from) < 0) outward.negate();

    const gates: [number, number][] = [];
    for (const [dx, dz] of PATH_SPURS) {
      const dir = new THREE.Vector2(dx, dz).normalize();
      // Spur p = t * dir meets the run from + s * along.
      const det = along.x * dir.y - dir.x * along.y;
      if (Math.abs(det) < 1e-6) continue;
      const t = (along.x * from.y - from.x * along.y) / det;
      const s = (dir.x * from.y - from.x * dir.y) / det;
      // Only a hit going out from the lake onto this stretch of railing.
      if (t < 10 || s < GATE_WIDTH / 2 || s > length - GATE_WIDTH / 2) continue;
      if (dir.dot(outward) < 0.2) continue;
      gates.push([s - GATE_WIDTH / 2, GATE_WIDTH]);
    }

    // Extra pedestrian openings that aren't on a spur, so the railings
    // aren't a solid wall with only the path ways in.
    if (Math.abs(from.y - to.y) < 0.1) {
      gates.push([54, 5], [length - 54 - 5, 5]);
    } else {
      gates.push([length * 0.72, 5]);
    }

    // Merge any that landed on top of each other.
    gates.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const gate of gates) {
      const last = merged[merged.length - 1];
      if (last && gate[0] < last[0] + last[1] + 2) {
        const end = Math.max(last[0] + last[1], gate[0] + gate[1]);
        last[1] = end - last[0];
      } else {
        merged.push([gate[0], gate[1]]);
      }
    }
    return merged;
  };

  return [
    { from: northFrom, to: northTo, gates: gatesOn(northFrom, northTo) },
    { from: eastFrom, to: eastTo, gates: gatesOn(eastFrom, eastTo) },
  ];
})();

export function buildFencing(scene: THREE.Scene): void {
  const work = new Ironwork();
  for (const run of RUNS) railing(work, run);
  work.build(scene);
}

/**
 * Midpoints of every gateway, plus a couple of open spots on the promenade
 * side. People and animals come in and leave by these, rather than
 * materialising on the path.
 */
export function parkGates(): THREE.Vector2[] {
  const gates: THREE.Vector2[] = [];
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const along = span.clone().normalize();
    for (const [start, width] of run.gates ?? []) {
      const at = start + width / 2;
      gates.push(
        new THREE.Vector2(
          run.from.x + along.x * at,
          run.from.y + along.y * at,
        ),
      );
    }
  }
  // The south side is open to the seafront — no railings to come through.
  gates.push(new THREE.Vector2(-50, -95), new THREE.Vector2(50, -95));
  return gates;
}

/** Solid ironwork underfoot — everywhere but the gateways. */
export function atRailings(x: number, z: number): boolean {
  const here = new THREE.Vector2(x, z);
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const length = span.length();
    const along = span.clone().normalize();
    const offset = new THREE.Vector2().subVectors(here, run.from);
    const at = offset.dot(along);
    if (at < 0 || at > length) continue;
    if (Math.abs(offset.x * along.y - offset.y * along.x) > 0.45) continue;
    if (!inGate(at, run.gates)) return true;
  }
  return false;
}
