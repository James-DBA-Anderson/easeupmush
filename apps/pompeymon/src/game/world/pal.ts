import Phaser from "phaser";
import { beatTrainer, isBeaten, persistRun, run, saveOverworld } from "../run";
import { SPECIES, type SpeciesId } from "../species";
import { ensureNpcSheets, npcAnim, npcSheet, playNpc, type NpcLook } from "../sprites/npc";
import type { Line } from "../ui/MsgBox";
import { type Facing } from "../walk";
import { mateAdvice, MATE_LOOK, MATE_NAME } from "./mate";
import type { Talker } from "./talkFx";

export const PAL_ID = "pal-jess";
export const PAL_NAME = "JESS";
export const PAL_LOOK: NpcLook = "blond";

const jess = (text: string): Line => ({ who: PAL_NAME, text });
const you = (text: string): Line => ({ who: "YOU", text });

export const PAL_AMBUSH: Line[] = [
  jess("Oi. I saw the whole thing."),
  jess("That hedgehog. Jumped out the bag. Proper."),
  jess("How long you been training?"),
  you("…Not long."),
  jess("I'm Jess. I want a battle."),
  jess("Now."),
];

export function palJoinChat(): Line[] {
  if (run.palWon) {
    return [
      jess("Alright. You're not useless."),
      jess("Never seen a mon jump in like that. I'm sticking with you."),
      jess("I'll point you at the gyms. Talk to me if you're lost."),
    ];
  }
  return [
    jess("Ease up mush. You're coming anyway."),
    jess("Never seen a mon jump in like that. I'm sticking with you."),
    jess("I'll point you at Atkins. Talk to me if you're lost."),
  ];
}

export function palAdvice(): Line[] {
  if (run.outfit === "pj") return [jess("Put some clothes on mush.")];
  const badge = run.items.includes("hilsea");
  const lv = run.party.reduce((m, p) => Math.max(m, p.lv), 1);
  const caught = run.owned.length;
  if (!badge) {
    if (lv < 8 || caught < 3) {
      return [
        jess("Atkins is PE. Three mons. He'll batter you like this."),
        jess("Grass on Hilsea. School field. Catch a couple."),
        jess("I had Atkins. Rain. Laps. Don't skip PE he says. Beard."),
      ];
    }
    if (!isBeaten("si-stevie")) {
      return [
        jess("Boys' School. Gym's inside. Stevie J's on the doors."),
        jess("Atkins is through him. I know Atkins. He's rough."),
      ];
    }
    if (!isBeaten("si-atkins")) {
      return [
        jess("Stevie's done. Atkins next. Three of 'em. Kit on."),
        jess("I told him I'd be back. Hilsea Badge. Go on."),
      ];
    }
  }
  return [
    jess("Badge is yours. South is North End. Not yet."),
    jess("Train on the Lines if you want. Don't stare in the ditch."),
  ];
}

export function palAside(npcId: string): Line | undefined {
  if (!run.palJoined) return undefined;
  const line: Record<string, string> = {
    "si-atkins": "That's Atkins. Don't let him do the laps speech.",
    "si-stevie": "Stevie J. He thinks he's hard.",
    "sch-pe": "Sir's alright. Atkins is the one.",
    "sch-ryan": "Ryan's always on the field. Easy XP.",
    "sch-ollie": "Give him something. Anything. He's had a week of it.",
    "is-mick": "Mick's barred. Gym's still the school.",
    "is-gaz": "Gaz is opposite the school. Warm-up.",
    "is-bex": "Bex is on the Lines. Good scrap if you need it.",
    "is-bus": "Bus is late. Gym's not.",
    "is-ryan": "He's been after that one all week.",
    "si-janitor": "Latch is off. Atkins doesn't care.",
    "si-miss": "Miss is alright. Gym's still that way.",
    "si-dot": "Dot'll feed you. Then Atkins feeds you to the floor.",
    "si-val": "Val's a scrap. Good for levels.",
    "si-dan": "Dan's in the way. Not the gym.",
    "si-kev": "Kev's easy. Save it for Stevie.",
    "br-dean": "Dean don't care about his mons. Watch him.",
    "rb-lee": "Lee's on the island. Catch some before Atkins.",
    "hs-kay": "Kay's chippy. Catch Chipgulls if you're thin.",
    "hs-tom": "Tom's south. Not a gym.",
    "hs-sharon": "Sharon and Tracy. Tag fight. Not Atkins.",
    "hs-tracy": "They've had me before. Annoying.",
    "hs-pub": "Dave's outside. Don't drink. Gym's Hilsea.",
    "hill-view": "Nan's seen Atkins. She'll tell you to train.",
    "lab-choke": "Choke's later. Atkins is the gym now.",
  };
  const text = line[npcId];
  return text ? jess(text) : undefined;
}

