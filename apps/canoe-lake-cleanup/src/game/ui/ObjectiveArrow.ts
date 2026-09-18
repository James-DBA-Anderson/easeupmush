import * as THREE from "three";

/** Stick with the current mark unless something else is clearly closer. */
const STICKY = 1.85;
/** Beyond this, arrow stays as a top-of-screen compass. */
const HUD_RANGE = 16;
/** Inside this, arrow sits fully over the mark in the world. */
const HOVER_RANGE = 5.5;
/** Hide once you're stood on it. */
const HIDE_WITHIN = 1.6;
/** How high above the spot the hover marker floats (metres). */
const HOVER_HEIGHT = 1.45;

export type ArrowKind = "mess" | "mission";

/**
 * Direction chevron. Yellow (`mess`) tracks dirt and ambient jobs; red
 * (`mission`) is reserved for scripted radio missions.
 */
export class ObjectiveArrow {
  private root: HTMLElement;
  private chevron: HTMLElement;
  private kind: ArrowKind;
  private locked: { x: number; z: number } | null = null;
  private scratch = new THREE.Vector3();
  private bob = 0;

  constructor(root: HTMLElement, kind: ArrowKind = "mess") {
    this.root = root;
    this.kind = kind;
    this.chevron = root.querySelector(".objective-chevron") as HTMLElement;
    this.root.classList.add(kind);
  }

  /**
   * `spots` are targets for this arrow. `heading` is the player's yaw.
   */
  public update(
    camera: THREE.PerspectiveCamera,
    player: { x: number; z: number },
    heading: number,
    spots: ReadonlyArray<{ x: number; z: number }>,
    delta: number,
  ): void {
    const target = this.pick(player, spots);
    if (!target) {
      this.root.classList.remove("visible", "hovering");
      return;
    }

    const gap = Math.hypot(target.x - player.x, target.z - player.z);
    // Missions stay visible until you're right on them; mess hides a bit sooner.
    const hideWithin = this.kind === "mission" ? 1.2 : HIDE_WITHIN;
    if (gap < hideWithin) {
      this.root.classList.remove("visible", "hovering");
      return;
    }

    this.bob += delta;

    // 0 = pure HUD compass, 1 = world hover above the target.
    const blend = THREE.MathUtils.clamp(
      1 - (gap - HOVER_RANGE) / (HUD_RANGE - HOVER_RANGE),
      0,
      1,
    );
    const ease = blend * blend * (3 - 2 * blend);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const touch = document.body.classList.contains("touch-ui");
    // Mission sits higher; mess sits a touch lower so both can show at once.
    const hudX = width * 0.5;
    const hudY =
      this.kind === "mission"
        ? touch
          ? 22
          : 72
        : touch
          ? 56
          : 118;

    // Ahead / visual-right in the CSS-flipped view (canvas is scaleX(-1)).
    // Camera forward is (−sin h, −cos h); camera right is (cos h, −sin h);
    // visual right is camera left (−cos h, sin h). Using (−cos, −sin) for
    // “right” made the basis collapse near 45° headings — arrow stuck on
    // “forward” and spun with the player.
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = -Math.cos(heading);
    const rz = Math.sin(heading);
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const turn = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);

    // Project a point floating above the mark into screen space.
    const hoverH = this.kind === "mission" ? 1.85 : HOVER_HEIGHT;
    const bobY = Math.sin(this.bob * 3.2) * 0.1;
    this.scratch.set(target.x, hoverH + bobY, target.z);
    this.scratch.project(camera);

    const behind = this.scratch.z > 1;
    // Mirror X to match the flipped game canvas.
    const worldX = (0.5 - this.scratch.x * 0.5) * width;
    const worldY = (-this.scratch.y * 0.5 + 0.5) * height;

    // If the mark is behind the camera while close, fall back toward HUD.
    const useWorld = !behind && ease > 0.02;
    if (!useWorld && ease > 0.85) {
      this.place(hudX, hudY, turn, 58, 0, false);
      this.root.classList.add("visible");
      this.root.classList.remove("hovering");
      return;
    }

    const screenBob = useWorld ? Math.sin(this.bob * 3.2) * 6 * ease : 0;
    const x = THREE.MathUtils.lerp(hudX, worldX, useWorld ? ease : 0);
    const y =
      THREE.MathUtils.lerp(hudY, worldY, useWorld ? ease : 0) + screenBob;

    // Tip points forward on the HUD; tip points down onto the mark when hovering.
    const tipZ = THREE.MathUtils.lerp(turn, Math.PI, ease);
    const tipX = THREE.MathUtils.lerp(58, 18, ease);
    const scale = THREE.MathUtils.lerp(
      this.kind === "mission" ? 1.08 : 1,
      this.kind === "mission" ? 1.25 : 1.15,
      ease,
    );

    this.place(x, y, tipZ, tipX, scale, ease > 0.55);
    this.root.classList.add("visible");
  }

  private place(
    x: number,
    y: number,
    tipZ: number,
    tipX: number,
    scale: number,
    hovering: boolean,
  ): void {
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.root.classList.toggle("hovering", hovering);
    this.chevron.style.transform = `rotateX(${tipX}deg) rotateZ(${tipZ}rad) scale(${scale})`;
  }

  private pick(
    player: { x: number; z: number },
    spots: ReadonlyArray<{ x: number; z: number }>,
  ): { x: number; z: number } | null {
    if (spots.length === 0) {
      this.locked = null;
      return null;
    }

    let best = spots[0]!;
    let bestDist = Infinity;
    for (const spot of spots) {
      const gap = Math.hypot(spot.x - player.x, spot.z - player.z);
      if (gap < bestDist) {
        bestDist = gap;
        best = spot;
      }
    }

    // Keep the previous mark if it's still valid and not much farther —
    // stops the arrow flicking between two piles of the same mess.
    if (this.locked) {
      const kept = spots.find(
        (spot) =>
          Math.hypot(spot.x - this.locked!.x, spot.z - this.locked!.z) < 2.5,
      );
      if (kept) {
        const keepDist = Math.hypot(kept.x - player.x, kept.z - player.z);
        if (keepDist < bestDist * STICKY) {
          this.locked = { x: kept.x, z: kept.z };
          return this.locked;
        }
      }
    }

    this.locked = { x: best.x, z: best.z };
    return this.locked;
  }
}
