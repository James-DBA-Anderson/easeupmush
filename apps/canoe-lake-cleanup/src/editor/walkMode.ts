import * as THREE from "three";
import { applyLevel } from "../level/apply";
import { cloneLevel } from "../level/defaultLevel";
import type { LevelData } from "../level/types";
import {
  PATH_OUTER,
  buildGround,
  buildLake,
  buildPaths,
  isInLake,
  offsetShore,
  wadeFootY,
} from "../game/world/lake";
import { buildElevation, groundHeight } from "../game/world/terrain";
import { placeBench, clearSitterBenches } from "../game/world/bench";
import { plantTrees } from "../game/world/trees";
import { buildSurrounds, lightWindows } from "../game/world/buildings";
import { buildFairyLights, lightFairyBulbs } from "../game/world/fairyLights";
import { buildFencing, insidePark } from "../game/world/fence";
import { buildParkBuildings, binStations } from "../game/world/park";
import { isBlocked } from "../game/world/blocking";
import { clockFaceAt, skyStateAt } from "../game/systems/DayCycle";

const WALK_SPEED = 9;
const SPRINT_SPEED = 15;
const WADE_SPEED = 2.8;
const WORLD_LIMIT = 200;
const EYE_HEIGHT = 1.7;
const LOOK_SENS = 0.002;

export type WalkHit = {
  x: number;
  z: number;
  shift: boolean;
};

export type WalkAim = {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  groundX: number;
  groundZ: number;
  shift: boolean;
};

/** Maps screenshot + fade settings from the Background tool. */
export type WalkRefOverlay = {
  image: HTMLImageElement | null;
  x: number;
  z: number;
  width: number;
  rotDeg: number;
  flipH: boolean;
  imageOpacity: number;
  mapOpacity: number;
};

export type WalkHost = {
  getLevel: () => LevelData;
  getRefOverlay: () => WalkRefOverlay;
  /**
   * Aim click: pick along the look ray first, else place/select on the ground.
   * Returns whether something is selected afterward (for drag).
   */
  onAimClick: (aim: WalkAim) => boolean;
  /** Click under crosshair — select or place (same rules as the map). */
  onGroundClick: (hit: WalkHit) => void;
  /** Drag start while something is selected. */
  onGroundDragStart: () => void;
  /** Drag selected item to ground point. */
  onGroundDrag: (x: number, z: number) => void;
  onGroundDragEnd: () => void;
  onDelete: () => void;
  onRotate: (dir: -1 | 1, shift: boolean) => void;
  onUndo: () => void;
  onExit: () => void;
  onStatus: (msg: string) => void;
  /** Current selection world position for the marker, or null. */
  getSelectionXZ: () => { x: number; z: number } | null;
};

/**
 * First-person walk-and-edit view for the level editor.
 * Builds the same static park as the game (no NPCs / tools).
 */
