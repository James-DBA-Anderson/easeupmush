import * as THREE from "three";

/**
 * Airliners going over Southsea on their way in and out of Gatwick and
 * Heathrow: too high to hear over the gulls, but there most of the day if
 * you look up. Occasionally something lower and slower off Solent way, and
 * now and then the Spitfire, in from the east along the seafront and away
 * over the Island.
 */

export type PlaneKind = "jet" | "light" | "spitfire";

/** Cruising height, and how far out either side they come from. */
const CRUISE_Y = 300;
const LOW_Y = 120;
const FIGHTER_Y = 85;
const CROSSING = 900;

/** They look slow from the ground; this is the ground-speed that reads right. */
const CRUISE_SPEED = 42;
const LOW_SPEED = 26;
const FIGHTER_SPEED = 58;

/** Out towards the Isle of Wight: west, and a bit out to sea with it. */
const ISLAND_WAY = new THREE.Vector2(-0.93, -0.37).normalize();

/** How long a bit of contrail hangs about before it's spread out and gone. */
const TRAIL_LIFE = 20;
const TRAIL_EVERY = 0.28;

const METAL = new THREE.MeshStandardMaterial({
  color: 0xdfe3e8,
  roughness: 0.4,
  metalness: 0.35,
});
const TAIL_PAINT = new THREE.MeshStandardMaterial({
  color: 0xc4ccd4,
  roughness: 0.6,
});

/** Dark Earth and Dark Green over Sky, which is how they're still painted. */
const CAMO_GREEN = new THREE.MeshStandardMaterial({
  color: 0x4a5a37,
  roughness: 0.85,
});
const CAMO_EARTH = new THREE.MeshStandardMaterial({
  color: 0x6b5334,
  roughness: 0.85,
});
const UNDERSIDE = new THREE.MeshStandardMaterial({
  color: 0xb9c6ab,
  roughness: 0.8,
});
const ROUNDEL_BLUE = new THREE.MeshBasicMaterial({ color: 0x1f3f8f });
const ROUNDEL_RED = new THREE.MeshBasicMaterial({ color: 0xc0392b });

type Puff = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; left: number };

export class Plane {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private material: THREE.MeshBasicMaterial;
  private trail: Puff[] = [];

