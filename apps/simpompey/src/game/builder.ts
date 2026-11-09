import * as THREE from "three";

export const ZONE = {
  none: 0,
  residential: 1,
  commercial: 2,
  industrial: 3,
  defence: 4,
  park: 5,
  civic: 6,
  harbour: 7,
  utilities: 8,
  cultural: 9,
  sports: 10,
  education: 11,
  parking: 12,
  nature: 13,
  church: 14,
  health: 15,
  police: 16,
  fire: 17,
  coastguard: 18,
} as const;

export type ZoneId = (typeof ZONE)[keyof typeof ZONE];

export type BuilderTool =
  | "query"
  | "demolish"
  | "residential"
  | "commercial"
  | "industrial"
  | "defence"
  | "park"
  | "civic"
  | "harbour"
  | "utilities"
  | "cultural"
  | "sports"
  | "education"
  | "parking"
  | "nature"
  | "church"
  | "health"
  | "police"
  | "fire"
  | "coastguard"
  | "dezone";

function zoneMeta(name: string, color: number): { name: string; color: number; rgb: [number, number, number] } {
  return {
    name,
    color,
    rgb: [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255],
  };
}

export const ZONE_META: Record<ZoneId, { name: string; color: number; rgb: [number, number, number] }> = {
  [ZONE.none]: zoneMeta("Unzoned", 0x000000),
  [ZONE.residential]: zoneMeta("Residential", 0x2ee86a),
  [ZONE.commercial]: zoneMeta("Commercial", 0x3d9bff),
  [ZONE.industrial]: zoneMeta("Industrial", 0xffd000),
  [ZONE.defence]: zoneMeta("Defence", 0xc8e000),
  [ZONE.park]: zoneMeta("Park", 0x1ee87a),
  [ZONE.civic]: zoneMeta("Civic", 0x8ec8ff),
  [ZONE.harbour]: zoneMeta("Harbour", 0x00e0f0),
  [ZONE.utilities]: zoneMeta("Utilities", 0xff4ef0),
  [ZONE.cultural]: zoneMeta("Cultural", 0xc070ff),
  [ZONE.sports]: zoneMeta("Sport", 0xff6a14),
  [ZONE.education]: zoneMeta("Education", 0x22e0ff),
  [ZONE.parking]: zoneMeta("Parking", 0xa8b4ff),
  [ZONE.nature]: zoneMeta("Nature reserve", 0x00d45a),
  [ZONE.church]: zoneMeta("Churches", 0xffd400),
  [ZONE.health]: zoneMeta("Health", 0xff3d7a),
  [ZONE.police]: zoneMeta("Police", 0x4d6bff),
  [ZONE.fire]: zoneMeta("Fire", 0xff2a2a),
  [ZONE.coastguard]: zoneMeta("Coastguard", 0xff9a00),
};

const TOOL_ZONE: Partial<Record<BuilderTool, ZoneId>> = {
  residential: ZONE.residential,
  commercial: ZONE.commercial,
  industrial: ZONE.industrial,
  defence: ZONE.defence,
  park: ZONE.park,
  civic: ZONE.civic,
  harbour: ZONE.harbour,
  utilities: ZONE.utilities,
  cultural: ZONE.cultural,
  sports: ZONE.sports,
  education: ZONE.education,
  parking: ZONE.parking,
  nature: ZONE.nature,
  church: ZONE.church,
  health: ZONE.health,
  police: ZONE.police,
  fire: ZONE.fire,
  coastguard: ZONE.coastguard,
  dezone: ZONE.none,
};

type BuildingFacts = {
  name?: string;
  number?: string;
  housename?: string;
  street?: string;
  place?: string;
  suburb?: string;
  city?: string;
  postcode?: string;
  building?: string;
  amenity?: string;
  shop?: string;
  office?: string;
  leisure?: string;
  tourism?: string;
  craft?: string;
  healthcare?: string;
  historic?: string;
  brand?: string;
  operator?: string;
  levels?: string;
  height?: string;
  roof?: string;
};

type ZoneFile = {
  v: number;
  cell: number;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  zones: string;
  xy: string;
  off: string;
  kind: string;
  facts?: Array<BuildingFacts & { i: number }>;
};

type BuildingFoot = {
  pts: Array<{ x: number; z: number }>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  kind: ZoneId;
  gone: boolean;
  facts?: BuildingFacts;
};

function washRgb(rgb: [number, number, number], sat: number, lift = 0): [number, number, number] {
  const l = rgb[0] * 0.22 + rgb[1] * 0.55 + rgb[2] * 0.23;
  return [
    Math.min(1, Math.max(0, l + (rgb[0] - l) * sat + lift)),
    Math.min(1, Math.max(0, l + (rgb[1] - l) * sat + lift)),
    Math.min(1, Math.max(0, l + (rgb[2] - l) * sat + lift)),
  ];
}

function valueRamp(t: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 18, 48, 72],
    [0.28, 42, 128, 110],
    [0.55, 232, 196, 64],
    [1, 226, 74, 58],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      a = stops[i - 1];
      b = stops[i];
      break;
    }
  }
  const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
    Math.round(a[3] + (b[3] - a[3]) * u),
  ];
}

function formatHa(pounds: number): string {
  if (pounds >= 1_000_000) return `£${(pounds / 1_000_000).toFixed(1)}m / ha`;
  if (pounds >= 1000) return `£${Math.round(pounds / 1000)}k / ha`;
  return `£${Math.round(pounds)} / ha`;
}

function formatFlow(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k / day`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k / day`;
  return `${Math.round(n)} / day`;
}

function formatDensity(n: number): string {
  return `${Math.round(n).toLocaleString("en-GB")} /km²`;
}

function roadLabel(s: string): string {
  if (!s || s === "U" || s === "C") return "Minor road";
  return s;
}

function prettyTag(v: string): string {
  return v.replace(/_/g, " ");
}

function buildingFactLines(b: BuildingFoot): string[] {
  const f = b.facts;
  const lines: string[] = [];
  if (f?.name) lines.push(f.name);
  if (f?.housename && f.housename !== f.name) lines.push(f.housename);
  const street = [f?.number, f?.street].filter(Boolean).join(" ");
  if (street) lines.push(street);
  const place = [f?.place, f?.suburb].filter(Boolean).join(", ");
  if (place) lines.push(place);
  if (f?.city) lines.push(f.city);
  if (f?.postcode) lines.push(f.postcode);
  const bits: string[] = [];
  if (f?.building) bits.push(prettyTag(f.building));
  if (f?.amenity) bits.push(prettyTag(f.amenity));
  if (f?.shop) bits.push(prettyTag(f.shop));
  if (f?.office) bits.push(prettyTag(f.office));
  if (f?.leisure) bits.push(prettyTag(f.leisure));
  if (f?.tourism) bits.push(prettyTag(f.tourism));
  if (f?.craft) bits.push(prettyTag(f.craft));
  if (f?.healthcare) bits.push(prettyTag(f.healthcare));
  if (f?.historic) bits.push(prettyTag(f.historic));
  if (f?.brand) bits.push(f.brand);
  if (f?.operator) bits.push(f.operator);
  if (f?.levels) bits.push(/^\d+(\.\d+)?$/.test(f.levels) ? `${f.levels} storeys` : f.levels);
  if (f?.height) bits.push(/m$/i.test(f.height) ? f.height : `${f.height} m`);
  if (f?.roof) bits.push(`${prettyTag(f.roof)} roof`);
  if (bits.length) lines.push(bits.join(" · "));
  if (b.gone) lines.push("cleared plot");
  return lines;
}

type OverlayKind = "none" | "density" | "zones" | "value" | "traffic" | "crime" | "pollution" | "flood" | "imd" | "broadband" | "speeds" | "masts";

const OVERLAY_KINDS: OverlayKind[] = [
  "none",
  "density",
  "zones",
  "value",
  "traffic",
  "crime",
  "pollution",
  "flood",
  "imd",
  "broadband",
  "speeds",
  "masts",
];

function isOverlayKind(value: string | undefined): value is OverlayKind {
  return !!value && OVERLAY_KINDS.includes(value as OverlayKind);
}

