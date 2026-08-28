import {
  beatTrainer,
  bondStolenMon,
  catchSpecies,
  healParty,
  makePartyMon,
  run,
  STOLEN_NICK,
  syncBagChrome,
  takeBag,
  takeCash,
  takeChomp,
  takeEmpty,
  takeFlyer,
  takeKebabBoxes,
  takePrize,
  takeStack,
  takeStarter,
} from "./run";
import { PAL_ID } from "./world/pal";
import { STEVE_ID } from "./world/steve";

/** One beat of the story you can drop into, in the order they happen. */
export type Milestone = {
  id: string;
  label: string;
  scene: string;
  data?: object;
  /** Party level once you're this far. */
  lv?: number;
  /** Just this step — the launcher runs every earlier one first. */
  apply?: () => void;
};

/** A side-path you could have done by then, but nobody made you. */
export type SidePath = {
  id: string;
  label: string;
  /** Earliest milestone it's reachable from. */
  from: number;
  /** Milestone that forces it anyway, so stop offering it as a choice. */
  forcedAt?: number;
  apply: () => void;
};

/** Level of the wild you get handed at a beat, so debug fights aren't a walkover. */
function levelParty(lv: number): void {
  for (const mon of run.party) {
    if (mon.lv >= lv) continue;
    const fresh = makePartyMon(mon.id, lv);
    mon.lv = fresh.lv;
    mon.xp = 0;
    mon.moves = fresh.moves;
  }
  healParty();
}

export const MILESTONES: Milestone[] = [
  {
    id: "wake",
    label: "WAKE UP",
    scene: "bedroom",
    apply: () => {
      run.outfit = "pj";
      run.dressed = false;
    },
  },
  {
    id: "dressed",
    label: "GOT DRESSED",
    scene: "landing",
    data: { from: "bedroom" },
    apply: () => {
      run.outfit = "jumper";
      run.dressed = true;
    },
  },
  {
    id: "bag",
    label: "GOT THE BAG",
    scene: "hall",
    data: { from: "kitchen" },
    apply: () => takeBag(),
  },
  {
    id: "steve",
    label: "STEVE RODE OFF",
    scene: "avenue",
    data: { from: "hall" },
    apply: () => {
      run.steveGone = true;
      run.flyerOnRoad = true;
    },
  },
  {
    id: "lab",
    label: "FOUND THE LAB",
    scene: "lab",
    apply: () => {
      run.labVisited = true;
    },
  },
  {
    id: "starter",
    label: "GOT A STARTER",
    scene: "highstreet",
    data: { from: "lab" },
    lv: 5,
    apply: () => takeStarter("scabfox"),
  },
  {
    id: "prickles",
    label: "DID STEVE",
    scene: "highstreet",
    data: { from: "lab" },
    lv: 7,
    apply: () => {
      beatTrainer(STEVE_ID);
      catchSpecies("spikehedge", 9, { stubborn: true, nick: STOLEN_NICK });
    },
  },
  {
    id: "dean",
    label: "DID DEAN",
    scene: "bridge",
    lv: 8,
    apply: () => {
      beatTrainer("br-dean");
      bondStolenMon();
    },
  },
  {
    id: "jess",
    label: "JESS TAGS ON",
    scene: "island",
    data: { from: "bridge" },
    lv: 10,
    apply: () => {
      beatTrainer(PAL_ID);
      run.palJoined = true;
      run.palWon = true;
      run.palGreeted = true;
    },
  },
  {
    id: "gate",
    label: "SCHOOL GATE",
    scene: "school",
    data: { from: "island" },
    lv: 11,
  },
  {
    id: "match",
    label: "SAW THE MATCH",
    scene: "school",
    data: { from: "island" },
    lv: 11,
    apply: () => {
      run.matchSeen = true;
      run.mateSad = true;
    },
  },
  {
    id: "inside",
    label: "IN THE SCHOOL",
    scene: "schoolin",
    data: { from: "school" },
    lv: 12,
  },
  {
    id: "stevie",
    label: "DID STEVIE J",
    scene: "schoolin",
    data: { from: "school" },
    lv: 14,
    apply: () => beatTrainer("si-stevie"),
  },
  {
    id: "badge",
    label: "HILSEA BADGE",
    scene: "schoolin",
    data: { from: "school" },
    lv: 16,
    apply: () => {
      beatTrainer("si-atkins");
      takePrize("hilsea");
    },
  },
];

const STREET_SCRAPS = ["hs-pub", "hs-kay", "hs-sharon", "hs-tom", "rb-lee"];
const ISLAND_SCRAPS = ["is-mick", "is-bex", "is-gaz", "sch-ryan"];
const SCHOOL_SCRAPS = ["si-val", "si-dan", "si-kev"];