/** Jess answers when a gym leader clocks their shared past. */
export function palGymReply(gymId: string): Line | undefined {
  if (!run.palJoined) return undefined;
  const line: Record<string, string> = {
    "si-atkins": "Told you I'd be back. Rain and all.",
  };
  const text = line[gymId];
  return text ? jess(text) : undefined;
}

/** Mid-battle shout — gym / multi-mon scraps only. */
export type PalCheerKind = "open" | "clutch" | "foeDown" | "pinch" | "win";

const PAL_CHEERS: Record<PalCheerKind, string[]> = {
  open: [
    "You've got this mush.",
    "Watch their lead. Don't squinny.",
    "Kit on. Batter them.",
  ],
  clutch: [
    "Finish it!",
    "They're soft now — go on!",
    "Defend if you have to. Then hit.",
    "Don't freeze. Move!",
  ],
  foeDown: [
    "One down. Keep going.",
    "Nice. Next.",
    "Don't get cocky. More coming.",
  ],
  pinch: [
    "Send another. You're not done.",
    "Ease up — switch. We've got this.",
    "They're not through you yet.",
  ],
  win: [
    "Cushty. Told you.",
    "That's how you do it.",
    "Badge's that way next. Or dosh. Either.",
  ],
};

/** True once she's joined and you're not battling her. */
export function palBesidePlayer(trainerId?: string): boolean {
  return !!run.palJoined && trainerId !== PAL_ID;
}

export function pickPalCheer(kind: PalCheerKind, avoid = -1): { line: Line; i: number } | undefined {
  const pool = PAL_CHEERS[kind];
  if (!pool.length) return undefined;
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === avoid) i = (i + 1) % pool.length;
  return { line: jess(pool[i]!), i };
}

/** Jess's take on a party mon from the bag detail screen. */
export function palMonTake(mon: { id: string; lv: number; nick?: string; stubborn?: boolean; cheeky?: boolean; elem?: string }): Line[] {
  if (!run.palJoined) return [jess("…")];
  const who = mon.nick?.trim() || SPECIES[mon.id as SpeciesId]?.name || mon.id.toUpperCase();
  if (mon.stubborn) {
    return [
      jess(`${who}. Won't listen. Still worth it.`),
      jess("That jump on the bridge though. Proper."),
    ];
  }
  if (mon.cheeky && (mon.nick === "PRICKLES" || mon.id === "spikehedge")) {
    return [
      jess(`${who}. Moody now. Better than stubborn.`),
      jess("Might jump in again. Keep them healthy."),
    ];
  }
  const takes: Record<string, string[]> = {
    scabfox: ["Scabfox. Nicked ear. Street smart.", "Good lead if they listen."],
    chipgull: ["Chipgull. Thieving git. I like them.", "Quick. Don't feed them your chips."],
    moggit: ["Moggit. Mine's meaner.", "Still a solid scrap."],
    donerrat: ["Donerrat. Bin's their gym.", "Greasy. Hits harder than they look."],
    pidgeon: ["Pidgeon. Fat town bird.", "Everywhere. Easy XP."],
    squirral: ["Squirral. Park lunatic.", "Fast. Don't let them start."],
    spikehedge: ["Spikehedge. Rolls up. Painful.", "Defend into them. Beard."],
    starlimur: ["Starlimur. Estate starling.", "Noisy. Useful though."],
    busstopper: ["Busstopper. Lives at the shelter.", "Tanky. Atkins material."],
    kerbite: ["Kerbite. Gutter bite.", "Rare. Don't squinny — catch it."],
    honkace: ["Honkace. Wrong bird. Loud.", "I heard one on the roundabout."],
    chalklur: ["Chalklur. Pale as the hill.", "Portsdown's got them."],
    linelurker: ["Linelurker. Keeps to the ditch.", "Lines. Don't stare too long."],
    kitthief: ["Kitthief. Nicks PE socks.", "School shed. Atkins would cop."],
  };
  const lines = takes[mon.id] ?? ["Alright. It's yours.", "Train it. Don't skip PE."];
  const out = lines.map((t) => jess(t));
  if (mon.lv < 8) out.push(jess("Low level. Grass. School field."));
  else if (mon.lv >= 10) out.push(jess("That's gym weight. Go on."));
  if (mon.elem) out.push(jess(`They've eaten. ${mon.elem.toUpperCase()} now.`));
  return out;
}

export function joinPal(won: boolean): void {
  run.palJoined = true;
  run.palWon = won;
  run.palGreeted = false;
  beatTrainer(PAL_ID);
  persistRun();
}

export function startPalFight(
  scene: Phaser.Scene,
  returnScene: string,
  pos: { x: number; y: number },
): void {
  saveOverworld(returnScene, pos);
  persistRun();
  scene.scene.start("encounter", {
    trainer: {
      id: PAL_ID,
      title: "LASS JESS",
      mon: "moggit",
      lv: 6,
      challenge: "Show me what that hedgehog's about.",
      win: "Cushty. Never seen a jump like that. I'm coming.",
      look: PAL_LOOK,
      who: PAL_NAME,
    },
  });
}

