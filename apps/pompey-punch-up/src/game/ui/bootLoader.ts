import {
  drawTitleLogo,
  TITLE_LOGO_H,
  TITLE_LOGO_W,
} from "../assets/titleLogo";

/** Paint the chrome title wordmark onto the HTML boot overlay. */
export function paintBootLogo(): void {
  const canvas = document.getElementById("boot-logo") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Match device pixels so the chrome rim stays sharp on retina
  const cssW = Math.min(520, Math.floor(window.innerWidth * 0.88));
  const cssH = Math.round((cssW / TITLE_LOGO_W) * TITLE_LOGO_H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTitleLogo(ctx, cssW, cssH);
}

/** Fade out the HTML boot overlay once the title scene is painted. */
export function dismissBootLoader(): void {
  const el = document.getElementById("boot-loader");
  if (!el || el.classList.contains("is-done")) return;
  el.classList.add("is-done");
  window.setTimeout(() => el.remove(), 400);
}
