import * as THREE from "three";
import {
  getRoadGraph,
  ROAD_WIDTH,
  type RoadGraph,
  type RoadLink,
} from "../world/buildings";
import { groundHeight } from "../world/terrain";
import {
  assembleStreetCar,
  pickStreetCarKind,
  streetCarPaint,
  type CarPart,
  type CarSink,
} from "../world/streetCar";

function matt(
  color: number,
  roughness: number,
  metalness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function glow(
  color: number,
  emissive: number,
  emissiveIntensity: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    emissive,
    emissiveIntensity,
  });
}

const CRUISE_LOW = 9;
const CRUISE_HIGH = 14;
/** Chance to peel onto a linked road when one is available mid-run. */
const TURN_CHANCE = 0.38;
/** How long a dead-end fade lasts. */
const FADE_FOR = 1.4;
/** UK left-hand lane offset from the centre line. */
const LANE = ROAD_WIDTH * 0.22;

/**
 * A car on the parade roads. Some run the line past the park; others turn
 * onto linked roads at junctions. Dead ends just fade them out.
 */

let nextTrafficId = 1;

export class TrafficCar {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private graph: RoadGraph;
  private materials: THREE.MeshStandardMaterial[] = [];

  private road: number;
  private index: number;
  private dir: 1 | -1;
  private progress = 0;
  private speed: number;
  private heading = 0;
  private fade = 0;
  private fading = false;
  private gone = false;
  private bob = Math.random() * Math.PI * 2;
  private wheels: THREE.Object3D[] = [];
  private wheelR = 0.33;

  public readonly id = nextTrafficId++;
  /** Odd one blasting the stereo with the windows down. */
  public readonly playingMusic = Math.random() < 0.18;

  constructor(scene: THREE.Scene, graph: RoadGraph, road: number, fromEnd: boolean) {
    this.scene = scene;
    this.graph = graph;
    this.road = road;
    const pts = graph.roads[road]!;
    if (fromEnd) {
      this.index = pts.length - 1;
      this.dir = -1;
    } else {
      this.index = 0;
      this.dir = 1;
    }
    this.speed = CRUISE_LOW + Math.random() * (CRUISE_HIGH - CRUISE_LOW);
    this.group = this.build();
    this.place(1);
    scene.add(this.group);
  }

  /** Spawn on a random road end, aimed into the network. */
  public static spawn(scene: THREE.Scene): TrafficCar | null {
    const graph = getRoadGraph();
    if (!graph || graph.roads.length === 0) return null;
    const usable = graph.roads
      .map((pts, i) => ({ i, pts }))
      .filter(({ pts }) => pts.length >= 2);
    if (usable.length === 0) return null;
    const pick = usable[Math.floor(Math.random() * usable.length)]!;
    return new TrafficCar(scene, graph, pick.i, Math.random() < 0.5);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public getSpeed(): number {
    return this.fading || this.gone ? 0 : this.speed;
  }

  /** Still on the road and not mid-fade — drives pass-by audio. */
  public isDriving(): boolean {
    return !this.gone && !this.fading;
  }

  public isGone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    if (this.gone) return;

    if (this.fading) {
      this.fade += delta / FADE_FOR;
      const a = Math.max(0, 1 - this.fade);
      for (const mat of this.materials) {
        mat.opacity = a;
        mat.transparent = true;
        mat.depthWrite = a > 0.2;
      }
      this.group.position.y = -this.fade * 0.4;
      if (this.fade >= 1) this.gone = true;
      return;
    }

    const pts = this.graph.roads[this.road]!;
    const next = this.index + this.dir;
    if (next < 0 || next >= pts.length) {
      this.arriveAtNode();
      return;
    }

    const a = pts[this.index]!;
    const b = pts[next]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    this.progress += (this.speed * delta) / len;
    if (this.progress >= 1) {
      this.progress = 0;
      this.index = next;
      this.arriveAtNode();
      return;
    }
    this.place(this.progress);
    const spin = (this.speed * delta) / Math.max(0.2, this.wheelR);
    for (const wheel of this.wheels) wheel.rotation.z -= spin;
  }

  /** Reached a vertex — continue, turn onto a link, or fade at a dead end. */
  private arriveAtNode(): void {
    const pts = this.graph.roads[this.road]!;
    const onward = this.index + this.dir;
    const canContinue = onward >= 0 && onward < pts.length;
    const links = this.graph.linksAt(this.road, this.index);

    type Option = { road: number; index: number; dir: 1 | -1 };
    const options: Option[] = [];

    if (canContinue) {
      options.push({ road: this.road, index: this.index, dir: this.dir });
    }

    const here = pts[this.index]!;
    const cameFrom = pts[this.index - this.dir];
    const inbound = cameFrom
      ? Math.atan2(here.x - cameFrom.x, here.z - cameFrom.z)
      : this.heading;

    for (const link of links) {
      const choice = this.departure(link, inbound);
      if (!choice) continue;
      // Don't U-turn straight back onto the same road we just left.
      if (choice.road === this.road && choice.dir === -this.dir) continue;
      options.push(choice);
    }

    if (options.length === 0) {
      this.fading = true;
      return;
    }

    // Mid-run: usually keep going; at the tip of a road, must pick a link.
    let pick: Option;
    if (canContinue && Math.random() > TURN_CHANCE) {
      pick = options[0]!;
    } else {
      pick = options[Math.floor(Math.random() * options.length)]!;
    }

    this.road = pick.road;
    this.index = pick.index;
    this.dir = pick.dir;
    this.progress = 0;

    // If the new road has no next vertex that way, fade.
    const nPts = this.graph.roads[this.road]!;
    const nNext = this.index + this.dir;
    if (nNext < 0 || nNext >= nPts.length) {
      this.fading = true;
      return;
    }
    this.place(0);
  }

