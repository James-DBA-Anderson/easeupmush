import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const SCAN_DIR = `${import.meta.env.BASE_URL}scans/`;
const SPIN = 0.55;
const TARGET_SIZE = 2.8;

/**
 * Textured Scaniverse bunny mesh on the Level 2 congrats overlay.
 */
export class CongratsScan {
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private pivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private visible = false;
  private loadStarted = false;

  constructor() {
    this.wrap = document.getElementById("win-scan-wrap")!;
    this.canvas = document.getElementById("win-scan") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    this.camera.position.set(0, 0.45, 5.2);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.pivot);
    this.scene.add(new THREE.HemisphereLight(0xfff2e0, 0x5a4a3a, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(2.2, 4.2, 3.2);
    this.scene.add(key);
    this.resize();
  }

  public show(): void {
    this.visible = true;
    this.wrap.hidden = false;
    this.resize();
    if (!this.loadStarted) {
      this.loadStarted = true;
      void this.loadMesh();
    }
  }

  public hide(): void {
    this.visible = false;
    this.wrap.hidden = true;
  }

  public update(delta: number): void {
    if (!this.visible || !this.model) return;
    this.pivot.rotation.y += SPIN * delta;
    this.renderer.render(this.scene, this.camera);
  }

  public resize(): void {
    const w = this.canvas.clientWidth || 280;
    const h = this.canvas.clientHeight || 280;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  private async loadMesh(): Promise<void> {
    const mtl = await new MTLLoader().setPath(SCAN_DIR).loadAsync("bunny-3d-scan.mtl");
    mtl.preload();
    const obj = await new OBJLoader()
      .setMaterials(mtl)
      .setPath(SCAN_DIR)
      .loadAsync("bunny-3d-scan.obj");

    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          mat.side = THREE.DoubleSide;
          if ("map" in mat && mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      }
    });

    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    this.pivot.scale.setScalar(TARGET_SIZE / maxDim);

    this.model = obj;
    this.pivot.add(obj);
  }
}
