import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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

const BARRIER_VIEW = 340;
const BARRIER_REACH = 170;
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
  private aerialBtn = document.getElementById("aerial-toggle") as HTMLButtonElement | null;
  private viewSelect = document.getElementById("view-select") as HTMLSelectElement | null;
  private viewIndex = 0;
  private hintEl = document.querySelector(".map-filters__hint");
  private mapHint =
    "Drag to pan · scroll zooms to cursor · right-drag to tilt · double-click to close in · T aerial · [ ] viewpoints · WASD to move · Q/E height";
  private aerialHeight = 1200;
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
    this.sun.shadow.mapSize.set(1024, 1024);
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
    try {
      const [gltf, labels] = await Promise.all([
        loader.loadAsync("./models/portsmouth-terrain.gltf?v=ships1"),
        fetch("./models/portsmouth-labels.json").then((r) => r.json()) as Promise<MapLabel[]>,
      ]);
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
      try {
        await addShore(gltf.scene);
      } catch (err) {
        console.warn("Shore failed to load:", err);
      }
      await this.placeSpinnaker(loader, labels);
      await this.placeForts(loader, labels);
      await this.placeVegetation(loader);
      await this.placePlaces(loader, labels);
      await this.placeShips(loader, labels);
      await this.placeHarbourKit(loader, labels);
      await this.placePowerKit(loader, labels);
      await this.placeBarrierKit(loader);
      await this.placeFurnitureKit(loader);
      await this.placeTrains(loader, labels);

      this.buildLabels(labels);
      this.applyFilters();

      const span = Math.max(size.x, size.z);
      this.aerialHeight = span * 0.9;
      this.snapAerial();
      this.controls.maxDistance = Math.max(8000, span * 1.6);
      this.controls.update();
    } catch (e) {
      console.error("Failed to load terrain:", e);
    }

    this.clock.start();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.loop();
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
    else this.updateFly(dt);
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
    const x = w - MINIMAP_PAD - MINIMAP_CSS;
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
      if (e.code === "KeyC" && !e.repeat) {
        this.setDriving(!this.driving);
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
    this.driveBtn?.addEventListener("click", () => this.setDriving(!this.driving));
    this.aerialBtn?.addEventListener("click", () => this.snapView(TOWN_VIEWS[0]));
    this.bindViews();
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
    if (view.aerial) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, this.aerialHeight, 1);
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
    if (this.driving) return;
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

  private applyFilters() {
    const buildings = this.layerMeshes.get("buildings");
    const roads = this.layerMeshes.get("roads");
    const rails = this.layerMeshes.get("rails");
    if (buildings) buildings.visible = this.filters.buildings;
    if (roads) roads.visible = this.filters.roads;
    for (const extra of this.roadDecor) extra.visible = this.filters.roads;
    if (rails) rails.visible = this.filters.rails;
    for (const extra of this.railDecor) extra.visible = this.filters.rails;
    if (this.spinnaker) this.spinnaker.visible = this.filters.buildings;
    if (this.forts) this.forts.visible = this.filters.buildings;
    if (this.vegetation) this.vegetation.visible = this.filters.vegetation;
    if (this.groundCover) this.groundCover.visible = this.filters.vegetation;
    if (this.landmarks) this.landmarks.visible = this.filters.buildings;
    if (this.harbour) this.harbour.group.visible = this.filters.ships;
    if (this.harbourKit) this.harbourKit.visible = this.filters.ships;
    if (this.powerKit) this.powerKit.visible = this.filters.power;
    for (const extra of this.powerDecor) extra.visible = this.filters.power;
    if (this.trains) this.trains.group.visible = this.filters.trains;
    this.updateSun();
    this.updateLabels();
  }

  private setDriving(on: boolean) {
    if (!this.motor || !this.mapScene) return;
    this.driving = on;
    this.motor.group.visible = on;
    this.controls.enabled = !on;
    document.body.classList.toggle("is-driving", on);
    if (this.driveBtn) this.driveBtn.textContent = on ? "Back to the map" : "Take the motor";
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
      const planted = await addVegetation(loader, this.mapScene, (x, z) => this.sampleGround(x, z));
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
      this.furnitureKit = await addFurnitureKit(loader, this.mapScene, (x, z) => this.sampleGround(x, z));
      this.furnitureKit.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) this.barrierChunks.push(mesh);
      });
    } catch (err) {
      console.warn("Street furniture failed to load:", err);
    }
  }

  private updateBarriers() {
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

  private sampleGround(x: number, z: number): number | null {
    if (this.groundMeshes.length === 0) return null;
    this.driveOrigin.set(x, 80, z);
    this.driveRay.set(this.driveOrigin, this.driveDown);
    this.driveRay.near = 0;
    this.driveRay.far = 120;
    const hit = this.driveRay.intersectObjects(this.groundMeshes, false)[0];
    return hit ? hit.point.y : null;
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

    const extent = THREE.MathUtils.clamp(dist * 1.05, 140, 680);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, extent * 3.4);
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

    const reach = extent * 1.2;
    for (const chunk of this.buildingChunks) {
      const sphere = chunk.geometry.boundingSphere;
      if (!sphere) {
        chunk.castShadow = false;
        continue;
      }
      this.chunkCenter.copy(sphere.center);
      chunk.localToWorld(this.chunkCenter);
      const dx = this.chunkCenter.x - target.x;
      const dz = this.chunkCenter.z - target.z;
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
    const maxDist = Math.max(160, viewDist * 0.72);
    const maxRank = viewDist > 2800 ? 1 : viewDist > 900 ? 2 : 3;
    const maxCount = viewDist > 2200 ? 16 : viewDist > 900 ? 40 : 72;

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
    const candidates: Candidate[] = [];

    for (const label of this.labelObjects) {
      if (!this.labelKindOn(label.kind) || label.rank > maxRank) {
        label.el.style.display = "none";
        continue;
      }
      this.labelScratch.copy(label.local).applyMatrix4(this.mapScene.matrixWorld);
      const dx = this.labelScratch.x - this.controls.target.x;
      const dz = this.labelScratch.z - this.controls.target.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxDist) {
        label.el.style.display = "none";
        continue;
      }
      this.labelScratch.project(this.camera);
      if (this.labelScratch.z < -1 || this.labelScratch.z > 1) {
        label.el.style.display = "none";
        continue;
      }
      const x = (this.labelScratch.x * 0.5 + 0.5) * w + rect.left;
      const y = (-this.labelScratch.y * 0.5 + 0.5) * h + rect.top;
      if (x < -60 || x > w + 60 || y < -30 || y > h + 30) {
        label.el.style.display = "none";
        continue;
      }
      candidates.push({ label, x, y, dist });
    }

    candidates.sort((a, b) => a.label.rank - b.label.rank || a.dist - b.dist);
    this.placedLabels.length = 0;
    let shown = 0;
    for (const { label, x, y } of candidates) {
      const text = label.el.textContent ?? "";
      const lw = Math.max(36, text.length * 6.4);
      const lh = label.kind === "area" ? 16 : 13;
      const box = { x: x - lw * 0.5, y: y - lh, w: lw, h: lh };
      if (shown >= maxCount || boxesOverlap(box, this.placedLabels)) {
        label.el.style.display = "none";
        continue;
      }
      this.placedLabels.push(box);
      shown++;
      label.el.style.display = "block";
      label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }
}

function osmLocal(lat: number, lon: number) {
  const south = 50.76;
  const west = -1.17;
  const north = 50.835;
  const r = 6_371_000;
  const midLat = (south + north) / 2;
  const scaleX = (Math.PI / 180) * r * Math.cos((midLat * Math.PI) / 180);
  const scaleY = (Math.PI / 180) * r;
  return { x: (lon - west) * scaleX, y: (lat - north) * scaleY };
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