  private heading: number;
  private speed: number;
  private travelled = 0;
  private since = 0;
  public readonly kind: PlaneKind;
  /** High jets leave a trail; the low stuff doesn't. */
  private readonly high: boolean;
  /** The Spitfire's propeller, which is a blur rather than blades. */
  private prop: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, sky: number, kind?: PlaneKind) {
    this.scene = scene;
    this.kind = kind ?? (Math.random() < 0.75 ? "jet" : "light");
    this.high = this.kind === "jet";
    this.speed =
      this.kind === "jet"
        ? CRUISE_SPEED
        : this.kind === "light"
          ? LOW_SPEED
          : FIGHTER_SPEED;

    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42 * (1 - sky),
      depthWrite: false,
    });

    this.group = new THREE.Group();
    if (this.kind === "spitfire") this.buildFighter();
    else this.build();

    // In off one edge of the sky, out the other, on a line past the lake.
    // The Spitfire always runs the same way: in from the east down the
    // seafront and out towards the Island.
    this.heading =
      this.kind === "spitfire"
        ? Math.atan2(ISLAND_WAY.x, ISLAND_WAY.y)
        : Math.random() * Math.PI * 2;
    const across =
      this.kind === "spitfire"
        ? (Math.random() - 0.5) * 120
        : (Math.random() - 0.5) * 400;
    const base =
      this.kind === "jet" ? CRUISE_Y : this.kind === "light" ? LOW_Y : FIGHTER_Y;
    const height = base * (0.85 + Math.random() * 0.3);
    this.group.position.set(
      -Math.sin(this.heading) * (CROSSING / 2) + Math.cos(this.heading) * across,
      height,
      -Math.cos(this.heading) * (CROSSING / 2) - Math.sin(this.heading) * across,
    );
    this.group.rotation.y = this.heading;
    // Big enough to read as an aeroplane from three hundred metres down.
    this.group.scale.setScalar(
      this.kind === "jet" ? 3.4 : this.kind === "light" ? 1.6 : 1.5,
    );
    scene.add(this.group);
  }

  private build(): void {
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.34, 8, 7),
      METAL,
    );
    fuselage.rotation.x = Math.PI / 2;
    this.group.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 7), METAL);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -4.4;
    this.group.add(nose);

    // Swept wings, and the tailplane and fin at the back.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 1.5), METAL);
    wing.position.z = 0.4;
    wing.rotation.y = 0.2;
    this.group.add(wing);

    const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.8), METAL);
    tailplane.position.z = 3.4;
    this.group.add(tailplane);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.2), TAIL_PAINT);
    fin.position.set(0, 0.8, 3.5);
    this.group.add(fin);

    for (const side of [-1, 1]) {
      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 1.3, 7),
        METAL,
      );
      engine.rotation.x = Math.PI / 2;
      engine.position.set(side * 2.6, -0.35, 0.2);
      this.group.add(engine);
    }
  }

  /**
   * A Spitfire: long nose, bubble of a canopy, and those elliptical wings,
   * which are the whole of what you recognise from the ground.
   */
  private buildFighter(): void {
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.16, 6.4, 8),
      CAMO_GREEN,
    );
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.z = 0.4;
    this.group.add(fuselage);

    // The long Merlin nose out front, and the spinner on the end of it.
    const nose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.36, 1.8, 8),
      CAMO_EARTH,
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -3.6;
    this.group.add(nose);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 8), CAMO_EARTH);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = -4.8;
    this.group.add(spinner);

    // The propeller reads as a disc rather than blades at any distance.
    this.prop = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 14),
      new THREE.MeshBasicMaterial({
        color: 0x2b2b2b,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.prop.position.z = -4.9;
    this.group.add(this.prop);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0x9fb4c4,
        roughness: 0.25,
        metalness: 0.2,
      }),
    );
    canopy.scale.set(0.8, 0.7, 1.7);
    canopy.position.set(0, 0.3, -0.9);
    this.group.add(canopy);

    // Elliptical wings: a flattened disc squashed front to back.
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 0.12, 16, 1, false, 0, Math.PI),
        CAMO_GREEN,
      );
      wing.rotation.y = side > 0 ? 0 : Math.PI;
      wing.scale.set(1, 1, 0.28);
      wing.position.set(0, -0.08, -0.5);
      this.group.add(wing);

      const under = new THREE.Mesh(
        new THREE.CylinderGeometry(3.45, 3.45, 0.05, 16, 1, false, 0, Math.PI),
        UNDERSIDE,
      );
      under.rotation.y = wing.rotation.y;
      under.scale.copy(wing.scale);
      under.position.set(0, -0.16, -0.5);
      this.group.add(under);

      // Roundels, under the wings where they'd be seen from down here.
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), ROUNDEL_BLUE);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(side * 2, -0.2, -0.5);
      this.group.add(ring);

      const middle = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), ROUNDEL_RED);
      middle.rotation.x = Math.PI / 2;
      middle.position.set(side * 2, -0.21, -0.5);
      this.group.add(middle);
    }

    const tailplane = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.7), CAMO_GREEN);
    tailplane.position.z = 3.1;
    this.group.add(tailplane);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.9), CAMO_EARTH);
    fin.position.set(0, 0.5, 3.2);
    this.group.add(fin);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isGone(): boolean {
    return this.travelled > CROSSING && this.trail.length === 0;
  }

  public update(delta: number, sky: number): void {
    // Contrails wash out as the cloud comes in and as the light goes.
    this.material.opacity = 0.42 * (1 - sky);
    const step = this.speed * delta;
    this.travelled += step;

    if (this.travelled <= CROSSING) {
      this.group.position.x += Math.sin(this.heading) * step;
      this.group.position.z += Math.cos(this.heading) * step;
      this.group.visible = true;
      if (this.high) this.layTrail(delta, sky);
      if (this.prop) this.flyIt(delta);
    } else {
      // Out of the far side; the trail it left behind takes a while to go.
      this.group.visible = false;
    }

    this.fadeTrail(delta);
  }

  /** Prop turning, and the airframe rocking about as it's hand-flown. */
  private flyIt(delta: number): void {
    this.prop!.rotation.z += delta * 40;
    const along = this.travelled / 60;
    this.group.rotation.z = Math.sin(along) * 0.12;
    this.group.rotation.x = Math.sin(along * 0.7) * 0.04;
  }

  /** Two lines of it out of the engines, spreading and thinning as they go. */
  private layTrail(delta: number, sky: number): void {
    this.since += delta;
    if (this.since < TRAIL_EVERY) return;
    this.since = 0;

    const here = this.group.position;
    const across = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    for (const side of [-1, 1]) {
      const material = this.material.clone();
      material.opacity = 0.42 * (1 - sky);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(7.5, 6, 5), material);
      puff.position
        .copy(here)
        .addScaledVector(across, side * 7)
        .add(
          new THREE.Vector3(
            -Math.sin(this.heading) * 12,
            -1,
            -Math.cos(this.heading) * 12,
          ),
        );
      this.scene.add(puff);
      this.trail.push({ mesh: puff, material, left: TRAIL_LIFE });
    }
  }

  /** Contrail spreads out and thins until there's nothing left of it. */
  private fadeTrail(delta: number): void {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const puff = this.trail[i]!;
      puff.left -= delta;
      const gone = 1 - puff.left / TRAIL_LIFE;
      puff.mesh.scale.setScalar(1 + gone * 2.6);
      puff.material.opacity = this.material.opacity * (1 - gone);

      if (puff.left > 0) continue;
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      puff.material.dispose();
      this.trail.splice(i, 1);
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const puff of this.trail) this.scene.remove(puff.mesh);
    this.trail = [];
    this.material.dispose();
  }
}