export const SIDE_PATHS: SidePath[] = [
  {
    id: "rent",
    label: "PAID MUM RENT",
    from: 2,
    apply: () => {
      run.mumRentPaid = true;
      takeCash(-50);
    },
  },
  { id: "flyer", label: "CHOKE FLYER", from: 3, apply: () => takeFlyer() },
  {
    id: "nan",
    label: "HILL NAN CHAT",
    from: 3,
    apply: () => {
      run.hillNanGone = true;
    },
  },
  {
    id: "chomp",
    label: "CHORED A CHOMP",
    from: 4,
    apply: () => {
      takeChomp();
      run.chompKept = true;
    },
  },
  { id: "bmx", label: "GOT A BMX", from: 5, apply: () => takePrize("bmx") },
  { id: "lock", label: "GOT A D-LOCK", from: 5, apply: () => takePrize("lock") },
  {
    id: "scran",
    label: "POCKET SCRAN",
    from: 5,
    apply: () => {
      takeStack("chips", 2);
      takeStack("fish", 1);
      takeStack("curry", 1);
      takeStack("doner", 1);
      takeStack("plaster", 2);
    },
  },
  {
    id: "boxes",
    label: "BOX HOARD",
    from: 5,
    apply: () => {
      takeKebabBoxes(5);
      takeEmpty(3);
    },
  },
  { id: "dosh", label: "POCKETS FULL", from: 2, apply: () => takeCash(400) },
  {
    id: "street",
    label: "COSHAM SCRAPS",
    from: 5,
    apply: () => {
      for (const id of STREET_SCRAPS) beatTrainer(id);
    },
  },
  {
    id: "hilsea",
    label: "HILSEA SCRAPS",
    from: 8,
    apply: () => {
      for (const id of ISLAND_SCRAPS) beatTrainer(id);
    },
  },
  {
    id: "mates",
    label: "SPARE MONS",
    from: 8,
    apply: () => {
      catchSpecies("chipgull", 8);
      catchSpecies("moggit", 8);
    },
  },
  {
    id: "ollie",
    label: "OLLIE TAGS ON",
    from: 10,
    apply: () => {
      run.mateJoined = true;
      run.mateSad = false;
    },
  },
  {
    id: "school",
    label: "SCHOOL SCRAPS",
    from: 11,
    apply: () => {
      for (const id of SCHOOL_SCRAPS) beatTrainer(id);
    },
  },
];

/** The side-paths worth offering at a beat — reachable by then, and not already forced on you. */
export function sidePathsFor(milestone: number): SidePath[] {
  return SIDE_PATHS.filter(
    (p) => p.from <= milestone && (p.forcedAt == null || p.forcedAt > milestone),
  );
}

/** Wipe back to a clean slate so a jump never inherits the last one. */
function blankRun(): void {
  run.outfit = "jumper";
  run.dressed = true;
  run.hasBag = false;
  run.items = [];
  run.steveGone = false;
  run.flyerOnRoad = false;
  run.starter = null;
  run.refusedStarters = false;
  run.seen = [];
  run.owned = [];
  run.party = [];
  run.lead = 0;
  run.islandPos = null;
  run.overworld = null;
  run.field = null;
  run.wildKey = null;
  run.wildGone = false;
  run.beaten = [];
  run.grassCalm = 0;
  run.kebabBoxes = 0;
  run.kebabCatch = false;
  run.empties = 0;
  run.whiteout = false;
  run.chompKept = false;
  run.labVisited = false;
  run.hillNanGone = false;
  run.lockChored = false;
  run.mumRentPaid = false;
  run.palJoined = false;
  run.palWon = false;
  run.palGreeted = false;
  run.matchSeen = false;
  run.mateSad = false;
  run.mateJoined = false;
  run.cash = 100;
  run.mounted = false;
  run.parked = null;
  run.plasters = 0;
  run.stale = 0;
  run.curry = 0;
  run.doner = 0;
  run.chips = 0;
  run.fish = 0;
}

/** Build the run as if you'd played up to `milestone`, plus whichever side-paths you ticked. */
export function applyStory(milestone: number, picked: ReadonlySet<string>): Milestone {
  const end = Math.max(0, Math.min(MILESTONES.length - 1, milestone));
  blankRun();
  let lv = 0;
  for (let i = 0; i <= end; i += 1) {
    const beat = MILESTONES[i]!;
    beat.apply?.();
    if (beat.lv) lv = beat.lv;
  }
  for (const path of sidePathsFor(end)) {
    if (picked.has(path.id)) path.apply();
  }
  if (lv) levelParty(lv);
  syncBagChrome();
  return MILESTONES[end]!;
}
