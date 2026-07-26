/**
 * Looks you'd clock on a Southsea Saturday — mixed skin tones, builds, hair, kit.
 * Texture prefix = look.id (e.g. look_civ03_idle).
 */

export type BodyBuild = "petite" | "slim" | "average" | "stocky" | "heavy" | "tall";

export type LookRole = "civilian" | "enemy" | "player" | "police";

export interface PersonLook {
  id: string;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  build: BodyBuild;
  /** Drawn height / width tweaks applied as sprite scale */
  scaleX: number;
  scaleY: number;
  roles: LookRole[];
}

/** Shade a hex skin for back-limb / silhouette. */
export function shadeSkin(hex: string, amount = 0.22): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const ch = (i: number) => {
    const v = Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - amount));
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

const SKIN = {
  fair: "#f3d5b5",
  light: "#e8c4a0",
  peach: "#f0c9a8",
  olive: "#c9956c",
  tan: "#b07845",
  brown: "#8d5524",
  deep: "#5c3a21",
  ebony: "#3a2214",
  warmBrown: "#a0673a",
  golden: "#d4a574",
} as const;

const HAIR = {
  black: "#1a1410",
  darkBrown: "#3a2418",
  brown: "#5c3a22",
  auburn: "#7a3a22",
  ginger: "#c06028",
  blonde: "#c8a868",
  dirtyBlonde: "#a89060",
  grey: "#8a8884",
  white: "#e0dcd4",
  dyedBlue: "#2a5080",
  dyedPurple: "#6a3a78",
  shaved: "#2a2420",
} as const;

function L(
  id: string,
  skin: string,
  hair: string,
  shirt: string,
  pants: string,
  build: BodyBuild,
  roles: LookRole[],
  scaleX = 1,
  scaleY = 1,
): PersonLook {
  return { id, skin, hair, shirt, pants, build, scaleX, scaleY, roles };
}

