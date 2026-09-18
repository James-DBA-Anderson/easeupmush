import * as THREE from "three";

/**
 * A civilian / coastguard chopper low over the Solent, heading for the Isle of
 * Wight. Slow enough that kids on the path have time to stop and wave.
 */

let nextHeliId = 1;

/** Same bearing the Spitfire takes — west and a touch out to sea. */
const ISLAND_WAY = new THREE.Vector2(-0.93, -0.37).normalize();

const CRUISE_Y = 175;
const CROSSING = 1200;
const SPEED = 29;

const SKY_FOG = false;

const HULL = new THREE.MeshStandardMaterial({
  color: 0x2f4a3a,
  roughness: 0.55,
  metalness: 0.25,
  fog: SKY_FOG,
});
const ACCENT = new THREE.MeshStandardMaterial({
  color: 0xd4a017,
  roughness: 0.45,
  metalness: 0.2,
  fog: SKY_FOG,
});
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x8ec4d8,
  roughness: 0.2,
  metalness: 0.35,
  fog: SKY_FOG,
  transparent: true,
  opacity: 0.85,
});
const ROTOR = new THREE.MeshBasicMaterial({
  color: 0x1a1a1c,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
  fog: SKY_FOG,
});

export class Helicopter {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private mainRotor: THREE.Mesh;
  private tailRotor: THREE.Mesh;
  private heading: number;
  private travelled = 0;
  public readonly id = nextHeliId++;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.heading = Math.atan2(ISLAND_WAY.x, ISLAND_WAY.y);
    this.build();

    const across = (Math.random() - 0.5) * 160;
    const height = CRUISE_Y * (0.9 + Math.random() * 0.2);
    this.group.position.set(
      -Math.sin(this.heading) * (CROSSING / 2) + Math.cos(this.heading) * across,
      height,
      -Math.cos(this.heading) * (CROSSING / 2) - Math.sin(this.heading) * across,
    );
    // Nose on local −Z; travel is (+sin, +cos).
    this.group.rotation.y = this.heading + Math.PI;
    this.group.scale.setScalar(2.4);
    scene.add(this.group);

    this.mainRotor = this.group.getObjectByName("mainRotor") as THREE.Mesh;
    this.tailRotor = this.group.getObjectByName("tailRotor") as THREE.Mesh;
  }

  private build(): void {
    const fuselage = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 10, 8),
      HULL,
    );
    fuselage.scale.set(1, 0.85, 1.55);
    fuselage.position.z = 0.15;
    this.group.add(fuselage);

    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), GLASS);
    cabin.scale.set(0.95, 0.8, 1.1);
    cabin.position.set(0, 0.15, -0.55);
    this.group.add(cabin);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.12, 1.6),
      ACCENT,
    );
    stripe.position.set(0, -0.15, 0.1);
    this.group.add(stripe);

    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 3.4, 7),
      HULL,
    );
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.15, 2.4);
    this.group.add(boom);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.7), HULL);
    fin.position.set(0, 0.7, 4.0);
    this.group.add(fin);

    const main = new THREE.Mesh(new THREE.CircleGeometry(3.6, 20), ROTOR);
    main.name = "mainRotor";
    main.rotation.x = -Math.PI / 2;
    main.position.set(0, 1.05, 0.1);
    main.renderOrder = 2;
    this.group.add(main);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8), HULL);
    hub.position.set(0, 0.9, 0.1);
    this.group.add(hub);

    const tail = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), ROTOR);
    tail.name = "tailRotor";
    tail.position.set(0.35, 0.55, 4.05);
    tail.rotation.y = Math.PI / 2;
    tail.renderOrder = 2;
    this.group.add(tail);

    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
        HULL,
      );
      skid.rotation.x = Math.PI / 2;
      skid.position.set(side * 0.55, -0.85, 0.05);
      this.group.add(skid);

      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5),
        HULL,
      );
      strut.position.set(side * 0.5, -0.55, 0.2);
      this.group.add(strut);
    }
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isInFlight(): boolean {
    return this.travelled <= CROSSING;
  }

  public isGone(): boolean {
    return this.travelled > CROSSING;
  }

  public update(delta: number): void {
    const step = SPEED * delta;
    this.travelled += step;
    if (this.travelled <= CROSSING) {
      this.group.position.x += Math.sin(this.heading) * step;
      this.group.position.z += Math.cos(this.heading) * step;
      this.group.visible = true;
      // Gentle crab / nose-down as it works west.
      this.group.rotation.z = Math.sin(this.travelled * 0.02) * 0.04;
      this.group.rotation.x = 0.06;
      if (this.mainRotor) this.mainRotor.rotation.z += delta * 28;
      if (this.tailRotor) this.tailRotor.rotation.x += delta * 42;
    } else {
      this.group.visible = false;
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
  }
}
