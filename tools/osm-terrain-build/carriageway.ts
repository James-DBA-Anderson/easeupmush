type Pt = { x: number; y: number };
type Seg = { ax: number; ay: number; bx: number; by: number; half: number };

const WALK = new Set(["pedestrian", "footway", "path", "track", "steps", "cycleway", "bridleway", "corridor", "platform"]);
const CELL = 16;

function distToSeg(x: number, y: number, s: Seg) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
  return { t, d: Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t)) };
}

function roadWidth(kind: string, tags: Record<string, string>): number {
  const tagged = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(tagged) && tagged >= 2 && tagged <= 24) return tagged;
  const lanes = Number.parseFloat(tags.lanes ?? "");
  if (Number.isFinite(lanes) && lanes >= 1) return Math.min(24, Math.max(3.2, lanes * 3.15 + 0.4));
  switch (kind) {
    case "motorway":
    case "trunk":
      return 10.5;
    case "primary":
      return 8.5;
    case "secondary":
      return 7.6;
    case "tertiary":
      return 6.8;
    case "unclassified":
      return 5.7;
    case "residential":
    case "living_street":
      return 5.5;
    case "service":
    case "alley":
      return 3.4;
    default:
      return 5.5;
  }
}

export type CarriageHit = {
  x: number;
  y: number;
  dist: number;
  half: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
};

export class Carriageways {
  private bins = new Map<string, Seg[]>();

  private key(x: number, y: number) {
    return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  }

  add(a: Pt, b: Pt, half: number) {
    const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, half };
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL);
    const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL);
    const y1 = Math.floor(Math.max(a.y, b.y) / CELL);
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        const k = `${xi},${yi}`;
        const bin = this.bins.get(k);
        if (bin) bin.push(seg);
        else this.bins.set(k, [seg]);
      }
    }
  }

  nearest(x: number, y: number, maxD: number): CarriageHit | null {
    const r = Math.ceil(maxD / CELL) + 1;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    let best: CarriageHit | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bin = this.bins.get(`${cx + dx},${cy + dy}`);
        if (!bin) continue;
        for (const s of bin) {
          const { t, d } = distToSeg(x, y, s);
          if (d > maxD || (best && d >= best.dist)) continue;
          const tx = s.bx - s.ax;
          const ty = s.by - s.ay;
          const len = Math.hypot(tx, ty) || 1;
          const nx = -ty / len;
          const ny = tx / len;
          best = {
            x: s.ax + tx * t,
            y: s.ay + ty * t,
            dist: d,
            half: s.half,
            nx,
            ny,
            tx: tx / len,
            ty: ty / len,
          };
        }
      }
    }
    return best;
  }

  covers(x: number, y: number, pad = 0.2): boolean {
    const hit = this.nearest(x, y, 14);
    return Boolean(hit && hit.dist < hit.half + pad);
  }

  /** Push a point to the kerb. Returns null if it still sits on tarmac. */
  nudge(x: number, y: number, extra = 1.4): { x: number; y: number; heading: number } | null {
    const hit = this.nearest(x, y, 16);
    if (!hit) return { x, y, heading: 0 };
    if (hit.dist >= hit.half - 0.08) return { x, y, heading: Math.atan2(hit.nx, hit.ny) };
    const side = Math.sign((x - hit.x) * hit.nx + (y - hit.y) * hit.ny) || 1;
    const reach = hit.half + extra;
    const tryAt = (px: number, py: number, s: number) => {
      if (this.covers(px, py, 0.05)) return null;
      return { x: px, y: py, heading: Math.atan2(-hit.nx * s, -hit.ny * s) };
    };
    for (const s of [side, -side]) {
      const placed = tryAt(hit.x + hit.nx * reach * s, hit.y + hit.ny * reach * s, s);
      if (placed) return placed;
    }
    for (const along of [3.5, -3.5, 6.5, -6.5, 9, -9]) {
      for (const s of [side, -side]) {
        const placed = tryAt(
          hit.x + hit.tx * along + hit.nx * reach * s,
          hit.y + hit.ty * along + hit.ny * reach * s,
          s,
        );
        if (placed) return placed;
      }
    }
    return null;
  }
}

export function collectCarriageways(
  buf: string,
  nodeMap: Map<number, [number, number]>,
  localM: (lat: number, lon: number) => Pt,
): Carriageways {
  const roads = new Carriageways();
  const wayStartRe = /<way\s+id="(\d+)"[^>]*>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayStartRe.exec(buf)) !== null) {
    const wayStart = wayMatch.index;
    const wayEnd = buf.indexOf("</way>", wayStart);
    if (wayEnd === -1) continue;
    const wayStr = buf.slice(wayStart, wayEnd + 6);
    const tags: Record<string, string> = {};
    const tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(wayStr)) !== null) tags[t[1]] = t[2];
    const hw = tags.highway;
    if (!hw || tags.area === "yes" || WALK.has(hw) || hw.startsWith("footway") || hw.startsWith("path")) continue;
    const ndRe = /<nd\s+ref="(\d+)"/g;
    const pts: Pt[] = [];
    let nd: RegExpExecArray | null;
    while ((nd = ndRe.exec(wayStr)) !== null) {
      const ll = nodeMap.get(Number(nd[1]));
      if (!ll) continue;
      pts.push(localM(ll[0], ll[1]));
    }
    if (pts.length < 2) continue;
    const half = roadWidth(hw, tags) / 2;
    for (let i = 0; i < pts.length - 1; i++) roads.add(pts[i], pts[i + 1], half);
  }
  return roads;
}
