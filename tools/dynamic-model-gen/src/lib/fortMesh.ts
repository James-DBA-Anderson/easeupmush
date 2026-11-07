import * as THREE from "three";

const STONE = 0x7a766c;
const STONE_DARK = 0x5c5952;
const WET = 0x4a4842;
const IRON = 0x3a3c42;
const COURT = 0x6a6560;
const WINDOW = 0x2a2824;

function mat(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

function cyl(rTop: number, rBot: number, h: number, y: number, color: number, seg = 22) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export type FortKind = "spitbank" | "horsesand" | "nomans" | "sthelens";

type FortSpec = {
  radius: number;
  wallH: number;
  tiers: 1 | 2;
  dazzle?: boolean;
  helipad?: boolean;
};

const SPECS: Record<FortKind, FortSpec> = {
  spitbank: { radius: 26, wallH: 14, tiers: 1 },
  horsesand: { radius: 32, wallH: 13, tiers: 2, dazzle: true },
  nomans: { radius: 30, wallH: 13, tiers: 2, helipad: true },
  sthelens: { radius: 18, wallH: 11, tiers: 1 },
};

function casemates(root: THREE.Group, radius: number, y: number, count: number, w: number, h: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), mat(WINDOW));
    mesh.position.set(Math.sin(a) * (radius - 0.4), y, Math.cos(a) * (radius - 0.4));
    mesh.rotation.y = a;
    mesh.castShadow = true;
    root.add(mesh);
  }
}

function dazzle(root: THREE.Group, radius: number) {
  const patches: Array<[number, number, number]> = [
    [0.35, 4.2, 5.5],
    [0.55, 6.0, 4.8],
    [0.72, 3.4, 6.2],
    [0.48, 8.5, 4.2],
  ];
  patches.forEach(([ang, y, h], i) => {
    const a = ang * Math.PI;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, h, 0.7),
      mat(i % 2 ? 0xe8e2d4 : 0x1c1a16),
    );
    mesh.position.set(Math.sin(a) * (radius + 0.2), y, Math.cos(a) * (radius + 0.2));
    mesh.rotation.y = a;
    root.add(mesh);
  });
}

export function buildFort(kind: FortKind): THREE.Group {
  const spec = SPECS[kind];
  const g = new THREE.Group();
  const r = spec.radius;

  g.add(cyl(r + 2.4, r + 3.2, 2.4, 1.2, WET, 24));
  g.add(cyl(r, r + 0.6, spec.wallH, 2.4 + spec.wallH / 2, STONE, 24));
  casemates(g, r, 5.2, spec.radius > 22 ? 18 : 14, 2.4, 3.1);
  if (spec.tiers === 2) casemates(g, r, 10.2, 16, 2.1, 2.6);

  const deckY = 2.4 + spec.wallH;
  g.add(cyl(r - 0.4, r - 0.2, 1.1, deckY + 0.55, STONE_DARK, 24));
  g.add(cyl(r * 0.55, r * 0.55, 0.5, deckY + 0.4, COURT, 16));

  if (spec.tiers === 2) {
    const ur = r * 0.62;
    const uh = 7.2;
    g.add(cyl(ur, ur + 0.3, uh, deckY + uh / 2, STONE, 20));
    casemates(g, ur, deckY + 3.2, 12, 2.0, 2.4);
    const top = deckY + uh;
    g.add(cyl(ur - 0.3, ur - 0.1, 0.9, top + 0.45, IRON, 20));
    g.add(cyl(ur * 0.5, ur * 0.5, 0.4, top + 0.35, COURT, 14));
    if (spec.helipad) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ur * 0.32, 0.28, 6, 20), mat(0xd8d0c0));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = top + 0.85;
      g.add(ring);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ur * 0.42, 0.18, 0.7), mat(0xd8d0c0));
      bar.position.y = top + 0.85;
      g.add(bar);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 8, 6), mat(IRON));
    mast.position.set(ur * 0.2, top + 4.4, 0);
    g.add(mast);
  } else {
    g.add(cyl(r * 0.72, r * 0.72, 1.6, deckY + 1.4, IRON, 18));
    const house = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 5.2), mat(STONE_DARK));
    house.position.set(0, deckY + 2.8, 0);
    g.add(house);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), mat(IRON));
    mast.position.set(3.2, deckY + 5.2, 1.4);
    g.add(mast);
  }

  if (spec.dazzle) dazzle(g, r);

  g.name = `fort-${kind}`;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  g.position.y -= box.min.y;
  g.updateMatrixWorld(true);
  return g;
}

export function buildSpitbank(): THREE.Group {
  return buildFort("spitbank");
}
export function buildHorseSand(): THREE.Group {
  return buildFort("horsesand");
}
export function buildNoMans(): THREE.Group {
  return buildFort("nomans");
}
export function buildStHelens(): THREE.Group {
  return buildFort("sthelens");
}
