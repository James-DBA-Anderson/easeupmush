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

  try {
    // Always paint at the wordmark's native size; CSS scales the canvas down.
    // Drawing into a narrow mobile bitmap clipped the italic chrome rim entirely.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(TITLE_LOGO_W * dpr);
    canvas.height = Math.round(TITLE_LOGO_H * dpr);
    canvas.style.width = "";
    canvas.style.height = "";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTitleLogo(ctx, TITLE_LOGO_W, TITLE_LOGO_H);
  } catch (err) {
    console.warn("Boot logo paint failed", err);
  }
}

/** Fade out the HTML boot overlay once the title scene is painted. */
export function dismissBootLoader(): void {
  const el = document.getElementById("boot-loader");
  if (!el || el.classList.contains("is-done")) return;
  el.classList.add("is-done");
  window.setTimeout(() => el.remove(), 400);
}
