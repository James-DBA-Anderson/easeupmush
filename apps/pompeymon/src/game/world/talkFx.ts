import Phaser from "phaser";
import { lineWho, type Line } from "../ui/MsgBox";

export type Talker = { name: string; spr?: Phaser.GameObjects.Sprite };

const HOP = 2;

/**
 * Nudges whoever's speaking so you can tell who it is. Message boxes freeze the
 * overworld tick, so tweening the sprite here doesn't fight their walk code.
 */
export class TalkFx {
  private tween?: Phaser.Tweens.Tween;
  private spr?: Phaser.GameObjects.Sprite;
  private restY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cast: () => Talker[],
  ) {}

  /** Hand this to `MsgBox` as its page hook. */
  onPage = (line?: Line): void => {
    const who = line ? lineWho(line) : undefined;
    const next = who ? this.cast().find((t) => t.name === who)?.spr : undefined;
    if (next === this.spr && this.tween?.isPlaying()) return;
    this.stop();
    if (!next?.active) return;
    this.spr = next;
    this.restY = next.y;
    this.tween = this.scene.tweens.add({
      targets: next,
      y: next.y - HOP,
      duration: 190,
      yoyo: true,
      repeat: -1,
      hold: 90,
      ease: "Quad.easeOut",
    });
  };

  private stop(): void {
    this.tween?.remove();
    this.tween = undefined;
    if (this.spr?.active) this.spr.y = this.restY;
    this.spr = undefined;
  }
}
