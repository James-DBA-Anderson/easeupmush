import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { MuckFlecks } from "../effects/MuckFlecks";

const COATS = [0x1a2a1a, 0x2a3a28, 0x1e2a22, 0x243028, 0x2f2a1a];
const TROUSERS = [0x1a1a1c, 0x222428, 0x2a2a22];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const MASK = [0x1a1a1a, 0x2a2a2a, 0x1e2418];

const CHARGE = [
  "GOSPORT FREE STATE!",
  "CANOE LAKE IS OURS!",
  "DOWN WITH THE DEPOT!",
  "FOR THE HARBOUR!",
  "NO MORE POMPEY RULE!",
  "TAKE THE PARK!",
];
const HIT = [
  "ARGH — THE LANCE!",
  "THEY'VE GOT A WASHER!",
  "FALL BACK!",
  "I'M SOAKED!",
  "THAT BATTERY'S LIVE!",
];
const FLEE = [
  "RETREAT!",
  "BACK TO THE BEACH!",
  "THEY'RE TOO STRONG!",
  "GOSPORT WITHDRAWS!",
];

/** How hard the hose has to hit before they scarper. */
const HOSE_TO_BREAK = 5;
const SWING_RANGE = 2.6;
const CHARGE_SPEED = 3.8;

type Mode = "charge" | "fight" | "flee" | "down";

interface Fighter {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  flecks: MuckFlecks;
  mode: Mode;
  step: number;
  hoseHits: number;
  swingIn: number;
  swingReady: boolean;
  shoutIn: number;
  wet: number;
}

/**
 * Gosport separatist rebels coming over the esplanade from Southsea Beach
 * to seize Canoe Lake. Hose them until they break and run back to the sea.
 */
export class RebelRaid {
  private scene: THREE.Scene;
  private fighters: Fighter[] = [];
  private grumble: Grumble | null = null;
  private wave = 0;
  private waves = 3;
  private spawnIn: number;
  private spawnX: number;
  private spawnZ: number;
  private cleared = false;
  private gone = false;

  constructor(
    scene: THREE.Scene,
    firstWaveIn = 12,
    spawnAt: { x: number; z: number } = { x: 10, z: -150 },
  ) {
    this.scene = scene;
    this.spawnIn = firstWaveIn;
    this.spawnX = spawnAt.x;
    this.spawnZ = spawnAt.z;
  }

  public getPositions(): THREE.Vector3[] {
    return this.fighters
      .filter((f) => f.mode !== "down" && f.group.visible)
      .map((f) => f.group.position.clone());
  }

  public isActive(): boolean {
    return !this.cleared && !this.gone;
  }

  public isCleared(): boolean {
    return this.cleared;
  }

  public isGone(): boolean {
    return this.gone;
  }

  /** True once when a fighter lands a dig. */
  public claimSwing(): THREE.Vector3 | null {
    for (const fighter of this.fighters) {
      if (!fighter.swingReady) continue;
      fighter.swingReady = false;
      fighter.swingIn = 1.4;
      return fighter.group.position.clone();
    }
    return null;
  }

  /** Jet hit — stagger them; enough hits and they break for the beach. */
  public takeWater(point: THREE.Vector3): boolean {
    for (const fighter of this.fighters) {
      if (fighter.mode === "flee" || fighter.mode === "down") continue;
      if (!this.soakedBy(fighter, point)) continue;

      fighter.flecks.splat(point);
      fighter.wet = 4;
      fighter.hoseHits += 1;
      fighter.swingIn = Math.max(fighter.swingIn, 0.6);
      fighter.swingReady = false;

      // Shove them back toward the sea.
      const here = fighter.group.position;
      here.z -= 0.55;
      here.x += (Math.random() - 0.5) * 0.4;

      if (fighter.hoseHits >= HOSE_TO_BREAK) {
        fighter.mode = "flee";
        this.say(FLEE, here);
      } else if (Math.random() < 0.45) {
        this.say(HIT, here);
      }
      return true;
    }
    return false;
  }

  public update(delta: number, player: THREE.Vector3): void {
    this.grumble =
      this.grumble?.update(delta, player.clone().setY(2)) === false
        ? null
        : this.grumble;

    if (this.cleared) {
      this.gone = this.fighters.every(
        (f) => !f.group.visible || f.mode === "down",
      );
      return;
    }

    this.spawnIn -= delta;
    if (
      this.spawnIn <= 0 &&
      this.wave < this.waves &&
      this.fighters.filter((f) => f.mode === "charge" || f.mode === "fight")
        .length < 2
    ) {
      this.spawnWave();
    }

    let anyFighting = false;
    for (const fighter of this.fighters) {
      fighter.flecks.update(delta);
      if (fighter.wet > 0) fighter.wet = Math.max(0, fighter.wet - delta);

      if (fighter.mode === "down") continue;

      if (fighter.mode === "flee") {
        this.runSouth(fighter, delta);
        continue;
      }

      anyFighting = true;
      const gap = fighter.group.position.distanceTo(player);

      if (gap < SWING_RANGE) {
        fighter.mode = "fight";
        this.fight(fighter, delta, player);
      } else {
        fighter.mode = "charge";
        this.charge(fighter, delta, player);
      }

      fighter.shoutIn -= delta;
      if (fighter.shoutIn <= 0) {
        fighter.shoutIn = 5 + Math.random() * 8;
        if (Math.random() < 0.55) this.say(CHARGE, fighter.group.position);
      }
    }

    if (
      this.wave >= this.waves &&
      !anyFighting &&
      this.fighters.every(
        (f) => f.mode === "flee" || f.mode === "down" || !f.group.visible,
      )
    ) {
      this.cleared = true;
    }
  }

