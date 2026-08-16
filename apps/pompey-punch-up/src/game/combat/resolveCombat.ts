import Phaser from "phaser";
import type { StrikeKind } from "../combat/Structure";
import { Fighter, inReach } from "../entities/Fighter";
import { Civilian } from "../entities/Civilian";
import { fightPlaneDepth } from "../systems/climbCars";

export interface CombatEvent {
  attacker: Fighter;
  target: Fighter;
  result: string;
  kind: StrikeKind | "grab" | "hold" | "cuff" | "loot" | "toss_hit";
}

export function resolveCombat(
  now: number,
  fighters: Fighter[],
  onEvent?: (e: CombatEvent) => void,
): void {
  // Body-toss missiles (hurled lads) — Batman Returns style pile-up
  resolveBodyTosses(now, fighters, onEvent);

  for (const attacker of fighters) {
    if (attacker.structure.isOut()) continue;

    if (attacker.isCuffActive(now)) {
      for (const target of fighters) {
        if (target === attacker) continue;
        if (target.structure.isOut()) continue;
        if (!inReach(attacker, target, 52)) continue;
        if (!attacker.markHit(target)) continue;
        const result = target.applyCuffs(now);
        onEvent?.({ attacker, target, result, kind: "cuff" });
      }
      continue;
    }

    if (attacker.isGrabActive(now) && attacker.action === "grab") {
      // Clinch the nearest one only — then you can toss them into the rest
      let best: Fighter | null = null;
      let bestD = 9999;
      for (const target of fighters) {
        if (target === attacker) continue;
        if (target.team === attacker.team && attacker.team !== "police") continue;
        if (target.structure.isOut()) continue;
        if (!inReach(attacker, target, attacker.attackReach + 8)) continue;
        const d = Math.abs(target.x - attacker.x);
        if (d < bestD) {
          bestD = d;
          best = target;
        }
      }
      if (best && attacker.markHit(best)) {
        // Behind them if you're on the opposite side of their facing
        const fromBehind = (attacker.x - best.x) * best.facing < -8;
        best.takeDown(now);
        best.structure.createOpening(now, 1000);
        if (attacker.team === "player") {
          attacker.startHoldOn(best, now, fromBehind);
          // Keep victim stuck to you briefly
          best.x = attacker.x + attacker.facing * (fromBehind ? 14 : 22);
          best.y = attacker.y;
          best.groundY = best.y;
          if (fromBehind) best.facing = attacker.facing;
        }
        onEvent?.({
          attacker,
          target: best,
          result: "takedown",
          kind: "grab",
        });
      }
      continue;
    }

    if (attacker.action === "hold" && attacker.heldTarget) {
      const v = attacker.heldTarget;
      if (!v.structure.isOut()) {
        v.heldBy = attacker;
        v.clearPlantLock();
        const cling = attacker.holdFromBehind ? 14 : 22;
        v.x = attacker.x + attacker.facing * cling;
        v.y = attacker.y;
        v.groundY = v.y;
        if (attacker.holdFromBehind) v.facing = attacker.facing;
        v.action = "down";
        // Refresh floor timer so tough lads don't get up mid-clinch
        v.structure.putOnFloor(now, 200);
      } else {
        v.heldBy = null;
        attacker.heldTarget = null;
        attacker.holdFromBehind = false;
      }
      continue;
    }

    const strike = attacker.strikeWindow(now);
    if (!strike) continue;

    let connected = false;
    for (const target of fighters) {
      if (target === attacker) continue;
      if (attacker.isBackground || target.isBackground) continue;
      if (attacker.team === "enemy" && target.team === "enemy") continue;
      if (attacker.team === "police" && target.team === "police") continue;
      // Civilians only strike when piled in with the player, or when
      // a bloke's steaming over his missus getting hurt.
      if (attacker.team === "civilian") {
        if (!(attacker instanceof Civilian)) continue;
        if (attacker.isAlly) {
          if (target.team !== "enemy") continue;
        } else if (attacker.isProtecting) {
          if (!attacker.isTargeting(target)) continue;
        } else {
          continue;
        }
      }
      // Floor finishers only — stomps / Swanton splash. Punches & kicks pass over.
      const crawling =
        target.structure.crawling && !target.structure.outCold && !target.structure.cuffed;
      const softFloored = target.structure.downed && !target.structure.isOut();
      const floorAttack =
        attacker.action === "stomp" || attacker.action === "swanton";
      if (softFloored && !floorAttack) continue;
      if (target.structure.isOut() && !crawling && !floorAttack) continue;
      if (crawling && !floorAttack) continue;
      if (target === attacker.heldTarget) continue;
      if (!inReach(attacker, target, attacker.attackReach, attacker.attackDir)) continue;
      if (!attacker.markHit(target)) continue;

      const open =
        target.structure.isOpen(now) ||
        target.structure.downed ||
        crawling ||
        target.structure.outCold;
      const onFloor = softFloored || crawling || target.structure.isOut();
      // Soft floors are openings for boots, not free chin-shot finishers
      const critical =
        strike.critical ||
        (!softFloored &&
          open &&
          (strike.kind === "kick" ||
            strike.kind === "hook" ||
            strike.kind === "headbutt" ||
            strike.kind === "boot_head"));

      let kind: StrikeKind = strike.kind;
      if (floorAttack && onFloor) kind = "boot_head";
      else if (
        !softFloored &&
        critical &&
        strike.kind !== "taser" &&
        strike.kind !== "headbutt"
      ) {
        kind = "chin_shot";
      }
      // Crowd moves shove everyone outward from the attacker
      const knock =
        attacker.omniStrike
          ? Math.sign(target.x - attacker.x) || attacker.facing
          : attacker.attackDir;

      const result = target.receiveStrike({
        kind,
        power:
          floorAttack && onFloor
            ? Math.max(strike.power, 0.75)
            : strike.power + attacker.structure.anger * 0.1,
        critical: (floorAttack && onFloor) || critical,
        dirty: strike.dirty,
        onOpening: open,
        now,
        bodyPart: strike.bodyPart,
        knockDir: knock,
      });

      connected = true;
      onEvent?.({ attacker, target, result, kind });
      if (attacker.action === "weapon_swing") attacker.consumeWeaponHit();
      attacker.refreshVisuals(now, 0);
    }

    if (!connected) {
      const remaining = attacker.actionUntil - now;
      if (remaining < 40 && remaining > 0) attacker.onWhiff(now);
    }
  }

  fighters.sort((a, b) => a.laneY - b.laneY || a.y - b.y);
  fighters.forEach((f, i) => {
    const depth = f.isBackground
      ? 3
      : fightPlaneDepth(f.laneY, i, f.platformY !== null);
    if (f.depth !== depth) f.setDepth(depth);
  });
}

