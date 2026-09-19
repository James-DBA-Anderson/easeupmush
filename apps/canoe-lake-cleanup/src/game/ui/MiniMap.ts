import * as THREE from "three";
import {
  PATH_INNER,
  PATH_OUTER,
  PATH_SPURS,
  SHORE,
  offsetShore,
} from "../world/lake";
import {
  getPlayPark,
  parkBuildingFootprints,
  type PlayParkSite,
} from "../world/park";
import {
  surroundFootprints,
  getCarParkOutline,
  getBeachOutline,
  getRoadGraph,
  getTerraceRuns,
  ROAD_WIDTH,
  HOUSE_DEPTH,
} from "../world/buildings";
import { PARK_RING } from "../world/fence";
import type { Footprint } from "../world/collision";

const REFRESH = 1 / 15;
const PATH_COLOUR = "#9a958a";
const PATH_WIDTH = 4;
const ROAD_COLOUR = "#4a4e54";
const TERRACE_COLOUR = "#7a746c";

interface MapData {
  player: THREE.Vector3;
  heading: number;
  swans: THREE.Vector3[];
  cygnets: THREE.Vector3[];
  people: THREE.Vector3[];
  cyclists: THREE.Vector3[];
  scooters: THREE.Vector3[];
  traffic: THREE.Vector3[];
  boats: THREE.Vector3[];
  fox: THREE.Vector3 | null;
  droppings: THREE.Vector3[];
  litter: THREE.Vector3[];
  /** Ducks and gulls, drawn small so they don't crowd the swans out. */
  birds: THREE.Vector3[];
  squirrels: THREE.Vector3[];
  /** Incoming geese — pulsing radar blips on the mini-map. */
  radar?: THREE.Vector3[];
  /** Active scripted mission targets (red arrow jobs). */
  missions?: ReadonlyArray<{ x: number; z: number }>;
}

/**
 * Top-down plan of the park. North (+Z) is always up the canvas; the player
 * chevron turns to show look direction.
 */
export class MiniMap {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private scale: number;
  private since = 0;
  /** World point under the map centre (follows the player). */
  private originX = 0;
  private originZ = 0;
  /** Player look yaw (radians) — turns the chevron only. */
  private heading = 0;
  /** Hard pulse after a mission starts (seconds). */
  private missionThrobLeft = 0;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.width = canvas.clientWidth || 200;
    this.height = canvas.clientHeight || 130;
    canvas.width = this.width * dpr;
    canvas.height = this.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("mini map needs a 2D context");
    ctx.scale(dpr, dpr);
    this.ctx = ctx;

