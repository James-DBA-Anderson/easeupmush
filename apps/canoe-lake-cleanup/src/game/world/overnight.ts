import type { XZ } from "../../level/types";

let piles: XZ[] = [];

/** Authored opening heaps from the level editor. */
export function applyOvernightPiles(next: ReadonlyArray<XZ>): void {
  piles = next
    .filter(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    )
    .map((p) => [p[0], p[1]] as XZ);
}

export function getOvernightPiles(): ReadonlyArray<XZ> {
  return piles;
}