function resolveBodyTosses(
  now: number,
  fighters: Fighter[],
  onEvent?: (e: CombatEvent) => void,
): void {
  for (const missile of fighters) {
    if (now >= missile.tossUntil || missile.tossVx === 0) {
      if (now >= missile.tossUntil) missile.tossVx = 0;
      continue;
    }
    for (const target of fighters) {
      if (target === missile) continue;
      // Floor finishers only — flying bodies skip planted / KO'd lads
      if (target.structure.downed || target.structure.isOut()) continue;
      if (target.team === "civilian" && missile.team === "civilian") continue;
      const dx = Math.abs(target.x - missile.x);
      const dy = Math.abs(target.laneY - missile.laneY);
      if (dx > 36 || dy > 40) continue;
      if (!missile.markHit(target)) continue;

      const dir = Math.sign(missile.tossVx) || 1;
      const result = target.receiveStrike({
        kind: "hook",
        power: 0.8,
        critical: true,
        dirty: false,
        onOpening: true,
        now,
        bodyPart: "body",
        knockDir: dir,
      });
      // Soften the missile too
      missile.receiveStrike({
        kind: "hook",
        power: 0.35,
        critical: false,
        dirty: false,
        onOpening: true,
        now,
        bodyPart: "body",
        knockDir: -dir,
      });
      missile.tossVx *= 0.35;
      onEvent?.({
        attacker: missile,
        target,
        result,
        kind: "toss_hit",
      });
    }
  }
}

export function tryLoot(
  player: Fighter,
  fighters: Fighter[],
  onEvent?: (e: CombatEvent) => void,
): boolean {
  let best: Fighter | null = null;
  let bestDist = 110;
  for (const f of fighters) {
    if (f === player || !f.structure.isLootable()) continue;
    const d = Phaser.Math.Distance.Between(player.x, player.y, f.x, f.y);
    if (d < bestDist && Math.abs(player.laneY - f.laneY) < 48) {
      bestDist = d;
      best = f;
    }
  }
  if (!best) return false;
  const drop = best.structure.takeLoot();
  if (!drop) return false;
  player.startLooting(player.scene.time.now);
  player.money += drop.money;
  if (drop.weapon !== "none") player.equipWeapon(drop.weapon);
  onEvent?.({
    attacker: player,
    target: best,
    result: `+£${drop.money}${drop.weapon !== "none" ? ` + ${drop.weapon}` : ""}`,
    kind: "loot",
  });
  return true;
}

/** Nearest lootable body in range, if any. */
export function nearestLootable(player: Fighter, fighters: Fighter[]): Fighter | null {
  let best: Fighter | null = null;
  let bestDist = 110;
  for (const f of fighters) {
    if (f === player || !f.structure.isLootable()) continue;
    const d = Phaser.Math.Distance.Between(player.x, player.y, f.x, f.y);
    if (d < bestDist && Math.abs(player.laneY - f.laneY) < 48) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}
