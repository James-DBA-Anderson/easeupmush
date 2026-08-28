import Phaser from "phaser";
import { run, seeSpecies } from "../run";
import { ensureMonSheets, monOwAnim, monOwSheet } from "../sprites/mon";
import { ensureNpcSheets, npcAnim, npcSheet } from "../sprites/npc";
import type { Line } from "../ui/MsgBox";
import { MATE_LOOK, MATE_NAME } from "./mate";
import type { Talker } from "./talkFx";

const STEVIE_NAME = "STEVIE J";
const STEVIE_LOOK = "hoodie" as const;
const STEVIE_MON = "spikehedge" as const;
const MATE_MON = "squirral" as const;

const stevie = (text: string): Line => ({ who: STEVIE_NAME, text });
const ollie = (text: string): Line => ({ who: MATE_NAME, text });
const jess = (text: string): Line => ({ who: "JESS", text });

/** Kick-off on the pitch — only the first walk in through the gate. */
export function matchPending(from: string): boolean {
  return from === "island" && !run.matchSeen && !run.mateSad && !run.mateJoined;
}

type Say = (lines: Line[], onDone?: () => void) => void;

/** Two pupils having it out on the school pitch, and the lad who loses. */
export class PitchMatch {
  private readonly bits: Phaser.GameObjects.GameObject[] = [];
  private stevieSpr!: Phaser.GameObjects.Sprite;
  private ollieSpr!: Phaser.GameObjects.Sprite;
  private stevieMon!: Phaser.GameObjects.Sprite;
  private ollieMon!: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly say: Say,
  ) {}

  /** Centre of the pitch — what the camera looks at. */
  static readonly VIEW = { x: 102, y: 150 };

  place(): void {
    const scene = this.scene;
    ensureNpcSheets(scene);
    ensureMonSheets(scene);
    seeSpecies(STEVIE_MON);
    seeSpecies(MATE_MON);

    this.stevieSpr = this.person(58, 160, STEVIE_LOOK, false);
    this.ollieSpr = this.person(146, 160, MATE_LOOK, true);
    this.stevieMon = this.mon(90, 148, STEVIE_MON, false);
    this.ollieMon = this.mon(114, 148, MATE_MON, true);
  }

  private person(x: number, y: number, look: typeof STEVIE_LOOK | typeof MATE_LOOK, faceLeft: boolean) {
    const spr = this.scene.add.sprite(x, y, npcSheet(look), "idle-side");
    spr.setOrigin(0.5, 1);
    spr.setDepth(y);
    spr.setFlipX(faceLeft);
    spr.play(npcAnim(look, "idle-side"));
    this.bits.push(spr);
    return spr;
  }

  private mon(x: number, y: number, id: typeof STEVIE_MON | typeof MATE_MON, faceLeft: boolean) {
    const spr = this.scene.add.sprite(x, y, monOwSheet(id), "idle-side");
    spr.setOrigin(0.5, 1);
    spr.setDepth(y);
    spr.setFlipX(faceLeft);
    spr.play(monOwAnim(id, "idle-side"));
    this.bits.push(spr);
    return spr;
  }

  /** Run the whole thing, then hand back for the gift. */
  start(onEnd: () => void): void {
    this.say([stevie("Spikehedge. Roll him."), ollie("Squirral — move! Move!")], () => {
      this.clash(() => {
        const watch: Line[] = run.palJoined
          ? [
              jess("That's Stevie J."),
              jess("Gym deputy. He's on the doors inside — you'll have to get through him."),
              jess("Other lad's Ollie. He's here every Friday getting done."),
            ]
          : [{ text: "Two pupils having it out on the pitch." }];
        this.say(watch, () => {
          this.say([stevie("Again. Roll him."), ollie("...Get up. Please get up.")], () => {
            this.clash(() => this.finish(onEnd));
          });
        });
      });
    });
  }

  /** The mons run at each other. */
  private clash(done: () => void): void {
    this.stevieMon.play(monOwAnim(STEVIE_MON, "walk-side-loop"));
    this.ollieMon.play(monOwAnim(MATE_MON, "walk-side-loop"));
    this.scene.tweens.add({
      targets: this.stevieMon,
      x: 100,
      duration: 220,
      yoyo: true,
      ease: "Quad.easeIn",
    });
    this.scene.tweens.add({
      targets: this.ollieMon,
      x: 106,
      duration: 220,
      delay: 60,
      yoyo: true,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.stevieMon.play(monOwAnim(STEVIE_MON, "idle-side"));
        this.ollieMon.play(monOwAnim(MATE_MON, "idle-side"));
        this.scene.time.delayedCall(220, done);
      },
    });
  }

  private finish(onEnd: () => void): void {
    this.ollieMon.setTint(0x8090a0);
    this.scene.tweens.add({
      targets: this.ollieMon,
      angle: -80,
      x: 122,
      duration: 260,
      ease: "Quad.easeIn",
    });
    this.scene.time.delayedCall(420, () => {
      this.say([stevie("Every Friday geez. Cushty."), stevie("Don't bother turning up next week.")], () => {
        this.stevieMon.destroy();
        this.stevieSpr.play(npcAnim(STEVIE_LOOK, "walk-up"));
        this.scene.tweens.add({
          targets: this.stevieSpr,
          y: 70,
          duration: 900,
          ease: "Linear",
          onComplete: () => this.stevieSpr.setVisible(false),
        });
        this.ollieSpr.setFlipX(false);
        this.ollieSpr.play(npcAnim(MATE_LOOK, "idle-down"));
        this.scene.tweens.add({
          targets: this.ollieSpr,
          x: 126,
          y: 152,
          duration: 600,
          ease: "Sine.easeOut",
        });
        this.scene.time.delayedCall(700, () => {
          const console_: Line[] = run.palJoined
            ? [
                jess("Oi. Ollie. He's a mug, don't listen to him."),
                ollie("...He's not wrong though."),
                jess("Give him something. Anything you've got. Go on."),
              ]
            : [ollie("...He's not wrong though."), { text: "The lad needs something." }];
          this.say(console_, onEnd);
        });
      });
    });
  }

  /** Who's on the pitch, so the talking nudge finds them. */
  cast(): Talker[] {
    return [
      { name: STEVIE_NAME, spr: this.stevieSpr },
      { name: MATE_NAME, spr: this.ollieSpr },
    ];
  }

  /** Ollie's left sat where he lost — the scene takes it from here. */
  clear(): void {
    for (const b of this.bits) b.destroy();
    this.bits.length = 0;
  }
}
