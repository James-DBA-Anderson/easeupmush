import * as THREE from "three";
import { isInLake, WATER_Y } from "../world/lake";
import { addEyes } from "./eyes";

type Mode = "in" | "perch" | "swoop" | "feed" | "return" | "pass" | "flee" | "gone";

const BODY = 0x6a7080;
const NECK = 0x5a7a6a;
const BILL = 0xc8a060;
const WING = 0x5a606c;
/** Casual circuit height — washer can knock them if you aim up. */
const LOW_PASS_Y = 5.4;

/**
 * Park pigeon on the fairy lights — already around the lake, swoops down for
 * bread when someone's feeding, then flies home. They mess while eating, and
 * again under the wire if they retreat up there. Hose knocks them off.
 */
export class WireBird {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private wings: THREE.Group[] = [];
  private mode: Mode = "in";
  private home: THREE.Vector3;
  private target = new THREE.Vector3();
  private flap = Math.random() * Math.PI * 2;
  private swoopIn: number;
  private feedLeft = 0;
  /** Countdown until a casual low fly-past off the wire. */
  private passIn: number;
  private pending: THREE.Vector3 | null = null;
  /** Ate on the path — dump under the wire when they land back up. */
  private gut = false;
  /** Reached a feeder during the wire-bird buildup (counts toward half-flock). */
  private joinedFlock = false;
  private age = 0;
  private faceYaw = 0;
  /** Waypoints for a low circuit (outbound then home). */
  private passRoute: THREE.Vector3[] = [];
  private passIdx = 0;

  constructor(
    scene: THREE.Scene,
    perch: THREE.Vector3,
    stagger = 0,
    start: "arrive" | "perch" | "wander" = "arrive",
  ) {
    this.scene = scene;
    this.home = perch.clone();
    this.swoopIn = 2 + stagger * 0.35 + Math.random() * 5;
    this.passIn = 6 + stagger * 0.5 + Math.random() * 14;
    this.build();
    if (start === "perch") {
      this.group.position.copy(perch);
      this.mode = "perch";
      this.fold();
      this.group.rotation.x = 0.06;
      this.faceYaw = Math.random() * Math.PI * 2;
      this.group.rotation.y = this.faceYaw;
    } else if (start === "wander") {
      const bearing = Math.random() * Math.PI * 2;
      const dist = 28 + Math.random() * 62;
      this.group.position.set(
        perch.x + Math.cos(bearing) * dist,
        LOW_PASS_Y + Math.random() * 3.5,
        perch.z + Math.sin(bearing) * dist,
      );
      this.beginLowPass();
    } else {
      const bearing = Math.PI * 0.6 + (Math.random() - 0.5) * 0.8;
      const arriveY =
        Math.random() < 0.4
          ? LOW_PASS_Y + Math.random() * 2.2
          : perch.y + 4 + Math.random() * 6;
      this.group.position.set(
        perch.x + Math.cos(bearing) * (18 + Math.random() * 22),
        arriveY,
        perch.z + Math.sin(bearing) * (18 + Math.random() * 22),
      );
    }
    scene.add(this.group);
  }

  public isGone(): boolean {
    return this.mode === "gone";
  }

