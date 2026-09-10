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
import { surroundFootprints } from "../world/buildings";
import { PARK_RING } from "../world/fence";
import type { Footprint } from "../world/collision";

const REFRESH = 1 / 15;
const PATH_COLOUR = "#9a958a";
const PATH_WIDTH = 4;

interface MapData {
  player: THREE.Vector3;
  heading: number;
  swans: THREE.Vector3[];
  cygnets: THREE.Vector3[];
  people: THREE.Vector3[];
  cyclists: THREE.Vector3[];
  scooters: THREE.Vector3[];
  boats: THREE.Vector3[];
  fox: THREE.Vector3 | null;
  droppings: THREE.Vector3[];
  litter: THREE.Vector3[];
  /** Ducks and gulls, drawn small so they don't crowd the swans out. */
  birds: THREE.Vector3[];
  squirrels: THREE.Vector3[];
}

/** Top-down plan of the park drawn straight onto a 2D canvas. */
export class MiniMap {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private scale: number;
  private since = 0;

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

  private toScreen(x: number, z: number): [number, number] {
    // North (+Z) at the top, matching the satellite plan.
    return [this.width / 2 + x * this.scale, this.height / 2 - z * this.scale];
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
    this.rect(
      site.x,
      site.z,
      site.wide / 2,
      site.deep / 2,
      site.yaw,
      "#5a4a52",
      "rgba(255,255,255,0.2)",
    );
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

  /**
   * Player chevron. Tip is drawn pointing up (screen −Y = world +Z); canvas
   * yaw is clockwise, while world heading is CCW about Y, so we rotate by
   * π + heading to send the tip along the look direction.
   */
  private drawPlayer(x: number, z: number, heading: number): void {
    const ctx = this.ctx;
    const [px, py] = this.toScreen(x, z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI + heading);

    // Dark outline so it stays readable on pale paving.
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

  public update(delta: number, data: MapData): void {
    this.since += delta;
    if (this.since < REFRESH) return;
    this.since = 0;
    this.draw(data);
  }

  private draw(data: MapData): void {
    const ctx = this.ctx;
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

    // Surround terraces first (far), then park buildings on top.
    for (const solid of surroundFootprints()) {
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
    for (const boat of data.boats) this.dot(boat, 1.2, "#ffd24a");
    for (const swan of data.swans) this.dot(swan, 2.1, "#ffffff");
    for (const cygnet of data.cygnets) this.dot(cygnet, 1.3, "#c9bfae");
    if (data.fox) this.dot(data.fox, 1.8, "#e07a2c");

    this.drawPlayer(data.player.x, data.player.z, data.heading);
  }
}
