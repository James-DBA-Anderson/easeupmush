import Phaser from "phaser";
import type { Fighter } from "../entities/Fighter";
import type { CarSurface, DestructibleProp, PropHitResult } from "../world/DestructibleProp";
import { LANE, ROAD, FIGHT_DEPTH_BASE, PASSING_TRAFFIC_DEPTH } from "../constants";

/** Lane-Y draw order — fractional index so crowds can't overtake road traffic. */
export function fightPlaneDepth(
  laneY: number,
  index: number,
  onPlatform = false,
): number {
  const tie = index * 0.001;
  if (onPlatform) return 40 + laneY * 0.02 + tie;
  return FIGHT_DEPTH_BASE + laneY * 0.05 + tie;
}

function decksOf(car: DestructibleProp, surface: CarSurface) {
  return {
    bonnet: car.bonnetY,
    roof: car.roofY,
    surface,
    car,
  };
}

function stickTo(f: Fighter, car: DestructibleProp, surface: CarSurface): void {
  const y = car.deckY(surface);
  f.platformY = y;
  f.carSurface = surface;
  f.mountedCar = car;
  f.carBonnetY = car.bonnetY;
  f.carRoofY = car.roofY;
  f.y = y;
  f.groundY = car.y;
}

function dropToRoad(f: Fighter, car: DestructibleProp | null, now: number): void {
  f.clearCarMount();
  f.carDismountUntil = now + 450;
  const roadY = car
    ? Math.max(ROAD.top + 6, Math.min(LANE.maxY, car.y - 4))
    : Math.min(ROAD.top + 8, LANE.maxY);
  f.y = roadY;
  f.groundY = f.y;
}

/**
 * SF2-style car platforms: jump onto bonnet/roof, or climb from the road.
 * Bonnet/boot stay off the cabin glass — walk toward the windows to climb the roof.
 */
export function updateCarPlatforms(
  fighters: Fighter[],
  cars: DestructibleProp[],
  now: number,
): void {
  for (const f of fighters) {
    if (f.structure.isOut() || f.structure.downed) {
      f.clearCarMount();
      f.climbing = false;
      continue;
    }

    if (f.updateClimbMotion(now)) continue;

    let stuckTo: DestructibleProp | null = null;
    let surface: CarSurface | null = null;

    for (const car of cars) {
      if (car.key !== "car") continue;
      const dx = Math.abs(f.x - car.x);
      if (dx > car.rx + 22) continue;

      const bonnet = car.bonnetY;
      const roof = car.roofY;
      const onThisCar = f.mountedCar === car || (f.platformY !== null && Math.abs(f.groundY - car.y) < 28);
      const wasOnThisCar = f.mountedCar === car || Math.abs(f.groundY - car.y) < 28;
      const onRoad = f.laneY >= ROAD.top - 14;
      // Climb / land only when you're actually at the body — not a wide aura
      const overlapX = dx <= car.rx + 14;
      const fromLeft = f.x < car.x;
      const atFront = fromLeft && dx > car.rx * 0.32 && dx <= car.rx + 18;
      const atRear = !fromLeft && dx > car.rx * 0.32 && dx <= car.rx + 18;
      const alongSide = dx <= car.rx + 4 && Math.abs(f.y - car.y) < 40;
      const canRemount = now >= f.carDismountUntil;

      // Bounce the motor when you hop on it
      if (f.airborne && f.jumpVy < 0 && wasOnThisCar && !f.carJumpBounced) {
        car.bounce(0.7);
        f.carJumpBounced = true;
      }

      // Land while falling — pick the deck under your feet (never the windows)
      if (
        f.airborne &&
        f.jumpVy >= 0 &&
        f.action !== "swanton" &&
        f.action !== "hurricanrana" &&
        overlapX &&
        (onRoad || wasOnThisCar || atFront || atRear)
      ) {
        const band = car.surfaceAt(f.x);
        if (band === "roof" && f.y >= roof - 22 && f.y <= bonnet - 6) {
          f.airborne = false;
          f.jumpVy = 0;
          if (f.action === "jump") f.action = "idle";
          stickTo(f, car, "roof");
          car.bounce(1.15);
          f.carJumpBounced = false;
          stuckTo = car;
          surface = "roof";
          break;
        }
        if ((band === "bonnet" || band === "boot") && f.y >= roof + 4 && f.y <= bonnet + 40) {
          f.airborne = false;
          f.jumpVy = 0;
          if (f.action === "jump") f.action = "idle";
          stickTo(f, car, band);
          car.bounce(1.05);
          f.carJumpBounced = false;
          stuckTo = car;
          surface = band;
          break;
        }
      }

      // Bumpers → nearest deck; cabin side → roof (not the glass)
      if (
        canRemount &&
        !f.airborne &&
        f.platformY === null &&
        !f.climbing &&
        onRoad &&
        (atFront || atRear || alongSide)
      ) {
        const target: CarSurface =
          f.x >= car.bonnetMaxX && f.x <= car.bootMinX
            ? "roof"
            : f.x < car.x
              ? "bonnet"
              : "boot";
        const range = car.deckRange(target);
        const inward = Math.sign(car.x - f.x) || 1;
        const toX = Phaser.Math.Clamp(f.x + inward * 18, range.min, range.max);
        f.beginClimbOnto(toX, car.deckY(target), car.y, now, decksOf(car, target));
        stuckTo = car;
        surface = target;
        break;
      }

      // Already on this car — hold the deck, and walk toward the cabin to climb
      if (!f.airborne && onThisCar && overlapX && f.platformY !== null) {
        const current: CarSurface = f.carSurface ?? car.surfaceAt(f.x) ?? "bonnet";
        const range = car.deckRange(current);

        if (current === "bonnet" && f.x > range.max + 1) {
          const roofRange = car.deckRange("roof");
          f.beginClimbOnto(
            Phaser.Math.Clamp(f.x, roofRange.min, roofRange.max),
            car.roofY,
            car.y,
            now,
            decksOf(car, "roof"),
          );
          stuckTo = car;
          surface = "roof";
          break;
        }
        if (current === "boot" && f.x < range.min - 1) {
          const roofRange = car.deckRange("roof");
          f.beginClimbOnto(
            Phaser.Math.Clamp(f.x, roofRange.min, roofRange.max),
            car.roofY,
            car.y,
            now,
            decksOf(car, "roof"),
          );
          stuckTo = car;
          surface = "roof";
          break;
        }
        if (current === "roof" && f.x < range.min - 1) {
          const bonnetRange = car.deckRange("bonnet");
          f.beginClimbOnto(
            Phaser.Math.Clamp(f.x, bonnetRange.min, bonnetRange.max),
            car.bonnetY,
            car.y,
            now,
            decksOf(car, "bonnet"),
          );
          stuckTo = car;
          surface = "bonnet";
          break;
        }
        if (current === "roof" && f.x > range.max + 1) {
          const bootRange = car.deckRange("boot");
          f.beginClimbOnto(
            Phaser.Math.Clamp(f.x, bootRange.min, bootRange.max),
            car.bonnetY,
            car.y,
            now,
            decksOf(car, "boot"),
          );
          stuckTo = car;
          surface = "boot";
          break;
        }

        f.x = Phaser.Math.Clamp(f.x, range.min, range.max);
        stickTo(f, car, current);
        stuckTo = car;
        surface = current;
      }
    }

    // Walked off a bumper → drop onto the road in front of the motor
    if (f.platformY !== null && !f.airborne && !f.climbing) {
      const car =
        f.mountedCar ??
        cars.find((c) => c.key === "car" && Math.abs(c.y - f.groundY) < 28) ??
        null;
      if (!car) {
        dropToRoad(f, null, now);
        continue;
      }
      const current = f.carSurface ?? car.surfaceAt(f.x);
      const offFront = current === "bonnet" && f.x < car.bonnetMinX - 4;
      const offRear = current === "boot" && f.x > car.bootMaxX + 4;
      const offWhole = Math.abs(f.x - car.x) > car.rx + 16;
      if (offFront || offRear || offWhole) {
        dropToRoad(f, car, now);
      } else if (stuckTo && surface) {
        stickTo(f, stuckTo, surface);
      }
    } else if (!f.airborne && !f.climbing && f.platformY === null && f.mountedCar) {
      f.mountedCar = null;
      f.carSurface = null;
    }
  }
}

