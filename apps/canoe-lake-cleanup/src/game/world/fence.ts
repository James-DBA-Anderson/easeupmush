import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
    geometry.rotateY(Math.atan2(along.x, along.y));
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
 * The park is open to the promenade on the south.
 */
const RUNS: readonly Run[] = [
  {
    from: new THREE.Vector2(-148, 82),
    to: new THREE.Vector2(146, 82),
    gates: [
      [64, 4],
      [148, 6],
      [232, 4],
    ],
  },
  {
    from: new THREE.Vector2(146, 82),
    to: new THREE.Vector2(146, -58),
    gates: [
      [46, 4],
      [104, 6],
    ],
  },
];

export function buildFencing(scene: THREE.Scene): void {
  const work = new Ironwork();
  for (const run of RUNS) railing(work, run);
  work.build(scene);
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