type CrimeLayer = "all" | "violence" | "asb" | "burglary" | "drugs" | "theft";
type PollutionLayer = "no2" | "pm25" | "noise";
type FloodLayer = "all" | "sea" | "surface";
type ImdLayer = "all" | "income" | "health" | "living";
type BroadbandLayer = "gigabit" | "superfast" | "slow";
type SpeedsLayer = "down" | "up";
type MastSite = { x: number; z: number; name: string; kind: string; detail?: string };
type TrafficPoint = { road: string; x: number; z: number; flow: number; delay: number };
type CrimeStreet = { name: string; x: number; z: number; n: number; cats: Record<CrimeLayer, number> };
type PollutionRoad = { road: string; x: number; z: number; no2: number };

const CRIME_LAYERS: CrimeLayer[] = ["all", "violence", "asb", "burglary", "drugs", "theft"];
const CRIME_LABEL: Record<CrimeLayer, string> = {
  all: "All crime",
  violence: "violence",
  asb: "ASB",
  burglary: "burglary",
  drugs: "drugs",
  theft: "theft",
};
const FLOOD_NAME = ["", "Low", "Medium", "High"];
const FLOOD_CHANCE = ["", "1 in 1,000", "1 in 100", "1 in 30"];
const IMD_LAYERS: ImdLayer[] = ["all", "income", "health", "living"];
const IMD_LABEL: Record<ImdLayer, string> = {
  all: "IMD",
  income: "income",
  health: "health",
  living: "living",
};
const HEAT_OVERLAY: OverlayKind[] = ["density", "value", "traffic", "crime", "pollution", "flood", "imd", "broadband", "speeds", "masts"];
const BROADBAND_LAYERS: BroadbandLayer[] = ["gigabit", "superfast", "slow"];

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function b64Bytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pointInPoly(x: number, z: number, pts: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const zi = pts[i].z;
    const zj = pts[j].z;
    const xi = pts[i].x;
    const xj = pts[j].x;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  if (len < 1e-8) return Math.hypot(x - ax, z - az);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function inFoot(x: number, z: number, b: BuildingFoot, pad = 0): boolean {
  if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) return false;
  if (pointInPoly(x, z, b.pts)) return true;
  if (pad <= 0) return false;
  for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) {
    if (distToSeg(x, z, b.pts[j].x, b.pts[j].z, b.pts[i].x, b.pts[i].z) <= pad) return true;
  }
  return false;
}

export class CityBuilder {
  active = false;
  tool: BuilderTool = "query";
  overlay: OverlayKind = "none";
  crimeLayer: CrimeLayer = "all";
  pollutionLayer: PollutionLayer = "no2";
  floodLayer: FloodLayer = "all";
  imdLayer: ImdLayer = "all";
  broadbandLayer: BroadbandLayer = "gigabit";
  speedsLayer: SpeedsLayer = "down";
  brush = 1;
  private mapScene: THREE.Object3D;
  private terrain: THREE.Mesh;
  private chunks: THREE.Mesh[];
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private cell = 16;
  private originX = 0;
  private originZ = 0;
  private cols = 0;
  private rows = 0;
  private grid: Uint8Array = new Uint8Array(0);
  private occupy: Uint8Array = new Uint8Array(0);
  private buildings: BuildingFoot[] = [];
  private bins = new Map<number, number[]>();
  private binSize = 32;
  private zoneTex: THREE.DataTexture | null = null;
  private zonePix: Uint8Array = new Uint8Array(0);
  private zoneMix = { value: 0 };
  private zoneWash = { value: 0.7 };
  private overlaySheet: THREE.Mesh | null = null;
  private valueIndex: Uint8Array = new Uint8Array(0);
  private valueRates: number[] = [];
  private trafficFlow: Uint8Array = new Uint8Array(0);
  private trafficDelay: Uint8Array = new Uint8Array(0);
  private trafficPoints: TrafficPoint[] = [];
  private flowLo = 0;
  private flowHi = 1;
  private delayLo = 0;
  private delayHi = 1;
  private crimeLayers: Record<CrimeLayer, Uint8Array> = {
    all: new Uint8Array(0),
    violence: new Uint8Array(0),
    asb: new Uint8Array(0),
    burglary: new Uint8Array(0),
    drugs: new Uint8Array(0),
    theft: new Uint8Array(0),
  };
  private crimeStreets: CrimeStreet[] = [];
  private crimeMonths = "";
  private pollutionNo2: Uint8Array = new Uint8Array(0);
  private pollutionPm25: Uint8Array = new Uint8Array(0);
  private pollutionNoise: Uint8Array = new Uint8Array(0);
  private pollutionRoads: PollutionRoad[] = [];
  private no2Lo = 0;
  private no2Hi = 1;
  private pm25Lo = 0;
  private pm25Hi = 1;
  private noiseLo = 0;
  private noiseHi = 1;
  private floodSea: Uint8Array = new Uint8Array(0);
  private floodSurface: Uint8Array = new Uint8Array(0);
  private imdLayers: Record<ImdLayer, Uint8Array> = {
    all: new Uint8Array(0),
    income: new Uint8Array(0),
    health: new Uint8Array(0),
    living: new Uint8Array(0),
  };
  private imdIndex: Uint16Array = new Uint16Array(0);
  private imdAreas: Array<{ name: string; rank: Record<ImdLayer, number>; decile: Record<ImdLayer, number> }> = [];
  private imdEngland = 0;
  private densityHeat: Uint8Array = new Uint8Array(0);
  private densityIndex: Uint16Array = new Uint16Array(0);
  private densityAreas: Array<{ name: string; density: number }> = [];
  private densityLo = 0;
  private densityHi = 1;
  private broadbandLayers: Record<BroadbandLayer, Uint8Array> = {
    gigabit: new Uint8Array(0),
    superfast: new Uint8Array(0),
    slow: new Uint8Array(0),
  };
  private speedsDown: Uint8Array = new Uint8Array(0);
  private speedsUp: Uint8Array = new Uint8Array(0);
  private downLo = 0;
  private downHi = 1;
  private upLo = 0;
  private upHi = 1;
  private mastDensity: Uint8Array = new Uint8Array(0);
  private mastSites: MastSite[] = [];
  private cursor: THREE.Line;
  private cursorGeo: THREE.BufferGeometry;
  private outlines: THREE.LineSegments | null = null;
  private pickOutlineGeo: THREE.BufferGeometry;
  private pickOutline: THREE.Line;
  private pickRay = new THREE.Raycaster();
  private pickNdc = new THREE.Vector2();
  private pickHit = new THREE.Vector3();
  private localHit = new THREE.Vector3();
  private localDir = new THREE.Vector3();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private painting = false;
  private lastCol = -1;
  private lastRow = -1;
  private infoEl = document.getElementById("planner-info");
  onChange: (() => void) | null = null;

