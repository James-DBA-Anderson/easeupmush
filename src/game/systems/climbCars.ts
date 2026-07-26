import type { Fighter } from "../entities/Fighter";
import type { DestructibleProp } from "../world/DestructibleProp";
import { LANE, ROAD } from "../constants";

/**
 * SF2-style car platforms: walk/jump onto bonnet from the kerb, hop to roof.
 * Cars sit on the road below the fight lane — step on from the promenade edge.
 */
export function updateCarPlatforms(fighters: Fighter[], cars: DestructibleProp[]): void {
  for (const f of fighters) {
    if (f.structure.isOut() || f.structure.downed) {
      f.platformY = null;
      continue;
    }

    let stuckTo: DestructibleProp | null = null;
    let surface: number | null = null;

    for (const car of cars) {
      if (car.key !== "car") continue;
      const onX = Math.abs(f.x - car.x) <= car.rx + 16;
      if (!onX) continue;

      const bonnet = car.bonnetY;
      const roof = car.roofY;
      // On the road near the motor, or already on it
      const nearRoad = f.laneY >= ROAD.top - 24;
      const onThisCar = f.platformY !== null && Math.abs(f.groundY - car.y) < 16;
      const nearLane = onThisCar || nearRoad;

      // Landing from a jump onto a surface
      if (f.airborne && f.jumpVy >= 0 && nearLane) {
        if (f.y >= roof - 14 && f.y <= roof + 16) {
          f.y = roof;
          f.airborne = false;
          f.jumpVy = 0;
          f.platformY = roof;
          f.groundY = car.y;
          if (f.action === "jump") f.action = "idle";
          stuckTo = car;
          surface = roof;
          break;
        }
        if (f.y >= bonnet - 16 && f.y <= bonnet + 20) {
          f.y = bonnet;
          f.airborne = false;
          f.jumpVy = 0;
          f.platformY = bonnet;
          f.groundY = car.y;
          if (f.action === "jump") f.action = "idle";
          stuckTo = car;
          surface = bonnet;
          break;
        }
      }

      // Walk into the car from the road → step onto bonnet
      if (!f.airborne && f.platformY === null && nearRoad) {
        if (Math.abs(f.x - car.x) < car.rx + 12) {
          f.platformY = bonnet;
          f.groundY = car.y;
          f.y = bonnet;
          stuckTo = car;
          surface = bonnet;
          break;
        }
      }

      // Already on this car — hold surface (bonnet or roof)
      if (!f.airborne && onThisCar && onX) {
        const onRoof = f.platformY! <= (bonnet + roof) * 0.5;
        surface = onRoof ? roof : bonnet;
        f.platformY = surface;
        f.y = surface;
        f.groundY = car.y;
        stuckTo = car;
      }
    }

    // Walked off the ends of the car → drop back onto the promenade
    if (f.platformY !== null && !f.airborne) {
      const car = cars.find((c) => c.key === "car" && Math.abs(c.y - f.groundY) < 16);
      if (!car || Math.abs(f.x - car.x) > car.rx + 18) {
        f.platformY = null;
        // Drop onto the road under the car
        f.y = car ? Math.min(car.y, LANE.maxY) : LANE.maxY;
        f.groundY = f.y;
      } else if (stuckTo && surface !== null) {
        f.y = surface;
      }
    }
  }
}