export class WalkMode {
  private host: WalkHost;
  private overlay: HTMLElement;
  private canvas: HTMLCanvasElement;
  private exitBtn: HTMLButtonElement;
  private timeInput: HTMLInputElement;
  private timeVal: HTMLElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private active = false;
  private locked = false;
  /** Fractional hour 0–24 — scrubbed in the walk HUD. */
  private hour = 13;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private sprinting = false;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, "YXZ");

  private dragging = false;
  private dragStarted = false;
  private rebuildTimer: number | null = null;
  private marker: THREE.Mesh | null = null;
  private worldRoot: THREE.Group | null = null;
  private terrainRoot: THREE.Group | null = null;
  private refPlane: THREE.Object3D | null = null;
  private refTexture: THREE.Texture | null = null;

  private readonly onKeyDown = (ev: KeyboardEvent) => this.handleKeyDown(ev);
  private readonly onKeyUp = (ev: KeyboardEvent) => this.handleKeyUp(ev);
  private readonly onMouseMove = (ev: MouseEvent) => this.handleMouseMove(ev);
  private readonly onMouseDown = (ev: MouseEvent) => this.handleMouseDown(ev);
  private readonly onMouseUp = (ev: MouseEvent) => this.handleMouseUp(ev);
  private readonly onPointerLockChange = () => this.handlePointerLockChange();
  private readonly onResize = () => this.resize();

  constructor(host: WalkHost) {
    this.host = host;
    this.overlay = document.getElementById("walk-overlay")!;
    this.canvas = document.getElementById("walk-canvas") as HTMLCanvasElement;
    this.exitBtn = document.getElementById("walk-exit") as HTMLButtonElement;
    this.timeInput = document.getElementById("walk-time") as HTMLInputElement;
    this.timeVal = document.getElementById("walk-time-val")!;
    this.exitBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.host.onExit();
    });
    this.timeInput.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }
    });
    this.timeInput.addEventListener("input", () => {
      this.hour = Number(this.timeInput.value);
      this.syncTimeUi();
      this.applyTimeOfDay();
    });
    this.canvas.addEventListener("click", () => {
      if (!this.active || this.locked) return;
      this.canvas.requestPointerLock();
    });
    this.syncTimeUi();
  }

  public isActive(): boolean {
    return this.active;
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public enter(): void {
    if (this.active) return;
    this.active = true;
    this.overlay.hidden = false;
    document.body.classList.add("walk-mode");

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Match game: flip view so FP east/west agree with the N-up map.
    this.renderer.domElement.style.transform = "scaleX(-1)";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8e0);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

    this.buildWorld();
    this.spawnAtDefault();
    this.resize();

    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("resize", this.onResize);

    this.clock.start();
    const tick = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(tick);
      this.update(Math.min(this.clock.getDelta(), 0.05));
    };
    this.raf = requestAnimationFrame(tick);

    this.host.onStatus(
      "Walk mode: click view to look · WASD move · time slider for day/night · click places/selects · Esc unlock, Esc again to exit.",
    );
  }

  public exit(): void {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.locked = false;
    this.dragging = false;
    this.dragStarted = false;
    this.clearKeys();

    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("resize", this.onResize);

    this.disposeWorld();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.marker = null;
    this.worldRoot = null;
    this.terrainRoot = null;
    this.refPlane = null;
    this.disposeRefTexture();

    this.overlay.hidden = true;
    document.body.classList.remove("walk-mode");
  }

  /** Rebuild meshes from the current level (keeps camera pose). */
  public scheduleRebuild(): void {
    if (!this.active) return;
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildNow();
    }, 120);
  }

  public rebuildNow(): void {
    if (!this.active || !this.camera) return;
    const pos = this.camera.position.clone();
    const yaw = this.euler.y;
    const pitch = this.euler.x;
    this.buildWorld();
    this.camera.position.copy(pos);
    this.euler.set(pitch, yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    this.syncMarker();
  }

  /** Refresh Maps underlay + terrain fade from current Background settings. */
  public syncOverlay(): void {
    if (!this.active || !this.worldRoot) return;
    this.rebuildRefPlane(this.worldRoot);
    if (this.terrainRoot) {
      this.applyTerrainFade(this.terrainRoot, this.host.getRefOverlay().mapOpacity);
    }
  }

  public syncMarker(): void {
    if (!this.marker) return;
    const sel = this.host.getSelectionXZ();
    if (!sel) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(sel.x, 0.05, sel.z);
  }

  private buildWorld(): void {
    if (!this.scene || !this.camera) return;

    if (this.worldRoot) {
      this.scene.remove(this.worldRoot);
      this.disposeObject(this.worldRoot);
      this.disposeRefTexture();
      this.worldRoot = null;
      this.terrainRoot = null;
      this.refPlane = null;
      this.marker = null;
    }

    applyLevel(cloneLevel(this.host.getLevel()));

    const root = new THREE.Group();
    root.name = "walk-world";
    this.scene.add(root);

    // Dark underlay matches the editor canvas so faded map reads the same.
    const underlay = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      new THREE.MeshBasicMaterial({ color: 0x1c2a20 }),
    );
    underlay.name = "walk-underlay";
    underlay.rotation.x = -Math.PI / 2;
    underlay.position.y = -0.1;
    root.add(underlay);

    const terrain = new THREE.Group();
    terrain.name = "walk-terrain";
    {
      const temp = new THREE.Scene();
      buildGround(temp, 560);
      buildElevation(temp);
      buildLake(temp);
      buildPaths(temp);
      while (temp.children.length > 0) terrain.add(temp.children[0]!);
    }
    root.add(terrain);
    this.terrainRoot = terrain;

    const props = new THREE.Group();
    props.name = "walk-props";
    {
      const temp = new THREE.Scene();
      buildSurrounds(temp);
      buildFairyLights(temp);
      buildFencing(temp);
      buildParkBuildings(temp);
      plantTrees(temp);
      this.buildLandmarks(temp);
      this.buildBinMarkers(temp);
      while (temp.children.length > 0) props.add(temp.children[0]!);
    }
    root.add(props);

    this.worldRoot = root;
    this.rebuildRefPlane(root);
    this.applyTerrainFade(terrain, this.host.getRefOverlay().mapOpacity);

    // Lights live on the main scene so they survive rebuilds of the root.
    if (!this.ambientLight || !this.sunLight) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      ambient.name = "walk-ambient";
      this.scene.add(ambient);
      this.ambientLight = ambient;
      const sun = new THREE.DirectionalLight(0xffffff, 0.85);
      sun.name = "walk-sun";
      sun.position.set(60, 90, 40);
      sun.castShadow = true;
      sun.shadow.camera.left = -220;
      sun.shadow.camera.right = 220;
      sun.shadow.camera.top = 220;
      sun.shadow.camera.bottom = -220;
      sun.shadow.mapSize.set(2048, 2048);
      this.scene.add(sun);
      this.sunLight = sun;
    }
    this.applyTimeOfDay();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe066,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 10;
    ring.visible = false;
    root.add(ring);
    this.marker = ring;
    this.syncMarker();
  }

  private rebuildRefPlane(root: THREE.Group): void {
    if (this.refPlane) {
      root.remove(this.refPlane);
      this.disposeObject(this.refPlane);
      this.refPlane = null;
    }
    this.disposeRefTexture();

    const overlay = this.host.getRefOverlay();
    if (!overlay.image || overlay.width <= 0) return;

    const img = overlay.image;
    const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
    const worldW = overlay.width;
    const worldH = worldW * aspect;

    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.refTexture = tex;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: overlay.imageOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Match the map editor drawImage transform in world XZ:
    //   translate(ref) → rotate(-refRotDeg in canvas) → optional Flip H → image
    // Canvas Y-down means image top sits toward world +Z (north).
    const holder = new THREE.Group();
    holder.name = "walk-ref";
    holder.position.set(overlay.x, -0.04, overlay.z);
    // Canvas call is rotate(-deg); with +Z up on the map that equals +yaw here.
    holder.rotation.y = (overlay.rotDeg * Math.PI) / 180;

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), mat);
    // PlaneGeometry: image top is +Y; Rx(-π/2) alone would send that to −Z.
    // Flip local Y so the top lands on +Z, same as the editor.
    plane.rotation.x = -Math.PI / 2;
    plane.scale.y = -1;
    if (overlay.flipH) plane.scale.x = -1;
    plane.renderOrder = -1;
    holder.add(plane);
    root.add(holder);
    this.refPlane = holder;
  }

  /**
   * Fade grass / water / paths like the editor map layer (map opacity slider).
   * Clones materials so shared game singletons stay untouched.
   */
  private applyTerrainFade(terrain: THREE.Object3D, opacity: number): void {
    const alpha = Math.max(0.05, Math.min(1, opacity));
    terrain.traverse((obj) => {
      // Reflective Water looks broken when faded with the map overlay.
      if ((obj as { isWater?: boolean }).isWater) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;

      const apply = (mat: THREE.Material): THREE.Material => {
        // Water shader — nudge its alpha uniform.
        if (mat instanceof THREE.ShaderMaterial && mat.uniforms?.["alpha"]) {
          if (!mat.userData.walkBaseAlpha) {
            mat.userData.walkBaseAlpha = mat.uniforms["alpha"].value as number;
          }
          mat.uniforms["alpha"].value =
            (mat.userData.walkBaseAlpha as number) * alpha;
          mat.transparent = true;
          return mat;
        }
        const base =
          mat.userData.walkFaded === true ? mat : mat.clone();
        base.userData.walkFaded = true;
        if (!base.userData.walkBaseOpacity) {
          base.userData.walkBaseOpacity =
            "opacity" in base ? (base as THREE.MeshStandardMaterial).opacity : 1;
        }
        const bo = base.userData.walkBaseOpacity as number;
        base.transparent = alpha < 0.999;
        base.opacity = bo * alpha;
        base.depthWrite = alpha >= 0.98;
        return base;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(apply);
      } else {
        mesh.material = apply(mesh.material);
      }
    });
  }

  private disposeRefTexture(): void {
    this.refTexture?.dispose();
    this.refTexture = null;
  }

  private buildLandmarks(scene: THREE.Scene): void {
    clearSitterBenches();
    const ring = offsetShore(PATH_OUTER - 1);
    for (let i = 0; i < ring.length; i += 12) {
      const spot = ring[i]!;
      const before = ring[(i - 1 + ring.length) % ring.length]!;
      const after = ring[(i + 1) % ring.length]!;
      const along = new THREE.Vector2().subVectors(after, before).normalize();
      const facing = new THREE.Vector2(-along.y, along.x);
      if (facing.dot(spot) > 0) facing.negate();
      placeBench(scene, spot.x, spot.y, Math.atan2(facing.x, facing.y), {
        sitters: true,
      });
    }
  }

  private buildBinMarkers(scene: THREE.Scene): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a });
    for (const spot of binStations()) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.1, 10), mat);
      mesh.position.set(spot.x, 0.55, spot.z);
      mesh.castShadow = true;
      scene.add(mesh);
    }
  }

  private spawnAtDefault(): void {
    if (!this.camera) return;
    const start = offsetShore(PATH_OUTER - 2).reduce((best, point) =>
      point.y > best.y ? point : best,
    );
    this.camera.position.set(
      start.x,
      EYE_HEIGHT + groundHeight(start.x, start.y),
      start.y,
    );
    this.camera.lookAt(0, EYE_HEIGHT + groundHeight(0, 0), 0);
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.z = 0;
    this.camera.quaternion.setFromEuler(this.euler);
  }

  private disposeWorld(): void {
    if (!this.scene) return;
    if (this.worldRoot) {
      this.scene.remove(this.worldRoot);
      this.disposeObject(this.worldRoot);
    }
    this.disposeRefTexture();
    this.terrainRoot = null;
    this.refPlane = null;
    for (const name of ["walk-ambient", "walk-sun"]) {
      const obj = this.scene.getObjectByName(name);
      if (obj) {
        this.scene.remove(obj);
        this.disposeObject(obj);
      }
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      // Only free geometries — many park materials are module singletons.
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = this.overlay.clientWidth;
    const h = this.overlay.clientHeight;
    if (w < 1 || h < 1) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private clearKeys(): void {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.sprinting = false;
  }

  private handlePointerLockChange(): void {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.dragging = false;
      if (this.dragStarted) {
        this.host.onGroundDragEnd();
        this.dragStarted = false;
      }
      this.clearKeys();
    }
  }

  private handleKeyDown(ev: KeyboardEvent): void {
    if (!this.active) return;

    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopPropagation();
      this.host.onUndo();
      return;
    }

    if (ev.code === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.locked) {
        document.exitPointerLock();
      } else {
        this.host.onExit();
      }
      return;
    }

    // Let ribbon typing work when unlocked (e.g. no focus steal).
    if (!this.locked) return;

    ev.stopPropagation();
    switch (ev.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveForward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveBackward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveLeft = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveRight = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.sprinting = true;
        break;
      case "Delete":
      case "Backspace":
        ev.preventDefault();
        this.host.onDelete();
        break;
      case "BracketLeft":
        ev.preventDefault();
        this.host.onRotate(-1, ev.shiftKey);
        break;
      case "BracketRight":
        ev.preventDefault();
        this.host.onRotate(1, ev.shiftKey);
        break;
    }
  }

  private handleKeyUp(ev: KeyboardEvent): void {
    if (!this.active) return;
    switch (ev.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveForward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveBackward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveLeft = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveRight = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.sprinting = false;
        break;
    }
  }

  private handleMouseMove(ev: MouseEvent): void {
    if (!this.active || !this.locked || !this.camera) return;

    this.euler.setFromQuaternion(this.camera.quaternion);
    // Same convention as game Player under CSS scaleX(-1).
    this.euler.y += (ev.movementX || 0) * LOOK_SENS;
    this.euler.x -= (ev.movementY || 0) * LOOK_SENS;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.euler.z = 0;
    this.camera.quaternion.setFromEuler(this.euler);

    if (this.dragging) {
      const hit = this.groundUnderCrosshair();
      if (!hit) return;
      if (!this.dragStarted) {
        this.host.onGroundDragStart();
        this.dragStarted = true;
      }
      this.host.onGroundDrag(hit.x, hit.z);
      this.syncMarker();
    }
  }

  private handleMouseDown(ev: MouseEvent): void {
    if (!this.active || !this.locked || ev.button !== 0) return;
    if (ev.target !== this.canvas && !(ev.target as HTMLElement)?.closest?.("#walk-overlay")) {
      return;
    }
    if (!this.camera) return;
    const ground = this.groundUnderCrosshair();
    if (!ground) return;

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const selected = this.host.onAimClick({
      originX: this.camera.position.x,
      originY: this.camera.position.y,
      originZ: this.camera.position.z,
      dirX: dir.x,
      dirY: dir.y,
      dirZ: dir.z,
      groundX: ground.x,
      groundZ: ground.z,
      shift: ev.shiftKey,
    });
    this.syncMarker();

    if (selected) {
      this.dragging = true;
      this.dragStarted = false;
    }
  }

  private handleMouseUp(ev: MouseEvent): void {
    if (!this.active || ev.button !== 0) return;
    if (this.dragging) {
      this.dragging = false;
      if (this.dragStarted) {
        this.host.onGroundDragEnd();
        this.dragStarted = false;
        this.scheduleRebuild();
      }
    }
  }

  private groundUnderCrosshair(): { x: number; z: number } | null {
    if (!this.camera) return null;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // Plane y = 0.
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -this.camera.position.y / dir.y;
    if (t <= 0 || t > 80) return null;
    return {
      x: this.camera.position.x + dir.x * t,
      z: this.camera.position.z + dir.z * t,
    };
  }

  private update(delta: number): void {
    if (!this.camera || !this.renderer || !this.scene) return;

    if (this.locked) {
      this.direction.set(
        Number(this.moveLeft) - Number(this.moveRight),
        0,
        Number(this.moveBackward) - Number(this.moveForward),
      );
      if (this.direction.lengthSq() > 0) this.direction.normalize();
      const wading = isInLake(this.camera.position.x, this.camera.position.z);
      const speed = wading
        ? WADE_SPEED
        : this.sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;
      this.velocity.lerp(
        this.direction.clone().multiplyScalar(speed),
        Math.min(1, (wading ? 6 : 12) * delta),
      );
    } else {
      this.velocity.lerp(new THREE.Vector3(), Math.min(1, 12 * delta));
    }

    const step = this.velocity.clone().multiplyScalar(delta);
    step.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.euler.y);
    this.moveWithCollision(step);
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const foot = isInLake(px, pz) ? wadeFootY(px, pz) : groundHeight(px, pz);
    this.camera.position.y = EYE_HEIGHT + foot;

    this.renderer.render(this.scene, this.camera);
  }

  private syncTimeUi(): void {
    this.timeInput.value = String(this.hour);
    this.timeVal.textContent = clockFaceAt(this.hour);
  }

  /** Match game DayCycle sky / sun / window glow for the scrubbed hour. */
  private applyTimeOfDay(): void {
    if (!this.scene || !this.ambientLight || !this.sunLight) return;
    const sky = skyStateAt(this.hour);
    this.scene.background = sky.sky.clone();
    this.ambientLight.intensity = sky.ambient;
    this.ambientLight.color.copy(sky.sky).lerp(new THREE.Color(0xffffff), 0.78);
    this.sunLight.intensity = sky.sun;
    this.sunLight.color.copy(sky.sunColor);
    this.sunLight.position.copy(sky.sunPosition);
    lightWindows(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
    lightFairyBulbs(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
  }

  private moveWithCollision(step: THREE.Vector3): void {
    if (!this.camera) return;
    const pos = this.camera.position;
    for (const axis of ["x", "z"] as const) {
      const next = pos.clone();
      next[axis] += step[axis];
      if (this.canStand(next.x, next.z)) pos[axis] = next[axis];
    }
    if (Math.abs(pos.x) > WORLD_LIMIT) pos.x = Math.sign(pos.x) * WORLD_LIMIT;
    if (Math.abs(pos.z) > WORLD_LIMIT) pos.z = Math.sign(pos.z) * WORLD_LIMIT;
  }

  private canStand(x: number, z: number): boolean {
    if (!insidePark(x, z)) return false;
    if (isBlocked(x, z)) return false;
    return true;
  }
}
