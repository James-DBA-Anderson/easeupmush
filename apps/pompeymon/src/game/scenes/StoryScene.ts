import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { applyStory, MILESTONES, sidePathsFor, type SidePath } from "../story";
import { consumeAction, consumeCancel, consumeDir } from "../touch";
import { clearDebugLeaveLock, setDebugSession } from "../ui/debugBack";

const ROWS = 8;
const ROW_H = 10;
const TOP = 64;
const LEFT_X = 4;
const LEFT_W = 104;
const RIGHT_X = 112;
const RIGHT_W = 124;

const FONT = '"Press Start 2P", monospace';

/** Debug story jump — pick a beat, tick the optional bits you'd have done by then. */
export class StoryScene extends Phaser.Scene {
  private side: "beat" | "extra" = "beat";
  private beat = 0;
  private extra = 0;
  private picked = new Set<string>();
  private beatTexts: Phaser.GameObjects.Text[] = [];
  private extraTexts: Phaser.GameObjects.Text[] = [];
  private noneText?: Phaser.GameObjects.Text;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private armed = false;

  constructor() {
    super("story");
  }

  create(): void {
    clearDebugLeaveLock();
    setDebugSession(false);
    this.side = "beat";
    this.beat = 0;
    this.extra = 0;
    this.picked = new Set();
    this.beatTexts = [];
    this.extraTexts = [];
    this.noneText = undefined;
    this.armed = false;
    this.drainInput();

    this.paintBg();
    this.bindKeys();

    this.label(8, 6, "STORY JUMP", "#f0a23a");
    this.label(8, 18, "LEFT/RIGHT SWITCH", "#d8e8f0", "6px");
    this.label(8, 28, "SPACE GO OR TICK", "#d8e8f0", "6px");
    this.label(8, 38, "ENTER GO   ESC BACK", "#d8e8f0", "6px");

    this.panel(LEFT_X, 50, LEFT_W, 100, "BEAT");
    this.panel(RIGHT_X, 50, RIGHT_W, 100, "DONE BEFORE");

    MILESTONES.forEach((m, i) => {
      this.beatTexts.push(this.row(LEFT_X + 10, m.label, () => this.pickBeat(i)));
    });
    sidePathsFor(MILESTONES.length - 1).forEach((p, i) => {
      this.extraTexts.push(this.row(RIGHT_X + 6, p.label, () => this.pickExtra(i)));
    });
    this.noneText = this.label(RIGHT_X + 6, TOP, "NOWT YET", "#6a8090", "6px");

    this.refresh();

    this.input.once("pointerup", () => this.time.delayedCall(80, () => (this.armed = true)));
    this.time.delayedCall(400, () => (this.armed = true));
  }

