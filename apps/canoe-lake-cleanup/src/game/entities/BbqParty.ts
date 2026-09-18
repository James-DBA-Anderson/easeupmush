import * as THREE from "three";
import {
  PATH_OUTER,
  SHORE,
  distanceToShore,
  isInLake,
} from "../world/lake";
import { insidePark, parkGates } from "../world/fence";
import { getCarParkOutline } from "../world/buildings";
import { getPlayPark } from "../world/park";
import { stepWalk } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";
import { PATH_Y } from "../world/lake";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44, 0x3a5a6a];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const CHAT = [
  "NICE ONE",
  "PASS US THAT",
  "SMELLS GOOD",
  "WHO WANTS A BURGER?",
  "NEARLY DONE",
  "CRACKING DAY FOR IT",
  "MIND THE SMOKE",
  "ANOTHER SAUSAGE?",
];

const DOUSED = [
  "OI! MY SAUSAGES!",
  "YOU'VE PUT THE BLOODY BBQ OUT!",
  "WHAT ARE YOU PLAYING AT?",
  "THAT'S OUR TEA!",
  "GET OFF OUR GRILL!",
  "I'LL LAY YOU OUT, MUSH!",
  "YOU ABSOLUTE MELT!",
  "LOOK WHAT YOU'VE DONE!",
];

/** True if (x,z) sits on the play-park wood chips. */
function inPlayPark(x: number, z: number): boolean {
  const play = getPlayPark();
  if (!play || play.outline.length < 3) return false;
  return pointInRing(play.outline, x, z);
}

function inCarPark(x: number, z: number): boolean {
  const car = getCarParkOutline();
  if (!car || car.length < 3) return false;
  return pointInRing(car, x, z);
}