  public isPerched(): boolean {
    return this.mode === "perch";
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public homePerch(): THREE.Vector3 {
    return this.home.clone();
  }

  /** Ready to dive on food from the wire. */
  public wantsFood(): boolean {
    return this.mode === "perch" && this.swoopIn <= 0;
  }

  public isFeeding(): boolean {
    return this.mode === "feed";
  }

  public hasJoinedFlock(): boolean {
    return this.joinedFlock;
  }

  public markJoinedFlock(): void {
    this.joinedFlock = true;
  }

  /** Peel off toward food from a wire, a skim, or a long flight in. */
  public tryFlockDown(food: THREE.Vector3, chance: number): boolean {
    if (
      this.mode === "flee" ||
      this.mode === "gone" ||
      this.mode === "feed" ||
      this.mode === "swoop" ||
      this.mode === "return"
    ) {
      return false;
    }
    if (this.mode === "perch" && this.swoopIn > 0) return false;
    if (Math.random() > chance) return false;
    this.target.set(food.x, 0.15, food.z);
    this.mode = "swoop";
    this.age = 0;
    this.passRoute = [];
    return true;
  }

  /** Others peeling off the wire — perched birds catch on faster. */
  public hurryFlock(delta: number, pressure: number): void {
    if (this.mode !== "perch") return;
    // Short post-scare waits stay put until the path looks clear.
    if (this.swoopIn > 1.5) this.swoopIn -= delta * pressure;
    this.passIn += delta * 0.4;
  }

  /** In the air heading to or from a feeder (buildup contagion). */
  public isFlockingAirborne(): boolean {
    return this.mode === "swoop" || this.mode === "in" || this.mode === "return";
  }

  /** On the path under the mission pin — feeding or diving in. */
  public isAtMission(cx: number, cz: number, radius: number): boolean {
    const p = this.group.position;
    const dx = p.x - cx;
    const dz = p.z - cz;
    if (dx * dx + dz * dz > radius * radius) return false;
    return this.mode === "feed" || this.mode === "swoop";
  }

  public isOnThePath(): boolean {
    return this.mode === "feed" || this.mode === "swoop";
  }

  /**
   * Spooked — home to a wire. `home` is the perch to use; `soon` means food
   * is still down so they peel off again once the path isn't underfoot.
   */
  public retreatToWire(home?: THREE.Vector3, soon = false): boolean {
    if (this.mode === "flee" || this.mode === "gone") return false;
    if (home) this.home.copy(home);
    this.passRoute = [];
    this.swoopIn = soon ? 0.4 + Math.random() * 0.85 : 2.4 + Math.random() * 3.2;
    if (this.mode === "perch") {
      if (this.group.position.distanceToSquared(this.home) > 1.4) {
        this.mode = "return";
        this.age = 0;
      }
      return true;
    }
    this.mode = "return";
    this.age = 0;
    return true;
  }

  /** Dive on a scrap / feeder — returns true if it took the job. */
  public swoopTo(food: THREE.Vector3): boolean {
    if (!this.wantsFood()) return false;
    this.target.set(food.x, 0.15, food.z);
    this.mode = "swoop";
    this.age = 0;
    return true;
  }

  /** Mess just let go — once, for the game to spawn. */
  public claimDrop(): THREE.Vector3 | null {
    const spot = this.pending;
    this.pending = null;
    return spot;
  }

  /** Washer hit the bird on the wire (or in the air nearby). */
  public soakedBy(point: THREE.Vector3): boolean {
    if (this.mode === "flee" || this.mode === "gone") return false;
    const here = this.group.position;
    const dx = point.x - here.x;
    const dy = point.y - here.y;
    const dz = point.z - here.z;
    // Airborne passes need a bit more forgiveness; wire stream thins out.
    const r =
      this.mode === "feed"
        ? 2.15
        : this.mode === "pass" || this.mode === "swoop" || this.mode === "return"
          ? 2.6
          : this.mode === "in"
            ? 2.2
            : 1.8;
    return dx * dx + dy * dy * 0.55 + dz * dz < r * r;
  }

  /** Hose blast — back to the lights; they come down again while food lasts. */
  public scare(home?: THREE.Vector3, soon = false): void {
    this.retreatToWire(home, soon);
  }

  /** Mission over / scared — clear off for good. */
  public flush(): void {
    if (this.mode === "gone" || this.mode === "flee") return;
    this.mode = "flee";
    this.age = 0;
    this.pending = null;
    this.target.set(
      this.group.position.x + (Math.random() - 0.5) * 160,
      this.group.position.y + 24 + Math.random() * 16,
      this.group.position.z + (Math.random() - 0.5) * 160,
    );
  }

  public update(delta: number): void {
    this.age += delta;
    this.flap += delta * (this.mode === "perch" || this.mode === "feed" ? 2.4 : 16);

    if (this.mode === "gone") return;

    if (this.mode === "flee") {
      this.flyToward(this.target, delta, 18);
      if (this.age > 3.2) this.mode = "gone";
      return;
    }

    if (this.mode === "pass") {
      const goal = this.passRoute[this.passIdx];
      if (!goal) {
        this.mode = "return";
        return;
      }
      this.flyToward(goal, delta, 12);
      if (this.group.position.distanceTo(goal) < 0.55) {
        this.passIdx += 1;
        if (this.passIdx >= this.passRoute.length) {
          this.mode = "return";
          this.age = 0;
        }
      }
      return;
    }

    if (this.mode === "in" || this.mode === "return") {
      this.flyToward(this.home, delta, this.mode === "return" ? 11 : 13);
      if (this.group.position.distanceTo(this.home) < 0.3) {
        this.group.position.copy(this.home);
        this.mode = "perch";
        this.fold();
        this.group.rotation.x = 0.06;
        this.faceYaw = Math.random() * Math.PI * 2;
        this.group.rotation.y = this.faceYaw;
        this.swoopIn = 3 + Math.random() * 7;
        this.passIn = 5 + Math.random() * 16;
        if (this.gut) {
          this.gut = false;
          if (Math.random() < 0.55) this.pending = this.groundUnder();
        }
      }
      return;
    }

    if (this.mode === "swoop") {
      const gap = this.group.position.distanceTo(this.target);
      this.flyToward(this.target, delta, gap > 28 ? 22 : 15);
      if (gap < 0.45) {
        this.group.position.copy(this.target);
        this.mode = "feed";
        this.feedLeft = 1.2 + Math.random() * 1.6;
        this.fold();
        this.joinedFlock = true;
        this.gut = true;
        if (Math.random() < 0.7) {
          this.pending = new THREE.Vector3(
            this.group.position.x + (Math.random() - 0.5) * 0.7,
            0,
            this.group.position.z + (Math.random() - 0.5) * 0.7,
          );
        }
      }
      return;
    }

    if (this.mode === "feed") {
      this.feedLeft -= delta;
      this.group.position.y = 0.12 + Math.abs(Math.sin(this.age * 10)) * 0.04;
      this.group.rotation.x = 0.35;
      this.group.rotation.y += delta * 0.4;
      if (this.feedLeft <= 0) {
        this.mode = "return";
        this.age = 0;
      }
      return;
    }

    if (this.mode === "perch") {
      this.sit();
      this.swoopIn -= delta;
      this.passIn -= delta;
      if (this.passIn <= 0 && this.swoopIn > 0.8) {
        this.beginLowPass();
      }
    }
  }

  /** Leave the fairy lights for a short low skim the washer can reach. */
  private beginLowPass(): void {
    this.mode = "pass";
    this.age = 0;
    this.passIn = 10 + Math.random() * 22;
    const ang = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 20;
    const midY = LOW_PASS_Y + Math.random() * 2.4;
    const mid = new THREE.Vector3(
      this.home.x + Math.cos(ang) * dist,
      midY,
      this.home.z + Math.sin(ang) * dist,
    );
    const side = ang + (Math.random() < 0.5 ? 1.1 : -1.1);
    const far = new THREE.Vector3(
      this.home.x + Math.cos(side) * (dist * 0.55),
      midY + (Math.random() - 0.5) * 1.4,
      this.home.z + Math.sin(side) * (dist * 0.55),
    );
    this.passRoute = [mid, far];
    this.passIdx = 0;
  }

  private groundUnder(): THREE.Vector3 {
    const jitter = 0.25 + Math.random() * 1.1;
    const ang = Math.random() * Math.PI * 2;
    const x = this.home.x + Math.cos(ang) * jitter;
    const z = this.home.z + Math.sin(ang) * jitter;
    const y = isInLake(x, z) ? WATER_Y : 0;
    return new THREE.Vector3(x, y, z);
  }

  public dispose(): void {
    this.scene.remove(this.group);
  }

  private flyToward(to: THREE.Vector3, delta: number, speed: number): void {
    const here = this.group.position;
    const gap = here.distanceTo(to);
    if (gap < 0.05) return;
    const step = Math.min(gap, speed * delta);
    here.lerp(to, step / gap);
    this.group.lookAt(to);
    this.group.rotation.z = Math.sin(this.flap) * 0.18;
    this.beat();
  }

  private sit(): void {
    this.group.position.copy(this.home);
    this.group.rotation.x = 0.08;
    this.group.rotation.y = this.faceYaw + Math.sin(this.age * 0.7) * 0.08;
    this.group.rotation.z = Math.sin(this.age * 1.5) * 0.04;
    for (let i = 0; i < this.wings.length; i++) {
      const wing = this.wings[i]!;
      wing.rotation.z =
        (i === 0 ? 0.12 : -0.12) + Math.sin(this.flap + i) * 0.03;
    }
  }

  private beat(): void {
    for (let i = 0; i < this.wings.length; i++) {
      const wing = this.wings[i]!;
      wing.scale.x = 1;
      wing.rotation.y = 0;
      wing.rotation.z =
        (i === 0 ? 1 : -1) * (0.35 + Math.sin(this.flap) * 0.55);
    }
  }

  private fold(): void {
    for (let i = 0; i < this.wings.length; i++) {
      const wing = this.wings[i]!;
      wing.scale.x = 0.35;
      wing.rotation.z = i === 0 ? 0.1 : -0.1;
      wing.rotation.y = i === 0 ? -1.1 : 1.1;
    }
  }

  private build(): void {
    const size = 0.3;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.55, 8, 6),
      new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.85 }),
    );
    body.scale.set(1, 0.75, 1.35);
    body.castShadow = true;
    this.group.add(body);

    const iridescence = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.32, 8, 6),
      new THREE.MeshStandardMaterial({
        color: NECK,
        roughness: 0.55,
        metalness: 0.2,
      }),
    );
    iridescence.position.set(0, size * 0.15, size * 0.45);
    this.group.add(iridescence);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.85 }),
    );
    head.position.set(0, size * 0.2, size * 0.7);
    this.group.add(head);
    addEyes(head, {
      spread: size * 0.12,
      y: 0.05,
      z: 0.12,
      size: size * 0.08,
    });

    const bill = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.08, size * 0.28, 5),
      new THREE.MeshStandardMaterial({ color: BILL, roughness: 0.6 }),
    );
    bill.rotation.x = Math.PI / 2;
    bill.position.set(0, -size * 0.02, size * 0.95);
    this.group.add(bill);

    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * size * 0.35, size * 0.05, 0);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.1, size * 0.08, size * 0.55),
        new THREE.MeshStandardMaterial({ color: WING, roughness: 0.9 }),
      );
      panel.position.x = side * size * 0.45;
      wing.add(panel);
      this.group.add(wing);
      this.wings.push(wing);
    }

    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(size * 0.35, size * 0.06, size * 0.4),
      new THREE.MeshStandardMaterial({ color: WING, roughness: 0.9 }),
    );
    tail.position.set(0, 0, -size * 0.75);
    this.group.add(tail);
  }
}

