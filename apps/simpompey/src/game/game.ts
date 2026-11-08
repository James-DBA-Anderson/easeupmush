import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { Motor } from "./car";
import { addVegetation } from "./vegetation";
import { HarbourTraffic } from "./ships";
import { RailTraffic } from "./trains";
import { addHorizon } from "./horizon";
import { addShore } from "./shore";
import { addSeaForts } from "./forts";
import { addHarbourKit } from "./harbour";
import { addPowerKit } from "./power";
import { addBarrierKit } from "./barriers";
import { addFurnitureKit } from "./furniture";
import { addPlaces } from "./places";
import { TOWN_VIEWS, type TownView } from "./views";
import { CityBuilder, type BuilderTool } from "./builder";
import { osmLocal } from "./geo";

const BARRIER_VIEW = 340;
const BARRIER_REACH = 170;
const SHADOW_MAP = 2048;
const SHADOW_EXTENT_MIN = 320;
const SHADOW_EXTENT_MAX = 720;
const MINIMAP_CSS = 168;
const MINIMAP_PAD = 16;
const MINIMAP_RADIUS = 150;

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

type MapLabel = {
  kind: "road" | "building" | "area";
  name: string;
  x: number;
  y: number;
  z: number;
};

type MapFilters = {
  buildings: boolean;
  roads: boolean;
  rails: boolean;
  trains: boolean;
  vegetation: boolean;
  ships: boolean;
  power: boolean;
  roadLabels: boolean;
  buildingLabels: boolean;
  areaLabels: boolean;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private running = false;
  private rafId = 0;
  private clock = new THREE.Clock();
  /** WASD / arrow key state */
  private keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Shift: false,
    space: false,
  };
  private driving = false;
  private motor: Motor | null = null;
  private driveRay = new THREE.Raycaster();
  private driveFwd = new THREE.Vector3();
  private driveDown = new THREE.Vector3(0, -1, 0);
  private driveOrigin = new THREE.Vector3();
  private groundMeshes: THREE.Object3D[] = [];
  private speedo = document.getElementById("speedo");
  private minimapEl = document.getElementById("minimap");
  private minimapMarker = document.querySelector(".minimap__marker") as HTMLElement | null;
  private miniCam: THREE.OrthographicCamera;
  private miniSize = new THREE.Vector2();
  private driveBtn = document.getElementById("drive-toggle") as HTMLButtonElement | null;
  private demolishBtn = document.getElementById("demolish-toggle") as HTMLButtonElement | null;
  private aerialBtn = document.getElementById("aerial-toggle") as HTMLButtonElement | null;
  private viewSelect = document.getElementById("view-select") as HTMLSelectElement | null;
  private viewIndex = 0;
  private mapOpen = false;
  private layersOpen = false;
  private hintEl = document.querySelector(".map-filters__hint");
  private bootEl = document.getElementById("boot");
  private bootStatus = document.getElementById("boot-status");
  private bootBar = document.getElementById("boot-bar");
  private bootFill = document.getElementById("boot-bar-fill");
  private mapHint =
    "Drag to pan · scroll zooms to cursor · right-drag to tilt · double-click to close in · T aerial · [ ] viewpoints · M map · B layers · WASD to move · Q/E height";
  private aerialHeight = 4200;
  private driveHint = "WASD to drive · Space brake · Shift boot it · Esc back to the map";
  private mapRoot = new THREE.Group();
  private mapScene: THREE.Object3D | null = null;
  private layerMeshes = new Map<string, THREE.Object3D>();
  private roadDecor: THREE.Object3D[] = [];
  private railDecor: THREE.Object3D[] = [];
  private powerDecor: THREE.Object3D[] = [];
  private barrierChunks: THREE.Object3D[] = [];
  private labelLayer = document.getElementById("labels");
  private labelObjects: Array<{
    kind: MapLabel["kind"];
    rank: number;
    local: THREE.Vector3;
    el: HTMLDivElement;
  }> = [];
  private labelScratch = new THREE.Vector3();
  private camForward = new THREE.Vector3();
  private camRight = new THREE.Vector3();
  private camMove = new THREE.Vector3();
  private camOffset = new THREE.Vector3();
  private camSpherical = new THREE.Spherical();
  private camYUp = new THREE.Vector3(0, 1, 0);
  private camQuat = new THREE.Quaternion();
  private camQuatInv = new THREE.Quaternion();
  private camHold: string | null = null;
  private camHoldAt = 0;
  private compassRose = document.getElementById("cam-compass");
  private camBoom = 9.6;
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pickRay = new THREE.Raycaster();
  private pickNdc = new THREE.Vector2();
  private pickHit = new THREE.Vector3();
  private placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
  private sun: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(-0.38, 0.84, 0.4).normalize();
  private sunDisc: THREE.Mesh;
  private buildingChunks: THREE.Mesh[] = [];
  private chunkCenter = new THREE.Vector3();
  private spinnaker: THREE.Object3D | null = null;
  private forts: THREE.Object3D | null = null;
  private vegetation: THREE.Object3D | null = null;
  private groundCover: THREE.Object3D | null = null;
  private harbour: HarbourTraffic | null = null;
  private harbourKit: THREE.Object3D | null = null;
  private powerKit: THREE.Object3D | null = null;
  private barrierKit: THREE.Object3D | null = null;
  private furnitureKit: THREE.Object3D | null = null;
  private landmarks: THREE.Object3D | null = null;
  private trains: RailTraffic | null = null;
  private builder: CityBuilder | null = null;
  private filters: MapFilters = {
    buildings: true,
    roads: true,
    rails: true,
    trains: true,
    vegetation: true,
    ships: true,
    power: true,
    roadLabels: false,
    buildingLabels: false,
    areaLabels: false,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x87a8b4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new THREE.Scene();

    // Camera starts high above the centre of Portsmouth terrain
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      2,
      80000,
    );
    this.camera.position.set(800, 600, 800);
    this.camera.lookAt(0, 0, 0);

    this.miniCam = new THREE.OrthographicCamera(
      -MINIMAP_RADIUS,
      MINIMAP_RADIUS,
      MINIMAP_RADIUS,
      -MINIMAP_RADIUS,
      4,
      600,
    );
    this.miniCam.up.set(0, 0, -1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.18;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 1.35;
    this.controls.zoomSpeed = 1.15;
    this.controls.rotateSpeed = 0.4;
    this.controls.zoomToCursor = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 20000;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    this.scene.add(new THREE.AmbientLight(0xfff6ea, 0.32));
    this.scene.add(new THREE.HemisphereLight(0xd4e7f7, 0x9a8b6a, 0.9));
    this.sun = new THREE.DirectionalLight(0xfff1c8, 1.45);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.intensity = 0.55;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 1.1;
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 4000;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe29a,
      depthWrite: false,
      fog: false,
    });
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), sunMat);
    this.sunDisc.frustumCulled = false;
    this.sunDisc.renderOrder = 2;
    this.scene.add(this.sunDisc);

    this.scene.add(this.mapRoot);
    this.motor = new Motor();
    this.motor.group.visible = false;
    this.scene.add(this.motor.group);
    this.bindInput();
    this.bindFilters();
    (window as any).__game = this;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    // Load terrain + buildings
    const loader = new GLTFLoader();
    this.setBoot("Hang on mush…", 0.04);
    try {
      const labelsP = fetch("./models/portsmouth-labels.json").then((r) => r.json()) as Promise<MapLabel[]>;
      const gltf = await this.loadGltf(loader, "./models/portsmouth-terrain.gltf?v=roads1", (t) => {
        this.setBoot("Laying out Pompey…", 0.06 + 0.7 * t);
      });
      const labels = await labelsP;
      gltf.scene.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      gltf.scene.position.sub(centre);
      gltf.scene.position.y += centre.y - box.min.y;
      this.mapScene = gltf.scene;
      this.mapRoot.add(gltf.scene);
      // Mesh is X=east, Z=north; default top-down view shows -Z at the top.
      // Negate Z so north is screen-up and east stays screen-right.
      this.mapRoot.scale.z = -1;

      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          const src = mesh.material as THREE.MeshStandardMaterial;
          const roadPart = mesh.name === "roads" || mesh.name.startsWith("road-");
          const railPart = mesh.name === "rails" || mesh.name.startsWith("rail-");
          const harbourPart = mesh.name.startsWith("harbour-");
          const bridgePart = mesh.name.startsWith("bridge-");
          const powerPart = mesh.name.startsWith("power-");
          const barrierPart = mesh.name.startsWith("barrier-");
          const layer = ["terrain", "buildings", "roads", "rails", "water"].find(
            (name) => mesh.name === name || mesh.parent?.name === name,
          );
          const water = layer === "water";
          const hasColors = Boolean(mesh.geometry.getAttribute("color"));
          const mat = new THREE.MeshLambertMaterial({
            color: hasColors ? 0xffffff : src.color,
            vertexColors: hasColors,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide,
            transparent: water && src.opacity < 1,
            opacity: water ? src.opacity : 1,
          });
          if (layer === "terrain") {
            mat.color.setHex(0x7e7b73);
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = 2;
            mat.polygonOffsetUnits = 2;
          }
          if (roadPart) {
            const factor =
              mesh.name === "road-marks" ? -5
              : mesh.name === "road-kerbs" ? -3
              : mesh.name === "road-cycleways" ? -2
              : mesh.name === "road-pavements" ? -2
              : -1;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = factor;
            mat.polygonOffsetUnits = factor;
          }
          if (railPart) {
            const factor = mesh.name === "rail-steel" ? -28 : mesh.name === "rail-sleepers" ? -24 : -20;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = factor;
            mat.polygonOffsetUnits = factor;
            // Pale granite / light oak — Lambert * 0.32 ambient otherwise reads as tarmac.
            if (mesh.name === "rails") mat.color.setHex(0xe4dccf);
            else if (mesh.name === "rail-sleepers") mat.color.setHex(0xcbb089);
            else if (mesh.name === "rail-steel") mat.color.setHex(0xf3f5f7);
            mat.emissive.setHex(0x3d382e);
            mat.emissiveIntensity = 0.28;
          }
          if (water) {
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -28;
            mat.polygonOffsetUnits = -28;
            mesh.position.y += 0.2;
          }
          mesh.material = mat;
          mesh.receiveShadow = !railPart;
          mesh.castShadow = harbourPart || bridgePart || powerPart;
          if (bridgePart) this.roadDecor.push(mesh);
          if (powerPart) this.powerDecor.push(mesh);
          if (barrierPart) mesh.visible = false;
          if (layer) this.layerMeshes.set(layer, mesh);
          if (roadPart && mesh.name !== "roads") this.roadDecor.push(mesh);
          if (railPart && mesh.name !== "rails") this.railDecor.push(mesh);
        }
      });

      this.setBoot("Chopping up the island…", 0.78);
      const buildings = this.layerMeshes.get("buildings");
      if (buildings instanceof THREE.Mesh && buildings.parent) {
        const chunks = chunkBuildings(buildings, 380);
        buildings.parent.add(chunks);
        buildings.parent.remove(buildings);
        buildings.geometry.dispose();
        this.layerMeshes.set("buildings", chunks);
        this.buildingChunks = chunks.children as THREE.Mesh[];
      }

      const barrierSrc: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name.startsWith("barrier-")) barrierSrc.push(mesh);
      });
      for (const mesh of barrierSrc) {
        if (!mesh.parent) continue;
        const chunks = chunkBuildings(mesh, 90);
        chunks.name = mesh.name;
        mesh.parent.add(chunks);
        mesh.parent.remove(mesh);
        mesh.geometry.dispose();
        for (const child of chunks.children) {
          child.visible = false;
          this.barrierChunks.push(child);
        }
      }

      this.groundMeshes = [];
      for (const name of ["terrain", "roads"] as const) {
        const mesh = this.layerMeshes.get(name);
        if (mesh instanceof THREE.Mesh) {
          mesh.geometry.computeBoundsTree();
          this.groundMeshes.push(mesh);
        }
      }
      for (const chunk of this.buildingChunks) chunk.geometry.computeBoundsTree();

      this.mapRoot.updateMatrixWorld(true);
      addHorizon(this.scene, gltf.scene);
      this.setBoot("Shoreline…", 0.82);
      try {
        await addShore(gltf.scene);
      } catch (err) {
        console.warn("Shore failed to load:", err);
      }
      this.setBoot("Landmarks…", 0.85);
      await this.placeSpinnaker(loader, labels);
      await this.placeForts(loader, labels);
      this.setBoot("Trees and parks…", 0.88);
      await this.placeVegetation(loader);
      await this.placePlaces(loader, labels);
      this.setBoot("Harbour traffic…", 0.91);
      await this.placeShips(loader, labels);
      await this.placeHarbourKit(loader, labels);
      await this.placePowerKit(loader, labels);
      await this.placeBarrierKit(loader);
      this.setBoot("Street kit…", 0.94);
      await this.placeFurnitureKit(loader);
      await this.placeTrains(loader, labels);

      this.buildLabels(labels);
      this.applyFilters();
      this.setBoot("Planning office…", 0.97);
      await this.placeBuilder();
      this.setBoot("Sweet as nut", 1);

      const span = Math.max(size.x, size.z);
      this.aerialHeight = TOWN_VIEWS[0].height || 4200;
      this.snapAerial();
      this.controls.maxDistance = Math.max(8000, span * 1.6);
      this.controls.update();
      this.hideBoot();
    } catch (e) {
      console.error("Failed to load terrain:", e);
      this.setBoot("Couldn't load the map, mush. Refresh.", 0);
      if (this.bootEl) this.bootEl.setAttribute("aria-busy", "false");
      this.clock.start();
      window.addEventListener("resize", this.resize);
      this.resize();
      this.loop();
      return;
    }

    this.clock.start();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.loop();
  }

  private loadGltf(loader: GLTFLoader, url: string, onPct: (t: number) => void): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (e) => {
          if (e.lengthComputable && e.total > 0) onPct(e.loaded / e.total);
        },
        reject,
      );
    });
  }

  private setBoot(label: string, amount: number) {
    const pct = Math.max(0, Math.min(1, amount));
    if (this.bootStatus) this.bootStatus.textContent = label;
    if (this.bootFill) this.bootFill.style.width = `${Math.round(pct * 100)}%`;
    if (this.bootBar) this.bootBar.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
    this.bootEl?.style.setProperty("--boot-pct", `${Math.round(pct * 100)}%`);
  }

  private hideBoot() {
    document.body.classList.remove("is-booting");
    const el = this.bootEl;
    if (!el) return;
    el.classList.add("is-done");
    el.setAttribute("aria-busy", "false");
    window.setTimeout(() => el.remove(), 700);
  }

  stop() {
    this.running = false;
    window.removeEventListener("resize", this.resize);
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.driving) this.updateDrive(dt);
    else {
      this.updateFly(dt);
      this.tickCamPad(dt);
    }
    this.syncCompass();
    this.harbour?.update(dt);
    this.trains?.update(dt);
    if (!this.driving) this.controls.update();
    this.updateSun();
    this.updateBarriers();
    const coverLift = Math.min(12, Math.max(0, (this.camera.position.y - 30) * 0.012));
    if (this.groundCover) this.groundCover.position.y = coverLift;
    const railLift = coverLift + 0.32;
    const rails = this.layerMeshes.get("rails");
    if (rails) rails.position.y = railLift;
    for (const extra of this.railDecor) extra.position.y = railLift;
    this.renderer.setScissorTest(false);
    this.renderer.getSize(this.miniSize);
    this.renderer.setViewport(0, 0, this.miniSize.x, this.miniSize.y);
    this.renderer.setScissor(0, 0, this.miniSize.x, this.miniSize.y);
    this.renderer.render(this.scene, this.camera);
    if (this.driving) this.renderMinimap();
    this.updateLabels();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private renderMinimap() {
    const motor = this.motor;
    if (!motor) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const size = MINIMAP_CSS;
    const x = MINIMAP_PAD;
    const y = h - MINIMAP_PAD - MINIMAP_CSS;

    const p = motor.position;
    this.miniCam.position.set(p.x, p.y + 220, p.z);
    this.miniCam.lookAt(p.x, p.y, p.z);
    this.miniCam.updateProjectionMatrix();

    motor.group.visible = false;
    this.sunDisc.visible = false;
    const barrierWas: boolean[] = [];
    for (const chunk of this.barrierChunks) {
      barrierWas.push(chunk.visible);
      chunk.visible = false;
    }
    const shadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;

    this.renderer.setScissorTest(true);
    this.renderer.setScissor(x, y, size, size);
    this.renderer.setViewport(x, y, size, size);
    this.renderer.setClearColor(0x1a2a32, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.miniCam);

    this.renderer.shadowMap.enabled = shadows;
    this.sunDisc.visible = true;
    motor.group.visible = true;
    for (let i = 0; i < this.barrierChunks.length; i++) {
      this.barrierChunks[i].visible = barrierWas[i] ?? false;
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.setClearColor(0x87a8b4, 1);

    if (this.minimapMarker) {
      const deg = THREE.MathUtils.radToDeg(-motor.heading) + 180;
      this.minimapMarker.style.setProperty("--heading", `${deg}deg`);
    }
  }

  private updateFly(dt: number) {
    if (this.driving) return;
    const k = this.keys;
    const dx = Number(k.d || k.ArrowRight) - Number(k.a || k.ArrowLeft);
    const dz = Number(k.s || k.ArrowDown) - Number(k.w || k.ArrowUp);
    const dy = Number(k.e) - Number(k.q);
    if (dx === 0 && dz === 0 && dy === 0) return;

    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.max(22, dist * 0.55) * (k.Shift ? 2.2 : 1);

    this.camera.getWorldDirection(this.camForward);
    this.camForward.y = 0;
    if (this.camForward.lengthSq() < 1e-6) {
      this.camForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camForward.y = 0;
    }
    if (this.camForward.lengthSq() < 1e-6) this.camForward.set(0, 0, -1);
    this.camForward.normalize();
    this.camRight.crossVectors(this.camForward, new THREE.Vector3(0, 1, 0)).normalize();

    this.camMove
      .set(0, 0, 0)
      .addScaledVector(this.camRight, dx * speed * dt)
      .addScaledVector(this.camForward, -dz * speed * dt);
    this.camMove.y += dy * speed * dt;

    this.camera.position.add(this.camMove);
    this.controls.target.add(this.camMove);
    this.camera.position.y = Math.max(8, this.camera.position.y);
    this.controls.target.y = Math.max(0, this.controls.target.y);
  }

  private bindInput() {
    const keyFromCode = (code: string): keyof typeof this.keys | null => {
      switch (code) {
        case "KeyW": return "w";
        case "KeyA": return "a";
        case "KeyS": return "s";
        case "KeyD": return "d";
        case "KeyQ": return "q";
        case "KeyE": return "e";
        case "ArrowUp": return "ArrowUp";
        case "ArrowDown": return "ArrowDown";
        case "ArrowLeft": return "ArrowLeft";
        case "ArrowRight": return "ArrowRight";
        case "ShiftLeft":
        case "ShiftRight": return "Shift";
        case "Space": return "space";
        default: return null;
      }
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && this.driving) {
        this.setDriving(false);
        e.preventDefault();
        return;
      }
      if (e.code === "Escape" && this.builder?.active) {
        if (this.builder.tool !== "query") {
          this.builder.setTool("query");
          if (!this.layersOpen) this.setPlanning(false);
        } else if (this.layersOpen) {
          this.setLayersOpen(false);
        } else if (this.mapOpen) {
          this.setMapOpen(false);
        }
        e.preventDefault();
        return;
      }
      if (e.code === "Escape" && (this.layersOpen || this.mapOpen) && !this.driving) {
        if (this.layersOpen) this.setLayersOpen(false);
        else this.setMapOpen(false);
        e.preventDefault();
        return;
      }
      if (e.code === "KeyM" && !e.repeat) {
        this.setMapOpen(!this.mapOpen);
        e.preventDefault();
        return;
      }
      if (e.code === "KeyB" && !e.repeat) {
        this.setLayersOpen(!this.layersOpen);
        e.preventDefault();
        return;
      }
      if (e.code === "KeyX" && !e.repeat) {
        this.toggleDemolish();
        e.preventDefault();
        return;
      }
      if (e.code === "KeyC" && !e.repeat) {
        this.setDriving(!this.driving);
        e.preventDefault();
        return;
      }
      if (this.handlePlanKey(e)) {
        e.preventDefault();
        return;
      }
      if ((e.code === "KeyT" || e.code === "Home") && !e.repeat) {
        this.snapView(TOWN_VIEWS[0]);
        e.preventDefault();
        return;
      }
      if (e.code === "BracketLeft" && !e.repeat) {
        this.cycleView(-1);
        e.preventDefault();
        return;
      }
      if (e.code === "BracketRight" && !e.repeat) {
        this.cycleView(1);
        e.preventDefault();
        return;
      }
      const key = keyFromCode(e.code);
      if (!key) return;
      this.keys[key] = true;
      if (key !== "Shift") e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      const key = keyFromCode(e.code);
      if (!key) return;
      this.keys[key] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    // Prevent focus loss from driving the browser away
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("click", () => this.canvas.focus());
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("dblclick", this.zoomToPoint);
    this.canvas.addEventListener("pointerdown", this.onPlanPointer);
    this.canvas.addEventListener("pointermove", this.onPlanPointer);
    this.canvas.addEventListener("pointerup", this.onPlanPointer);
    this.canvas.addEventListener("pointerleave", this.onPlanPointer);
    this.driveBtn?.addEventListener("click", () => this.setDriving(!this.driving));
    this.demolishBtn?.addEventListener("click", () => this.toggleDemolish());
    this.aerialBtn?.addEventListener("click", () => this.snapView(TOWN_VIEWS[0]));
    document.getElementById("hud")?.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement | null)?.closest("[data-panel]") as HTMLElement | null;
      if (tab?.dataset.panel === "map") this.setMapOpen(!this.mapOpen);
      if (tab?.dataset.panel === "layers") this.setLayersOpen(!this.layersOpen);
    });
    document.getElementById("dock-map")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement | null)?.closest("[data-close='map']")) this.setMapOpen(false);
    });
    document.getElementById("dock-layers")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement | null)?.closest("[data-close='layers']")) this.setLayersOpen(false);
    });
    this.bindViews();
    this.bindCamPad();
  }

  private bindCamPad() {
    const pad = document.getElementById("cam-pad");
    if (!pad) return;
    const actionOf = (e: Event) =>
      ((e.target as HTMLElement | null)?.closest("[data-cam]") as HTMLElement | null)?.dataset.cam ?? null;
    pad.addEventListener("pointerdown", (e) => {
      const action = actionOf(e);
      if (!action || this.driving) return;
      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is optional; hold-to-repeat still stops on pointerup */
      }
      this.nudgeCam(action);
      if (action !== "north") {
        this.camHold = action;
        this.camHoldAt = performance.now();
      }
    });
    const stop = () => {
      this.camHold = null;
    };
    pad.addEventListener("pointerup", stop);
    pad.addEventListener("pointercancel", stop);
    pad.addEventListener("lostpointercapture", stop);
    pad.addEventListener("click", (e) => {
      if (actionOf(e) === "north") this.nudgeCam("north");
    });
  }

  private tickCamPad(dt: number) {
    if (!this.camHold || this.driving) return;
    if (performance.now() - this.camHoldAt < 280) return;
    const turn = 0.95 * dt;
    const tilt = 0.7 * dt;
    switch (this.camHold) {
      case "rot-ccw":
        this.orbitBy(-turn, 0, 1);
        break;
      case "rot-cw":
        this.orbitBy(turn, 0, 1);
        break;
      case "tilt-up":
        this.orbitBy(0, -tilt, 1);
        break;
      case "tilt-down":
        this.orbitBy(0, tilt, 1);
        break;
      case "zoom-in":
        this.orbitBy(0, 0, Math.pow(0.22, dt));
        break;
      case "zoom-out":
        this.orbitBy(0, 0, Math.pow(4.6, dt));
        break;
      default:
        break;
    }
  }

  private nudgeCam(action: string) {
    if (this.driving) return;
    if (action === "north") {
      this.orbitBy(-this.controls.getAzimuthalAngle(), 0, 1);
      this.canvas.focus();
      return;
    }
    switch (action) {
      case "rot-ccw":
        this.orbitBy(-0.14, 0, 1);
        break;
      case "rot-cw":
        this.orbitBy(0.14, 0, 1);
        break;
      case "tilt-up":
        this.orbitBy(0, -0.1, 1);
        break;
      case "tilt-down":
        this.orbitBy(0, 0.1, 1);
        break;
      case "zoom-in":
        this.orbitBy(0, 0, 0.72);
        break;
      case "zoom-out":
        this.orbitBy(0, 0, 1.38);
        break;
      default:
        break;
    }
    this.canvas.focus();
  }

  private orbitBy(dTheta: number, dPhi: number, dolly: number) {
    this.camQuat.setFromUnitVectors(this.camera.up, this.camYUp);
    this.camQuatInv.copy(this.camQuat).invert();
    this.camOffset.copy(this.camera.position).sub(this.controls.target).applyQuaternion(this.camQuat);
    this.camSpherical.setFromVector3(this.camOffset);
    this.camSpherical.theta += dTheta;
    this.camSpherical.phi = THREE.MathUtils.clamp(
      this.camSpherical.phi + dPhi,
      this.controls.minPolarAngle + 0.02,
      this.controls.maxPolarAngle,
    );
    if (dolly !== 1) {
      this.camSpherical.radius = THREE.MathUtils.clamp(
        this.camSpherical.radius * dolly,
        this.controls.minDistance,
        this.controls.maxDistance,
      );
    }
    this.camOffset.setFromSpherical(this.camSpherical).applyQuaternion(this.camQuatInv);
    this.camera.position.copy(this.controls.target).add(this.camOffset);
    this.camera.up.copy(this.camYUp);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  private syncCompass() {
    if (!this.compassRose) return;
    const deg = THREE.MathUtils.radToDeg(this.controls.getAzimuthalAngle());
    this.compassRose.style.setProperty("--heading", `${-deg}deg`);
  }

  private bindViews() {
    const select = this.viewSelect;
    if (!select) return;
    select.replaceChildren();
    for (const view of TOWN_VIEWS) {
      const opt = document.createElement("option");
      opt.value = view.id;
      opt.textContent = view.name;
      select.append(opt);
    }
    select.value = TOWN_VIEWS[0].id;
    select.addEventListener("change", () => {
      const view = TOWN_VIEWS.find((v) => v.id === select.value);
      if (view) this.snapView(view);
    });
  }

  private cycleView(step: number) {
    const n = TOWN_VIEWS.length;
    this.viewIndex = (this.viewIndex + step + n) % n;
    this.snapView(TOWN_VIEWS[this.viewIndex]);
  }

  private snapAerial() {
    this.snapView(TOWN_VIEWS[0]);
  }

  private snapView(view: TownView) {
    if (this.driving) this.setDriving(false);
    this.viewIndex = Math.max(0, TOWN_VIEWS.findIndex((v) => v.id === view.id));
    if (this.viewSelect) this.viewSelect.value = view.id;
    this.aerialBtn?.classList.toggle("is-on", !!view.aerial);
    if (view.aerial) {
      const { x, y: z } = osmLocal(view.lat, view.lon);
      const target = new THREE.Vector3(x, 0, z);
      this.mapScene?.localToWorld(target);
      target.y = this.sampleGround(target.x, target.z) ?? 0;
      const height = view.height || this.aerialHeight;
      this.controls.target.copy(target);
      this.camera.position.set(target.x, height, target.z + 1);
      this.camera.up.set(0, 1, 0);
      this.camera.near = 2;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.canvas.focus();
      return;
    }
    if (!this.mapScene) return;
    const { x, y: z } = osmLocal(view.lat, view.lon);
    const rad = (view.from * Math.PI) / 180;
    const probe = new THREE.Vector3(x, 40, z);
    this.mapScene.localToWorld(probe);
    const ground = this.sampleGround(probe.x, probe.z) ?? 4;
    const target = new THREE.Vector3(x, 0, z);
    const cam = new THREE.Vector3(
      x + Math.sin(rad) * view.dist,
      0,
      z + Math.cos(rad) * view.dist,
    );
    this.mapScene.localToWorld(target);
    this.mapScene.localToWorld(cam);
    target.y = ground + (view.look ?? 6);
    cam.y = ground + view.height;
    this.controls.target.copy(target);
    this.camera.position.copy(cam);
    this.camera.up.set(0, 1, 0);
    this.controls.minDistance = 18;
    this.controls.update();
    this.canvas.focus();
  }

  private zoomToPoint = (e: MouseEvent) => {
    if (this.driving || this.builder?.ownsLeftClick()) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.pickNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pickRay.setFromCamera(this.pickNdc, this.camera);
    if (!this.pickRay.ray.intersectPlane(this.groundPlane, this.pickHit)) return;
    this.camera.position.lerp(this.pickHit, 0.42);
    this.camera.position.y = Math.max(22, this.camera.position.y);
    this.controls.target.lerp(this.pickHit, 0.42);
    this.controls.target.y = 0;
    this.controls.update();
  };

  private bindFilters() {
    const panel = document.getElementById("map-filters");
    if (!panel) return;
    panel.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement | null;
      const key = input?.dataset.filter as keyof MapFilters | undefined;
      if (!input || !key || !(key in this.filters)) return;
      this.filters[key] = input.checked;
      this.applyFilters();
    });
  }

  private hidingGround() {
    return Boolean(this.builder?.active && this.builder.overlay !== "none");
  }

  private applyFilters() {
    const strip = this.hidingGround();
    const showBuildings = this.filters.buildings && !strip;
    const showRoads = this.filters.roads;
    const showRails = this.filters.rails;
    const showVeg = this.filters.vegetation && !strip;
    const showPower = this.filters.power && !strip;
    const showTrains = this.filters.trains;
    const buildings = this.layerMeshes.get("buildings");
    const roads = this.layerMeshes.get("roads");
    const rails = this.layerMeshes.get("rails");
    if (buildings) buildings.visible = showBuildings;
    if (roads) roads.visible = showRoads;
    for (const extra of this.roadDecor) extra.visible = showRoads;
    if (rails) rails.visible = showRails;
    for (const extra of this.railDecor) extra.visible = showRails;
    if (this.spinnaker) this.spinnaker.visible = showBuildings;
    if (this.forts) this.forts.visible = showBuildings;
    if (this.vegetation) this.vegetation.visible = showVeg;
    if (this.groundCover) this.groundCover.visible = showVeg;
    if (this.landmarks) this.landmarks.visible = showBuildings;
    if (this.harbour) this.harbour.group.visible = this.filters.ships;
    if (this.harbourKit) this.harbourKit.visible = this.filters.ships;
    if (this.powerKit) this.powerKit.visible = showPower;
    for (const extra of this.powerDecor) extra.visible = showPower;
    if (this.trains) this.trains.group.visible = showTrains;
    if (this.furnitureKit) this.furnitureKit.visible = !strip;
    if (this.barrierKit) this.barrierKit.visible = !strip;
    this.updateSun();
    this.updateLabels();
  }

  private async placeBuilder() {
    const terrain = this.layerMeshes.get("terrain");
    const buildings = this.layerMeshes.get("buildings");
    const chunks = buildings instanceof THREE.Group ? (buildings.children as THREE.Mesh[]) : this.buildingChunks;
    if (!this.mapScene || !(terrain instanceof THREE.Mesh)) return;
    try {
      const builder = new CityBuilder(this.mapScene, terrain, chunks, this.camera, this.canvas);
      builder.onChange = () => {
        this.syncPlanControls();
        this.applyFilters();
      };
      await builder.load();
      this.builder = builder;
      if (this.layersOpen) this.setPlanning(true);
    } catch (err) {
      console.warn("Planning office failed to load:", err);
    }
  }

  private syncHudChrome() {
    const mapDock = document.getElementById("dock-map");
    const layerDock = document.getElementById("dock-layers");
    const mapTab = document.getElementById("tab-map");
    const layerTab = document.getElementById("tab-layers");
    mapDock?.classList.toggle("is-away", !this.mapOpen);
    layerDock?.classList.toggle("is-away", !this.layersOpen);
    document.body.classList.toggle("is-map", this.mapOpen);
    document.body.classList.toggle("is-layers", this.layersOpen);
    mapTab?.classList.toggle("is-on", this.mapOpen);
    layerTab?.classList.toggle("is-on", this.layersOpen);
    mapTab?.setAttribute("aria-pressed", String(this.mapOpen));
    layerTab?.setAttribute("aria-pressed", String(this.layersOpen));
  }

  private setMapOpen(on: boolean) {
    this.mapOpen = on;
    this.syncHudChrome();
    this.canvas.focus();
  }

  private setLayersOpen(on: boolean) {
    if (on && this.driving) this.setDriving(false);
    this.layersOpen = on;
    this.syncHudChrome();
    if (on) this.setPlanning(true);
    else if (this.builder?.tool !== "demolish") this.setPlanning(false);
    this.canvas.focus();
  }

  private toggleDemolish() {
    if (!this.builder) return;
    if (this.driving) this.setDriving(false);
    if (this.builder.active && this.builder.tool === "demolish") {
      this.builder.setTool("query");
      if (!this.layersOpen) this.setPlanning(false);
    } else {
      this.setPlanning(true);
      this.builder.setTool("demolish");
    }
  }

  private setPlanning(on: boolean) {
    if (!this.builder) return;
    if (on && this.driving) this.setDriving(false);
    this.builder.setActive(on);
    this.syncPlanControls();
    this.canvas.focus();
  }

  private syncPlanControls() {
    const paint = Boolean(this.builder?.ownsLeftClick());
    this.controls.mouseButtons.LEFT = paint ? (-1 as THREE.MOUSE) : THREE.MOUSE.PAN;
  }

  private handlePlanKey(e: KeyboardEvent): boolean {
    const builder = this.builder;
    if (!builder || e.repeat || this.driving) return false;
    const tools: Record<string, BuilderTool> = {
      Digit1: "residential",
      Digit2: "commercial",
      Digit3: "industrial",
      Digit4: "defence",
      Digit5: "park",
      Digit6: "civic",
      Digit7: "harbour",
      Digit8: "utilities",
      Digit9: "cultural",
      Digit0: "query",
      KeyZ: "dezone",
    };
    const tool = tools[e.code];
    if (tool) {
      if (tool !== "query") this.setLayersOpen(true);
      this.setPlanning(true);
      builder.setTool(tool);
      return true;
    }
    if (e.code === "Minus") {
      builder.setBrush(builder.brush - 1);
      return true;
    }
    if (e.code === "Equal") {
      builder.setBrush(builder.brush + 1);
      return true;
    }
    return false;
  }

  private onPlanPointer = (e: PointerEvent) => {
    const builder = this.builder;
    if (!builder?.active) return;
    if (e.type === "pointerdown" && e.button !== 0) return;
    const phase =
      e.type === "pointerdown" ? "down"
      : e.type === "pointerup" || e.type === "pointerleave" ? "up"
      : builder.ownsLeftClick() && e.buttons & 1 ? "move"
      : "hover";
    if (phase === "down" && builder.ownsLeftClick()) {
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    builder.pointer(e, phase);
  };

  private setDriving(on: boolean) {
    if (!this.motor || !this.mapScene) return;
    if (on) this.setPlanning(false);
    this.driving = on;
    this.motor.group.visible = on;
    this.controls.enabled = !on;
    document.body.classList.toggle("is-driving", on);
    if (this.driveBtn) {
      const label = on ? "Back to the map" : "Take the motor";
      this.driveBtn.classList.toggle("is-on", on);
      this.driveBtn.title = label;
      this.driveBtn.setAttribute("aria-label", label);
      this.driveBtn.setAttribute("aria-pressed", String(on));
    }
    if (this.hintEl) this.hintEl.textContent = on ? this.driveHint : this.mapHint;
    if (this.speedo) this.speedo.hidden = !on;
    if (this.minimapEl) this.minimapEl.hidden = !on;
    this.camera.near = on ? 0.45 : 2;
    this.camera.updateProjectionMatrix();

    if (on) {
      const spawn = this.controls.target;
      const ground = this.sampleGround(spawn.x, spawn.z) ?? spawn.y;
      this.motor.place(spawn.x, ground, spawn.z, 0);
      this.motor.forward(this.driveFwd);
      this.camBoom = 9.6;
      this.followMotor(this.motor.position, this.nearbyChunks(spawn.x, spawn.z, 90), 0, true);
      this.controls.target.set(spawn.x, ground, spawn.z);
    } else {
      const p = this.motor.position;
      this.controls.target.set(p.x, p.y, p.z);
      this.camera.position.set(p.x, p.y + 80, p.z + 40);
      this.controls.update();
    }
    this.canvas.focus();
  }

  private async placeSpinnaker(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      const gltf = await loader.loadAsync("./models/spinnaker-tower.glb?v=leaf4");
      const tower = gltf.scene;
      tower.name = "spinnaker";
      const { x, y: z } = osmLocal(50.795617, -1.108572);
      this.mapScene.updateWorldMatrix(true, false);
      const probe = new THREE.Vector3(x, 40, z);
      this.mapScene.localToWorld(probe);
      const ground = this.sampleGround(probe.x, probe.z);
      const at = new THREE.Vector3(x, 0, z);
      if (ground !== null) {
        at.set(probe.x, ground, probe.z);
        this.mapScene.worldToLocal(at);
      }
      tower.position.copy(at);
      tower.rotation.y = 0.22;
      tower.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.geometry.computeBoundingSphere();
        mesh.geometry.computeBoundsTree();
        this.buildingChunks.push(mesh);
      });
      this.mapScene.add(tower);
      this.spinnaker = tower;
      labels.push({ kind: "building", name: "Spinnaker Tower", x: at.x, y: at.y + 175, z: at.z });
    } catch (err) {
      console.warn("Spinnaker Tower failed to load:", err);
    }
  }

  private async placeForts(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      this.forts = await addSeaForts(loader, this.mapScene, labels);
    } catch (err) {
      console.warn("Sea forts failed to load:", err);
    }
  }

  private async placeVegetation(loader: GLTFLoader) {
    if (!this.mapScene) return;
    try {
      const planted = await addVegetation(
        loader,
        this.mapScene,
        (x, z) => this.sampleGround(x, z),
        (x, z) => this.onCarriage(x, z),
      );
      this.vegetation = planted.trees;
      this.groundCover = planted.cover;
    } catch (err) {
      console.warn("Vegetation failed to load:", err);
    }
  }

  private async placePlaces(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene || !this.groundCover) return;
    try {
      this.landmarks = await addPlaces(
        loader,
        this.mapScene,
        (x, z) => this.sampleGround(x, z),
        this.groundCover,
        labels,
      );
    } catch (err) {
      console.warn("Places failed to load:", err);
    }
  }

  private async placeHarbourKit(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      this.harbourKit = await addHarbourKit(loader, this.mapScene, (x, z) => this.sampleGround(x, z), labels);
    } catch (err) {
      console.warn("Harbour kit failed to load:", err);
    }
  }

  private async placePowerKit(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      this.powerKit = await addPowerKit(loader, this.mapScene, (x, z) => this.sampleGround(x, z), labels);
    } catch (err) {
      console.warn("Power kit failed to load:", err);
    }
  }

  private async placeBarrierKit(loader: GLTFLoader) {
    if (!this.mapScene) return;
    try {
      this.barrierKit = await addBarrierKit(loader, this.mapScene);
      this.barrierKit.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) this.barrierChunks.push(mesh);
      });
    } catch (err) {
      console.warn("Barrier kit failed to load:", err);
    }
  }

  private async placeFurnitureKit(loader: GLTFLoader) {
    if (!this.mapScene) return;
    try {
      this.furnitureKit = await addFurnitureKit(
        loader,
        this.mapScene,
        (x, z) => this.sampleGround(x, z),
        (x, z) => this.onCarriage(x, z),
      );
      this.furnitureKit.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) this.barrierChunks.push(mesh);
      });
    } catch (err) {
      console.warn("Street furniture failed to load:", err);
    }
  }

  private updateBarriers() {
    if (this.hidingGround()) {
      for (const chunk of this.barrierChunks) chunk.visible = false;
      return;
    }
    const near = this.camera.position.distanceTo(this.controls.target) < BARRIER_VIEW;
    const tx = this.controls.target.x;
    const tz = this.controls.target.z;
    for (const chunk of this.barrierChunks) {
      if (!near) {
        chunk.visible = false;
        continue;
      }
      const mesh = chunk as THREE.Mesh;
      const sphere = mesh.geometry?.boundingSphere;
      if (typeof chunk.userData.cellX === "number") {
        this.chunkCenter.set(chunk.userData.cellX, 0, chunk.userData.cellZ);
        this.mapScene?.localToWorld(this.chunkCenter);
      } else if (sphere) {
        this.chunkCenter.copy(sphere.center);
        mesh.localToWorld(this.chunkCenter);
      } else {
        chunk.visible = false;
        continue;
      }
      const reach = sphere?.radius ?? 55;
      chunk.visible = Math.hypot(this.chunkCenter.x - tx, this.chunkCenter.z - tz) < BARRIER_REACH + reach;
    }
  }

  private async placeShips(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      this.harbour = new HarbourTraffic();
      await this.harbour.load(loader, this.mapScene, (x, z) => this.sampleGround(x, z));
      this.harbour.group.traverse((o) => {
        const name = o.userData?.label as string | undefined;
        if (!name) return;
        labels.push({
          kind: "building",
          name,
          x: o.position.x,
          y: o.position.y + 28,
          z: o.position.z,
        });
      });
    } catch (err) {
      console.warn("Harbour traffic failed to load:", err);
    }
  }

  private async placeTrains(loader: GLTFLoader, labels: MapLabel[]) {
    if (!this.mapScene) return;
    try {
      this.trains = new RailTraffic();
      await this.trains.load(loader, this.mapScene, (x, z) => this.sampleGround(x, z));
      this.trains.group.traverse((o) => {
        const name = o.userData?.label as string | undefined;
        if (!name) return;
        labels.push({
          kind: "building",
          name,
          x: o.position.x,
          y: o.position.y + 8,
          z: o.position.z,
        });
      });
    } catch (err) {
      console.warn("Rail traffic failed to load:", err);
    }
  }

  private nearbyChunks(x: number, z: number, radius: number): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const chunk of this.buildingChunks) {
      const sphere = chunk.geometry.boundingSphere;
      if (!sphere) continue;
      this.chunkCenter.copy(sphere.center);
      chunk.localToWorld(this.chunkCenter);
      if (Math.hypot(this.chunkCenter.x - x, this.chunkCenter.z - z) < radius + sphere.radius) {
        out.push(chunk);
      }
    }
    return out;
  }

  private groundHit = { x: Number.NaN, z: Number.NaN, y: 0, road: false, ok: false };

  private sampleHit(x: number, z: number): { y: number; road: boolean } | null {
    if (this.groundHit.ok && this.groundHit.x === x && this.groundHit.z === z) {
      return this.groundHit;
    }
    if (this.groundMeshes.length === 0) return null;
    this.driveOrigin.set(x, 80, z);
    this.driveRay.set(this.driveOrigin, this.driveDown);
    this.driveRay.near = 0;
    this.driveRay.far = 120;
    const hit = this.driveRay.intersectObjects(this.groundMeshes, false)[0];
    if (!hit) {
      this.groundHit.ok = false;
      return null;
    }
    const road = hit.object.name === "roads";
    this.groundHit = { x, z, y: hit.point.y, road, ok: true };
    return this.groundHit;
  }

  private sampleGround(x: number, z: number): number | null {
    return this.sampleHit(x, z)?.y ?? null;
  }

  private onCarriage(x: number, z: number): boolean {
    return this.sampleHit(x, z)?.road ?? false;
  }

  private bumperBlocked(origin: THREE.Vector3, dir: THREE.Vector3, chunks: THREE.Mesh[]): number {
    this.driveRay.set(origin, dir);
    this.driveRay.near = 0.1;
    this.driveRay.far = 2.4;
    const hit = this.driveRay.intersectObjects(chunks, false)[0];
    if (!hit) return 0;
    return dir.dot(this.driveFwd) >= 0 ? 1 : -1;
  }

  /** How far from `from` toward `to` before a building wall, with a little skin. */
  private boomClearance(from: THREE.Vector3, to: THREE.Vector3, chunks: THREE.Mesh[]): number {
    this.camForward.subVectors(to, from);
    const span = this.camForward.length();
    if (span < 0.08 || chunks.length === 0) return span;
    this.camForward.multiplyScalar(1 / span);
    this.camRight.set(this.camForward.z, 0, -this.camForward.x);
    if (this.camRight.lengthSq() < 1e-6) this.camRight.set(1, 0, 0);
    else this.camRight.normalize();
    let best = span;
    for (const side of [0, 0.42, -0.42]) {
      this.pickHit.copy(from).addScaledVector(this.camRight, side);
      this.driveRay.set(this.pickHit, this.camForward);
      this.driveRay.near = 0.12;
      this.driveRay.far = span;
      const hits = this.driveRay.intersectObjects(chunks, false);
      for (const hit of hits) {
        if (Math.abs(hit.normal?.y ?? 0) > 0.72) continue;
        best = Math.min(best, hit.distance - 0.55);
        break;
      }
    }
    return Math.max(0.35, best);
  }

  private liftOverRoofs(pos: THREE.Vector3, chunks: THREE.Mesh[]) {
    if (chunks.length === 0) return;
    this.camRight.set(0, 1, 0);
    this.driveRay.set(pos, this.camRight);
    this.driveRay.near = 0.15;
    this.driveRay.far = 22;
    const hit = this.driveRay.intersectObjects(chunks, false)[0];
    if (hit && (hit.normal?.y ?? 1) > 0.25) pos.y = hit.point.y + 1.7;
  }

  private followMotor(p: THREE.Vector3, chunks: THREE.Mesh[], dt: number, snap: boolean) {
    const BACK = 9.6;
    const HEIGHT = 3.8;
    this.labelScratch.copy(p).addScaledVector(this.driveFwd, 6.4);
    this.labelScratch.y += 1.2;
    this.driveOrigin.copy(p);
    this.driveOrigin.y += 1.4;

    this.camMove.copy(p).addScaledVector(this.driveFwd, -BACK);
    this.camMove.y = p.y + HEIGHT;
    const walls = this.filters.buildings ? chunks : [];
    const low = this.boomClearance(this.driveOrigin, this.camMove, walls);
    if (walls.length && low < BACK * 0.78) {
      this.chunkCenter.copy(p).addScaledVector(this.driveFwd, -5.2);
      this.chunkCenter.y = p.y + 8.1;
      if (this.boomClearance(this.driveOrigin, this.chunkCenter, walls) > low + 0.45) {
        this.camMove.copy(this.chunkCenter);
      }
    }

    this.camForward.subVectors(this.camMove, this.driveOrigin);
    const span = Math.max(0.001, this.camForward.length());
    this.camForward.multiplyScalar(1 / span);
    const allowed = this.boomClearance(this.driveOrigin, this.camMove, walls);
    const target = THREE.MathUtils.clamp(Math.min(span, allowed), 2.4, span);
    if (snap) this.camBoom = target;
    else {
      const rate = target < this.camBoom - 0.04 ? 18 : 3.5;
      this.camBoom += (target - this.camBoom) * (1 - Math.exp(-rate * dt));
    }
    this.camMove.copy(this.driveOrigin).addScaledVector(this.camForward, this.camBoom);
    this.liftOverRoofs(this.camMove, walls);
    const gy = this.sampleGround(this.camMove.x, this.camMove.z);
    if (gy !== null) this.camMove.y = Math.max(this.camMove.y, gy + 1.15);
    this.driveOrigin.copy(p);
    this.driveOrigin.y += 1.4;

    if (snap) this.camera.position.copy(this.camMove);
    else this.camera.position.lerp(this.camMove, 1 - Math.exp(-7 * dt));

    const keep = this.boomClearance(this.driveOrigin, this.camera.position, walls);
    this.camForward.subVectors(this.camera.position, this.driveOrigin);
    const now = this.camForward.length();
    if (now > 0.25 && keep < now - 0.02) {
      this.camForward.multiplyScalar(1 / now);
      this.camera.position.copy(this.driveOrigin).addScaledVector(this.camForward, keep);
    }
    this.liftOverRoofs(this.camera.position, walls);
    this.camera.lookAt(this.labelScratch);
  }

  private updateDrive(dt: number) {
    const motor = this.motor;
    if (!motor) return;
    const k = this.keys;
    const throttle = Number(k.w || k.ArrowUp) - Number(k.s || k.ArrowDown);
    const steer = Number(k.a || k.ArrowLeft) - Number(k.d || k.ArrowRight);
    motor.forward(this.driveFwd);
    const p = motor.position;
    const chunks = this.nearbyChunks(p.x, p.z, 90);
    const sense = motor.speed < -0.35 ? -1 : 1;
    this.camForward.copy(this.driveFwd).multiplyScalar(sense);
    this.driveOrigin.set(p.x, p.y + 0.7, p.z).addScaledVector(this.camForward, 1.55);
    const blocked = this.bumperBlocked(this.driveOrigin, this.camForward, chunks);

    const travel = motor.integrate(dt, {
      throttle,
      steer,
      brake: k.space,
      boost: k.Shift,
    }, blocked);
    if (!blocked) p.addScaledVector(this.driveFwd, travel);

    const ground = this.sampleGround(p.x, p.z);
    if (ground !== null) p.y = ground;
    else p.y += (0.2 - p.y) * Math.min(1, 4 * dt);

    this.controls.target.copy(p);
    this.followMotor(p, chunks, dt, false);
    if (this.speedo) this.speedo.textContent = `${motor.mph().toFixed(0)} mph`;
  }

  private updateSun() {
    const target = this.controls.target;
    const dist = this.camera.position.distanceTo(target);
    const skyDist = Math.min(8200, Math.max(3200, dist * 2.2));
    this.sunDisc.position.copy(target).addScaledVector(this.sunDir, skyDist);
    this.sunDisc.scale.setScalar(skyDist * 0.028);

    const shadowsOn = this.filters.buildings && dist < 2100;
    this.sun.castShadow = shadowsOn;
    if (!shadowsOn) {
      for (const chunk of this.buildingChunks) chunk.castShadow = false;
      return;
    }

    const extent = THREE.MathUtils.clamp(dist * 1.05, SHADOW_EXTENT_MIN, SHADOW_EXTENT_MAX);
    this.camMove.copy(target);
    if (this.driving) this.camMove.addScaledVector(this.driveFwd, extent * 0.45);
    this.sun.target.position.copy(this.camMove);
    this.sun.position.copy(this.camMove).addScaledVector(this.sunDir, extent * 3.4);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();

    const cam = this.sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 4;
    cam.far = extent * 6.2;
    cam.updateProjectionMatrix();

    const reach = extent * 1.35;
    const focusX = this.camMove.x;
    const focusZ = this.camMove.z;
    for (const chunk of this.buildingChunks) {
      const sphere = chunk.geometry.boundingSphere;
      if (!sphere) {
        chunk.castShadow = false;
        continue;
      }
      this.chunkCenter.copy(sphere.center);
      chunk.localToWorld(this.chunkCenter);
      const dx = this.chunkCenter.x - focusX;
      const dz = this.chunkCenter.z - focusZ;
      chunk.castShadow = Math.hypot(dx, dz) < reach + sphere.radius;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  private buildLabels(labels: MapLabel[]) {
    if (!this.labelLayer) return;
    this.labelLayer.replaceChildren();
    this.labelObjects = [];
    for (const label of labels) {
      const el = document.createElement("div");
      el.className = `map-label map-label--${label.kind}`;
      el.textContent = label.name;
      el.style.display = "none";
      this.labelLayer.appendChild(el);
      this.labelObjects.push({
        kind: label.kind,
        rank: labelRank(label.kind, label.name),
        local: new THREE.Vector3(label.x, label.y, label.z),
        el,
      });
    }
  }

  private labelKindOn(kind: MapLabel["kind"]) {
    if (this.hidingGround() && kind === "building") return false;
    if (kind === "road") return this.filters.roadLabels;
    if (kind === "building") return this.filters.buildingLabels;
    return this.filters.areaLabels;
  }

  private updateLabels() {
    if (!this.mapScene) return;
    this.mapScene.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld();
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const viewDist = this.camera.position.distanceTo(this.controls.target);
    const far = viewDist > 4000;
    const mid = viewDist > 1500;
    const roadRankCap = far ? 0 : mid ? 1 : 2;
    const budget: Record<MapLabel["kind"], number> = {
      area: far ? 22 : mid ? 18 : 26,
      road: far ? 18 : mid ? 28 : 52,
      building: far ? 18 : mid ? 24 : 64,
    };
    const cell = far ? 150 : mid ? 118 : 86;

    type Candidate = {
      label: {
        kind: MapLabel["kind"];
        rank: number;
        local: THREE.Vector3;
        el: HTMLDivElement;
      };
      x: number;
      y: number;
      dist: number;
    };
    const byKind: Record<MapLabel["kind"], Candidate[]> = { area: [], road: [], building: [] };

    for (const label of this.labelObjects) {
      if (!this.labelKindOn(label.kind) || (label.kind === "road" && label.rank > roadRankCap)) {
        label.el.style.display = "none";
        continue;
      }
      this.labelScratch.copy(label.local).applyMatrix4(this.mapScene.matrixWorld);
      const dx = this.labelScratch.x - this.controls.target.x;
      const dz = this.labelScratch.z - this.controls.target.z;
      const dist = Math.hypot(dx, dz);
      this.labelScratch.project(this.camera);
      if (this.labelScratch.z < -1 || this.labelScratch.z > 1) {
        label.el.style.display = "none";
        continue;
      }
      const x = (this.labelScratch.x * 0.5 + 0.5) * w;
      const y = (-this.labelScratch.y * 0.5 + 0.5) * h;
      if (x < -60 || x > w + 60 || y < -30 || y > h + 30) {
        label.el.style.display = "none";
        continue;
      }
      byKind[label.kind].push({ label, x, y, dist });
    }

    for (const list of Object.values(byKind)) {
      list.sort((a, b) => a.label.rank - b.label.rank || a.dist - b.dist);
    }

    this.placedLabels.length = 0;
    const usedCells = new Set<string>();
    const shown: Record<MapLabel["kind"], number> = { area: 0, road: 0, building: 0 };
    const kinds = (["area", "road", "building"] as const).filter((k) => this.labelKindOn(k));
    const cursor = { area: 0, road: 0, building: 0 };

    const tryPlace = (kind: MapLabel["kind"]): boolean => {
      if (shown[kind] >= budget[kind]) return false;
      const list = byKind[kind];
      while (cursor[kind] < list.length) {
        const { label, x, y } = list[cursor[kind]++];
        const gx = Math.round(x / cell);
        const gy = Math.round(y / cell);
        const key = `${gx},${gy}`;
        if (usedCells.has(key)) {
          label.el.style.display = "none";
          continue;
        }
        const text = label.el.textContent ?? "";
        const lw = Math.max(36, text.length * 6.4);
        const lh = kind === "area" ? 16 : 13;
        const box = { x: x - lw * 0.5, y: y - lh, w: lw, h: lh };
        if (boxesOverlap(box, this.placedLabels)) {
          label.el.style.display = "none";
          continue;
        }
        usedCells.add(key);
        this.placedLabels.push(box);
        shown[kind]++;
        label.el.style.display = "block";
        label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        return true;
      }
      return false;
    };

    let added = true;
    while (added) {
      added = false;
      for (const kind of kinds) {
        if (tryPlace(kind)) added = true;
      }
    }

    for (const kind of kinds) {
      const list = byKind[kind];
      for (let i = cursor[kind]; i < list.length; i++) list[i].label.el.style.display = "none";
    }
  }
}

function labelRank(kind: MapLabel["kind"], name: string): number {
  if (/\bspinnaker\b/i.test(name)) return 0;
  if (kind === "area") return 0;
  if (kind === "building") return 3;
  const n = name.toLowerCase();
  if (
    /\b(eastern road|commercial road|london road|albert road|fratton road|highland road|milton road|copnor road|elm grove|northern parade)\b/.test(
      n,
    )
  ) {
    return 0;
  }
  if (/\b(road|street|parade|esplanade|avenue)\b/.test(n)) return 1;
  return 2;
}

function boxesOverlap(
  box: { x: number; y: number; w: number; h: number },
  placed: Array<{ x: number; y: number; w: number; h: number }>,
) {
  for (const p of placed) {
    if (box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y) {
      return true;
    }
  }
  return false;
}

function chunkBuildings(src: THREE.Mesh, cell: number): THREE.Group {
  const geom = src.geometry;
  const pos = geom.attributes.position.array as Float32Array;
  const nrm = geom.attributes.normal.array as Float32Array;
  const col = geom.attributes.color?.array as Float32Array | undefined;
  const colSize = geom.attributes.color?.itemSize ?? 3;
  const idx = geom.index?.array;
  if (!idx) return new THREE.Group();

  const bins = new Map<number, number[]>();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const cx = Math.floor(pos[a * 3] / cell);
    const cz = Math.floor(pos[a * 3 + 2] / cell);
    const key = ((cx + 32768) << 16) | (cz + 32768);
    let bin = bins.get(key);
    if (!bin) {
      bin = [];
      bins.set(key, bin);
    }
    bin.push(a, idx[i + 1], idx[i + 2]);
  }

  const group = new THREE.Group();
  group.name = src.name;
  for (const indices of bins.values()) {
    const remap = new Map<number, number>();
    const newPos: number[] = [];
    const newNrm: number[] = [];
    const newCol: number[] = [];
    const newIdx = new Uint32Array(indices.length);
    let next = 0;
    for (let i = 0; i < indices.length; i++) {
      const old = indices[i];
      let ni = remap.get(old);
      if (ni === undefined) {
        ni = next++;
        remap.set(old, ni);
        const o = old * 3;
        newPos.push(pos[o], pos[o + 1], pos[o + 2]);
        newNrm.push(nrm[o], nrm[o + 1], nrm[o + 2]);
        if (col) {
          const c = old * colSize;
          newCol.push(col[c], col[c + 1], col[c + 2]);
        }
      }
      newIdx[i] = ni;
    }
    const chunkGeom = new THREE.BufferGeometry();
    chunkGeom.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
    chunkGeom.setAttribute("normal", new THREE.Float32BufferAttribute(newNrm, 3));
    if (newCol.length) chunkGeom.setAttribute("color", new THREE.Float32BufferAttribute(newCol, 3));
    chunkGeom.setIndex(new THREE.Uint32BufferAttribute(newIdx, 1));
    chunkGeom.computeBoundingSphere();
    const mesh = new THREE.Mesh(chunkGeom, src.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    group.add(mesh);
  }
  return group;
}
