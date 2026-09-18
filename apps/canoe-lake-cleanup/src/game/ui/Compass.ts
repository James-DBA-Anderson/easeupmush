/**
 * HUD bearing under the objective arrows. World +Z is north, −Z the Solent;
 * labels match the N-up map / CSS-flipped first-person view.
 */

const POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

const NAMES: Record<(typeof POINTS)[number], string> = {
  N: "North",
  NNE: "North-northeast",
  NE: "Northeast",
  ENE: "East-northeast",
  E: "East",
  ESE: "East-southeast",
  SE: "Southeast",
  SSE: "South-southeast",
  S: "South",
  SSW: "South-southwest",
  SW: "Southwest",
  WSW: "West-southwest",
  W: "West",
  WNW: "West-northwest",
  NW: "Northwest",
  NNW: "North-northwest",
};

export class Compass {
  private root: HTMLElement;
  private bearing: HTMLElement;
  private name: HTMLElement;
  private needle: HTMLElement;
  private last = "";

  constructor(root: HTMLElement) {
    this.root = root;
    this.bearing = root.querySelector(".compass-bearing") as HTMLElement;
    this.name = root.querySelector(".compass-name") as HTMLElement;
    this.needle = root.querySelector(".compass-needle") as HTMLElement;
  }

  /**
   * `heading` is player yaw (same as the mini-map chevron). Forward in the
   * flipped view is (−sin h, −cos h) on world XZ.
   */
  public update(heading: number): void {
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    // 0° = north (+Z), clockwise through east (+X).
    const deg = ((Math.atan2(fx, fz) * 180) / Math.PI + 360) % 360;
    const idx = Math.round(deg / 22.5) % 16;
    const point = POINTS[idx]!;
    if (point !== this.last) {
      this.last = point;
      this.bearing.textContent = point;
      this.name.textContent = NAMES[point];
      this.root.setAttribute("aria-label", `Facing ${NAMES[point]}`);
    }
    // Needle points at world north relative to the player's facing.
    this.needle.style.transform = `rotate(${-deg}deg)`;
  }
}