/**
 * Pack pigeons onto the two fairy-light spans nearest the feeders — bunched
 * tight on each wire rather than stretched along the whole run.
 */
/** One or two birds per fairy-light span so the flock is spread round the park. */
export function roostPerchesSpread(
  count: number,
  sections: readonly (readonly THREE.Vector3[])[],
): THREE.Vector3[] {
  if (count <= 0) return [];
  const usable = sections.filter((sec) => sec.length > 0);
  if (usable.length === 0) return [];

  const out: THREE.Vector3[] = [];
  let si = 0;
  while (out.length < count) {
    const sec = usable[si % usable.length]!;
    const mid = Math.floor(sec.length / 2);
    const bulb = sec[mid] ?? sec[0]!;
    const jitter = (out.length % 3) - 1;
    const pick = sec[Math.min(sec.length - 1, Math.max(0, mid + jitter))] ?? bulb;
    out.push(pick.clone());
    si += 1;
  }
  return out;
}

export function roostPerchesNear(
  tip: { x: number; z: number },
  count: number,
  sections: readonly (readonly THREE.Vector3[])[],
): THREE.Vector3[] {
  if (count <= 0) return [];

  const ranked = sections
    .filter((sec) => sec.length > 0)
    .map((sec) => {
      let cx = 0;
      let cz = 0;
      for (const p of sec) {
        cx += p.x;
        cz += p.z;
      }
      cx /= sec.length;
      cz /= sec.length;
      const d = (cx - tip.x) * (cx - tip.x) + (cz - tip.z) * (cz - tip.z);
      return { sec, d };
    })
    .sort((a, b) => a.d - b.d);

  const pick = ranked.slice(0, Math.min(2, ranked.length));
  if (pick.length === 0) return [];

  const near: THREE.Vector3[] = [];
  const reach = 9.5 * 9.5;
  for (const { sec } of pick) {
    for (const p of sec) {
      const dx = p.x - tip.x;
      const dz = p.z - tip.z;
      if (dx * dx + dz * dz <= reach) near.push(p.clone());
    }
  }
  if (near.length >= 2) {
    if (near.length <= count) return near;
    const step = near.length / count;
    return Array.from({ length: count }, (_, i) =>
      near[Math.min(near.length - 1, Math.floor(i * step))]!.clone(),
    );
  }

  const out: THREE.Vector3[] = [];
  const firstShare = pick.length === 1 ? count : Math.ceil(count / 2);
  const shares = pick.length === 1 ? [count] : [firstShare, count - firstShare];
  for (let i = 0; i < pick.length; i++) {
    out.push(...packSection(pick[i]!.sec, shares[i]!));
  }
  return out;
}

