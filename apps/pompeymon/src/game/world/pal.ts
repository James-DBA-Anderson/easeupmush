import Phaser from "phaser";
import { beatTrainer, isBeaten, persistRun, run, saveOverworld } from "../run";
import { ensureNpcSheets, npcAnim, npcSheet, playNpc, type NpcLook } from "../sprites/npc";
import type { Line } from "../ui/MsgBox";
import { near, type Facing } from "../walk";

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
    "is-mick": "Mick's barred. Gym's still the school.",
    "is-gaz": "Gaz is opposite the school. Warm-up.",
    "is-bex": "Bex is on the Lines. Good scrap if you need it.",
    "is-bus": "Bus is late. Gym's not.",
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

/** Overworld follower after she joins. */
export class PalField {
  private sprite?: Phaser.GameObjects.Sprite;
  private trail: { x: number; y: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    private readonly say: Say,
  ) {
    if (!run.palJoined) return;
    ensureNpcSheets(scene);
    const sprite = scene.add.sprite(player.x, player.y + 18, npcSheet(PAL_LOOK), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(player.y);
    playNpc(sprite, PAL_LOOK, "down", false);
    this.sprite = sprite;
    this.trail = Array.from({ length: 12 }, () => ({ x: player.x, y: player.y + 18 }));
  }

  tick(facing: Facing, flip: number): void {
    const spr = this.sprite;
    if (!spr) return;
    this.trail.unshift({ x: this.player.x, y: this.player.y });
    if (this.trail.length > 14) this.trail.pop();
    const goal = this.trail[this.trail.length - 1];
    const dx = goal.x - spr.x;
    const dy = goal.y - spr.y;
    const dist = Math.hypot(dx, dy);
    const moving = dist > 4;
    if (moving) {
      spr.x += dx * 0.22;
      spr.y += dy * 0.22;
    }
    let palFacing: Facing = facing;
    let palFlip = flip;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (Math.abs(dx) > Math.abs(dy)) {
        palFacing = "side";
        palFlip = dx < 0 ? -1 : 1;
      } else palFacing = dy < 0 ? "up" : "down";
    }
    spr.setFlipX(palFlip < 0);
    spr.setDepth(spr.y);
    playNpc(spr, PAL_LOOK, palFacing, moving);
  }

  tryTalk(): boolean {
    if (!this.sprite || !run.palJoined) return false;
    if (!near(this.player, { x: this.sprite.x - 8, y: this.sprite.y - 16, w: 16, h: 16 }, 14)) return false;
    this.say(palAdvice());
    return true;
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