type Say = (line: Line | Line[]) => void;

const PAL_GAP = 18;
/** Ollie hangs back behind Jess. */
const MATE_GAP = 30;

/** One person trailing the player. */
class Follower {
  private sprite?: Phaser.GameObjects.Sprite;
  private trail: { x: number; y: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    private readonly look: NpcLook,
    private readonly gap: number,
    private readonly lag: number,
  ) {
    ensureNpcSheets(scene);
    const sprite = scene.add.sprite(player.x, player.y + gap, npcSheet(look), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(player.y);
    playNpc(sprite, look, "down", false);
    this.sprite = sprite;
    this.trail = Array.from({ length: lag }, () => ({ x: player.x, y: player.y + gap }));
  }

  get spr(): Phaser.GameObjects.Sprite | undefined {
    return this.sprite;
  }

  near(dist: number): boolean {
    if (!this.sprite) return false;
    return Math.hypot(this.sprite.x - this.player.x, this.sprite.y - this.player.y) < dist;
  }

  tick(facing: Facing, flip: number): void {
    const spr = this.sprite;
    if (!spr) return;
    this.trail.unshift({ x: this.player.x, y: this.player.y });
    if (this.trail.length > this.lag + 2) this.trail.pop();

    const toX = spr.x - this.player.x;
    const toY = spr.y - this.player.y;
    const toDist = Math.hypot(toX, toY);

    const vx = this.player.body.velocity.x;
    const vy = this.player.body.velocity.y;
    const playerMoving = Math.hypot(vx, vy) > 12;
    // Walking into her would otherwise shove her away along the trail.
    const approaching = playerMoving && vx * toX + vy * toY > 40;
    // Idle trail collapses onto the player — keep a gap.
    const hold = approaching || (!playerMoving && toDist < this.gap);

    let moving = false;
    if (!hold) {
      const goal = this.trail[this.trail.length - 1]!;
      const dx = goal.x - spr.x;
      const dy = goal.y - spr.y;
      const dist = Math.hypot(dx, dy);
      moving = dist > 4;
      if (moving) {
        spr.x += dx * 0.22;
        spr.y += dy * 0.22;
      }
    }

    let palFacing: Facing = facing;
    let palFlip = flip;
    if (Math.abs(toX) > 3 || Math.abs(toY) > 3) {
      if (Math.abs(toX) > Math.abs(toY)) {
        palFacing = "side";
        palFlip = toX > 0 ? -1 : 1;
      } else palFacing = toY > 0 ? "up" : "down";
    }
    spr.setFlipX(palFlip < 0);
    spr.setDepth(spr.y);
    playNpc(spr, this.look, palFacing, moving);
  }
}

/** Everyone tagging along — Jess, and Ollie once you've fed him. */
export class PalField {
  private pal?: Follower;
  private mate?: Follower;

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    private readonly say: Say,
  ) {
    if (run.palJoined) this.pal = new Follower(scene, player, PAL_LOOK, PAL_GAP, 12);
    if (run.mateJoined) this.mate = new Follower(scene, player, MATE_LOOK, MATE_GAP, 20);
  }

  tick(facing: Facing, flip: number): void {
    this.pal?.tick(facing, flip);
    this.mate?.tick(facing, flip);
  }

  /** Who's following, for the talking nudge. */
  cast(): Talker[] {
    return [
      { name: PAL_NAME, spr: this.pal?.spr },
      { name: MATE_NAME, spr: this.mate?.spr },
    ];
  }

  /** Ollie falls in behind after you've fed him. */
  addMate(scene: Phaser.Scene, player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody): void {
    if (this.mate) return;
    this.mate = new Follower(scene, player, MATE_LOOK, MATE_GAP, 20);
  }

  /** Look with nothing else nearby — the crew is always close when they're following. */
  tryTalk(): boolean {
    if (this.pal?.near(48)) {
      this.say(palAdvice());
      return true;
    }
    if (this.mate?.near(48)) {
      this.say(mateAdvice());
      return true;
    }
    return false;
  }
}

export function runPalAmbush(
  scene: Phaser.Scene,
  player: { x: number; y: number },
  onArrive: () => void,
): Phaser.GameObjects.Sprite {
  ensureNpcSheets(scene);
  const spr = scene.add.sprite(player.x, player.y + 90, npcSheet(PAL_LOOK), "walk-up");
  spr.setOrigin(0.5, 1);
  spr.setDepth(player.y + 80);
  spr.play(npcAnim(PAL_LOOK, "walk-up"));
  scene.tweens.add({
    targets: spr,
    y: player.y + 16,
    duration: 720,
    ease: "Sine.easeOut",
    onComplete: () => {
      spr.play(npcAnim(PAL_LOOK, "idle-up"));
      onArrive();
    },
  });
  return spr;
}