/**
 * Pick the two northernmost wire sections (highest Z values) for the pigeons mission.
 * North end of the lake has positive Z coordinates.
 */
export function roostPerchesNorth(
  count: number,
  sections: readonly (readonly THREE.Vector3[])[],
): THREE.Vector3[] {
  if (count <= 0) return [];

  const ranked = sections
    .filter((sec) => sec.length > 0)
    .map((sec) => {
      let cz = 0;
      for (const p of sec) {
        cz += p.z;
      }
      cz /= sec.length;
      return { sec, cz };
    })
    .sort((a, b) => b.cz - a.cz);

  const pick = ranked.slice(0, Math.min(2, ranked.length));
  if (pick.length === 0) return [];

  const out: THREE.Vector3[] = [];
  const firstShare = pick.length === 1 ? count : Math.ceil(count / 2);
  const shares = pick.length === 1 ? [count] : [firstShare, count - firstShare];

  for (let i = 0; i < pick.length; i++) {
    out.push(...packSection(pick[i]!.sec, shares[i]!));
  }
  return out;
}

/** Consecutive cluster on a span; interpolate if the flock outnumbers bulbs. */
function packSection(
  sec: readonly THREE.Vector3[],
  want: number,
): THREE.Vector3[] {
  if (want <= 0 || sec.length === 0) return [];
  if (want <= sec.length) {
    const start = Math.max(0, Math.floor((sec.length - want) / 2));
    return sec.slice(start, start + want).map((p) => p.clone());
  }
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < want; i++) {
    const t = want === 1 ? 0.5 : i / (want - 1);
    const f = t * (sec.length - 1);
    const a = Math.floor(f);
    const b = Math.min(sec.length - 1, a + 1);
    const u = f - a;
    result.push(new THREE.Vector3().lerpVectors(sec[a]!, sec[b]!, u));
  }
  return result;
}