    // Fit the whole grounds inside the railings, with a little breathing room.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of PARK_RING) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    const pad = 12;
    this.scale = Math.min(
      this.width / (maxX - minX + pad * 2),
      this.height / (maxZ - minZ + pad * 2),
    );
  }

  /** World XZ → map pixels. +Z (north) is up; +X (east) is right. */
  private toScreen(x: number, z: number): [number, number] {
    return [
      this.width / 2 + (x - this.originX) * this.scale,
      this.height / 2 - (z - this.originZ) * this.scale,
    ];
  }

  private trace(points: ReadonlyArray<THREE.Vector2>): void {
    this.ctx.beginPath();
    points.forEach((p, i) => {
      const [sx, sy] = this.toScreen(p.x, p.y);
      if (i === 0) this.ctx.moveTo(sx, sy);
      else this.ctx.lineTo(sx, sy);
    });
    this.ctx.closePath();
  }

  private dot(at: THREE.Vector3, radius: number, color: string): void {
    const [sx, sy] = this.toScreen(at.x, at.z);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Oriented rectangle in world XZ — buildings, play park. */
  private rect(
    x: number,
    z: number,
    halfWide: number,
    halfDeep: number,
    yaw: number,
    fill: string,
    stroke?: string,
  ): void {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const corners: [number, number][] = [
      [-halfWide, -halfDeep],
      [halfWide, -halfDeep],
      [halfWide, halfDeep],
      [-halfWide, halfDeep],
    ];
    this.ctx.beginPath();
    corners.forEach(([lx, lz], i) => {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      const [sx, sy] = this.toScreen(wx, wz);
      if (i === 0) this.ctx.moveTo(sx, sy);
      else this.ctx.lineTo(sx, sy);
    });
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 0.75;
      this.ctx.stroke();
    }
  }

  private footprint(solid: Footprint, fill: string, stroke?: string): void {
    this.rect(
      solid.x,
      solid.z,
      solid.halfWide,
      solid.halfDeep,
      solid.yaw,
      fill,
      stroke,
    );
  }

  private playPark(site: PlayParkSite): void {
    if (site.outline.length < 2) return;
    this.ctx.beginPath();
    site.outline.forEach((p, i) => {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (i === 0) this.ctx.moveTo(sx, sy);
      else this.ctx.lineTo(sx, sy);
    });
    this.ctx.closePath();
    this.ctx.fillStyle = "#8a6a3e";
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255,255,255,0.2)";
    this.ctx.lineWidth = 0.75;
    this.ctx.stroke();
  }

  private carPark(outline: ReadonlyArray<{ x: number; z: number }>): void {
    if (outline.length < 2) return;
    this.ctx.beginPath();
    outline.forEach((p, i) => {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (i === 0) this.ctx.moveTo(sx, sy);
      else this.ctx.lineTo(sx, sy);
    });
    this.ctx.closePath();
    this.ctx.fillStyle = "#3a3e42";
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255,255,255,0.18)";
    this.ctx.lineWidth = 0.75;
    this.ctx.stroke();
  }

  private beach(outline: ReadonlyArray<{ x: number; z: number }>): void {
    if (outline.length < 2) return;
    this.ctx.beginPath();
    outline.forEach((p, i) => {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (i === 0) this.ctx.moveTo(sx, sy);
      else this.ctx.lineTo(sx, sy);
    });
    this.ctx.closePath();
    this.ctx.fillStyle = "#c9bb9a";
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255,255,255,0.15)";
    this.ctx.lineWidth = 0.75;
    this.ctx.stroke();
  }

  /** Parade asphalt — same polylines / width as the 3D road meshes. */
  private drawRoads(): void {
    const graph = getRoadGraph();
    if (!graph) return;
    const ctx = this.ctx;
    const width = Math.max(2, ROAD_WIDTH * this.scale);
    ctx.strokeStyle = ROAD_COLOUR;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const line of graph.roads) {
      if (line.length < 2) continue;
      ctx.beginPath();
      line.forEach((p, i) => {
        const [sx, sy] = this.toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
  }

  /** One continuous band per terrace run — no individual house parcels. */
  private drawTerraces(): void {
    const ctx = this.ctx;
    const width = Math.max(2, HOUSE_DEPTH * this.scale);
    ctx.strokeStyle = TERRACE_COLOUR;
    ctx.lineWidth = width;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    for (const line of getTerraceRuns()) {
      if (line.length < 2) continue;
      ctx.beginPath();
      line.forEach((p, i) => {
        const [sx, sy] = this.toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
  }

  /** Bigger seafront lumps only — skip terrace plots and parked cars. */
  private isLandmark(solid: Footprint): boolean {
    const terraceDeep = HOUSE_DEPTH * 0.5;
    if (Math.abs(solid.halfDeep - terraceDeep) < 0.2) return false;
    if (solid.halfWide <= 2.5 && solid.halfDeep <= 1.2) return false;
    return true;
  }

  /**
   * Lake ring and the spur network as stroked polylines — same segments as
   * the 3D paving, so the mini map stays in step when the paths change.
   */
  private drawPaths(): void {
    const ctx = this.ctx;
    const width = Math.max(1.5, PATH_WIDTH * this.scale);

    // Outer fill of the perimeter path, then punch the water side with grass
    // so only the ring reads as paving.
    this.trace(offsetShore(PATH_OUTER));
    ctx.fillStyle = PATH_COLOUR;
    ctx.fill();
    this.trace(offsetShore(PATH_INNER));
    ctx.fillStyle = "#456848";
    ctx.fill();

    ctx.strokeStyle = PATH_COLOUR;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const spur of PATH_SPURS) {
      const [ax, ay] = this.toScreen(spur.ax, spur.az);
      const [bx, by] = this.toScreen(spur.bx, spur.bz);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  /** Player chevron — map stays north-up; tip follows look direction. */
  private drawPlayer(): void {
    const ctx = this.ctx;
    const px = this.width / 2;
    const py = this.height / 2;
    // Camera forward is (sin h, −cos h), but the game view is CSS-flipped on X
    // so FP left/right matches the map. Mirror the chevron's east/west so it
    // agrees with what you're looking at in that flipped view.
    const h = this.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    ctx.save();
    ctx.translate(px, py);
    // Tip starts at canvas (0,−1); rotate toward map forward.
    ctx.rotate(Math.atan2(fx, fz));

    ctx.fillStyle = "#1a1204";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6.5);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5.5, 6.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /** Fixed N marker — north is always toward the top of the map. */
  private drawNorthBug(): void {
    const ctx = this.ctx;
    const cx = this.width - 16;
    const cy = 14;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.fillStyle = "rgba(255,225,120,0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx, cy - 6);
    ctx.stroke();
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", cx, cy - 12);
  }

  /** Flash mission pins hard when a radio job kicks off. */
  public pulseMissions(seconds = 9): void {
    this.missionThrobLeft = Math.max(this.missionThrobLeft, seconds);
  }

  public update(delta: number, data: MapData): void {
    if (this.missionThrobLeft > 0) {
      this.missionThrobLeft = Math.max(0, this.missionThrobLeft - delta);
    }
    this.since += delta;
    if (this.since < REFRESH) return;
    this.since = 0;
    this.draw(data);
  }

  private draw(data: MapData): void {
    const ctx = this.ctx;
    this.originX = data.player.x;
    this.originZ = data.player.z;
    this.heading = data.heading;

    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = "#3c5f40";
    ctx.fillRect(0, 0, this.width, this.height);

    // Iron railings — the walkable grounds.
    this.trace(PARK_RING);
    ctx.fillStyle = "#456848";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,25,22,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    this.drawPaths();

    this.trace(SHORE);
    ctx.fillStyle = "#2f6d7c";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Beach, roads, terrace bands, then car park under landmark footprints.
    const sand = getBeachOutline();
    if (sand) this.beach(sand);
    this.drawRoads();
    this.drawTerraces();
    const lot = getCarParkOutline();
    if (lot) this.carPark(lot);
    for (const solid of surroundFootprints()) {
      if (!this.isLandmark(solid)) continue;
      this.footprint(solid, "#8a8378", "rgba(0,0,0,0.25)");
    }
    const play = getPlayPark();
    if (play) this.playPark(play);
    for (const solid of parkBuildingFootprints()) {
      this.footprint(solid, "#6b5a48", "rgba(0,0,0,0.35)");
    }

    for (const spot of data.droppings)
      this.dot(spot, 0.8, "rgba(240,255,235,0.5)");
    for (const spot of data.litter) this.dot(spot, 0.9, "rgba(255,170,60,0.7)");
    for (const bird of data.birds) this.dot(bird, 0.8, "rgba(210,220,230,0.75)");
    for (const grey of data.squirrels) this.dot(grey, 0.7, "rgba(150,150,140,0.8)");
    for (const person of data.people) this.dot(person, 1.4, "#2b3038");
    for (const rider of data.cyclists) this.dot(rider, 1.7, "#d8452f");
    for (const scooter of data.scooters) this.dot(scooter, 1.7, "#ff7a1a");
    for (const car of data.traffic) this.dot(car, 2.2, "#5a6570");
    for (const boat of data.boats) this.dot(boat, 1.2, "#ffd24a");
    for (const swan of data.swans) this.dot(swan, 2.1, "#ffffff");
    for (const cygnet of data.cygnets) this.dot(cygnet, 1.3, "#c9bfae");
    if (data.fox) this.dot(data.fox, 1.8, "#e07a2c");

    if (data.radar && data.radar.length > 0) this.drawRadar(data.radar);
    if (data.missions && data.missions.length > 0) {
      this.drawMissions(data.missions);
    }

    this.drawPlayer();
    this.drawNorthBug();
  }

  /** Bold red pins — same spots the mission arrow tracks. */
  private drawMissions(
    spots: ReadonlyArray<{ x: number; z: number }>,
  ): void {
    const ctx = this.ctx;
    const hot = this.missionThrobLeft > 0;
    const speed = hot ? 0.016 : 0.007;
    const pulse =
      (hot ? 0.4 : 0.55) + Math.sin(performance.now() * speed) * (hot ? 0.6 : 0.45);
    ctx.save();
    for (const spot of spots) {
      const [sx, sy] = this.toScreen(spot.x, spot.z);
      const ring = (hot ? 10 : 7) + pulse * (hot ? 8 : 4);

      ctx.beginPath();
      ctx.arc(sx, sy, ring, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.25 + pulse * (hot ? 0.55 : 0.35)})`;
      ctx.lineWidth = hot ? 3 : 2.2;
      ctx.stroke();

      if (hot) {
        ctx.beginPath();
        ctx.arc(sx, sy, ring * 1.35, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 60, ${0.12 + pulse * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, hot ? 5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = "#1a0505";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, hot ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 55, 45, ${0.85 + pulse * 0.15})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 230, 180, 0.95)";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Small tip mark so it reads as a pin, not another person dot.
      ctx.beginPath();
      ctx.moveTo(sx, sy - (hot ? 12 : 9) - pulse);
      ctx.lineTo(sx + (hot ? 4 : 3.2), sy - 3.5);
      ctx.lineTo(sx - (hot ? 4 : 3.2), sy - 3.5);
      ctx.closePath();
      ctx.fillStyle = "#ff2e28";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 240, 200, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Pulsing orange blips — incoming geese on radar. */
  private drawRadar(blips: readonly THREE.Vector3[]): void {
    const ctx = this.ctx;
    const pulse = 0.55 + Math.sin(performance.now() * 0.006) * 0.35;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 120, 40, ${0.35 + pulse * 0.35})`;
    ctx.fillStyle = `rgba(255, 180, 60, ${0.5 + pulse * 0.4})`;
    for (const blip of blips) {
      const [sx, sy] = this.toScreen(blip.x, blip.z);
      const r = 3.5 + pulse * 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.font = "bold 8px sans-serif";
    ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("RADAR", 6, 6);
    ctx.restore();
  }
}
