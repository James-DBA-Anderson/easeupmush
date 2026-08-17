import {
  drawTitleLogo,
  TITLE_LOGO_H,
  TITLE_LOGO_W,
} from "../assets/titleLogo";

function logoCssSize(): { cssW: number; cssH: number } {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const cssW = Math.max(160, Math.min(520, Math.round(vw * 0.88)));
  let cssH = Math.round(cssW * (TITLE_LOGO_H / TITLE_LOGO_W));
  const maxH = Math.round(vh * 0.28);
  if (cssH > maxH && maxH > 40) {
    cssH = maxH;
  }
  return { cssW, cssH: Math.max(36, cssH) };
}

function applyLogoBox(el: HTMLElement, cssW: number, cssH: number): void {
  el.style.width = `${cssW}px`;
  el.style.height = `${cssH}px`;
  el.style.maxWidth = "92vw";
  el.style.maxHeight = "28vh";
}

/** Paint the chrome title wordmark onto the HTML boot overlay. */
export function paintBootLogo(): void {
  const canvas = document.getElementById("boot-logo") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { cssW, cssH } = logoCssSize();

  try {
    // Keep the bitmap at native size — iOS collapses height:auto canvases, and
    // bumping width/height by DPR makes that worse. CSS pixels are set explicitly.
    canvas.width = TITLE_LOGO_W;
    canvas.height = TITLE_LOGO_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawTitleLogo(ctx, TITLE_LOGO_W, TITLE_LOGO_H);
    applyLogoBox(canvas, cssW, cssH);

    // Safari often won't display a CSS-scaled canvas; an <img> is reliable.
    let img = document.getElementById("boot-logo-img") as HTMLImageElement | null;
    if (!img) {
      img = new Image();
      img.id = "boot-logo-img";
      img.className = "boot-logo";
      img.alt = "Pompey Punch-Up";
      canvas.insertAdjacentElement("afterend", img);
    }
    applyLogoBox(img, cssW, cssH);
    const showImg = (): void => {
      canvas.hidden = true;
      img.hidden = false;
      document.getElementById("boot-wordmark")?.setAttribute("hidden", "");
    };
    img.onload = showImg;
    img.src = canvas.toDataURL("image/png");
    if (img.complete) showImg();
  } catch (err) {
    console.warn("Boot logo paint failed", err);
    applyLogoBox(canvas, cssW, cssH);
    canvas.hidden = false;
  }
}

/** Fade out the HTML boot overlay once the title scene is painted. */
export function dismissBootLoader(): void {
  const el = document.getElementById("boot-loader");
  if (!el || el.classList.contains("is-done")) return;
  el.classList.add("is-done");
  window.setTimeout(() => el.remove(), 400);
}
