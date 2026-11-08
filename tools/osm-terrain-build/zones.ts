import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SOUTH, WEST, NORTH, EAST, localM, inBox } from "./bbox.ts";

const DATA_DIR = "./data";
const OSM_PATH = `${DATA_DIR}/portsmouth.osm`;
const OS_BUILDINGS = `${DATA_DIR}/portsmouth-os-buildings.json`;
const OUT = `${DATA_DIR}/portsmouth-zones.json`;
const GAME_MODELS = path.resolve("../../apps/simpompey/public/models");
const GAME_PUBLIC = path.resolve("../../apps/simpompey/public");

const CELL = 16;
const ZONE = {
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

type Pt = { x: number; y: number };
type Fill = { pts: Pt[]; zone: number };
type Building = { pts: Pt[]; zone: number; tags?: Record<string, string> };

const FACT_KEYS: Array<[string, string]> = [
  ["name", "name"],
  ["addr:housenumber", "number"],
  ["addr:housename", "housename"],
  ["addr:street", "street"],
  ["addr:place", "place"],
  ["addr:suburb", "suburb"],
  ["addr:city", "city"],
  ["addr:postcode", "postcode"],
  ["amenity", "amenity"],
  ["shop", "shop"],
  ["office", "office"],
  ["leisure", "leisure"],
  ["tourism", "tourism"],
  ["craft", "craft"],
  ["healthcare", "healthcare"],
  ["historic", "historic"],
  ["brand", "brand"],
  ["operator", "operator"],
  ["building:levels", "levels"],
  ["height", "height"],
  ["roof:shape", "roof"],
];

function buildingFacts(tags: Record<string, string> | undefined): Record<string, string> | null {
  if (!tags) return null;
  const out: Record<string, string> = {};
  const building = tags.building?.trim();
  if (building && building !== "yes" && building !== "no") out.building = building;
  for (const [key, as] of FACT_KEYS) {
    const v = tags[key]?.trim();
    if (v && v !== "yes" && v !== "no") out[as] = v;
  }
  return Object.keys(out).length ? out : null;
}


function uniqueRing(nodes: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === n[0] && prev[1] === n[1]) continue;
    out.push(n);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function pointInPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y;
    const yj = pts[j].y;
    const xi = pts[i].x;
    const xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function ringBox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function isGiantBuilding(pts: Pt[]): boolean {
  const b = ringBox(pts);
  return (b.maxX - b.minX) * (b.maxY - b.minY) > 40_000;
}

function isWaterPoly(tags: Record<string, string>): boolean {
  if (tags.natural === "coastline") return false;
  if (tags.natural === "water") return true;
  if (tags.landuse === "reservoir" || tags.landuse === "basin") return true;
  if (tags.waterway === "riverbank" || tags.waterway === "dock") return true;
  const water = tags.water;
  if (water === "harbour" || water === "bay" || water === "strait" || water === "sea" || water === "ocean") return true;
  return Boolean(water && water !== "no");
}

function amenityOf(tags: Record<string, string>): string {
  return (tags.amenity ?? "").split(";")[0];
}

function isCultural(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const building = tags.building;
  if (
    amenity === "theatre" ||
    amenity === "cinema" ||
    amenity === "arts_centre" ||
    amenity === "concert_hall" ||
    amenity === "music_venue" ||
    amenity === "planetarium"
  ) {
    return true;
  }
  if (tourism === "museum" || tourism === "gallery" || tourism === "aquarium") return true;
  if (leisure === "bandstand") return true;
  if (building === "theatre" || building === "cinema" || building === "museum") return true;
  return false;
}

function isSport(tags: Record<string, string>): boolean {
  const leisure = tags.leisure;
  const amenity = amenityOf(tags);
  const club = tags.club;
  const landuse = tags.landuse;
  const building = tags.building;
  if (leisure === "marina") return false;
  if (landuse === "recreation_ground") return true;
  if (
    leisure === "pitch" ||
    leisure === "track" ||
    leisure === "sports_centre" ||
    leisure === "sports_hall" ||
    leisure === "stadium" ||
    leisure === "swimming_pool" ||
    leisure === "golf_course" ||
    leisure === "miniature_golf" ||
    leisure === "ice_rink" ||
    leisure === "bowling_alley" ||
    leisure === "bowling_green" ||
    leisure === "fitness_centre" ||
    leisure === "fitness_station" ||
    leisure === "horse_riding" ||
    leisure === "skatepark" ||
    leisure === "water_park" ||
    leisure === "recreation_ground" ||
    leisure === "playground" ||
    leisure === "disc_golf" ||
    leisure === "dog_park" ||
    leisure === "raceway"
  ) {
    return true;
  }
  if (amenity === "swimming_pool") return true;
  if (
    club === "sport" ||
    club === "sailing" ||
    club === "yacht" ||
    club === "football" ||
    club === "rugby" ||
    club === "cricket" ||
    club === "rowing" ||
    club === "hockey"
  ) {
    return true;
  }
  if (building === "stadium" || building === "sports_hall" || building === "sports_centre" || building === "grandstand") {
    return true;
  }
  return false;
}

function isEducation(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const landuse = tags.landuse;
  const building = tags.building;
  if (landuse === "education") return true;
  if (
    amenity === "school" ||
    amenity === "college" ||
    amenity === "university" ||
    amenity === "kindergarten" ||
    amenity === "preschool" ||
    amenity === "language_school" ||
    amenity === "music_school" ||
    amenity === "research_institute"
  ) {
    return true;
  }
  if (building === "school" || building === "university" || building === "college" || building === "kindergarten") {
    return true;
  }
  return false;
}

function isNature(tags: Record<string, string>): boolean {
  const leisure = tags.leisure;
  const boundary = tags.boundary;
  const designation = (tags.designation ?? "").toLowerCase();
  if (leisure === "nature_reserve") return true;
  if (boundary === "national_park") return true;
  if (boundary === "protected_area") {
    const cls = Number(tags.protect_class);
    if (cls >= 1 && cls <= 6) return true;
    if (
      /nature.?reserve|sssi|ramsar|nnr|lnr|special protection|special area of conservation/.test(designation) ||
      /nature.?reserve|sssi|ramsar/i.test(tags.protection_title ?? "")
    ) {
      return true;
    }
  }
  if (/local nature reserve|national nature reserve|site of special scientific interest/.test(designation)) {
    return true;
  }
  return false;
}

function isChurch(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const building = tags.building;
  const landuse = tags.landuse;
  if (amenity === "place_of_worship") return true;
  if (landuse === "religious") return true;
  if (/^(church|cathedral|chapel|mosque|synagogue|temple)$/.test(building ?? "")) return true;
  return false;
}

function isHealth(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const building = tags.building;
  const healthcare = (tags.healthcare ?? "").split(";")[0];
  if (
    amenity === "hospital" ||
    amenity === "clinic" ||
    amenity === "doctors" ||
    amenity === "dentist" ||
    amenity === "healthcare" ||
    amenity === "nursing_home"
  ) {
    return true;
  }
  if (amenity === "social_facility" && /nursing|care|assisted/.test(tags.social_facility ?? "")) return true;
  if (healthcare && healthcare !== "no" && healthcare !== "pharmacy") return true;
  if (building === "hospital" || building === "clinic") return true;
  if (tags.emergency === "ambulance_station") return true;
  return false;
}

function isPolice(tags: Record<string, string>): boolean {
  if (amenityOf(tags) === "police") return true;
  if (tags.building === "police") return true;
  if (tags.police && tags.police !== "no") return true;
  return false;
}

function isFire(tags: Record<string, string>): boolean {
  if (amenityOf(tags) === "fire_station") return true;
  if (tags.building === "fire_station") return true;
  if (tags.emergency === "fire_station") return true;
  return false;
}

function isCoastguard(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const emergency = tags.emergency ?? "";
  const military = tags.military ?? "";
  if (amenity === "coast_guard" || amenity === "lifeboat_station") return true;
  if (emergency === "coast_guard" || emergency === "lifeboat_station" || emergency === "rescue_station") return true;
  if (military === "coast_guard") return true;
  if (tags["seamark:type"] === "rescue_station") return true;
  const blob = `${tags.name ?? ""} ${tags.operator ?? ""} ${tags.brand ?? ""}`.toLowerCase();
  if (/hm\s*coastguard|coast\s*guard/.test(blob)) return true;
  if ((amenity || emergency || tags.building) && /rnli|lifeboat station/.test(blob)) return true;
  return false;
}

function isParking(tags: Record<string, string>): boolean {
  const amenity = amenityOf(tags);
  const landuse = tags.landuse;
  const building = tags.building;
  if (amenity === "parking" || amenity === "motorcycle_parking" || amenity === "parking_space") return true;
  if (landuse === "garages") return true;
  if (building === "parking" || building === "carport" || building === "garages") return true;
  return false;
}

function isUtility(tags: Record<string, string>): boolean {
  const landuse = tags.landuse;
  const amenity = amenityOf(tags);
  const man = tags["man_made"];
  const power = tags.power;
  if (landuse === "landfill") return true;
  if (amenity === "waste_transfer_station" || amenity === "recycling") return true;
  if (
    man === "wastewater_plant" ||
    man === "water_works" ||
    man === "water_tower" ||
    man === "pumping_station" ||
    man === "gasometer"
  ) {
    return true;
  }
  if (power === "plant" || power === "substation" || power === "station") return true;
  if (tags.utility && tags.utility !== "no") return true;
  return false;
}

function areaZone(tags: Record<string, string>): number | null {
  if (tags.building && tags.building !== "no") return null;
  const landuse = tags.landuse;
  const leisure = tags.leisure;
  const amenity = amenityOf(tags);
  const military = tags.military;
  if (isUtility(tags)) return ZONE.utilities;
  if (isCoastguard(tags)) return ZONE.coastguard;
  if (landuse === "military" || (military && military !== "no" && military !== "coast_guard")) return ZONE.defence;
  if (
    landuse === "harbour" ||
    landuse === "port" ||
    tags.harbour && tags.harbour !== "no" ||
    tags.leisure === "marina" ||
    tags.industrial === "port" ||
    tags.industrial === "shipyard"
  ) {
    return ZONE.harbour;
  }
  if (isChurch(tags)) return ZONE.church;
  if (isHealth(tags)) return ZONE.health;
  if (isPolice(tags)) return ZONE.police;
  if (isFire(tags)) return ZONE.fire;
  if (isCultural(tags)) return ZONE.cultural;
  if (isEducation(tags)) return ZONE.education;
  if (isParking(tags)) return ZONE.parking;
  if (isNature(tags)) return ZONE.nature;
  if (isSport(tags)) return ZONE.sports;
  if (
    landuse === "institutional" ||
    amenity === "library" ||
    amenity === "townhall" ||
    amenity === "community_centre" ||
    amenity === "courthouse" ||
    amenity === "public_building"
  ) {
    return ZONE.civic;
  }
  if (
    landuse === "grass" ||
    landuse === "cemetery" ||
    landuse === "forest" ||
    landuse === "meadow" ||
    landuse === "village_green" ||
    landuse === "allotments" ||
    landuse === "orchard" ||
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "common" ||
    leisure === "cemetery"
  ) {
    return ZONE.park;
  }
  if (landuse === "industrial" || landuse === "brownfield" || landuse === "depot" || landuse === "construction") {
    return ZONE.industrial;
  }
  if (landuse === "commercial" || landuse === "retail" || landuse === "office" || tags.shop) return ZONE.commercial;
  if (landuse === "residential") return ZONE.residential;
  return null;
}

function buildingZone(type: string | undefined, area: number, tags?: Record<string, string>): number {
  if (tags && isCoastguard(tags)) return ZONE.coastguard;
  if (tags && isChurch(tags)) return ZONE.church;
  if (tags && isHealth(tags)) return ZONE.health;
  if (tags && isPolice(tags)) return ZONE.police;
  if (tags && isFire(tags)) return ZONE.fire;
  if (tags && isUtility(tags)) return ZONE.utilities;
  if (tags && isCultural(tags)) return ZONE.cultural;
  if (tags && isEducation(tags)) return ZONE.education;
  if (tags && isParking(tags)) return ZONE.parking;
  if (tags && isNature(tags)) return ZONE.nature;
  if (tags && isSport(tags)) return ZONE.sports;
  if (tags && tags.military && tags.military !== "no" && tags.military !== "coast_guard") return ZONE.defence;
  const t = (type ?? "").toLowerCase();
  if (/^(transformer_tower|service)$/.test(t)) return ZONE.utilities;
  if (/^(industrial|warehouse|hangar|manufacture|factory|shed)$/.test(t)) return ZONE.industrial;
  if (/^(retail|commercial|shop|supermarket|office|hotel|kiosk)$/.test(t)) return ZONE.commercial;
  if (/^(church|cathedral|chapel|mosque|synagogue|temple)$/.test(t)) return ZONE.church;
  if (/^(hospital|clinic)$/.test(t)) return ZONE.health;
  if (t === "fire_station") return ZONE.fire;
  if (t === "police") return ZONE.police;
  if (/^(public|civic|train_station|transportation)$/.test(t)) return ZONE.civic;
  if (/military|bunker|barracks/.test(t)) return ZONE.defence;
  if (/^(theatre|cinema|museum)$/.test(t)) return ZONE.cultural;
  if (/^(school|university|college|kindergarten)$/.test(t)) return ZONE.education;
  if (/^(parking|carport|garages)$/.test(t)) return ZONE.parking;
  if (/^(stadium|sports_hall|sports_centre|grandstand)$/.test(t)) return ZONE.sports;
  if (/^(apartments|apartment|dormitory|terrace|house|detached|semidetached_house|semidetached|bungalow|residential|static_caravan|cabin)$/.test(t)) {
    return ZONE.residential;
  }
  if (area > 1800) return ZONE.industrial;
  if (area > 700) return ZONE.commercial;
  return ZONE.residential;
}

function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return Math.abs(a) * 0.5;
}

