import { ITEM, persistRun, run, takeItem, type ItemId } from "../run";
import type { NpcLook } from "../sprites/npc";
import type { Line } from "../ui/MsgBox";
import type { NpcSpec } from "./npcs";

export const MATE_ID = "sch-ollie";
export const MATE_NAME = "OLLIE";
export const MATE_LOOK: NpcLook = "polo";
/** Where he sits after Stevie J does him on the pitch. */
export const MATE_SPOT = { x: 126, y: 152 };

const ollie = (text: string): Line => ({ who: MATE_NAME, text });

/** Anything you could hand a sad lad. Stacked food first, then the tat. */
const GIFTS: ItemId[] = ["chips", "fish", "doner", "curry", "stale", "plaster"];

export function spareGift(): ItemId | undefined {
  return GIFTS.find((id) => run.items.includes(id) && stackLeft(id) > 0);
}

function stackLeft(id: ItemId): number {
  if (id === "chips") return run.chips;
  if (id === "fish") return run.fish;
  if (id === "doner") return run.doner;
  if (id === "curry") return run.curry;
  if (id === "stale") return run.stale;
  if (id === "plaster") return run.plasters;
  return 1;
}

function dropStack(id: ItemId): void {
  if (id === "chips") run.chips -= 1;
  else if (id === "fish") run.fish -= 1;
  else if (id === "doner") run.doner -= 1;
  else if (id === "curry") run.curry -= 1;
  else if (id === "stale") run.stale -= 1;
  else if (id === "plaster") run.plasters -= 1;
  if (stackLeft(id) <= 0) takeItem(id);
}

/** Hand it over — he cheers up and tags along. Returns what you gave. */
export function giveMateGift(): ItemId | undefined {
  const id = spareGift();
  if (!id) return undefined;
  dropStack(id);
  run.mateJoined = true;
  run.mateSad = false;
  persistRun();
  return id;
}

export function mateGiftChat(id: ItemId): Line[] {
  return [
    { who: "YOU", text: `Here. ${ITEM[id].label}.` },
    ollie("...For me?"),
    ollie("Nobody give me nuffin all term."),
    ollie("I'm Ollie. I'm coming with you. Don't say no."),
  ];
}

export function mateNoGiftChat(): Line[] {
  return [
    { who: "YOU", text: "...I've got nothing." },
    ollie("S'alright. Everyone's got nuffin for me."),
    ollie("I'll sit here then."),
  ];
}

export function mateWaitChat(): Line[] {
  return [ollie("Leave it mush. I'm alright."), ollie("...I'm not alright.")];
}

const ADVICE: Line[][] = [
  [ollie("Stevie J does me every Friday. Every one."), ollie("You'll do him. You've got the look.")],
  [ollie("Atkins is through the doors. He's worse than Stevie.")],
  [ollie("Chips helped. Honest.")],
  [ollie("My mon's still knackered. He tried though.")],
];

export function mateAdvice(): Line[] {
  return ADVICE[Math.floor(Math.random() * ADVICE.length)]!;
}

/** Sat on the pitch until someone gives him something. */
export const MATE_NPC: NpcSpec = {
  id: MATE_ID,
  name: MATE_NAME,
  look: MATE_LOOK,
  x: MATE_SPOT.x,
  y: MATE_SPOT.y,
  facing: "down",
  talk: "Stevie J done me again.",
  more: ["Every Friday. On the pitch. In front of everyone.", "Go on then. Laugh."],
};
