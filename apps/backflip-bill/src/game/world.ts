import {
  FLAG_X,
  GAP_END,
  GROUND_Y,
  LEFT_END,
  LEVEL_END,
  VIEW_WIDTH,
} from "./constants";

export interface Platform {
  x0: number;
  x1: number;
  y: number;
}

export const PLATFORMS: Platform[] = [
  { x0: -4, x1: LEFT_END, y: GROUND_Y },
  { x0: GAP_END, x1: LEVEL_END + 6, y: GROUND_Y },
];

export function groundAt(x: number): number | null {
  for (const p of PLATFORMS) {
    if (x >= p.x0 && x <= p.x1) return p.y;
  }
  return null;
}

export interface Cam {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeCam(viewW: number, viewH: number): Cam {
  return { x: 0, y: 0, w: viewW, h: viewH };
}

export function fitView(cssW: number, cssH: number): { w: number; h: number } {
  const w = VIEW_WIDTH;
  const h = w * (cssH / Math.max(1, cssW));
  return { w, h };
}

export function followCam(cam: Cam, px: number, vx: number, dt: number): void {
  const look = Math.max(-2.2, Math.min(2.2, vx * 0.28));
  const targetX = px + look;
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
  const minX = cam.w * 0.45;
  const maxX = LEVEL_END - cam.w * 0.4;
  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  // Ground sits in the lower third so portrait has sky to breathe.
  cam.y = GROUND_Y + cam.h * 0.28;
}

export function drawSky(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "#1b3348");
  g.addColorStop(0.45, "#3a5570");
  g.addColorStop(0.72, "#c47a4a");
  g.addColorStop(1, "#f0a23a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  // Sodium glow.
  const sx = worldToScreenX(cam, cssW, 10);
  const sy = worldToScreenY(cam, cssH, 7);
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, cssW * 0.55);
  glow.addColorStop(0, "rgba(240,162,58,0.28)");
  glow.addColorStop(1, "rgba(240,162,58,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cssW, cssH);
}

export function drawWorld(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  drawSea(ctx, cam, cssW, cssH);
  drawBackdrop(ctx, cam, cssW, cssH);
  drawPit(ctx, cam, cssW, cssH);
  drawGround(ctx, cam, cssW, cssH);
  drawFlag(ctx, cam, cssW, cssH);
}

function drawSea(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const horizon = worldToScreenY(cam, cssH, 1.8);
  ctx.fillStyle = "#163445";
  ctx.fillRect(0, horizon, cssW, cssH);
  ctx.strokeStyle = "rgba(200,221,230,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(cssW, horizon);
  ctx.stroke();

  ctx.strokeStyle = "rgba(200,221,230,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = horizon + 18 + i * 22;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  // Distant lamps along the esplanade.
  for (let x = 0; x <= LEVEL_END; x += 6.5) {
    const sx = worldToScreenX(cam, cssW, x);
    const gy = worldToScreenY(cam, cssH, GROUND_Y);
    if (sx < -40 || sx > cssW + 40) continue;
    ctx.strokeStyle = "#2a1c14";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, gy);
    ctx.lineTo(sx, gy - 86);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,196,107,0.85)";
    ctx.beginPath();
    ctx.arc(sx, gy - 90, 6, 0, Math.PI * 2);
    ctx.fill();
    const lamp = ctx.createRadialGradient(sx, gy - 90, 2, sx, gy - 90, 48);
    lamp.addColorStop(0, "rgba(255,196,107,0.28)");
    lamp.addColorStop(1, "rgba(255,196,107,0)");
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(sx, gy - 90, 48, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPit(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const x0 = worldToScreenX(cam, cssW, LEFT_END);
  const x1 = worldToScreenX(cam, cssW, GAP_END);
  const y0 = worldToScreenY(cam, cssH, GROUND_Y);
  const y1 = cssH + 8;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#0a1218");
  g.addColorStop(1, "#020406");
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  ctx.fillStyle = "rgba(80, 30, 20, 0.35)";
  ctx.font = "700 13px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("the gap", (x0 + x1) / 2, y0 + 28);
}

function drawGround(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const gy = worldToScreenY(cam, cssH, GROUND_Y);
  const ppm = cssW / cam.w;
  const depth = 140;

  for (const p of PLATFORMS) {
    const x0 = worldToScreenX(cam, cssW, p.x0);
    const x1 = worldToScreenX(cam, cssW, p.x1);
    ctx.fillStyle = "#5c5348";
    ctx.fillRect(x0, gy, x1 - x0, depth);
    ctx.fillStyle = "#8a8378";
    ctx.fillRect(x0, gy, x1 - x0, 10);
    ctx.fillStyle = "#d8cbb8";
    ctx.fillRect(x0, gy - 4, x1 - x0, 6);

    ctx.strokeStyle = "rgba(40,32,24,0.25)";
    ctx.lineWidth = 1;
    const slab = 1.6 * ppm;
    for (let x = x0; x < x1; x += slab) {
      ctx.beginPath();
      ctx.moveTo(x, gy - 4);
      ctx.lineTo(x, gy + depth);
      ctx.stroke();
    }
  }

  // Lip marks at the gap.
  ctx.fillStyle = "#2a2420";
  const a = worldToScreenX(cam, cssW, LEFT_END);
  const b = worldToScreenX(cam, cssW, GAP_END);
  ctx.fillRect(a - 5, gy - 6, 8, 18);
  ctx.fillRect(b - 3, gy - 6, 8, 18);
}

function drawFlag(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const sx = worldToScreenX(cam, cssW, FLAG_X);
  const gy = worldToScreenY(cam, cssH, GROUND_Y);
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, gy);
  ctx.lineTo(sx, gy - 78);
  ctx.stroke();
  ctx.fillStyle = "#f0a23a";
  ctx.beginPath();
  ctx.moveTo(sx, gy - 78);
  ctx.lineTo(sx + 36, gy - 64);
  ctx.lineTo(sx, gy - 50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8f0f4";
  ctx.font = "700 12px 'Source Sans 3', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Bill", sx + 6, gy - 60);
}

export function worldToScreenX(cam: Cam, cssW: number, x: number): number {
  return ((x - (cam.x - cam.w * 0.5)) / cam.w) * cssW;
}

export function worldToScreenY(cam: Cam, cssH: number, y: number): number {
  return ((cam.y + cam.h * 0.5 - y) / cam.h) * cssH;
}

export function worldToScreen(
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  y: number,
): { x: number; y: number; ppm: number } {
  return {
    x: worldToScreenX(cam, cssW, x),
    y: worldToScreenY(cam, cssH, y),
    ppm: cssW / cam.w,
  };
}