/** Body toss slam while stood on a motor — write it off. */
export function wreckCarUnderThrower(
  scene: Phaser.Scene,
  thrower: Fighter,
  props: DestructibleProp[],
): { prop: DestructibleProp; result: PropHitResult } | null {
  const car =
    thrower.mountedCar && thrower.mountedCar.key === "car"
      ? thrower.mountedCar
      : (props.find(
          (p) => p.isCar && !p.destroyed && Math.abs(p.y - thrower.groundY) < 40,
        ) ?? null);
  if (!car || car.destroyed) return null;
  if (!thrower.mountedCar && thrower.platformY === null && !thrower.climbing) return null;
  const result = car.wreck(scene);
  return { prop: car, result };
}

/**
 * Draw fighters under cars / coffee van when standing north of them,
 * and above when in front / on the platform.
 * Passing road traffic (optional) always paints in front of the promenade.
 */
export function syncCarOcclusion(
  fighters: Fighter[],
  props: DestructibleProp[],
  passingTraffic: Phaser.GameObjects.Image[] = [],
): void {
  const motors = props.filter((c) => c.isOccluder);
  for (const t of passingTraffic) {
    if (t.active) t.setDepth(PASSING_TRAFFIC_DEPTH);
  }
  const trafficCap =
    passingTraffic.some((t) => t.active) ? PASSING_TRAFFIC_DEPTH - 1 : null;

  fighters.sort((a, b) => a.laneY - b.laneY || a.y - b.y);
  fighters.forEach((f, i) => {
    if (f.isBackground) {
      f.setDepth(3);
      return;
    }

    let depth = fightPlaneDepth(f.laneY, i, f.platformY !== null);

    for (const car of motors) {
      if (Math.abs(f.x - car.x) > car.rx + 28) continue;
      const carD = car.image.depth;
      const onCar =
        f.climbing ||
        (f.platformY !== null && Math.abs(f.groundY - car.y) < 36);
      const inCarSprite = f.y >= car.roofY - 12 && f.y <= car.y + 8;

      // On the deck / climbing / still overlapping the body while mounted
      if (onCar || (inCarSprite && f.platformY !== null)) {
        depth = Math.max(depth, carD + 8);
        continue;
      }

      // Hinge near the lower body — south of this = in front of the art
      // (old car.y-12 threshold left almost the whole fight lane drawn behind)
      const hinge = car.y - Math.round(car.image.displayHeight * 0.28);
      if (f.laneY < hinge) {
        depth = Math.min(depth, carD - 2);
      } else {
        depth = Math.max(depth, carD + 2 + (i % 4) * 0.01);
      }
    }

    // Road passers are closer to camera than the fight strip
    if (trafficCap !== null) depth = Math.min(depth, trafficCap);

    f.setDepth(depth);
  });
}