  private spawnWave(): void {
    this.wave += 1;
    const count = 2 + this.wave + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const x = this.spawnX + (Math.random() - 0.5) * 90;
      const z = this.spawnZ - Math.random() * 25;
      this.fighters.push(this.buildFighter(new THREE.Vector3(x, 0, z)));
    }
    this.spawnIn = this.wave < this.waves ? 14 + Math.random() * 8 : 9999;
  }

  private buildFighter(at: THREE.Vector3): Fighter {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.92,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.95,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.85,
    });
    const mask = new THREE.MeshStandardMaterial({
      color: pick(MASK),
      roughness: 0.9,
    });

    const group = new THREE.Group();
    group.position.copy(at);
    this.scene.add(group);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.28), coat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    // Green armband — Gosport colours, near enough.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.8 }),
    );
    band.position.set(0.28, 1.2, 0);
    group.add(band);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.68;
    group.add(head);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.2, 0.34),
      mask,
    );
    hood.position.y = 1.82;
    group.add(hood);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0.78, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.72, 0.16),
        trousers,
      );
      thigh.position.y = -0.36;
      thigh.castShadow = true;
      leg.add(thigh);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.28, 1.35, 0);
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.52, 0.12),
        coat,
      );
      sleeve.position.y = -0.26;
      arm.add(sleeve);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      flecks: new MuckFlecks(group, 14),
      mode: "charge",
      step: Math.random() * Math.PI * 2,
      hoseHits: 0,
      swingIn: 0.8 + Math.random(),
      swingReady: false,
      shoutIn: 2 + Math.random() * 4,
      wet: 0,
    };
  }

  private soakedBy(fighter: Fighter, point: THREE.Vector3): boolean {
    const here = fighter.group.position;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    if (dx * dx + dz * dz > 0.6 * 0.6) return false;
    return point.y > here.y - 0.1 && point.y < here.y + 1.9;
  }

  private charge(fighter: Fighter, delta: number, player: THREE.Vector3): void {
    const here = fighter.group.position;
    const to = new THREE.Vector3(player.x - here.x, 0, player.z - here.z);
    const gap = to.length();
    if (gap < 0.05) return;
    to.multiplyScalar(1 / gap);
    const speed = CHARGE_SPEED * (fighter.wet > 0 ? 0.55 : 1);
    here.addScaledVector(to, speed * delta);
    fighter.group.rotation.y = Math.atan2(to.x, to.z);
    fighter.step += delta * speed * 5;
    const swing = Math.sin(fighter.step) * 0.9;
    fighter.legs[0]!.rotation.x = swing;
    fighter.legs[1]!.rotation.x = -swing;
    fighter.arms[0]!.rotation.x = -swing * 0.7;
    fighter.arms[1]!.rotation.x = swing * 0.7;
    here.y = Math.abs(Math.sin(fighter.step)) * 0.06;
  }

  private fight(fighter: Fighter, delta: number, player: THREE.Vector3): void {
    const here = fighter.group.position;
    fighter.group.rotation.y = Math.atan2(player.x - here.x, player.z - here.z);
    here.y = 0;
    fighter.legs[0]!.rotation.x = 0.15;
    fighter.legs[1]!.rotation.x = -0.1;
    fighter.arms[0]!.rotation.x = -1.2;
    fighter.arms[1]!.rotation.x = -1.4;
    fighter.arms[1]!.rotation.z = -0.4;

    fighter.swingIn -= delta;
    if (fighter.swingIn <= 0) {
      fighter.swingReady = true;
      fighter.swingIn = 1.6 + Math.random() * 0.8;
      // Wind-up punch pose.
      fighter.arms[1]!.rotation.x = -2.1;
    }
  }

  private runSouth(fighter: Fighter, delta: number): void {
    const here = fighter.group.position;
    here.z -= 5.5 * delta;
    here.x += Math.sin(fighter.step) * delta * 0.8;
    fighter.group.rotation.y = Math.PI;
    fighter.step += delta * 14;
    const swing = Math.sin(fighter.step) * 1.1;
    fighter.legs[0]!.rotation.x = swing;
    fighter.legs[1]!.rotation.x = -swing;
    fighter.arms[0]!.rotation.x = -swing;
    fighter.arms[1]!.rotation.x = swing;
    here.y = Math.abs(Math.sin(fighter.step)) * 0.08;
    if (here.z < -180) {
      fighter.group.visible = false;
      fighter.mode = "down";
    }
  }

  private say(lines: readonly string[], at: THREE.Vector3): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      at.clone().setY(2.1),
    );
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const fighter of this.fighters) {
      fighter.flecks.dispose();
      this.scene.remove(fighter.group);
    }
    this.fighters = [];
  }
}