/** ~18 distinct Pompey faces — weighted toward what you'd see on the front. */
export const POMPEY_LOOKS: PersonLook[] = [
  // —— Civilians ——
  L("look_c00", SKIN.fair, HAIR.blonde, "#2a6db0", "#3a4558", "average", ["civilian", "player"], 1, 1),
  L("look_c01", SKIN.light, HAIR.brown, "#c9a0d0", "#4a4050", "slim", ["civilian"], 0.92, 1.02),
  L("look_c02", SKIN.olive, HAIR.black, "#2a8a6a", "#2e3848", "average", ["civilian", "enemy"], 1, 1),
  L("look_c03", SKIN.brown, HAIR.black, "#e8a030", "#3a4558", "stocky", ["civilian", "enemy"], 1.08, 0.96),
  L("look_c04", SKIN.deep, HAIR.black, "#c04050", "#2a3040", "tall", ["civilian", "enemy"], 0.98, 1.12),
  L("look_c05", SKIN.ebony, HAIR.shaved, "#f0f0f0", "#1a2030", "heavy", ["civilian", "enemy"], 1.14, 0.94),
  L("look_c06", SKIN.tan, HAIR.darkBrown, "#4a6a9a", "#5a5048", "average", ["civilian"], 1, 1),
  L("look_c07", SKIN.warmBrown, HAIR.black, "#8b3a6a", "#3a4558", "petite", ["civilian"], 0.9, 0.88),
  L("look_c08", SKIN.peach, HAIR.ginger, "#3a7a4a", "#4a4038", "slim", ["civilian"], 0.94, 1.05),
  L("look_c09", SKIN.fair, HAIR.grey, "#6a6860", "#4a4850", "heavy", ["civilian"], 1.1, 0.92),
  L("look_c10", SKIN.golden, HAIR.dirtyBlonde, "#d06040", "#3a4558", "stocky", ["civilian", "enemy"], 1.06, 0.98),
  L("look_c11", SKIN.olive, HAIR.dyedBlue, "#202028", "#1a1a22", "slim", ["civilian"], 0.93, 1.04),
  L("look_c12", SKIN.brown, HAIR.auburn, "#e8e0d0", "#5a4030", "average", ["civilian"], 1, 0.98),
  L("look_c13", SKIN.fair, HAIR.white, "#a05070", "#5a5060", "petite", ["civilian"], 0.95, 0.9),
  L("look_c14", SKIN.deep, HAIR.dyedPurple, "#50b0c0", "#2e3848", "average", ["civilian"], 1, 1.02),
  L("look_c15", SKIN.light, HAIR.darkBrown, "#f2e6d8", "#6a5040", "tall", ["civilian"], 0.96, 1.1),

  // —— Lads / enemies (harder shirts) ——
  L("look_e00", SKIN.fair, HAIR.shaved, "#8b3a3a", "#2a2020", "stocky", ["enemy"], 1.08, 0.98),
  L("look_e01", SKIN.olive, HAIR.black, "#5a2020", "#1a1818", "average", ["enemy"], 1, 1),
  L("look_e02", SKIN.brown, HAIR.black, "#3a3a48", "#1a1a22", "heavy", ["enemy"], 1.12, 0.95),
  L("look_e03", SKIN.peach, HAIR.ginger, "#6a3030", "#2a2420", "slim", ["enemy"], 0.95, 1.06),
  L("look_e04", SKIN.deep, HAIR.black, "#8b3a3a", "#201818", "tall", ["enemy"], 1.02, 1.1),
  L("look_e05", SKIN.tan, HAIR.brown, "#4a2028", "#2a2020", "average", ["enemy", "civilian"], 1, 1),

  // —— Player options ——
  L("look_p00", SKIN.fair, HAIR.darkBrown, "#2a6db0", "#1a3048", "average", ["player"], 1, 1),
  L("look_p01", SKIN.brown, HAIR.black, "#2a6db0", "#1a3048", "stocky", ["player"], 1.05, 0.98),
  L("look_p02", SKIN.olive, HAIR.black, "#2a6db0", "#1a3048", "slim", ["player"], 0.96, 1.04),
  L("look_p03", SKIN.deep, HAIR.black, "#2a6db0", "#1a3048", "tall", ["player"], 1, 1.08),

  // —— Bill ——
  L("look_o00", SKIN.fair, HAIR.brown, "#1a3a6e", "#0a1a30", "average", ["police"], 1, 1),
  L("look_o01", SKIN.brown, HAIR.black, "#1a3a6e", "#0a1a30", "stocky", ["police"], 1.06, 0.98),
  L("look_o02", SKIN.olive, HAIR.darkBrown, "#1a3a6e", "#0a1a30", "tall", ["police"], 0.98, 1.08),
  L("look_o03", SKIN.light, HAIR.grey, "#1a3a6e", "#0a1a30", "heavy", ["police"], 1.1, 0.94),
];

export function looksForRole(role: LookRole): PersonLook[] {
  return POMPEY_LOOKS.filter((l) => l.roles.includes(role));
}

export function pickLook(role: LookRole, rng = Math.random): PersonLook {
  const pool = looksForRole(role);
  return pool[Math.floor(rng() * pool.length)] ?? POMPEY_LOOKS[0];
}

export function getLook(id: string): PersonLook | undefined {
  return POMPEY_LOOKS.find((l) => l.id === id);
}

/** Build → limb / torso multipliers for the doodle drawer. */
export function buildMetrics(build: BodyBuild): {
  torsoW: number;
  limb: number;
  height: number;
  belly: number;
} {
  switch (build) {
    case "petite":
      return { torsoW: 0.82, limb: 0.85, height: 0.9, belly: 0 };
    case "slim":
      return { torsoW: 0.88, limb: 0.88, height: 1.02, belly: 0 };
    case "stocky":
      return { torsoW: 1.18, limb: 1.15, height: 0.96, belly: 2 };
    case "heavy":
      return { torsoW: 1.32, limb: 1.22, height: 0.94, belly: 5 };
    case "tall":
      return { torsoW: 0.95, limb: 0.95, height: 1.12, belly: 0 };
    default:
      return { torsoW: 1, limb: 1, height: 1, belly: 0 };
  }
}