function pointInRing(
  ring: ReadonlyArray<{ x: number; z: number }>,
  x: number,
  z: number,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const straddles = a.z > z !== b.z > z;
    if (straddles && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Open grass on the big east lawn — east of the lake path, south of the play
 * park. Built from the live shore / fence / play outline so editor levels stay
 * correct. Shared by BBQs, picnics and gazebos.
 */
export function lawnGatherSpots(): THREE.Vector2[] {
  let lakeEast = -Infinity;
  for (const p of SHORE) lakeEast = Math.max(lakeEast, p.x);

  const play = getPlayPark();
  let playSouth = 18;
  let playEast = lakeEast + PATH_OUTER + 80;
  if (play && play.outline.length >= 3) {
    playSouth = Infinity;
    playEast = -Infinity;
    for (const p of play.outline) {
      playSouth = Math.min(playSouth, p.z);
      playEast = Math.max(playEast, p.x);
    }
  }

  const candidates: THREE.Vector2[] = [];
  const x0 = lakeEast + PATH_OUTER + 5;
  const x1 = Math.max(playEast + 28, lakeEast + PATH_OUTER + 105);
  // Just south of the play chips, stretching toward the sea — not the thin
  // fringe hard against the promenade wall.
  const z1 = playSouth - 6;
  const z0 = z1 - 78;

  for (let x = x0; x <= x1; x += 6) {
    for (let z = z0; z <= z1; z += 6) {
      if (!insidePark(x, z)) continue;
      if (isInLake(x, z)) continue;
      if (distanceToShore(x, z) < PATH_OUTER + 5) continue;
      if (inPlayPark(x, z)) continue;
      if (inCarPark(x, z)) continue;
      // Keep a soft margin inside the fence.
      if (!insidePark(x + 4, z) || !insidePark(x - 4, z)) continue;
      if (!insidePark(x, z + 4) || !insidePark(x, z - 4)) continue;
      candidates.push(new THREE.Vector2(x, z));
    }
  }
  return candidates;
}

/** @deprecated Use {@link lawnGatherSpots}. */
export function bbqSpots(): THREE.Vector2[] {
  return lawnGatherSpots();
}

type Phase = "arriving" | "cooking" | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  stand: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  step: number;
  chatIn: number;
  cook: boolean;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  life: number;
  rise: number;
  drift: number;
  /** White steam off a wet grill, denser and faster than cooking smoke. */
  steam: boolean;
}

/**
 * A disposable barbecue on the east lawn — a few people walk in from a nearby
 * gate, stand round a kettle grill with a bit of smoke, then pack up again.
 */
export class BbqParty {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private grill!: THREE.Group;
  private coals!: THREE.Mesh;
  private guests: Guest[] = [];
  private smoke: SmokePuff[] = [];
  private packUp: number;
  private cooking = false;
  private gone = false;
  private grumble: Grumble | null = null;
  private smokeAcc = 0;
  private spot: THREE.Vector3;
  /** How wet the coals are — water on a hot grill throws steam and cools them. */
  private wet = 0;
  /** Seconds left of fury after the hose hits. */
  private anger = 0;
  private shoutCool = 0;
  private complained = false;
  private foe = new THREE.Vector3();

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    const gy = PATH_Y + groundHeight(at.x, at.y);
    this.spot = new THREE.Vector3(at.x, gy, at.y);
    this.packUp = 200 + Math.random() * 220;

    this.root.position.copy(this.spot);
    this.buildGrill();
    this.root.add(this.grill);
    // Grill's already set up on the grass — folk just walk over to it.
    this.grill.visible = true;
    scene.add(this.root);

    const party = 2 + Math.floor(Math.random() * 3);
    const approach = this.pickApproach();
    const exit = this.pickGate();

    for (let i = 0; i < party; i++) {
      const ang = (i / party) * Math.PI * 2 + Math.random() * 0.4;
      const rad = 1.4 + Math.random() * 0.7;
      const stand = new THREE.Vector3(
        this.spot.x + Math.cos(ang) * rad,
        0,
        this.spot.z + Math.sin(ang) * rad,
      );
      const start = approach
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            0,
            (Math.random() - 0.5) * 5,
          ),
        );
      const leave = exit
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            0,
            (Math.random() - 0.5) * 10,
          ),
        );
      this.guests.push(this.buildGuest(start, stand, leave, i === 0));
    }
  }

  /** Walk in from nearby path / lawn, not a distant park gate. */
  private pickApproach(): THREE.Vector3 {
    const dist = 14 + Math.random() * 12;
    // Prefer coming from the lakeside path (west) onto the east green.
    const yaw = Math.PI * 0.92 + (Math.random() - 0.5) * 0.7;
    return new THREE.Vector3(
      this.spot.x + Math.sin(yaw) * dist,
      0,
      this.spot.z + Math.cos(yaw) * dist,
    );
  }

  /** Nearest park gate, preferring ones south / east of the grill. */
  private pickGate(): THREE.Vector3 {
    const gates = parkGates();
    if (gates.length === 0) {
      return new THREE.Vector3(this.spot.x + 20, 0, this.spot.z - 30);
    }
    let best = gates[0]!;
    let bestScore = Infinity;
    for (const g of gates) {
      const dx = g.x - this.spot.x;
      const dz = g.y - this.spot.z;
      // Prefer closer gates that sit a bit south or further east.
      const score =
        Math.hypot(dx, dz) + (g.y > this.spot.z ? 18 : 0) + (g.x < this.spot.x ? 8 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return new THREE.Vector3(best.x, 0, best.y);
  }

  public getPosition(): THREE.Vector3 {
    return this.spot.clone();
  }

  public isCooking(): boolean {
    return this.cooking;
  }

  /**
   * Grill's set the grass off — they drop everything and clear out toward
   * the promenade without finishing their tea.
   */
  public scarper(): void {
    if (this.guests.every((g) => g.phase === "leaving")) return;
    this.cooking = false;
    this.packUp = 0;
    for (const guest of this.guests) {
      if (guest.phase === "leaving") continue;
      guest.phase = "leaving";
      this.say(guest, [
        "FIRE!",
        "THE GRASS IS ALIGHT!",
        "GET BACK!",
        "SOMEONE CALL THE BRIGADE!",
        "LEAVE IT!",
      ]);
    }
  }

  /** Everyone who's turned up so far — for the minimap crowd. */
  public guestPositions(): THREE.Vector3[] {
    return this.guests.map((g) => g.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  /** Droplet landed on the kettle (or right over the coals). */
  public hitBy(point: THREE.Vector3): boolean {
    if (!this.grill.visible) return false;
    const dx = point.x - this.spot.x;
    const dz = point.z - this.spot.z;
    if (dx * dx + dz * dz > 0.7 * 0.7) return false;
    return point.y > 0.15 && point.y < 1.35;
  }

  /**
   * Water on hot coals — a rush of steam, the fire sulks, and everyone round
   * it loses their temper. Returns true once per party for a complaint.
   */
  public douse(point: THREE.Vector3, from: THREE.Vector3): boolean {
    if (!this.hitBy(point) || !this.cooking) return false;

    this.foe.copy(from);
    this.wet = Math.min(1, this.wet + 0.14);
    this.anger = Math.max(this.anger, 5.5);
    this.steamBurst(point);

    if (this.shoutCool <= 0) {
      this.shoutCool = 1.1;
      const speaker =
        this.guests.find((g) => g.phase === "cooking") ?? this.guests[0];
      if (speaker) this.say(speaker, DOUSED);
    }

    if (this.complained) return false;
    this.complained = true;
    return true;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.spot) === false ? null : this.grumble;
    if (this.anger > 0) this.anger = Math.max(0, this.anger - delta);
    if (this.shoutCool > 0) this.shoutCool = Math.max(0, this.shoutCool - delta);
    if (this.wet > 0) this.wet = Math.max(0, this.wet - delta * 0.04);

    let anyCooking = false;
    let anyHere = false;

    for (const guest of this.guests) {
      guest.face.update(delta);

      if (guest.phase === "arriving") {
        if (this.amble(guest, guest.stand, delta, 1.45) < 0.35) {
          guest.phase = "cooking";
          guest.group.position.x = guest.stand.x;
          guest.group.position.z = guest.stand.z;
          this.faceGrill(guest);
          this.idlePose(guest);
          this.grill.visible = true;
          this.cooking = true;
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "leaving") {
        if (this.amble(guest, guest.exit, delta, 1.55) < 0.5) {
          guest.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      anyCooking = true;

      if (this.anger > 0) {
        this.ragePose(guest, delta);
      } else {
        this.faceGrill(guest);
        this.cookPose(guest, delta);
        guest.chatIn -= delta;
        if (guest.chatIn <= 0) {
          guest.chatIn = 8 + Math.random() * 16;
          if (Math.random() < 0.55) this.say(guest, CHAT);
        }
      }
    }

    if (this.cooking && anyCooking) {
      this.packUp -= delta;
      this.pulseCoals(delta);
      if (this.wet < 0.55) this.emitSmoke(delta);
      if (this.packUp <= 0) this.startLeaving();
    }

    this.updateSmoke(delta);

    if (!anyHere && this.guests.every((g) => g.phase === "leaving" || !g.group.visible)) {
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const puff of this.smoke) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      (puff.mesh.material as THREE.Material).dispose();
    }
    this.smoke = [];
    for (const guest of this.guests) {
      this.scene.remove(guest.group);
    }
    this.scene.remove(this.root);
  }

  private startLeaving(): void {
    this.cooking = false;
    this.grill.visible = false;
    for (const guest of this.guests) {
      if (guest.phase === "leaving") continue;
      guest.phase = "leaving";
    }
  }

  private buildGrill(): void {
    this.grill = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
      color: 0x2a2e32,
      roughness: 0.55,
      metalness: 0.4,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.35,
      metalness: 0.6,
    });

    // Kettle body sat on three stubby legs.
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
    bowl.position.y = 0.42;
    bowl.castShadow = true;
    this.grill.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 16), chrome);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.55;
    this.grill.add(rim);

    // Lid tipped open so you can see the coals.
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), steel);
    lid.position.set(0.15, 0.78, -0.05);
    lid.rotation.z = -0.85;
    lid.castShadow = true;
    this.grill.add(lid);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 10), chrome);
    handle.position.set(0.42, 1.0, -0.05);
    handle.rotation.z = 0.4;
    this.grill.add(handle);

    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.38, 5), steel);
      leg.position.set(Math.cos(ang) * 0.28, 0.19, Math.sin(ang) * 0.28);
      this.grill.add(leg);
    }

    this.coals = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 10),
      new THREE.MeshStandardMaterial({
        color: 0x3a2218,
        emissive: 0xc44818,
        emissiveIntensity: 0.55,
        roughness: 1,
      }),
    );
    this.coals.rotation.x = -Math.PI / 2;
    this.coals.position.y = 0.5;
    this.grill.add(this.coals);

    // A couple of sausages on the grate.
    const meat = new THREE.MeshStandardMaterial({ color: 0x8a4a28, roughness: 0.85 });
    for (const [x, z, yaw] of [
      [-0.08, 0.04, 0.4],
      [0.06, -0.05, -0.5],
      [0.02, 0.1, 1.1],
    ] as const) {
      const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 6), meat);
      sausage.position.set(x, 0.54, z);
      sausage.rotation.set(Math.PI / 2, 0, yaw);
      this.grill.add(sausage);
    }
  }

  private buildGuest(
    start: THREE.Vector3,
    stand: THREE.Vector3,
    exit: THREE.Vector3,
    cook: boolean,
  ): Guest {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });

    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = Math.atan2(stand.x - start.x, stand.z - start.z);
    this.scene.add(group);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = 0.92;
    hips.castShadow = true;
    group.add(hips);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), coat);
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Group();
    head.position.y = 1.68;
    group.add(head);
    const face = new Face(skin);
    head.add(face.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.92, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), legMat);
      thigh.geometry.translate(0, -0.2, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.13), legMat);
      shin.geometry.translate(0, -0.19, 0);
      shin.position.y = -0.4;
      shin.castShadow = true;
      leg.add(shin);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
      );
      shoe.position.set(0, -0.4, 0.03);
      shin.add(shoe);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.26, 1.48, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), coat);
      upper.geometry.translate(0, -0.21, 0);
      upper.castShadow = true;
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      face,
      stand,
      exit,
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      chatIn: 4 + Math.random() * 10,
      cook,
    };
  }

  private amble(
    guest: Guest,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = guest.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      ((to.x - here.x) / gap) * step,
      ((to.z - here.z) / gap) * step,
      0.4,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    guest.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    guest.step += delta * speed * 4.5;
    const swing = Math.sin(guest.step) * 0.55;
    guest.legs[0]!.rotation.x = swing;
    guest.legs[1]!.rotation.x = -swing;
    guest.arms[0]!.rotation.x = -swing * 0.7;
    guest.arms[1]!.rotation.x = swing * 0.7;
    guest.group.position.y =
      this.footY(here.x, here.z) + Math.abs(Math.sin(guest.step)) * 0.04;
    guest.face.setMood("idle");
    return gap - step;
  }

  private faceGrill(guest: Guest): void {
    guest.group.rotation.y = Math.atan2(
      this.spot.x - guest.group.position.x,
      this.spot.z - guest.group.position.z,
    );
  }

  private idlePose(guest: Guest): void {
    guest.legs[0]!.rotation.x = 0.05;
    guest.legs[1]!.rotation.x = -0.05;
    guest.arms[0]!.rotation.x = 0.15;
    guest.arms[1]!.rotation.x = 0.15;
    guest.arms[0]!.rotation.z = 0;
    guest.arms[1]!.rotation.z = 0;
    this.plantFeet(guest);
  }

  private cookPose(guest: Guest, delta: number): void {
    guest.step += delta;
    guest.legs[0]!.rotation.x = 0.08;
    guest.legs[1]!.rotation.x = -0.06;
    guest.arms[0]!.rotation.z = 0;
    guest.arms[1]!.rotation.z = 0;
    this.plantFeet(guest);
    if (guest.cook) {
      // Tong arm hovering over the grate.
      guest.arms[1]!.rotation.x = 0.9 + Math.sin(guest.step * 1.4) * 0.15;
      guest.arms[0]!.rotation.x = 0.25;
      guest.face.setMood("pleased");
    } else {
      guest.arms[0]!.rotation.x = 0.2 + Math.sin(guest.step * 0.7) * 0.05;
      guest.arms[1]!.rotation.x = 0.35;
      guest.face.setMood(Math.sin(guest.step) > 0.7 ? "pleased" : "idle");
    }
  }

  /** Square up at whoever just drowned the sausages. */
  private ragePose(guest: Guest, delta: number): void {
    guest.step += delta * 2.2;
    guest.group.rotation.y = Math.atan2(
      this.foe.x - guest.group.position.x,
      this.foe.z - guest.group.position.z,
    );
    guest.legs[0]!.rotation.x = 0.12;
    guest.legs[1]!.rotation.x = -0.1;
    // Jabbing finger / fist at the hose.
    guest.arms[1]!.rotation.x = -1.15 + Math.sin(guest.step * 3) * 0.2;
    guest.arms[0]!.rotation.x = 0.45;
    guest.arms[0]!.rotation.z = 0.35;
    guest.arms[1]!.rotation.z = -0.2;
    guest.face.setMood("angry");
    guest.group.position.y =
      this.footY(guest.group.position.x, guest.group.position.z) +
      Math.abs(Math.sin(guest.step * 2)) * 0.03;
  }

  private plantFeet(guest: Guest): void {
    guest.group.position.y = this.footY(
      guest.group.position.x,
      guest.group.position.z,
    );
  }

  private footY(x: number, z: number): number {
    return PATH_Y + groundHeight(x, z);
  }

  private pulseCoals(delta: number): void {
    const mat = this.coals.material as THREE.MeshStandardMaterial;
    const glow = (1 - this.wet * 0.9) * (0.4 + Math.sin(performance.now() * 0.004) * 0.25);
    mat.emissiveIntensity = Math.max(0.02, glow);
    void delta;
  }

  /** White cloud boiling off the grate when the lance hits. */
  private steamBurst(at: THREE.Vector3): void {
    const count = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      if (this.smoke.length > 36) break;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe8eef2,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat);
      mesh.position.set(
        at.x + (Math.random() - 0.5) * 0.35,
        Math.max(0.55, at.y) + Math.random() * 0.15,
        at.z + (Math.random() - 0.5) * 0.35,
      );
      this.scene.add(mesh);
      this.smoke.push({
        mesh,
        life: 1.1 + Math.random() * 0.9,
        rise: 1.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 0.5,
        steam: true,
      });
    }
  }

  private emitSmoke(delta: number): void {
    this.smokeAcc += delta;
    while (this.smokeAcc >= 0.12) {
      this.smokeAcc -= 0.12;
      if (this.smoke.length > 28) break;

      const mat = new THREE.MeshBasicMaterial({
        color: 0xa8a098,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), mat);
      mesh.position.set(
        this.spot.x + (Math.random() - 0.5) * 0.3,
        0.72,
        this.spot.z + (Math.random() - 0.5) * 0.3,
      );
      this.scene.add(mesh);
      this.smoke.push({
        mesh,
        life: 3.2 + Math.random() * 2.2,
        rise: 0.85 + Math.random() * 0.55,
        drift: (Math.random() - 0.5) * 0.45,
        steam: false,
      });
    }
  }

  private updateSmoke(delta: number): void {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const puff = this.smoke[i]!;
      puff.life -= delta;
      puff.mesh.position.y += puff.rise * delta;
      puff.mesh.position.x += puff.drift * delta;
      puff.mesh.position.z += puff.drift * 0.35 * delta;
      // Soften and widen as it climbs.
      puff.rise *= 1 - delta * 0.08;
      const age = puff.steam ? 1.4 : 3.6;
      const spent = age - Math.max(0, puff.life);
      const grow = 1 + spent * (puff.steam ? 1.1 : 0.85);
      puff.mesh.scale.setScalar(grow);
      const mat = puff.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(
        0,
        Math.min(0.5, puff.life * (puff.steam ? 0.35 : 0.12)),
      );
      if (puff.life > 0) continue;
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      mat.dispose();
      this.smoke.splice(i, 1);
    }
  }

  private say(guest: Guest, lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      guest.group.position,
    );
  }
}
