import * as THREE from "three";
import type { Platform, Solid } from "../types";

export type LollipopFlavor = "purple" | "swirl" | "red";

const FLAVORS: Record<
  LollipopFlavor,
  { a: number; b: number }
> = {
  purple: { a: 0x9b5de5, b: 0xd4a5ff },
  swirl: { a: 0x4cc9f0, b: 0xffe066 },
  red: { a: 0xff4d6d, b: 0xffb3c1 },
};

/** Brown stick + flat swirl disc platform. */
export function buildLollipop(
  x: number,
  z: number,
  height: number,
  radius: number,
  flavor: LollipopFlavor,
): { group: THREE.Group; platform: Platform; stick: Solid } {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.85,
  });
  const stickR = 0.16;
  const stickMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(stickR * 0.85, stickR, height, 8),
    stickMat,
  );
  stickMesh.position.y = height / 2;
  stickMesh.castShadow = true;
  stickMesh.receiveShadow = true;
  group.add(stickMesh);

  const colors = FLAVORS[flavor];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const cx = 128;
  const cy = 128;
  ctx.fillStyle = `#${colors.a.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `#${colors.b.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let t = 0; t < 1; t += 0.02) {
    const ang = t * Math.PI * 4.5;
    const r = 20 + t * 95;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    if (t === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const discMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.45,
  });
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.28, 32),
    discMat,
  );
  disc.position.y = height + 0.14;
  disc.castShadow = true;
  disc.receiveShadow = true;
  group.add(disc);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.98, 0.06, 8, 32),
    new THREE.MeshStandardMaterial({ color: colors.b, roughness: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height + 0.28;
  group.add(rim);

  const top = height + 0.28;
  const bottom = height;
  return {
    group,
    platform: {
      x,
      y: 0,
      z,
      radius,
      top,
      bottom,
    },
    stick: {
      kind: "cylinder",
      x,
      z,
      y0: 0,
      y1: height + 0.1,
      radius: stickR,
    },
  };
}