  update(): void {
    if (!this.armed) {
      this.drainInput();
      return;
    }
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.left!) || consumeDir("left")) this.swap("beat");
    if (Phaser.Input.Keyboard.JustDown(k.right!) || consumeDir("right")) this.swap("extra");
    if (Phaser.Input.Keyboard.JustDown(k.up!) || consumeDir("up")) this.move(-1);
    if (Phaser.Input.Keyboard.JustDown(k.down!) || consumeDir("down")) this.move(1);

    if (Phaser.Input.Keyboard.JustDown(k.enter!)) {
      this.go();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(k.space!) || consumeAction()) {
      if (this.side === "extra") this.toggle();
      else this.go();
      return;
    }
    if (
      Phaser.Input.Keyboard.JustDown(k.esc!) ||
      Phaser.Input.Keyboard.JustDown(k.d!) ||
      consumeCancel()
    ) {
      this.scene.start("debug");
    }
  }

  private options(): SidePath[] {
    return sidePathsFor(this.beat);
  }

  private swap(side: "beat" | "extra"): void {
    if (side === "extra" && !this.options().length) return;
    this.side = side;
    this.extra = Math.min(this.extra, Math.max(0, this.options().length - 1));
    this.refresh();
  }

  private move(step: number): void {
    if (this.side === "beat") {
      this.beat = Phaser.Math.Clamp(this.beat + step, 0, MILESTONES.length - 1);
      this.extra = 0;
    } else {
      this.extra = Phaser.Math.Clamp(this.extra + step, 0, Math.max(0, this.options().length - 1));
    }
    this.refresh();
  }

  private pickBeat(i: number): void {
    if (!this.armed) return;
    this.side = "beat";
    this.beat = i;
    this.extra = 0;
    this.refresh();
  }

  private pickExtra(i: number): void {
    if (!this.armed) return;
    if (i >= this.options().length) return;
    this.side = "extra";
    this.extra = i;
    this.toggle();
  }

  private toggle(): void {
    const opt = this.options()[this.extra];
    if (!opt) return;
    if (this.picked.has(opt.id)) this.picked.delete(opt.id);
    else this.picked.add(opt.id);
    this.refresh();
  }

  private go(): void {
    const beat = applyStory(this.beat, this.picked);
    setDebugSession(true);
    this.scene.start(beat.scene, beat.data);
  }

  private refresh(): void {
    const beatTop = Phaser.Math.Clamp(this.beat - ROWS + 1, 0, Math.max(0, MILESTONES.length - ROWS));
    this.beatTexts.forEach((text, i) => {
      const row = i - beatTop;
      const on = row >= 0 && row < ROWS;
      text.setVisible(on);
      if (on) text.setPosition(LEFT_X + 10, TOP + row * ROW_H);
      const active = this.side === "beat" && this.beat === i;
      text.setColor(active ? "#f8f0d8" : i <= this.beat ? "#9cb0c0" : "#5c7080");
      text.setText(`${active ? ">" : i === this.beat ? "*" : " "}${MILESTONES[i]!.label}`);
    });

    const opts = this.options();
    const extraTop = Phaser.Math.Clamp(this.extra - ROWS + 1, 0, Math.max(0, opts.length - ROWS));
    this.extraTexts.forEach((text, i) => {
      const opt = opts[i];
      const row = i - extraTop;
      const on = !!opt && row >= 0 && row < ROWS;
      text.setVisible(on);
      if (!opt || !on) return;
      text.setPosition(RIGHT_X + 6, TOP + row * ROW_H);
      const active = this.side === "extra" && this.extra === i;
      const ticked = this.picked.has(opt.id);
      text.setColor(active ? "#f8f0d8" : ticked ? "#a8d8a0" : "#9cb0c0");
      text.setText(`${active ? ">" : " "}${ticked ? "[X]" : "[ ]"} ${opt.label}`);
    });
    this.noneText?.setVisible(!opts.length);
  }

  private row(x: number, label: string, onPick: () => void): Phaser.GameObjects.Text {
    return this.add
      .text(x, TOP, label, { fontFamily: FONT, fontSize: "6px", color: "#9cb0c0" })
      .setInteractive({ useHandCursor: true })
      .on("pointerup", onPick);
  }

  private label(x: number, y: number, text: string, color: string, size = "8px") {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color }).setDepth(2);
  }

  private panel(x: number, y: number, w: number, h: number, title: string): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a1814, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0xf0a23a, 1);
    g.strokeRect(x, y, w, h);
    this.add.text(x + 5, y + 4, title, { fontFamily: FONT, fontSize: "8px", color: "#f0a23a" });
  }

  private paintBg(): void {
    const g = this.add.graphics();
    g.fillStyle(0x102030, 1);
    g.fillRect(0, 0, GBA_W, GBA_H);
    g.fillStyle(0x183848, 1);
    g.fillRect(0, 0, GBA_W, 46);
    g.fillStyle(0x142c38, 1);
    g.fillRect(0, 46, GBA_W, GBA_H - 46);
  }

  private bindKeys(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey("UP"),
      down: kb.addKey("DOWN"),
      left: kb.addKey("LEFT"),
      right: kb.addKey("RIGHT"),
      space: kb.addKey("SPACE"),
      enter: kb.addKey("ENTER"),
      esc: kb.addKey("ESC"),
      d: kb.addKey("D"),
    };
  }

  private drainInput(): void {
    consumeAction();
    consumeCancel();
    consumeDir("up");
    consumeDir("down");
    consumeDir("left");
    consumeDir("right");
  }
}