function simplify(pts: Pt[], maxPts = 16): Pt[] {
  if (pts.length <= maxPts) return pts;
  const step = pts.length / maxPts;
  const out: Pt[] = [];
  for (let i = 0; i < maxPts; i++) out.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]);
  return out;
}

function stitchPolylines(parts: Pt[][]): Pt[][] {
  const chains = parts.filter((p) => p.length >= 2).map((p) => p.slice());
  const rings: Pt[][] = [];
  const joinTol = 1.2;
  while (chains.length) {
    const ring = chains.pop()!;
    for (let guard = 0; guard < 400; guard++) {
      const start = ring[0];
      const end = ring[ring.length - 1];
      if (Math.hypot(start.x - end.x, start.y - end.y) < joinTol && ring.length >= 4) break;
      let found = -1;
      let rev = false;
      let atStart = false;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        const cs = c[0];
        const ce = c[c.length - 1];
        if (Math.hypot(end.x - cs.x, end.y - cs.y) < joinTol) {
          found = i;
          break;
        }
        if (Math.hypot(end.x - ce.x, end.y - ce.y) < joinTol) {
          found = i;
          rev = true;
          break;
        }
        if (Math.hypot(start.x - ce.x, start.y - ce.y) < joinTol) {
          found = i;
          atStart = true;
          break;
        }
        if (Math.hypot(start.x - cs.x, start.y - cs.y) < joinTol) {
          found = i;
          rev = true;
          atStart = true;
          break;
        }
      }
      if (found < 0) break;
      const add = chains.splice(found, 1)[0];
      if (rev) add.reverse();
      if (atStart) ring.unshift(...add.slice(0, -1));
      else ring.push(...add.slice(1));
    }
    const closed: Pt[] = [];
    for (const p of ring) {
      const prev = closed[closed.length - 1];
      if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.15) continue;
      closed.push(p);
    }
    if (closed.length > 1) {
      const a = closed[0];
      const b = closed[closed.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1.2) closed.pop();
    }
    if (closed.length >= 3) rings.push(closed);
  }
  return rings;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function unpackCoast(flat: number[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
  return pts;
}

function landCells(cols: number, rows: number, originX: number, originZ: number): Uint8Array {
  const mask = new Uint8Array(cols * rows);
  const coastPath = `${DATA_DIR}/portsmouth-coast.json`;
  if (!existsSync(coastPath)) return mask;
  const coast = JSON.parse(readFileSync(coastPath, "utf8")) as { coasts?: number[][] };
  const rings = (coast.coasts ?? []).map(unpackCoast).filter((r) => r.length >= 16);
  for (const ring of rings) {
    const simple = ring.filter((_, i) => i % 8 === 0 || i === ring.length - 1);
    if (simple.length >= 12) fillPoly(mask, cols, rows, originX, originZ, simple, 1, true);
  }
  return mask;
}

function fillPoly(grid: Uint8Array, cols: number, rows: number, originX: number, originZ: number, pts: Pt[], zone: number, overwrite: boolean) {
  const b = ringBox(pts);
  const c0 = Math.max(0, Math.floor((b.minX - originX) / CELL));
  const c1 = Math.min(cols - 1, Math.floor((b.maxX - originX) / CELL));
  const r0 = Math.max(0, Math.floor((b.minY - originZ) / CELL));
  const r1 = Math.min(rows - 1, Math.floor((b.maxY - originZ) / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = originX + (c + 0.5) * CELL;
      const z = originZ + (r + 0.5) * CELL;
      if (!pointInPoly(x, z, pts)) continue;
      const i = r * cols + c;
      if (overwrite || grid[i] === ZONE.none) grid[i] = zone;
    }
  }
}

type Rel = { zone: number | "water"; members: { ref: number; role: string; pts: Pt[] }[] };

function main() {
  const buf = readFileSync(OSM_PATH, "utf8");
  console.log(`XML size: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  const originX = 0;
  const originZ = localM(SOUTH, WEST).y;
  const width = localM(SOUTH, EAST).x - originX;
  const height = localM(NORTH, WEST).y - originZ;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const grid = new Uint8Array(cols * rows);
  console.log(`  grid ${cols}×${rows} @ ${CELL}m (${(grid.length / 1024).toFixed(0)} KB)`);

  const nodeMap = new Map<number, [number, number]>();
  const nodeRe = /<node\s+id="(\d+)"\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(buf)) !== null) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (inBox(lat, lon)) {
      nodeMap.set(Number(m[1]), [lat, lon]);
    }
  }
  console.log(`  nodes in bbox: ${nodeMap.size}`);

  const pendingRels: Rel[] = [];
  const relNeedWays = new Set<number>();
  const relStartRe = /<relation\s+id="(\d+)"[^>]*>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relStartRe.exec(buf)) !== null) {
    const relStart = relMatch.index;
    const relEnd = buf.indexOf("</relation>", relStart);
    if (relEnd === -1) continue;
    const relStr = buf.slice(relStart, relEnd + 11);
    const tags = parseTags(relStr);
    const water = isWaterPoly(tags);
    const zone = water ? ("water" as const) : areaZone(tags);
    if (zone === null) continue;
    const members: Rel["members"] = [];
    const memberRe = /<member\s+type="(\w+)"\s+ref="(\d+)"\s+role="([^"]*)"/g;
    let mem: RegExpExecArray | null;
    while ((mem = memberRe.exec(relStr)) !== null) {
      if (mem[1] !== "way") continue;
      const ref = Number(mem[2]);
      members.push({ ref, role: mem[3], pts: [] });
      relNeedWays.add(ref);
    }
    if (members.length) pendingRels.push({ zone, members });
  }

  const fills: Fill[][] = Array.from({ length: 18 }, () => []);
  const water: Pt[][] = [];
  const buildings: Building[] = [];
  const occupied = new Set<string>();
  const occupyKey = (x: number, y: number) => `${Math.round(x / 8)},${Math.round(y / 8)}`;

  const pushFill = (pts: Pt[], zone: number | "water") => {
    if (pts.length < 3) return;
    if (zone === "water") {
      water.push(pts);
      return;
    }
    const layer =
      zone === ZONE.residential ? 0
      : zone === ZONE.commercial ? 1
      : zone === ZONE.industrial ? 2
      : zone === ZONE.park ? 3
      : zone === ZONE.civic ? 4
      : zone === ZONE.cultural ? 5
      : zone === ZONE.education ? 6
      : zone === ZONE.parking ? 7
      : zone === ZONE.sports ? 8
      : zone === ZONE.harbour ? 9
      : zone === ZONE.defence ? 10
      : zone === ZONE.utilities ? 11
      : zone === ZONE.nature ? 12
      : zone === ZONE.church ? 13
      : zone === ZONE.health ? 14
      : zone === ZONE.police ? 15
      : zone === ZONE.fire ? 16
      : 17;
    fills[layer].push({ pts, zone });
  };

  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  let ways = 0;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);
    const tags = parseTags(wayStr);
    const ndRe = /<nd\s+ref="(\d+)"/g;
    const nodes: [number, number][] = [];
    let ndCount = 0;
    let ndMatch: RegExpExecArray | null;
    while ((ndMatch = ndRe.exec(wayStr)) !== null) {
      ndCount++;
      const n = nodeMap.get(Number(ndMatch[1]));
      if (n) nodes.push(n);
    }
    const complete = ndCount > 0 && nodes.length === ndCount;
    if (nodes.length < 3) continue;
    ways++;

    const wayId = Number(wayMatch[1]);
    if (relNeedWays.has(wayId) && nodes.length >= 2) {
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      for (const rel of pendingRels) {
        for (const mem of rel.members) {
          if (mem.ref === wayId && mem.pts.length < 2) mem.pts = pts;
        }
      }
    }

    if (nodes.length < 3) continue;
    const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
    if (pts.length < 3) continue;

    if (tags.building && tags.building !== "no") {
      if (!complete) continue;
      if (isGiantBuilding(pts)) continue;
      const zone = buildingZone(tags.building, polyArea(pts), tags);
      buildings.push({ pts, zone, tags });
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      occupied.add(occupyKey(cx, cy));
      continue;
    }

    if (isWaterPoly(tags)) {
      pushFill(pts, "water");
      continue;
    }
    const zone = areaZone(tags);
    if (zone !== null) pushFill(pts, zone);
  }
  console.log(`  ways scanned: ${ways}`);

  let relFills = 0;
  for (const rel of pendingRels) {
    const outers = stitchPolylines(
      rel.members.filter((m) => m.role !== "inner" && m.pts.length >= 2).map((m) => m.pts),
    );
    for (const outer of outers) {
      pushFill(outer, rel.zone);
      relFills++;
    }
  }
  console.log(`  landuse relations: ${relFills}`);

  if (existsSync(OS_BUILDINGS)) {
    const extra = JSON.parse(readFileSync(OS_BUILDINGS, "utf8")) as Array<
      [number, number][] | { nodes: [number, number][] }
    >;
    let added = 0;
    for (const item of extra) {
      const nodes = Array.isArray(item) ? item : item.nodes;
      if (!nodes || nodes.length < 3) continue;
      const pts = uniqueRing(nodes).map(([lat, lon]) => localM(lat, lon));
      if (pts.length < 3 || isGiantBuilding(pts)) continue;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      if (occupied.has(occupyKey(cx, cy))) continue;
      buildings.push({ pts, zone: buildingZone(undefined, polyArea(pts)) });
      occupied.add(occupyKey(cx, cy));
      added++;
    }
    console.log(`  extra footprints: ${added}`);
  }

  const layerNames = [
    "residential",
    "commercial",
    "industrial",
    "park",
    "civic",
    "cultural",
    "education",
    "parking",
    "sports",
    "harbour",
    "defence",
    "utilities",
    "nature",
    "church",
    "health",
    "police",
    "fire",
    "coastguard",
  ];
  for (let layer = 0; layer < fills.length; layer++) {
    for (const fill of fills[layer]) fillPoly(grid, cols, rows, originX, originZ, fill.pts, fill.zone, true);
    console.log(`  layer ${layerNames[layer]}: ${fills[layer].length} polys`);
  }
  for (const b of buildings) {
    const punch =
      b.zone === ZONE.cultural ||
      b.zone === ZONE.sports ||
      b.zone === ZONE.education ||
      b.zone === ZONE.parking ||
      b.zone === ZONE.church ||
      b.zone === ZONE.health ||
      b.zone === ZONE.police ||
      b.zone === ZONE.fire ||
      b.zone === ZONE.coastguard;
    fillPoly(grid, cols, rows, originX, originZ, b.pts, b.zone, punch);
  }
  for (const pts of water) fillPoly(grid, cols, rows, originX, originZ, pts, ZONE.none, true);

  const land = landCells(cols, rows, originX, originZ);
  let leftover = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== ZONE.none || !land[i]) continue;
    grid[i] = ZONE.nature;
    leftover++;
  }
  console.log(`  leftover land filled as nature: ${leftover}`);

  const counts = new Array(19).fill(0);
  for (const z of grid) counts[z]++;
  console.log(`  cells`, {
    none: counts[0],
    residential: counts[1],
    commercial: counts[2],
    industrial: counts[3],
    defence: counts[4],
    park: counts[5],
    civic: counts[6],
    harbour: counts[7],
    utilities: counts[8],
    cultural: counts[9],
    sports: counts[10],
    education: counts[11],
    parking: counts[12],
    nature: counts[13],
    church: counts[14],
    health: counts[15],
    police: counts[16],
    fire: counts[17],
    coastguard: counts[18],
  });
  console.log(`  buildings: ${buildings.length}`);

  const xy: number[] = [];
  const off: number[] = [0];
  const kind = new Uint8Array(buildings.length);
  for (let i = 0; i < buildings.length; i++) {
    const ring = simplify(buildings[i].pts);
    let lastX = 1e9;
    let lastZ = 1e9;
    for (const p of ring) {
      const x = Math.max(-32767, Math.min(32767, Math.round(p.x)));
      const z = Math.max(-32767, Math.min(32767, Math.round(p.y)));
      if (x === lastX && z === lastZ) continue;
      xy.push(x, z);
      lastX = x;
      lastZ = z;
    }
    off.push(xy.length / 2);
    kind[i] = buildings[i].zone;
  }

  const facts: Array<Record<string, string> & { i: number }> = [];
  for (let i = 0; i < buildings.length; i++) {
    const fact = buildingFacts(buildings[i].tags);
    if (fact) facts.push({ i, ...fact });
  }
  console.log(`  building facts: ${facts.length}`);

  const xyBytes = new Uint8Array(Int16Array.from(xy).buffer);
  const offBytes = new Uint8Array(Uint32Array.from(off).buffer);
  const json = {
    v: 1,
    cell: CELL,
    originX,
    originZ,
    cols,
    rows,
    zones: b64(grid),
    xy: b64(xyBytes),
    off: b64(offBytes),
    kind: b64(kind),
    facts,
  };
  writeFileSync(OUT, JSON.stringify(json));
  mkdirSync(GAME_MODELS, { recursive: true });
  mkdirSync(GAME_PUBLIC, { recursive: true });
  copyFileSync(OUT, path.join(GAME_MODELS, "portsmouth-zones.json"));
  copyFileSync(OUT, path.join(GAME_PUBLIC, "portsmouth-zones.json"));
  console.log(`Wrote ${OUT} (${(Buffer.byteLength(JSON.stringify(json)) / 1024 / 1024).toFixed(2)} MB)`);
}

main();
