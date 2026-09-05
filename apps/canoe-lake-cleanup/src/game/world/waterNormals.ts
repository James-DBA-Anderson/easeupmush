import * as THREE from "three";

/**
 * A looping normal map for the lake shader — soft ripples, nothing that needs
 * fetching from disk.
 */
export function waterNormalsTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // A few overlapping waves so the surface isn't a single sine.
      const h =
        Math.sin(u * Math.PI * 8 + v * Math.PI * 2) * 0.45 +
        Math.sin(u * Math.PI * 3 - v * Math.PI * 11) * 0.3 +
        Math.sin((u + v) * Math.PI * 14) * 0.2 +
        Math.sin(u * Math.PI * 19 + v * Math.PI * 7) * 0.15;
      const hx =
        Math.cos(u * Math.PI * 8 + v * Math.PI * 2) * 0.45 * 8 +
        Math.cos(u * Math.PI * 3 - v * Math.PI * 11) * 0.3 * 3 +
        Math.cos((u + v) * Math.PI * 14) * 0.2 * 14 +
        Math.cos(u * Math.PI * 19 + v * Math.PI * 7) * 0.15 * 19;
      const hy =
        Math.sin(u * Math.PI * 8 + v * Math.PI * 2) * 0.45 * 2 -
        Math.cos(u * Math.PI * 3 - v * Math.PI * 11) * 0.3 * 11 +
        Math.cos((u + v) * Math.PI * 14) * 0.2 * 14 +
        Math.cos(u * Math.PI * 19 + v * Math.PI * 7) * 0.15 * 7;

      const nx = THREE.MathUtils.clamp(0.5 + hx * 0.04 + h * 0.02, 0, 1);
      const ny = THREE.MathUtils.clamp(0.5 + hy * 0.04, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.floor(nx * 255);
      img.data[i + 1] = Math.floor(ny * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
