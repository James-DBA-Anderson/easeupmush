import type { Scene } from "three";
import type { ClimbZone, Platform, Solid } from "../types";
import type { Carrot } from "./Carrot";

/** Shared level surface for Game. */
export interface Level {
  readonly platforms: Platform[];
  readonly solids: Solid[];
  readonly carrots: Carrot[];
  /** Optional climbable faces (Chippy). */
  readonly climbZones?: ClimbZone[];
  /** Carrots needed to clear (0 = reach the goal instead). */
  readonly targetCarrots: number;
  /** Optional finish volume (e.g. wormhole). */
  readonly goal?: import("three").Vector3;
  readonly goalRadius?: number;
  update(delta: number, elapsed: number): void;
  reset(): void;
  dispose(scene: Scene): void;
}