  constructor(
    mapScene: THREE.Object3D,
    terrain: THREE.Mesh,
    chunks: THREE.Mesh[],
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.mapScene = mapScene;
    this.terrain = terrain;
    this.chunks = chunks;
    this.camera = camera;
    this.canvas = canvas;
    this.cursorGeo = new THREE.BufferGeometry();
    this.cursor = new THREE.Line(
      this.cursorGeo,
      new THREE.LineBasicMaterial({ color: 0xf0a23a, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.cursor.renderOrder = 8;
    this.cursor.frustumCulled = false;
    this.cursor.visible = false;
    mapScene.add(this.cursor);
    this.pickOutlineGeo = new THREE.BufferGeometry();
    this.pickOutline = new THREE.Line(
      this.pickOutlineGeo,
      new THREE.LineBasicMaterial({ color: 0xf0a23a, depthTest: false, transparent: true, opacity: 1 }),
    );
    this.pickOutline.renderOrder = 9;
    this.pickOutline.frustumCulled = false;
    this.pickOutline.visible = false;
    mapScene.add(this.pickOutline);
  }

  async load() {
      const raw = (await fetch("./portsmouth-zones.json?v=9").then((r) => {
      if (!r.ok) throw new Error(`zones ${r.status}`);
      return r.json();
    })) as ZoneFile;
    this.cell = raw.cell;
    this.originX = raw.originX;
    this.originZ = raw.originZ;
    this.cols = raw.cols;
    this.rows = raw.rows;
    this.grid = b64Bytes(raw.zones);
    this.readBuildings(raw);
    this.markPlots();
    this.makeOutlines();
    await this.loadLandValue();
    await this.loadTraffic();
    await this.loadCrime();
    await this.loadPollution();
    await this.loadFlood();
    await this.loadImd();
    await this.loadPopulation();
    await this.loadBroadband();
    await this.loadSpeeds();
    await this.loadMasts();
    this.makeOverlay();
    this.bindHud();
  }

  private async loadLandValue() {
    try {
      const raw = (await fetch("./portsmouth-land-value.json?v=6").then((r) => {
        if (!r.ok) throw new Error(`land-value ${r.status}`);
        return r.json();
      })) as { value: string; rates?: number[] };
      this.valueIndex = b64Bytes(raw.value);
      this.valueRates = raw.rates ?? [];
    } catch (err) {
      console.warn("Land value failed to load:", err);
    }
  }

  private async loadTraffic() {
    try {
      const raw = (await fetch("./portsmouth-traffic.json?v=4").then((r) => {
        if (!r.ok) throw new Error(`traffic ${r.status}`);
        return r.json();
      })) as {
        flow: string;
        delay: string;
        flowLo?: number;
        flowHi?: number;
        delayLo?: number;
        delayHi?: number;
        points?: TrafficPoint[];
      };
      this.trafficFlow = b64Bytes(raw.flow);
      this.trafficDelay = b64Bytes(raw.delay);
      this.flowLo = raw.flowLo ?? 0;
      this.flowHi = raw.flowHi ?? 1;
      this.delayLo = raw.delayLo ?? 0;
      this.delayHi = raw.delayHi ?? 1;
      this.trafficPoints = raw.points ?? [];
    } catch (err) {
      console.warn("Traffic failed to load:", err);
    }
  }

  private async loadCrime() {
    try {
      const raw = (await fetch("./portsmouth-crime.json?v=1").then((r) => {
        if (!r.ok) throw new Error(`crime ${r.status}`);
        return r.json();
      })) as {
        layers?: Record<string, string>;
        streets?: CrimeStreet[];
        from?: string;
        to?: string;
      };
      for (const layer of CRIME_LAYERS) {
        const packed = raw.layers?.[layer];
        this.crimeLayers[layer] = packed ? b64Bytes(packed) : new Uint8Array(0);
      }
      this.crimeStreets = raw.streets ?? [];
      this.crimeMonths = raw.from && raw.to ? `${raw.from}–${raw.to}` : "";
    } catch (err) {
      console.warn("Crime failed to load:", err);
    }
  }

  private async loadPollution() {
    try {
      const raw = (await fetch("./portsmouth-pollution.json?v=3").then((r) => {
        if (!r.ok) throw new Error(`pollution ${r.status}`);
        return r.json();
      })) as {
        no2?: string;
        pm25?: string;
        noise?: string;
        no2Lo?: number;
        no2Hi?: number;
        pm25Lo?: number;
        pm25Hi?: number;
        noiseLo?: number;
        noiseHi?: number;
        roads?: PollutionRoad[];
      };
      this.pollutionNo2 = raw.no2 ? b64Bytes(raw.no2) : new Uint8Array(0);
      this.pollutionPm25 = raw.pm25 ? b64Bytes(raw.pm25) : new Uint8Array(0);
      this.pollutionNoise = raw.noise ? b64Bytes(raw.noise) : new Uint8Array(0);
      this.no2Lo = raw.no2Lo ?? 0;
      this.no2Hi = raw.no2Hi ?? 1;
      this.pm25Lo = raw.pm25Lo ?? 0;
      this.pm25Hi = raw.pm25Hi ?? 1;
      this.noiseLo = raw.noiseLo ?? 0;
      this.noiseHi = raw.noiseHi ?? 1;
      this.pollutionRoads = raw.roads ?? [];
    } catch (err) {
      console.warn("Pollution failed to load:", err);
    }
  }

  private async loadFlood() {
    try {
      const raw = (await fetch("./portsmouth-flood.json?v=2").then((r) => {
        if (!r.ok) throw new Error(`flood ${r.status}`);
        return r.json();
      })) as { sea?: string; surface?: string };
      this.floodSea = raw.sea ? b64Bytes(raw.sea) : new Uint8Array(0);
      this.floodSurface = raw.surface ? b64Bytes(raw.surface) : new Uint8Array(0);
    } catch (err) {
      console.warn("Flood failed to load:", err);
    }
  }

  private async loadImd() {
    try {
      const raw = (await fetch("./portsmouth-deprivation.json?v=2").then((r) => {
        if (!r.ok) throw new Error(`imd ${r.status}`);
        return r.json();
      })) as {
        layers?: Record<string, string>;
        index?: string;
        areas?: Array<{ name: string; rank: Record<ImdLayer, number>; decile: Record<ImdLayer, number> }>;
        england?: number;
      };
      for (const layer of IMD_LAYERS) {
        const packed = raw.layers?.[layer];
        this.imdLayers[layer] = packed ? b64Bytes(packed) : new Uint8Array(0);
      }
      if (raw.index) {
        const bytes = b64Bytes(raw.index);
        this.imdIndex = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      }
      this.imdAreas = raw.areas ?? [];
      this.imdEngland = raw.england ?? 0;
    } catch (err) {
      console.warn("Deprivation failed to load:", err);
    }
  }

  private async loadPopulation() {
    try {
      const raw = (await fetch("./portsmouth-population.json?v=1").then((r) => {
        if (!r.ok) throw new Error(`population ${r.status}`);
        return r.json();
      })) as {
        density?: string;
        index?: string;
        areas?: Array<{ name: string; density: number }>;
        densityLo?: number;
        densityHi?: number;
      };
      this.densityHeat = raw.density ? b64Bytes(raw.density) : new Uint8Array(0);
      if (raw.index) {
        const bytes = b64Bytes(raw.index);
        this.densityIndex = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      }
      this.densityAreas = raw.areas ?? [];
      this.densityLo = raw.densityLo ?? 0;
      this.densityHi = raw.densityHi ?? 1;
    } catch (err) {
      console.warn("Population density failed to load:", err);
    }
  }

  private async loadBroadband() {
    try {
      const raw = (await fetch("./portsmouth-broadband.json?v=2").then((r) => {
        if (!r.ok) throw new Error(`broadband ${r.status}`);
        return r.json();
      })) as { layers?: Record<string, string> };
      for (const layer of BROADBAND_LAYERS) {
        const packed = raw.layers?.[layer];
        this.broadbandLayers[layer] = packed ? b64Bytes(packed) : new Uint8Array(0);
      }
    } catch (err) {
      console.warn("Broadband failed to load:", err);
    }
  }

  private async loadSpeeds() {
    try {
      const raw = (await fetch("./portsmouth-speeds.json?v=2").then((r) => {
        if (!r.ok) throw new Error(`speeds ${r.status}`);
        return r.json();
      })) as { down?: string; up?: string; downLo?: number; downHi?: number; upLo?: number; upHi?: number };
      this.speedsDown = raw.down ? b64Bytes(raw.down) : new Uint8Array(0);
      this.speedsUp = raw.up ? b64Bytes(raw.up) : new Uint8Array(0);
      this.downLo = raw.downLo ?? 0;
      this.downHi = raw.downHi ?? 1;
      this.upLo = raw.upLo ?? 0;
      this.upHi = raw.upHi ?? 1;
    } catch (err) {
      console.warn("Speeds failed to load:", err);
    }
  }

  private async loadMasts() {
    try {
      const raw = (await fetch("./portsmouth-masts.json?v=3").then((r) => {
        if (!r.ok) throw new Error(`masts ${r.status}`);
        return r.json();
      })) as { density?: string; sites?: MastSite[] };
      this.mastDensity = raw.density ? b64Bytes(raw.density) : new Uint8Array(0);
      this.mastSites = raw.sites ?? [];
    } catch (err) {
      console.warn("Masts failed to load:", err);
    }
  }

  setActive(on: boolean) {
    this.active = on;
    document.body.classList.toggle("is-planning", on);
    this.cursor.visible = on;
    if (!on) this.painting = false;
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setTool(tool: BuilderTool) {
    this.tool = tool;
    if (tool !== "query" && tool !== "demolish") this.overlay = "zones";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setOverlay(overlay: OverlayKind) {
    this.overlay = overlay;
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setCrimeLayer(layer: CrimeLayer) {
    this.crimeLayer = layer;
    this.overlay = "crime";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setPollutionLayer(layer: PollutionLayer) {
    this.pollutionLayer = layer;
    this.overlay = "pollution";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setFloodLayer(layer: FloodLayer) {
    this.floodLayer = layer;
    this.overlay = "flood";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setImdLayer(layer: ImdLayer) {
    this.imdLayer = layer;
    this.overlay = "imd";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setBroadbandLayer(layer: BroadbandLayer) {
    this.broadbandLayer = layer;
    this.overlay = "broadband";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setSpeedsLayer(layer: SpeedsLayer) {
    this.speedsLayer = layer;
    this.overlay = "speeds";
    this.tool = "query";
    this.refreshOverlay();
    this.syncHud();
    this.onChange?.();
  }

  setBrush(n: number) {
    this.brush = Math.max(1, Math.min(8, Math.round(n)));
    this.syncHud();
    this.onChange?.();
  }

  ownsLeftClick() {
    return this.active && this.tool !== "query";
  }

  pointer(e: PointerEvent, phase: "down" | "move" | "up" | "hover") {
    if (!this.active) return;
    const hit = this.hitLocal(e);
    if (!hit) {
      this.cursor.visible = false;
      this.pickOutline.visible = false;
      if (this.infoEl && phase === "hover") this.infoEl.textContent = "Off the island";
      return;
    }
    this.drawCursor(hit.x, hit.z);
    if (phase === "hover" || (phase === "move" && !this.painting)) this.describe(hit.x, hit.z);
    if (phase === "down" && this.tool !== "query") {
      this.painting = true;
      this.lastCol = -1;
      this.apply(hit.x, hit.z);
    } else if (phase === "move" && this.painting) {
      this.apply(hit.x, hit.z);
    } else if (phase === "up") {
      this.painting = false;
    }
  }

  private readBuildings(raw: ZoneFile) {
    const xy = new Int16Array(b64Bytes(raw.xy).buffer);
    const off = new Uint32Array(b64Bytes(raw.off).buffer);
    const kind = b64Bytes(raw.kind);
    const facts = new Map<number, BuildingFacts>();
    for (const fact of raw.facts ?? []) facts.set(fact.i, fact);
    const n = kind.length;
    this.buildings = [];
    this.bins.clear();
    for (let i = 0; i < n; i++) {
      const a = off[i];
      const b = off[i + 1];
      const pts: Array<{ x: number; z: number }> = [];
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      let sx = 0, sz = 0;
      for (let k = a; k < b; k++) {
        const x = xy[k * 2];
        const z = xy[k * 2 + 1];
        pts.push({ x, z });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        sx += x;
        sz += z;
      }
      if (pts.length < 3) continue;
      const foot: BuildingFoot = {
        pts,
        minX,
        maxX,
        minZ,
        maxZ,
        cx: sx / pts.length,
        cz: sz / pts.length,
        kind: kind[i] as ZoneId,
        gone: false,
        facts: facts.get(i),
      };
      const idx = this.buildings.length;
      this.buildings.push(foot);
      const x0 = Math.floor(minX / this.binSize);
      const x1 = Math.floor(maxX / this.binSize);
      const z0 = Math.floor(minZ / this.binSize);
      const z1 = Math.floor(maxZ / this.binSize);
      for (let bx = x0; bx <= x1; bx++) {
        for (let bz = z0; bz <= z1; bz++) {
          const key = ((bx + 32768) << 16) | (bz + 32768);
          const list = this.bins.get(key);
          if (list) list.push(idx);
          else this.bins.set(key, [idx]);
        }
      }
    }
  }

  private markPlots() {
    const { cols, rows, cell, originX, originZ } = this;
    this.occupy = new Uint8Array(cols * rows);
    const pad = cell * 0.2;
    for (const b of this.buildings) {
      const c0 = Math.max(0, Math.floor((b.minX - pad - originX) / cell));
      const c1 = Math.min(cols - 1, Math.floor((b.maxX + pad - originX) / cell));
      const r0 = Math.max(0, Math.floor((b.minZ - pad - originZ) / cell));
      const r1 = Math.min(rows - 1, Math.floor((b.maxZ + pad - originZ) / cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = originX + (c + 0.5) * cell;
          const z = originZ + (r + 0.5) * cell;
          if (inFoot(x, z, b, pad)) this.occupy[r * cols + c] = 1;
        }
      }
    }
  }

  private makeOverlay() {
    const pix = new Uint8Array(this.cols * this.rows * 4);
    for (let i = 0; i < this.grid.length; i++) this.writePix(pix, i, this.grid[i] as ZoneId);
    this.zonePix = pix;
    const tex = new THREE.DataTexture(pix, this.cols, this.rows, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.zoneTex = tex;

    const pos = this.terrain.geometry.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    const spanX = this.cols * this.cell;
    const spanZ = this.rows * this.cell;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uvs[i * 2] = (x - this.originX) / spanX;
      uvs[i * 2 + 1] = (z - this.originZ) / spanZ;
    }
    this.terrain.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    const mat = this.terrain.material as THREE.MeshLambertMaterial;
    mat.map = tex;
    mat.color.setHex(0x7e7b73);
    const mix = this.zoneMix;
    const wash = this.zoneWash;
    mat.customProgramCacheKey = () => "simpompey-zones-ground-2";
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.zoneMix = mix;
      shader.uniforms.zoneWash = wash;
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        "uniform float zoneMix;\nuniform float zoneWash;\nvoid main() {",
      );
      const tint = `
          #ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            float overlayA = sampledDiffuseColor.a * zoneMix;
            vec3 ground = diffuseColor.rgb;
            float lum = dot(ground, vec3(0.22, 0.55, 0.23));
            vec3 tinted = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * (0.22 + 1.2 * lum), zoneWash);
            diffuseColor.rgb = mix(ground, tinted, overlayA);
          #endif
      `;
      if (shader.fragmentShader.includes("#include <map_fragment>")) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", tint);
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          "diffuseColor *= sampledDiffuseColor;",
          `
            float overlayA = sampledDiffuseColor.a * zoneMix;
            vec3 ground = diffuseColor.rgb;
            float lum = dot(ground, vec3(0.22, 0.55, 0.23));
            vec3 tinted = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * (0.22 + 1.2 * lum), zoneWash);
            diffuseColor.rgb = mix(ground, tinted, overlayA);
          `,
        );
      }
    };
    mat.needsUpdate = true;
    this.makeOverlaySheet(tex, spanX, spanZ);
    this.refreshOverlay();
  }

  private makeOverlaySheet(tex: THREE.DataTexture, spanX: number, spanZ: number) {
    this.overlaySheet?.removeFromParent();
    (this.overlaySheet?.material as THREE.Material | undefined)?.dispose();
    this.overlaySheet?.geometry.dispose();
    const y = 0.45;
    const geo = new THREE.BufferGeometry();
    const { originX, originZ } = this;
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          originX, y, originZ,
          originX + spanX, y, originZ,
          originX, y, originZ + spanZ,
          originX + spanX, y, originZ + spanZ,
        ],
        3,
      ),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });
    const sheet = new THREE.Mesh(geo, mat);
    sheet.name = "overlay-sheet";
    sheet.renderOrder = 3;
    sheet.frustumCulled = false;
    sheet.visible = false;
    this.mapScene.add(sheet);
    this.overlaySheet = sheet;
  }

  private focusZone(): ZoneId | null {
    const zone = TOOL_ZONE[this.tool];
    if (zone === undefined || zone === ZONE.none) return null;
    return zone;
  }

  private refreshOverlay() {
    if (this.zonePix.length === 0) return;
    for (let i = 0; i < this.grid.length; i++) this.writePix(this.zonePix, i, this.grid[i] as ZoneId);
    if (this.zoneTex) this.zoneTex.needsUpdate = true;
    const focus = this.focusZone();
    const heat = HEAT_OVERLAY.includes(this.overlay);
    const show = this.overlay !== "none";
    // Terrain carries colour on land; the full-bbox sheet covers harbour / Solent
    // gaps the heightfield does not. Isle of Wight sits south of the sheet.
    this.zoneMix.value = show ? 1 : 0;
    this.zoneWash.value = heat ? 0.28 : focus !== null ? 0.18 : 0.4;
    if (this.overlaySheet) this.overlaySheet.visible = show;
    const showOutlines = show;
    if (this.outlines) this.outlines.visible = showOutlines;
    if (!showOutlines) this.pickOutline.visible = false;
  }

  private makeOutlines() {
    const y = 1.15;
    const pos: number[] = [];
    for (const b of this.buildings) {
      const n = b.pts.length;
      if (n < 2) continue;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        pos.push(b.pts[j].x, y, b.pts[j].z, b.pts[i].x, y, b.pts[i].z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.outlines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x3a4450,
        transparent: true,
        opacity: 0.34,
        depthTest: true,
        depthWrite: false,
      }),
    );
    this.outlines.renderOrder = 7;
    this.outlines.frustumCulled = false;
    this.outlines.visible = false;
    this.mapScene.add(this.outlines);
  }

  private markBuilding(b: BuildingFoot | null) {
    if (!b || b.gone || !this.outlines?.visible) {
      this.pickOutline.visible = false;
      return;
    }
    const y = 1.4;
    const pos: number[] = [];
    for (const p of b.pts) pos.push(p.x, y, p.z);
    const first = b.pts[0];
    pos.push(first.x, y, first.z);
    this.pickOutlineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.pickOutline.visible = true;
  }

  private writePix(pix: Uint8Array, i: number, zone: ZoneId) {
    const o = i * 4;
    if (this.overlay === "value") {
      this.writeValuePix(pix, i, zone);
      return;
    }
    if (this.overlay === "traffic") {
      this.writeTrafficPix(pix, i);
      return;
    }
    if (this.overlay === "crime") {
      this.writeCrimePix(pix, i);
      return;
    }
    if (this.overlay === "pollution") {
      this.writePollutionPix(pix, i);
      return;
    }
    if (this.overlay === "flood") {
      this.writeFloodPix(pix, i);
      return;
    }
    if (this.overlay === "density") {
      this.writeHeatPix(pix, i, this.densityHeat[i] ?? 0);
      return;
    }
    if (this.overlay === "imd") {
      this.writeImdPix(pix, i);
      return;
    }
    if (this.overlay === "broadband") {
      this.writeHeatPix(pix, i, this.broadbandLayers[this.broadbandLayer][i] ?? 0);
      return;
    }
    if (this.overlay === "speeds") {
      this.writeHeatPix(pix, i, (this.speedsLayer === "up" ? this.speedsUp : this.speedsDown)[i] ?? 0);
      return;
    }
    if (this.overlay === "masts") {
      this.writeHeatPix(pix, i, this.mastDensity[i] ?? 0);
      return;
    }
    if (zone === ZONE.none) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const plot = this.occupy[i] === 1;
    const focus = this.overlay === "zones" ? this.focusZone() : null;
    const selected = focus !== null && zone === focus;
    const other = focus !== null && zone !== focus;
    const rgb = washRgb(
      ZONE_META[zone].rgb,
      selected ? (plot ? 1.05 : 1.45) : other ? (plot ? 0.4 : 0.7) : plot ? 0.7 : 1.15,
      plot ? 0.04 : 0,
    );
    const alpha = selected ? (plot ? 190 : 255) : other ? (plot ? 28 : 52) : plot ? 110 : 210;
    pix[o] = Math.round(rgb[0] * 255);
    pix[o + 1] = Math.round(rgb[1] * 255);
    pix[o + 2] = Math.round(rgb[2] * 255);
    pix[o + 3] = alpha;
  }

  private floodHeat(i: number): number {
    const sea = this.floodSea[i] ?? 0;
    const surface = this.floodSurface[i] ?? 0;
    if (this.floodLayer === "sea") return sea;
    if (this.floodLayer === "surface") return surface;
    return Math.max(sea, surface);
  }

  private writeFloodPix(pix: Uint8Array, i: number) {
    const o = i * 4;
    const heat = this.floodHeat(i);
    if (!heat) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const rgb = valueRamp(heat / 255);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = 230;
  }

  private writeImdPix(pix: Uint8Array, i: number) {
    this.writeHeatPix(pix, i, this.imdLayers[this.imdLayer][i] ?? 0);
  }

  private writeHeatPix(pix: Uint8Array, i: number, heat: number) {
    const o = i * 4;
    if (!heat) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const rgb = valueRamp(heat / 255);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = 230;
  }

  private pollutionHeat(i: number): number {
    if (this.pollutionLayer === "pm25") return this.pollutionPm25[i] ?? 0;
    if (this.pollutionLayer === "noise") return this.pollutionNoise[i] ?? 0;
    return this.pollutionNo2[i] ?? 0;
  }

  private writePollutionPix(pix: Uint8Array, i: number) {
    const o = i * 4;
    const heat = this.pollutionHeat(i);
    if (!heat) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const rgb = valueRamp(heat / 255);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = 230;
  }

  private writeCrimePix(pix: Uint8Array, i: number) {
    const o = i * 4;
    const heat = this.crimeLayers[this.crimeLayer][i] ?? 0;
    if (!heat) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const rgb = valueRamp(heat / 255);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = 240;
  }

  private writeTrafficPix(pix: Uint8Array, i: number) {
    const o = i * 4;
    const flow = this.trafficFlow[i] ?? 0;
    const delay = this.trafficDelay[i] ?? 0;
    if (!flow && !delay) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const tFlow = flow / 255;
    const tDelay = delay / 255;
    const t = delay ? 0.38 * tFlow + 0.62 * tDelay : tFlow * 0.72;
    const rgb = valueRamp(t);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = 240;
  }

  private writeValuePix(pix: Uint8Array, i: number, zone: ZoneId) {
    const o = i * 4;
    const idx = this.valueIndex[i] ?? 0;
    if (!idx && zone === ZONE.none) {
      pix[o] = 0;
      pix[o + 1] = 0;
      pix[o + 2] = 0;
      pix[o + 3] = 0;
      return;
    }
    const t = idx / 255;
    const rgb = valueRamp(t);
    pix[o] = rgb[0];
    pix[o + 1] = rgb[1];
    pix[o + 2] = rgb[2];
    pix[o + 3] = zone === ZONE.none ? 150 : 230;
  }

  private hitLocal(e: PointerEvent): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pickNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pickRay.setFromCamera(this.pickNdc, this.camera);
    const hits = this.pickRay.intersectObject(this.terrain, false);
    if (hits[0]) this.pickHit.copy(hits[0].point);
    else if (!this.pickRay.ray.intersectPlane(this.groundPlane, this.pickHit)) return null;
    this.localHit.copy(this.pickHit);
    this.mapScene.worldToLocal(this.localHit);
    if (this.tool === "demolish") {
      const along = this.buildingAlongView();
      if (along) return { x: along.cx, z: along.cz };
    }
    return { x: this.localHit.x, z: this.localHit.z };
  }

  private buildingAlongView(): BuildingFoot | null {
    this.localDir.copy(this.pickRay.ray.origin);
    this.mapScene.worldToLocal(this.localDir);
    const far = this.pickHit.clone();
    this.mapScene.worldToLocal(far);
    far.sub(this.localDir);
    const span = far.length();
    if (span < 0.5) return this.buildingAt(this.localHit.x, this.localHit.z);
    far.multiplyScalar(1 / span);
    const maxT = Math.min(span, 140);
    for (let t = 3; t < maxT; t += 2.2) {
      const x = this.localDir.x + far.x * t;
      const y = this.localDir.y + far.y * t;
      const z = this.localDir.z + far.z * t;
      if (y < -1) break;
      const b = this.buildingAt(x, z);
      if (b && !b.gone && y < 70) return b;
    }
    return this.buildingAt(this.localHit.x, this.localHit.z);
  }

  private cellOf(x: number, z: number) {
    const col = Math.floor((x - this.originX) / this.cell);
    const row = Math.floor((z - this.originZ) / this.cell);
    return { col, row };
  }

  private apply(x: number, z: number) {
    const { col, row } = this.cellOf(x, z);
    if (col === this.lastCol && row === this.lastRow) return;
    this.lastCol = col;
    this.lastRow = row;
    if (this.tool === "demolish") this.demolishAt(x, z);
    else {
      const zone = TOOL_ZONE[this.tool];
      if (zone === undefined) return;
      this.paintAt(col, row, zone);
    }
    this.describe(x, z);
  }

  private paintAt(col: number, row: number, zone: ZoneId) {
    const r = this.brush - 1;
    let dirty = false;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (dc * dc + dr * dr > r * r + r) continue;
        const c = col + dc;
        const rw = row + dr;
        if (c < 0 || rw < 0 || c >= this.cols || rw >= this.rows) continue;
        const i = rw * this.cols + c;
        if (this.grid[i] === zone) continue;
        this.grid[i] = zone;
        this.writePix(this.zonePix, i, zone);
        dirty = true;
      }
    }
    if (dirty && this.zoneTex) this.zoneTex.needsUpdate = true;
  }

  private demolishAt(x: number, z: number) {
    const radius = this.brush <= 1 ? this.cell * 0.35 : this.brush * this.cell * 0.55;
    const hits: number[] = [];
    const seen = new Set<number>();
    const x0 = Math.floor((x - radius) / this.binSize);
    const x1 = Math.floor((x + radius) / this.binSize);
    const z0 = Math.floor((z - radius) / this.binSize);
    const z1 = Math.floor((z + radius) / this.binSize);
    let direct = -1;
    for (let bx = x0; bx <= x1; bx++) {
      for (let bz = z0; bz <= z1; bz++) {
        const list = this.bins.get(((bx + 32768) << 16) | (bz + 32768));
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = this.buildings[i];
          if (b.gone) continue;
          if (inFoot(x, z, b, 0.6)) {
            direct = i;
            hits.push(i);
            continue;
          }
          if (this.brush > 1 && Math.hypot(b.cx - x, b.cz - z) <= radius) hits.push(i);
        }
      }
    }
    const list = this.brush <= 1 && direct >= 0 ? [direct] : hits;
    if (list.length === 0) return;
    for (const i of list) {
      const b = this.buildings[i];
      if (b.gone) continue;
      b.gone = true;
      this.stripBuilding(b);
    }
  }

  private stripBuilding(b: BuildingFoot) {
    const pad = 0.7;
    for (const chunk of this.chunks) {
      const sphere = chunk.geometry.boundingSphere;
      if (sphere) {
        this.pickHit.copy(sphere.center);
        chunk.localToWorld(this.pickHit);
        this.mapScene.worldToLocal(this.pickHit);
        const reach = sphere.radius + 8;
        if (
          this.pickHit.x < b.minX - reach ||
          this.pickHit.x > b.maxX + reach ||
          this.pickHit.z < b.minZ - reach ||
          this.pickHit.z > b.maxZ + reach
        ) {
          continue;
        }
      }
      this.stripChunk(chunk, b, pad);
    }
  }

  private stripChunk(mesh: THREE.Mesh, b: BuildingFoot, pad: number) {
    const geom = mesh.geometry;
    const pos = geom.attributes.position;
    const nrm = geom.attributes.normal;
    const col = geom.attributes.color;
    const idx = geom.index;
    if (!idx) return;
    const keep: number[] = [];
    const minX = b.minX - pad;
    const maxX = b.maxX + pad;
    const minZ = b.minZ - pad;
    const maxZ = b.maxZ + pad;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const c = idx.getX(i + 1);
      const d = idx.getX(i + 2);
      const x = (pos.getX(a) + pos.getX(c) + pos.getX(d)) / 3;
      const z = (pos.getZ(a) + pos.getZ(c) + pos.getZ(d)) / 3;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && inFoot(x, z, b, pad)) continue;
      keep.push(a, c, d);
    }
    if (keep.length === idx.count) return;
    if (keep.length === 0) {
      mesh.visible = false;
      geom.setDrawRange(0, 0);
      return;
    }
    const remap = new Map<number, number>();
    const newPos: number[] = [];
    const newNrm: number[] = [];
    const newCol: number[] = [];
    const newIdx = new Uint32Array(keep.length);
    let next = 0;
    for (let i = 0; i < keep.length; i++) {
      const old = keep[i];
      let ni = remap.get(old);
      if (ni === undefined) {
        ni = next++;
        remap.set(old, ni);
        newPos.push(pos.getX(old), pos.getY(old), pos.getZ(old));
        newNrm.push(nrm.getX(old), nrm.getY(old), nrm.getZ(old));
        if (col) newCol.push(col.getX(old), col.getY(old), col.getZ(old));
      }
      newIdx[i] = ni;
    }
    if (geom.boundsTree) geom.disposeBoundsTree();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(newNrm, 3));
    if (col && newCol.length) geom.setAttribute("color", new THREE.Float32BufferAttribute(newCol, 3));
    geom.setIndex(new THREE.Uint32BufferAttribute(newIdx, 1));
    geom.computeBoundingSphere();
    geom.computeBoundsTree();
  }

  private drawCursor(x: number, z: number) {
    const { col, row } = this.cellOf(x, z);
    const r = this.brush - 1;
    const x0 = this.originX + (col - r) * this.cell;
    const z0 = this.originZ + (row - r) * this.cell;
    const x1 = this.originX + (col + r + 1) * this.cell;
    const z1 = this.originZ + (row + r + 1) * this.cell;
    const y = 1.4;
    this.cursorGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, x0, y, z0], 3),
    );
    this.cursor.visible = true;
    const mat = this.cursor.material as THREE.LineBasicMaterial;
    const focus = this.focusZone();
    mat.color.setHex(
      this.tool === "demolish" ? 0xe24a3a
      : HEAT_OVERLAY.includes(this.overlay) ? 0xf0a23a
      : focus !== null ? ZONE_META[focus].color
      : 0xf0a23a,
    );
  }

  private describe(x: number, z: number) {
    if (!this.infoEl) return;
    const { col, row } = this.cellOf(x, z);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      this.pickOutline.visible = false;
      this.infoEl.textContent = "Off the map";
      return;
    }
    const i = row * this.cols + col;
    const zone = this.grid[i] as ZoneId;
    const building = this.buildingAt(x, z);
    this.markBuilding(building);
    const lines: string[] = [];
    if (building) lines.push(...buildingFactLines(building));
    let overlay: string | null = null;
    if (this.overlay === "traffic") overlay = this.trafficAt(x, z, i) ?? "No traffic count";
    else if (this.overlay === "crime") overlay = this.crimeAt(x, z, i) ?? "No crime logged";
    else if (this.overlay === "pollution") overlay = this.pollutionAt(x, z, i) ?? "No reading";
    else if (this.overlay === "flood") overlay = this.floodAt(i) ?? "Dry";
    else if (this.overlay === "density") overlay = this.densityAt(i) ?? "No density data";
    else if (this.overlay === "imd") overlay = this.imdAt(i) ?? "No IMD";
    else if (this.overlay === "broadband") overlay = this.broadbandAt(i) ?? "No coverage data";
    else if (this.overlay === "speeds") overlay = this.speedsAt(i) ?? "No speed reading";
    else if (this.overlay === "masts") overlay = this.mastAt(x, z, i) ?? "No radio site nearby";
    else {
      const bits = [ZONE_META[zone].name];
      if (building && !building.gone && !building.facts) bits.push("building");
      const worth = this.landValueAt(i, zone);
      if (worth !== null) bits.push(formatHa(worth));
      overlay = bits.join(" · ");
    }
    if (overlay) lines.push(overlay);
    this.infoEl.textContent = lines.filter(Boolean).join("\n") || "Off the map";
  }

  private trafficAt(x: number, z: number, i: number): string | null {
    let best: TrafficPoint | null = null;
    let bestD = 110;
    for (const p of this.trafficPoints) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      const bits = [roadLabel(best.road), formatFlow(best.flow)];
      if (best.delay > 0) bits.push(`${Math.round(best.delay)}s delay/mi`);
      return bits.join(" · ");
    }
    const flowIdx = this.trafficFlow[i] ?? 0;
    const delayIdx = this.trafficDelay[i] ?? 0;
    if (!flowIdx && !delayIdx) return null;
    const bits: string[] = [];
    if (flowIdx) {
      const logv = this.flowLo + (flowIdx / 255) * (this.flowHi - this.flowLo);
      bits.push(formatFlow(Math.exp(logv)));
    }
    if (delayIdx) {
      const delay = this.delayLo + (delayIdx / 255) * (this.delayHi - this.delayLo);
      bits.push(`${Math.round(delay)}s delay/mi`);
    }
    return bits.join(" · ");
  }

  private crimeAt(x: number, z: number, i: number): string | null {
    let best: CrimeStreet | null = null;
    let bestD = 90;
    for (const p of this.crimeStreets) {
      const n = this.crimeLayer === "all" ? p.n : p.cats[this.crimeLayer];
      if (!n) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      const n = this.crimeLayer === "all" ? best.n : best.cats[this.crimeLayer];
      const bits = [best.name, `${n} in 12 months`];
      if (this.crimeLayer === "all") {
        let top: CrimeLayer = "violence";
        let topN = 0;
        for (const layer of CRIME_LAYERS) {
          if (layer === "all") continue;
          if (best.cats[layer] > topN) {
            topN = best.cats[layer];
            top = layer;
          }
        }
        if (topN > 0) bits.push(`mostly ${CRIME_LABEL[top]}`);
      } else {
        bits.push(CRIME_LABEL[this.crimeLayer]);
      }
      return bits.join(" · ");
    }
    const heat = this.crimeLayers[this.crimeLayer][i] ?? 0;
    if (!heat) return null;
    return this.crimeLayer === "all" ? "Crime nearby" : CRIME_LABEL[this.crimeLayer];
  }

  private pollutionAt(x: number, z: number, i: number): string | null {
    const heat = this.pollutionHeat(i);
    if (this.pollutionLayer === "noise") {
      if (!heat) return null;
      const db = this.noiseLo + (heat / 255) * (this.noiseHi - this.noiseLo);
      return `${db.toFixed(0)} dB Lden`;
    }
    if (this.pollutionLayer === "no2") {
      let best: PollutionRoad | null = null;
      let bestD = 90;
      for (const p of this.pollutionRoads) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) return `${roadLabel(best.road)} · ${best.no2.toFixed(1)} µg/m³ NO₂`;
      if (!heat) return null;
      const ug = this.no2Lo + (heat / 255) * (this.no2Hi - this.no2Lo);
      return `${ug.toFixed(1)} µg/m³ NO₂`;
    }
    if (!heat) return null;
    const ug = this.pm25Lo + (heat / 255) * (this.pm25Hi - this.pm25Lo);
    return `${ug.toFixed(1)} µg/m³ PM₂.₅`;
  }

  private floodLine(heat: number, source: string): string | null {
    const band = Math.round((heat / 255) * 3);
    if (!band) return null;
    return `${FLOOD_NAME[band]} · ${FLOOD_CHANCE[band]} · ${source}`;
  }

  private floodAt(i: number): string | null {
    if (this.floodLayer === "sea") return this.floodLine(this.floodSea[i] ?? 0, "sea");
    if (this.floodLayer === "surface") return this.floodLine(this.floodSurface[i] ?? 0, "surface");
    const bits = [this.floodLine(this.floodSea[i] ?? 0, "sea"), this.floodLine(this.floodSurface[i] ?? 0, "surface")].filter(Boolean);
    return bits.length ? bits.join(" · ") : null;
  }

  private densityAt(i: number): string | null {
    const idx = this.densityIndex[i] ?? 0;
    if (idx) {
      const area = this.densityAreas[idx - 1];
      if (area) {
        const bits = [formatDensity(area.density)];
        if (area.name) bits.unshift(area.name);
        return bits.join(" · ");
      }
    }
    const heat = this.densityHeat[i] ?? 0;
    if (!heat) return null;
    const logLo = Math.log(Math.max(1, this.densityLo));
    const logHi = Math.log(Math.max(logLo + 1e-6, this.densityHi));
    const t = heat / 255;
    return formatDensity(Math.exp(logLo + t * (logHi - logLo)));
  }

  private imdAt(i: number): string | null {
    const idx = this.imdIndex[i] ?? 0;
    if (!idx) return null;
    const area = this.imdAreas[idx - 1];
    if (!area) return null;
    const rank = area.rank[this.imdLayer];
    const decile = area.decile[this.imdLayer];
    const bits = [area.name];
    if (this.imdLayer !== "all") bits.push(IMD_LABEL[this.imdLayer]);
    if (decile) bits.push(`${ordinal(decile)} most deprived 10%`);
    if (rank) {
      const of = this.imdEngland ? ` of ${this.imdEngland.toLocaleString("en-GB")}` : "";
      bits.push(`rank ${rank.toLocaleString("en-GB")}${of}`);
    }
    return bits.join(" · ");
  }

  private unpackPct(v: number): number | null {
    if (!v) return null;
    return (v - 1) / 2.54;
  }

  private broadbandAt(i: number): string | null {
    const gig = this.unpackPct(this.broadbandLayers.gigabit[i] ?? 0);
    const sfbb = this.unpackPct(this.broadbandLayers.superfast[i] ?? 0);
    const slow = this.unpackPct(this.broadbandLayers.slow[i] ?? 0);
    if (gig === null && sfbb === null && slow === null) return null;
    if (this.broadbandLayer === "gigabit") return gig === null ? null : `Gigabit ${gig.toFixed(0)}% of premises`;
    if (this.broadbandLayer === "superfast") return sfbb === null ? null : `Superfast ${sfbb.toFixed(0)}% of premises`;
    if (slow === null) return null;
    return slow < 0.5 ? "Can order 30 Mbps" : `${slow.toFixed(0)}% can't get 30 Mbps`;
  }

  private speedsAt(i: number): string | null {
    const downIdx = this.speedsDown[i] ?? 0;
    const upIdx = this.speedsUp[i] ?? 0;
    if (!downIdx && !upIdx) return null;
    const bits: string[] = [];
    if (downIdx) {
      const mbps = Math.exp(this.downLo + (downIdx / 255) * (this.downHi - this.downLo));
      bits.push(`${mbps.toFixed(0)} Mbps down`);
    }
    if (upIdx) {
      const mbps = Math.exp(this.upLo + (upIdx / 255) * (this.upHi - this.upLo));
      bits.push(`${mbps.toFixed(0)} Mbps up`);
    }
    bits.push("median 2023");
    return bits.join(" · ");
  }

  private mastAt(x: number, z: number, i: number): string | null {
    let best: MastSite | null = null;
    let bestD = 220;
    for (const site of this.mastSites) {
      const d = Math.hypot(site.x - x, site.z - z);
      if (d < bestD) {
        bestD = d;
        best = site;
      }
    }
    if (best) {
      const kind = best.kind === "osm" ? "OSM mast" : best.kind === "cell" ? "cell (approx)" : "licensed";
      return [best.name, best.detail, kind, `${Math.round(bestD)} m`].filter(Boolean).join(" · ");
    }
    if (!(this.mastDensity[i] ?? 0)) return null;
    return "Radio sites nearby";
  }

  private landValueAt(i: number, zone: ZoneId): number | null {
    const rate = this.valueRates[zone] ?? 0;
    const idx = this.valueIndex[i] ?? 0;
    if (!rate || !idx) return null;
    return rate * (0.45 + 1.2 * (idx / 255));
  }

  private buildingAt(x: number, z: number): BuildingFoot | null {
    const list = this.bins.get(((Math.floor(x / this.binSize) + 32768) << 16) | (Math.floor(z / this.binSize) + 32768));
    if (!list) return null;
    for (const i of list) {
      const b = this.buildings[i];
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (pointInPoly(x, z, b.pts)) return b;
    }
    return null;
  }

  private bindHud() {
    const bar = document.getElementById("planner");
    if (!bar) return;
    bar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement | null)?.closest("[data-tool], [data-brush], [data-view], [data-crime], [data-pollution], [data-flood], [data-imd], [data-broadband], [data-speeds]") as HTMLElement | null;
      if (!btn) return;
      if (isOverlayKind(btn.dataset.view)) {
        this.setOverlay(btn.dataset.view === this.overlay ? "none" : btn.dataset.view);
      }
      if (btn.dataset.crime) this.setCrimeLayer(btn.dataset.crime as CrimeLayer);
      if (btn.dataset.pollution) this.setPollutionLayer(btn.dataset.pollution as PollutionLayer);
      if (btn.dataset.flood) this.setFloodLayer(btn.dataset.flood as FloodLayer);
      if (btn.dataset.imd) this.setImdLayer(btn.dataset.imd as ImdLayer);
      if (btn.dataset.broadband) this.setBroadbandLayer(btn.dataset.broadband as BroadbandLayer);
      if (btn.dataset.speeds) this.setSpeedsLayer(btn.dataset.speeds as SpeedsLayer);
      if (btn.dataset.tool) this.setTool(btn.dataset.tool as BuilderTool);
      if (btn.dataset.brush) this.setBrush(Number(btn.dataset.brush));
    });
    this.syncHud();
  }

  private syncHud() {
    const bar = document.getElementById("planner");
    if (bar) {
      for (const btn of bar.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
        btn.classList.toggle("is-on", this.overlay === "zones" && btn.dataset.tool === this.tool);
      }
      for (const btn of bar.querySelectorAll<HTMLButtonElement>("[data-view]")) {
        btn.classList.toggle("is-on", btn.dataset.view === this.overlay);
      }
      for (const btn of bar.querySelectorAll<HTMLButtonElement>("[data-brush]")) {
        btn.classList.toggle("is-on", Number(btn.dataset.brush) === this.brush);
      }
      const legend = document.getElementById("value-legend");
      const host = bar.querySelector(`[data-view="${this.overlay}"]`)?.closest(".planner__layer");
      if (legend) {
        legend.hidden = !HEAT_OVERLAY.includes(this.overlay);
        if (host && !legend.hidden) host.append(legend);
        const lo = legend.querySelector("[data-legend-lo]");
        const hi = legend.querySelector("[data-legend-hi]");
        if (lo) {
          lo.textContent =
            this.overlay === "traffic" || this.overlay === "crime" || (this.overlay === "pollution" && this.pollutionLayer === "noise") ? "Quiet"
            : this.overlay === "pollution" ? "Clean"
            :             this.overlay === "flood" ? "Dry"
            : this.overlay === "density" ? "Sparse"
            : this.overlay === "imd" ? "Least"
            : this.overlay === "broadband" && this.broadbandLayer === "slow" ? "Can get 30"
            : this.overlay === "broadband" ? "None"
            : this.overlay === "speeds" ? "Slow"
            : this.overlay === "masts" ? "Sparse"
            : "Low";
        }
        if (hi) {
          hi.textContent =
            this.overlay === "traffic" ? "Busy"
            : this.overlay === "crime" ? "Hot"
            : this.overlay === "pollution" && this.pollutionLayer === "noise" ? "Loud"
            : this.overlay === "pollution" ? "Dirty"
            : this.overlay === "density" ? "Packed"
            : this.overlay === "imd" ? "Most"
            : this.overlay === "broadband" && this.broadbandLayer === "slow" ? "Notspot"
            : this.overlay === "broadband" ? "All premises"
            : this.overlay === "speeds" ? "Fast"
            : this.overlay === "masts" ? "Busy"
            : "High";
        }
      }
      const zoneTools = document.getElementById("zone-tools");
      if (zoneTools) zoneTools.hidden = this.overlay !== "zones";
      const crimeTools = document.getElementById("crime-tools");
      if (crimeTools) {
        crimeTools.hidden = this.overlay !== "crime";
        for (const btn of crimeTools.querySelectorAll<HTMLButtonElement>("[data-crime]")) {
          btn.classList.toggle("is-on", btn.dataset.crime === this.crimeLayer);
        }
      }
      const pollutionTools = document.getElementById("pollution-tools");
      if (pollutionTools) {
        pollutionTools.hidden = this.overlay !== "pollution";
        for (const btn of pollutionTools.querySelectorAll<HTMLButtonElement>("[data-pollution]")) {
          btn.classList.toggle("is-on", btn.dataset.pollution === this.pollutionLayer);
        }
      }
      const floodTools = document.getElementById("flood-tools");
      if (floodTools) {
        floodTools.hidden = this.overlay !== "flood";
        for (const btn of floodTools.querySelectorAll<HTMLButtonElement>("[data-flood]")) {
          btn.classList.toggle("is-on", btn.dataset.flood === this.floodLayer);
        }
      }
      const imdTools = document.getElementById("imd-tools");
      if (imdTools) {
        imdTools.hidden = this.overlay !== "imd";
        for (const btn of imdTools.querySelectorAll<HTMLButtonElement>("[data-imd]")) {
          btn.classList.toggle("is-on", btn.dataset.imd === this.imdLayer);
        }
      }
      const broadbandTools = document.getElementById("broadband-tools");
      if (broadbandTools) {
        broadbandTools.hidden = this.overlay !== "broadband";
        for (const btn of broadbandTools.querySelectorAll<HTMLButtonElement>("[data-broadband]")) {
          btn.classList.toggle("is-on", btn.dataset.broadband === this.broadbandLayer);
        }
      }
      const speedsTools = document.getElementById("speeds-tools");
      if (speedsTools) {
        speedsTools.hidden = this.overlay !== "speeds";
        for (const btn of speedsTools.querySelectorAll<HTMLButtonElement>("[data-speeds]")) {
          btn.classList.toggle("is-on", btn.dataset.speeds === this.speedsLayer);
        }
      }
      if (host && this.infoEl) host.append(this.infoEl);
    }
    if (this.infoEl && this.tool === "query") {
      if (this.overlay === "value") this.infoEl.textContent = "Hover a plot for £/ha";
      else if (this.overlay === "traffic") this.infoEl.textContent = "Hover a road for traffic";
      else if (this.overlay === "crime") this.infoEl.textContent = this.crimeMonths ? `Hover a street · ${this.crimeMonths}` : "Hover a street for crime";
      else if (this.overlay === "pollution") this.infoEl.textContent = this.pollutionLayer === "noise" ? "Hover for dB Lden" : "Hover for µg/m³";
      else if (this.overlay === "flood") this.infoEl.textContent = "Hover for flood likelihood";
      else if (this.overlay === "density") this.infoEl.textContent = "Hover an area for people per km²";
      else if (this.overlay === "imd") this.infoEl.textContent = "Hover an area for IMD 2025";
      else if (this.overlay === "broadband") this.infoEl.textContent = "Hover for Ofcom coverage";
      else if (this.overlay === "speeds") this.infoEl.textContent = "Hover for median speed (2023)";
      else if (this.overlay === "masts") this.infoEl.textContent = "Hover for radio sites";
      else if (this.overlay === "zones") this.infoEl.textContent = "Hover a plot for land use";
      else this.infoEl.textContent = "No overlay on the map";
    }
    const knock = document.getElementById("demolish-toggle");
    if (knock) {
      const on = this.active && this.tool === "demolish";
      knock.classList.toggle("is-on", on);
      knock.setAttribute("aria-pressed", String(on));
    }
  }
}
