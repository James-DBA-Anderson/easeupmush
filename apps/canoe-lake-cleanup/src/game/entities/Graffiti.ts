import * as THREE from "three";

/** What gets sprayed on the back of the toilet block round here. */
const TAGS = [
  "POMPEY",
  "PFC",
  "6.57",
  "OI OI",
  "SOUTHSEA",
  "PLAY UP POMPEY",
  "BAZ",
  "SKINT",
];
const INKS = ["#e0332f", "#2f6fd8", "#1f1f26", "#3f9f5f", "#8b3ad8"];

/** How much of it comes off per droplet, and the size of the panel. */
const SCRUB_PER_HIT = 0.012;

/** A wall a tag can end up on. */
export interface Wall {
  x: number;
  z: number;
  y: number;
  yaw: number;
  width: number;
  height: number;
}

function tagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const ink = INKS[Math.floor(Math.random() * INKS.length)]!;

  // A fat outline scrawl, leaning over, with a line under it.
  ctx.translate(128, 70);
  ctx.rotate((Math.random() - 0.5) * 0.2);
  ctx.font = "bold 58px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const word = TAGS[Math.floor(Math.random() * TAGS.length)]!;
  const size = word.length > 8 ? 34 : 58;
  ctx.font = `bold ${size}px sans-serif`;

  ctx.lineWidth = 7;
  ctx.strokeStyle = ink;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillText(word, 0, 0);

  ctx.beginPath();
  ctx.moveTo(-90, 34);
  ctx.bezierCurveTo(-30, 46, 30, 22, 92, 38);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

/** A tag sprayed on a wall, which comes off under the pressure washer. */
export class Graffiti {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private left = 1;
  /** Half-extents of the slab of air in front of it that counts as a hit. */
  private reach: THREE.Vector3;

  constructor(scene: THREE.Scene, wall: Wall) {
    this.scene = scene;

    const wide = Math.min(2.6, wall.width * 0.6);
    const high = Math.min(1.4, wall.height * 0.55);
    this.material = new THREE.MeshBasicMaterial({
      map: tagTexture(),
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wide, high), this.material);

    // Sat just proud of the brickwork, off-centre like the real thing.
    const out = new THREE.Vector3(Math.sin(wall.yaw), 0, Math.cos(wall.yaw));
    const along = new THREE.Vector3(out.z, 0, -out.x);
    const shift = (Math.random() - 0.5) * Math.max(0, wall.width - wide);
    this.mesh.position
      .set(wall.x, wall.y, wall.z)
      .addScaledVector(out, 0.06)
      .addScaledVector(along, shift);
    this.mesh.rotation.y = wall.yaw;
    scene.add(this.mesh);

    this.reach = new THREE.Vector3(wide / 2 + 0.4, high / 2 + 0.4, 0.7);
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  /** Did a droplet land on the tag? */
  public hitBy(point: THREE.Vector3): boolean {
    const local = this.mesh.worldToLocal(point.clone());
    return (
      Math.abs(local.x) < this.reach.x &&
      Math.abs(local.y) < this.reach.y &&
      Math.abs(local.z) < this.reach.z
    );
  }

  /** Another second under the lance and a bit more of it lifts. */
  public scrub(): void {
    this.left = Math.max(0, this.left - SCRUB_PER_HIT);
    this.material.opacity = this.left;
  }

  public isClean(): boolean {
    return this.left <= 0;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}
