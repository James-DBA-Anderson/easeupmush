import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { treeSpots } from "../world/trees";

const COATS = [0x2f4f7f, 0xd8452f, 0x3f6b4a, 0x2b2b33, 0xe0b83c];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const EGGING_ON = [
  "GO ON, SNAP IT!",
  "SWING ON IT!",
  "IT'S NEARLY OFF",
  "GET UP THERE",
  "HARDER!",
  "SWEET AS NUT!",
];
const CAUGHT = [
  "IT WASN'T ME",
  "ALRIGHT, ALRIGHT!",
  "RUN!",
  "WE WEREN'T DOING NOTHING",
  "MY MUM KNOWS YOU",
  "DON'T LAY US OUT, MUSH",
];

/** How long they'll work at a branch before it goes, and the run-off after. */
const SWING_TIME = 26;
const LEG_IT = 6;
/** How near you have to get before they think better of it. */
const CHASE_OFF = 7;

/**
 * A pair of kids hanging off a low branch, trying to get it down. Walk over
 * and they scarper; leave them and the branch comes off and lies there.
 */
export class BranchKid {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private kids: THREE.Group[] = [];
  private branch: THREE.Mesh;
  private tree: THREE.Vector2;

  private swing = 0;
  private effort = 0;
  private fleeing = 0;
  private snapped = false;
  private grumble: Grumble | null = null;
  private cheer = 4 + Math.random() * 6;
  /** Set when the branch comes down, for the game to log it once. */
  private damage = false;
  private arriving = true;
  private hangAt = new THREE.Vector3();

