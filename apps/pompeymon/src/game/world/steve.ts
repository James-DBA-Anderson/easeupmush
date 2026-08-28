import Phaser from "phaser";
import { beatTrainer, isBeaten, persistRun, run, saveOverworld } from "../run";
import type { Line } from "../ui/MsgBox";
import { ensureNpcSheets, npcAnim, npcSheet, type NpcLook } from "../sprites/npc";
import { ensureSteve, steveSheet } from "../sprites/steve";
import { ensureBikeArt } from "../sprites/bike";

export const STEVE_ID = "hs-steve";
export const STEVE_NAME = "STEVE";
export const STEVE_LOOK: NpcLook = "cap";
/** Strong mon he abandons when the bike gets chored. */
export const STEVE_MON = "spikehedge" as const;
export const STEVE_LV = 9;

/** Parked bike spot in the Steve battle (near the trainer). */
export const STEVE_BIKE = { x: 200, y: 118 };

const steve = (text: string): Line => ({ who: STEVE_NAME, text });
const you = (text: string): Line => ({ who: "YOU", text });

/** Outside Choke's, first time you leave with a starter. */
export const STEVE_AMBUSH: Line[] = [
  steve("Oi. Noob."),
  you("Steve?"),
  steve("Tournament day. And you're out here playing Pompeymon."),
  steve("Embarrassing. Even me talking to you is embarrassing."),
  steve("Battle. Now. Before I regret it."),
];

export const STEVE_TAUNT: string[] = [
  "Noob.",
  "Cushty. Soft as butter init.",
  "My bike's worth more than you.",
  "Beard. Absolute noob.",
  "Tournament's today. You're a joke.",
  "Choke gave you that? Charity case.",
];

export function steveFightPending(): boolean {
  return !!run.starter && !isBeaten(STEVE_ID);
}

export function startSteveFight(
  scene: Phaser.Scene,
  returnScene: string,
  pos: { x: number; y: number },
): void {
  saveOverworld(returnScene, pos);
  persistRun();
  scene.scene.start("encounter", {
    trainer: {
      id: STEVE_ID,
      title: "LAD STEVE",
      mon: STEVE_MON,
      lv: STEVE_LV,
      challenge: "Noob. Embarrassing you're even trying today.",
      win: "Whatever. Bike's more important.",
      look: STEVE_LOOK,
      who: STEVE_NAME,
      taunt: STEVE_TAUNT,
    },
  });
}

/** Sinks in after you've boxed a mon that wasn't yours. */
export const STEVE_SHAME: Line[] = [
  you("..."),
  you("That's Steve's mon. In my kebab box."),
  you("I've just chored a Pompeymon."),
  you("Hope no one finds out about this."),
  "It won't look at you.",
];

export function finishSteveCatch(): void {
  beatTrainer(STEVE_ID);
  persistRun();
}

/** Steve on his new BMX, waiting outside the lab. */
export function spawnSteveWait(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Sprite {
  ensureSteve(scene);
  const spr = scene.add.sprite(x, y, steveSheet(), "idle");
  spr.setOrigin(0.5, 1);
  spr.setDepth(y);
  spr.setFlipX(true);
  return spr;
}

/** Hoodie thief for the battle backdrop. */
export function spawnBikeThief(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Sprite {
  ensureNpcSheets(scene);
  const spr = scene.add.sprite(x, y, npcSheet("hoodie"), "walk-side");
  spr.setOrigin(0.5, 1);
  spr.setDepth(5);
  spr.setScale(2);
  spr.play(npcAnim("hoodie", "walk-side"));
  return spr;
}

/** Steve's parked BMX — visible in the fight until it's chored. */
export function spawnSteveBattleBike(scene: Phaser.Scene): Phaser.GameObjects.Image {
  ensureBikeArt(scene);
  return scene.add
    .image(STEVE_BIKE.x, STEVE_BIKE.y, "bike-park")
    .setScale(2)
    .setOrigin(0.5, 1)
    .setDepth(3);
}
