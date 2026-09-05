import * as THREE from "three";
import {
  Lensflare,
  LensflareElement,
} from "three/examples/jsm/objects/Lensflare.js";
import type { SkyState } from "./DayCycle";

/**
 * Soft radial textures for the flare elements — no image files to fetch.
 */
function glowTexture(size: number, inner = "rgba(255,255,255,1)"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, inner);
  g.addColorStop(0.15, "rgba(255,250,230,0.85)");
  g.addColorStop(0.4, "rgba(255,200,120,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.35, c, c, c * 0.55);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.45, "rgba(255,230,180,0.55)");
  g.addColorStop(0.7, "rgba(255,180,80,0.2)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The sun disc in the sky and the lens flare that comes off it. Tracks the
 * day-cycle light and packs up when the weather or night takes over.
 */
export class Sun {
  private disc: THREE.Mesh;
  private flare: Lensflare;
  private light: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, light: THREE.DirectionalLight) {
    this.light = light;

    const discMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c8,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });
    this.disc = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), discMat);
    this.disc.renderOrder = 5;
    scene.add(this.disc);

    // A soft halo behind the disc so it reads against blue sky.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(128),
        color: 0xffe6a8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.7,
      }),
    );
    halo.scale.setScalar(55);
    this.disc.add(halo);

    const flare1 = glowTexture(64, "rgba(255,255,255,0.9)");
    const flare2 = ringTexture(128);

    // Flare rides on the disc — not the light — so it can't drift into a
    // second sun when the camera leaves the park centre.
    this.flare = new Lensflare();
    this.flare.addElement(new LensflareElement(flare1, 60, 0.25));
    this.flare.addElement(new LensflareElement(flare2, 120, 0.4));
    this.flare.addElement(new LensflareElement(flare1, 40, 0.6));
    this.flare.addElement(new LensflareElement(flare1, 70, 0.8));
    this.flare.addElement(new LensflareElement(flare2, 160, 0.95));
    this.disc.add(this.flare);
  }

  public update(sky: SkyState, gloom: number): void {
    const bright = sky.sun * (1 - gloom);
    const showing = bright > 0.22 && sky.sunPosition.y > 25;

    this.disc.visible = showing;
    this.flare.visible = showing && bright > 0.3;

    // Sit out on the light's bearing, past the fog, so the disc stays sharp.
    const dir = sky.sunPosition.clone().normalize();
    this.disc.position.copy(dir).multiplyScalar(420);

    const mat = this.disc.material as THREE.MeshBasicMaterial;
    mat.color.copy(sky.sunColor);
    mat.opacity = THREE.MathUtils.clamp(bright * 1.1, 0, 1);

    // Keep the light tinted with whatever the sun is doing.
    this.light.color.copy(sky.sunColor);
  }
}