  constructor(scene: THREE.Scene, tree?: THREE.Vector2) {
    this.scene = scene;

    const trees = treeSpots();
    this.tree =
      tree ??
      trees[Math.floor(Math.random() * trees.length)] ??
      new THREE.Vector2();

    this.group = new THREE.Group();
    // Stood just off the trunk, on the side the branch reaches out over.
    const angle = Math.random() * Math.PI * 2;
    this.hangAt.set(
      this.tree.x + Math.cos(angle) * 1.8,
      0,
      this.tree.y + Math.sin(angle) * 1.8,
    );
    // Start a way off and walk over — never just hanging there.
    this.group.position.set(
      this.hangAt.x + Math.cos(angle) * 16,
      0,
      this.hangAt.z + Math.sin(angle) * 16,
    );
    this.group.rotation.y = -angle;

    // The branch itself, hinged at the trunk end so it can be hauled down.
    this.branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.11, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 }),
    );
    this.branch.geometry.translate(0, -1.7, 0);
    this.branch.rotation.z = Math.PI / 2;
    this.branch.position.set(-1.7, 2.6, 0);
    this.branch.castShadow = true;
    this.branch.visible = false;
    this.group.add(this.branch);

    for (const side of [-0.45, 0.45]) this.kids.push(this.buildKid(side));

    scene.add(this.group);
  }

  private buildKid(offset: number): THREE.Group {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });

    const kid = new THREE.Group();
    kid.position.set(offset, 0, 0);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.2), coat);
    torso.position.y = 0.85;
    torso.castShadow = true;
    kid.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.y = 1.2;
    head.castShadow = true;
    kid.add(head);

    for (const side of [-1, 1]) {
      // Arms straight up, hanging off the branch.
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.1), coat);
      arm.geometry.translate(0, 0.21, 0);
      arm.position.set(side * 0.2, 1.02, 0);
      kid.add(arm);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.13), coat);
      leg.geometry.translate(0, -0.26, 0);
      leg.position.set(side * 0.09, 0.62, 0);
      kid.add(leg);
    }

    this.group.add(kid);
    return kid;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Which tree they're wrecking, for the message that goes out. */
  public getTree(): THREE.Vector2 {
    return this.tree.clone();
  }

  public isGone(): boolean {
    return this.fleeing < 0;
  }

  /** True once, when the branch actually comes off. */
  public claimDamage(): boolean {
    if (!this.damage) return false;
    this.damage = false;
    return true;
  }

  /** Hosed, or somebody official has walked over. Off they go. */
  public scarper(): void {
    if (this.fleeing > 0) return;
    this.fleeing = LEG_IT;
    this.say(CAUGHT);
  }

  private say(lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.group.position,
    );
  }

  public update(delta: number, player: THREE.Vector3): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.arriving) {
      const gap = this.amble(this.hangAt, delta, 2.2);
      if (gap < 0.4) {
        this.arriving = false;
        this.group.position.copy(this.hangAt);
        this.branch.visible = true;
        // Arms up once they're under it.
        for (const kid of this.kids) {
          kid.children[2]!.rotation.x = Math.PI * 0.9;
          kid.children[4]!.rotation.x = Math.PI * 0.9;
        }
      }
      return;
    }

    if (this.fleeing > 0) {
      this.runOff(delta);
      return;
    }

    if (this.group.position.distanceTo(player) < CHASE_OFF) {
      this.scarper();
      return;
    }

    this.effort += delta;
    this.swing += delta * 4;
    const heave = Math.abs(Math.sin(this.swing));

    // Both of them hanging and bouncing, the branch bending further each go.
    const bend = (this.effort / SWING_TIME) * 0.5;
    this.branch.rotation.x = -(bend + heave * 0.22);
    for (let i = 0; i < this.kids.length; i++) {
      const kid = this.kids[i]!;
      kid.position.y = 0.35 + heave * 0.25 - bend * 0.6;
    }

    this.cheer -= delta;
    if (this.cheer <= 0) {
      this.cheer = 6 + Math.random() * 8;
      this.say(EGGING_ON);
    }

    if (this.effort >= SWING_TIME && !this.snapped) this.snap();
  }

  /** The branch gives way, dumps them both, and stays down on the grass. */
  private snap(): void {
    this.snapped = true;
    this.damage = true;
    this.branch.rotation.x = 0;
    this.branch.rotation.z = 1.4 + Math.random() * 0.3;
    this.branch.position.set(-2.2, 0.2, (Math.random() - 0.5) * 1.5);
    // The branch stays behind as litter; the pair of them do not.
    this.group.remove(this.branch);
    this.branch.position.add(this.group.position);
    this.branch.rotation.y = this.group.rotation.y;
    this.scene.add(this.branch);
    this.fleeing = LEG_IT;
  }

  /** Walk toward the tree. Returns the gap left. */
  private amble(to: THREE.Vector3, delta: number, speed: number): number {
    const here = this.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    here.x += ((to.x - here.x) / gap) * step;
    here.z += ((to.z - here.z) / gap) * step;
    this.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    this.swing += delta * 12;
    const trot = Math.sin(this.swing);
    for (const kid of this.kids) {
      kid.position.y = Math.abs(trot) * 0.04;
      kid.children[3]!.rotation.x = trot * 0.9;
      kid.children[5]!.rotation.x = -trot * 0.9;
      kid.children[2]!.rotation.x = -trot * 0.5;
      kid.children[4]!.rotation.x = trot * 0.5;
    }
    return gap - step;
  }

  /** Legging it away from the lake, arms going, until they're off the map. */
  private runOff(delta: number): void {
    this.fleeing -= delta;
    const away = new THREE.Vector3(
      this.group.position.x - this.tree.x,
      0,
      this.group.position.z - this.tree.y,
    );
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    this.group.position.addScaledVector(away, delta * 7);
    this.group.rotation.y = Math.atan2(away.x, away.z);

    this.swing += delta * 14;
    const trot = Math.sin(this.swing);
    for (const kid of this.kids) {
      kid.position.y = Math.abs(trot) * 0.05;
      kid.rotation.x = 0;
      // Children go torso, head, then arm and leg for each side.
      kid.children[3]!.rotation.x = trot * 1.1;
      kid.children[5]!.rotation.x = -trot * 1.1;
      kid.children[2]!.rotation.x = Math.PI * 0.9;
      kid.children[4]!.rotation.x = Math.PI * 0.9;
    }

    if (this.fleeing <= 0) this.fleeing = -1;
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }
}
