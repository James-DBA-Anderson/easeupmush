/** Streets of Rage–style chrome italic wordmark — title screen + boot loader. */
export const TITLE_LOGO_W = 820;
export const TITLE_LOGO_H = 178;

export function drawTitleLogo(
  ctx: CanvasRenderingContext2D,
  w = TITLE_LOGO_W,
  h = TITLE_LOGO_H,
): void {
  ctx.clearRect(0, 0, w, h);

  const sx = w / TITLE_LOGO_W;
  const sy = h / TITLE_LOGO_H;
  const lines: { text: string; size: number; y: number }[] = [
    { text: "POMPEY", size: 78 * sy, y: 62 * sy },
    { text: "PUNCH-UP", size: 68 * sy, y: 136 * sy },
  ];

  const paint = (mode: "fill" | "stroke", ox: number, oy: number): void => {
    for (const line of lines) {
      ctx.font = `900 ${line.size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = `${-2 * sx}px`;
      const x = w * 0.5 - 28 * sx + ox;
      const y = line.y + oy;
      if (mode === "fill") ctx.fillText(line.text, x, y);
      else ctx.strokeText(line.text, x, y);
    }
  };

  ctx.save();
  // Hard italic lean — classic 16-bit brawler wordmark
  ctx.transform(1, 0, -0.32, 1, 78 * sx, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.miterLimit = 2;

  // Deep navy extrusion (fake 3D block)
  for (let i = 10; i >= 1; i--) {
    const t = i / 10;
    ctx.fillStyle = t > 0.55 ? "#061018" : "#0c1c30";
    paint("fill", i * 1.15 * sx, i * 1.35 * sy);
  }

  // Hot outer rim (arcade punch)
  ctx.strokeStyle = "#ff2a1a";
  ctx.lineWidth = 18 * Math.min(sx, sy);
  paint("stroke", 0, 0);
  ctx.strokeStyle = "#ffcc33";
  ctx.lineWidth = 12 * Math.min(sx, sy);
  paint("stroke", 0, 0);

  // Heavy black outline
  ctx.strokeStyle = "#050508";
  ctx.lineWidth = 8 * Math.min(sx, sy);
  paint("stroke", 0, 0);

  // Chrome / steel fill with blue Pompey flash
  const chrome = ctx.createLinearGradient(0, 12 * sy, 0, 168 * sy);
  chrome.addColorStop(0, "#ffffff");
  chrome.addColorStop(0.18, "#dcefff");
  chrome.addColorStop(0.34, "#7eb0e0");
  chrome.addColorStop(0.48, "#f4f8ff");
  chrome.addColorStop(0.58, "#3a6ea5");
  chrome.addColorStop(0.74, "#c5ddf5");
  chrome.addColorStop(0.88, "#1e4a7a");
  chrome.addColorStop(1, "#9bb8d4");
  ctx.fillStyle = chrome;
  paint("fill", 0, 0);

  // Crisp inner edge highlight
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2.2 * Math.min(sx, sy);
  paint("stroke", -0.5 * sx, -1.2 * sy);

  // Top ridge glint (SoR chrome catch-light)
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.4 * Math.min(sx, sy);
  paint("stroke", -1.2 * sx, -2.4 * sy);

  ctx.restore();
}
