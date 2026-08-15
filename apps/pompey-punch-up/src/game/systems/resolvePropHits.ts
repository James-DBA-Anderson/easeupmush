import Phaser from "phaser";
import type { Fighter } from "../entities/Fighter";
import type { DestructibleProp, PropHitResult } from "../world/DestructibleProp";

export type EnvHitEvent = {
  attacker: Fighter;
  prop: DestructibleProp;
  result: PropHitResult;
};

/**
 * Melee / weapon swings that connect with destructible scenery.
 */
export function resolvePropHits(
  scene: Phaser.Scene,
  now: number,
  fighters: Fighter[],
  props: DestructibleProp[],
  onHit?: (e: EnvHitEvent) => void,
): void {
  for (const attacker of fighters) {
    if (attacker.structure.isOut()) continue;
    const strike = attacker.strikeWindow(now);
    const grabbing = attacker.isGrabActive(now);
    if (!strike && !grabbing) continue;

    const power = strike
      ? strike.power + (attacker.action === "headbutt" ? 0.25 : 0) + (attacker.action === "weapon_swing" ? 0.15 : 0)
      : 0.45;
    const reach = attacker.attackReach + 10;
    const actionId = attacker.actionUntil;

    for (const prop of props) {
      if (prop.destroyed) continue;
      if (!prop.inReach(attacker.x, attacker.laneY, reach, attacker.attackDir)) continue;
      const result = prop.takeHit(scene, now, actionId, power, attacker.x);
      if (!result) continue;
      if (attacker.action === "weapon_swing") attacker.consumeWeaponHit();
      onHit?.({ attacker, prop, result });
      break; // one prop per swing
    }
  }
}