  /**
   * Pick a travel direction on the linked road that leaves the junction
   * roughly continuing the inbound heading (not back into the join).
   */
  private departure(
    link: RoadLink,
    inbound: number,
  ): { road: number; index: number; dir: 1 | -1 } | null {
    const pts = this.graph.roads[link.road]!;
    if (pts.length < 2) return null;
    const at = pts[link.index]!;

    const candidates: { dir: 1 | -1; score: number }[] = [];
    for (const dir of [1, -1] as const) {
      const nxt = link.index + dir;
      if (nxt < 0 || nxt >= pts.length) continue;
      const to = pts[nxt]!;
      const heading = Math.atan2(to.x - at.x, to.z - at.z);
      let turn = heading - inbound;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      // Prefer small turns; reject hard reverses.
      if (Math.abs(turn) > 2.4) continue;
      candidates.push({ dir, score: Math.abs(turn) });
    }
    if (candidates.length === 0) {
      // Dead stub — still allow leaving either way if a neighbour exists.
      if (link.index + 1 < pts.length)
        return { road: link.road, index: link.index, dir: 1 };
      if (link.index - 1 >= 0)
        return { road: link.road, index: link.index, dir: -1 };
      return null;
    }
    candidates.sort((a, b) => a.score - b.score);
    // Usually take the gentlest exit; sometimes take the other.
    const choice =
      candidates.length > 1 && Math.random() < 0.28
        ? candidates[1]!
        : candidates[0]!;
    return { road: link.road, index: link.index, dir: choice.dir };
  }

  private place(t: number): void {
    const pts = this.graph.roads[this.road]!;
    const next = this.index + this.dir;
    const a = pts[this.index]!;
    const b = pts[next] ?? a;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const fx = b.x - a.x;
    const fz = b.z - a.z;
    const len = Math.hypot(fx, fz) || 1;
    const ux = fx / len;
    const uz = fz / len;
    // Left of travel (UK).
    const lx = -uz;
    const lz = ux;
    this.heading = Math.atan2(ux, uz);
    this.bob += 0.02;
    const px = x + lx * LANE;
    const pz = z + lz * LANE;
    this.group.position.set(
      px,
      groundHeight(px, pz) + Math.sin(this.bob) * 0.015,
      pz,
    );
    // Mesh nose is local +X — yaw so +X follows travel.
    this.group.rotation.y = Math.atan2(-uz, ux);
  }

  private build(): THREE.Group {
    const group = new THREE.Group();
    const kind = pickStreetCarKind(Math.random);
    const paintCol = streetCarPaint(kind, Math.random);
    const kit: Record<CarPart, THREE.MeshStandardMaterial> = {
      paint: matt(paintCol, 0.42, 0.28),
      glass: matt(0x2b3742, 0.35, 0.2),
      bumper: matt(0x1a1a1c, 0.7, 0),
      tyre: matt(0x0e0e10, 1, 0),
      hub: matt(0xb0b4b8, 0.45, 0.55),
      lightFront: glow(0xf2f0e4, 0x2a2818, 0.35),
      lightRear: glow(0xa81818, 0x3a0808, 0.4),
      amber: glow(0xf0a020, 0x402008, 0.3),
      plateFront: matt(0xf4f1ea, 0.7, 0),
      plateRear: matt(0xf0cc3a, 0.7, 0),
      chrome: matt(0xc8ccd0, 0.28, 0.75),
      trim: matt(0x1c1c1e, 0.65, 0),
      sign: glow(0xf0c12a, 0x403008, 0.25),
    };
    this.materials.push(...Object.values(kit));

    const sink: CarSink = {
      box: (part, size, at) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size[0], size[1], size[2]),
          kit[part],
        );
        mesh.position.set(at[0], at[1], at[2]);
        mesh.castShadow = true;
        group.add(mesh);
      },
      wheel: (x, y, z, radius, thick) => {
        const hub = new THREE.Group();
        hub.position.set(x, y, z);
        const tyre = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, thick, 9),
          kit.tyre,
        );
        tyre.rotation.x = Math.PI / 2;
        hub.add(tyre);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, thick + 0.02, 7),
          kit.hub,
        );
        cap.rotation.x = Math.PI / 2;
        hub.add(cap);
        group.add(hub);
        this.wheels.push(hub);
      },
    };

    const size = assembleStreetCar(sink, kind, Math.random);
    this.wheelR = size.wheelR;
    return group;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const mat of this.materials) mat.dispose();
  }
}
