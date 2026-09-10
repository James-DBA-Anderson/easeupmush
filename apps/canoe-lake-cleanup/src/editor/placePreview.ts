import * as THREE from "three";
import type { PlaceableId } from "../level/types";
import { buildPreviewMesh } from "./previewMeshes";

export type PlacePreviewHandlers = {
  onYawDrag?: (yawRad: number) => void;
};

/**
 * WebGL preview for a placeable: orbit with drag, zoom with scroll,
 * yaw shown on the model (and editable via drag with Shift).
 */
export class PlacePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private mesh: THREE.Group | null = null;
  private id: PlaceableId | null = null;
  private yaw = 0;
  private distance = 18;
  private azimuth = 0.7;
  private elevation = 0.55;
  private dragging = false;
  private yawDragging = false;
  private lastX = 0;
  private lastY = 0;
  private raf = 0;
  private running = false;
  private handlers: PlacePreviewHandlers = {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(0x1a221c, 1);
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.scene.add(this.pivot);
    this.pivot.add(this.root);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x334422, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3d30, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(30, 15, 0x3a5040, 0x304438);
    grid.position.y = 0.02;
    this.scene.add(grid);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setHandlers(handlers: PlacePreviewHandlers): void {
    this.handlers = handlers;
  }

  setPlaceable(id: PlaceableId | null, yawRad: number): void {
    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      this.mesh = null;
    }
    this.id = id;
    this.yaw = yawRad;
    if (!id) {
      this.updateCamera();
      return;
    }
    this.mesh = buildPreviewMesh(id);
    this.mesh.rotation.y = yawRad;
    this.root.add(this.mesh);
    this.fitDistance();
    this.updateCamera();
  }

  setYaw(yawRad: number): void {
    this.yaw = yawRad;
    if (this.mesh) this.mesh.rotation.y = yawRad;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  dispose(): void {
    this.stop();
    this.setPlaceable(null, 0);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.renderer.dispose();
  }

  private fitDistance(): void {
    if (!this.mesh) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 4) * 0.65;
    this.distance = Math.max(8, radius * 2.8);
  }

  private updateCamera(): void {
    const x = Math.cos(this.elevation) * Math.sin(this.azimuth) * this.distance;
    const y = Math.sin(this.elevation) * this.distance;
    const z = Math.cos(this.elevation) * Math.cos(this.azimuth) * this.distance;
    this.camera.position.set(x, y + 1.2, z);
    this.camera.lookAt(0, 1.2, 0);
  }

  private onPointerDown = (ev: PointerEvent): void => {
    this.dragging = true;
    this.yawDragging = ev.shiftKey || ev.button === 2;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.canvas.setPointerCapture(ev.pointerId);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    if (this.yawDragging && this.id) {
      this.yaw += dx * 0.01;
      if (this.mesh) this.mesh.rotation.y = this.yaw;
      this.handlers.onYawDrag?.(this.yaw);
    } else {
      this.azimuth -= dx * 0.01;
      this.elevation = Math.min(
        1.2,
        Math.max(0.12, this.elevation + dy * 0.01),
      );
      this.updateCamera();
    }
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    this.yawDragging = false;
  };

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    ev.stopPropagation();
    const factor = ev.deltaY > 0 ? 1.08 : 0.92;
    this.distance = Math.min(60, Math.max(4, this.distance * factor));
    this.updateCamera();
  };
}
