import Phaser from "phaser";
import { BATTLE, MAX_LV, scaled, xpToNext } from "../battle";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { MOVES } from "../moves";
import { monLabel, persistRun, run, setLead, type PartyMon } from "../run";
import { ELEM_LABEL, ELEM_TINT, SPECIES } from "../species";
import { ensureMonSheets, monBattleKey } from "../sprites/mon";
import { consumeDir, isTouchUi } from "../touch";
import { palMonTake } from "../world/pal";
import type { Line } from "./MsgBox";

type DetailCallbacks = {
  onSay: (msg: Line | Line[]) => void;
  onClose: () => void;
};

/** Party mon summary — lead, ask Jess, back. */
export class MonDetail {
  private root: Phaser.GameObjects.Container;
  private portrait?: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Text;
  private optRows: Phaser.GameObjects.Text[] = [];
  private cursor: Phaser.GameObjects.Text;
  private open = false;
  private mon?: PartyMon;
  private opts: string[] = [];
  private index = 0;
  private optTop = 0;
  private readonly scene: Phaser.Scene;
  private readonly callbacks: DetailCallbacks;

  constructor(scene: Phaser.Scene, callbacks: DetailCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    const w = 224;
    const h = 140;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.5);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    this.body = scene.add.text(x + 52, y + 10, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "6px",
      color: "#e8f0f4",
      lineSpacing: 4,
      wordWrap: { width: w - 60 },
    });

    this.cursor = scene.add.text(x + 10, y + h - 36, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    const hint = scene.add
      .text(GBA_W / 2, y + h - 6, isTouchUi() ? "LOOK  PICK    BACK" : "SPACE  PICK    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, this.body, this.cursor, hint]);
    this.root.setDepth(UI_DEPTH + 2);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(mon: PartyMon): void {
    ensureMonSheets(this.scene);
    this.mon = mon;
    this.open = true;
    this.index = 0;
    this.paint();
    this.root.setVisible(true);
  }

  hide(): void {
    this.open = false;
    this.mon = undefined;
    this.portrait?.destroy();
    this.portrait = undefined;
    this.root.setVisible(false);
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "S", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): void {
    if (!this.open || !this.mon) return;
    const n = this.opts.length;
    if (n > 1) {
      if (
        Phaser.Input.Keyboard.JustDown(cursors.up) ||
        Phaser.Input.Keyboard.JustDown(wasd.W) ||
        consumeDir("up")
      ) {
        this.index = (this.index + n - 1) % n;
        this.placeCursor();
      }
      if (
        Phaser.Input.Keyboard.JustDown(cursors.down) ||
        Phaser.Input.Keyboard.JustDown(wasd.S) ||
        consumeDir("down")
      ) {
        this.index = (this.index + 1) % n;
        this.placeCursor();
      }
    }
    if (confirm) {
      this.pick();
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onClose();
    }
  }

  private pick(): void {
    const mon = this.mon;
    if (!mon) return;
    const choice = this.opts[this.index];
    if (choice === "LEAD") {
      if (mon.hp <= 0) {
        this.callbacks.onSay("It's out.");
        return;
      }
      if (run.party[run.lead] === mon) {
        this.callbacks.onSay("Already lead.");
        return;
      }
      if (!setLead(mon)) {
        this.callbacks.onSay("It's out.");
        return;
      }
      persistRun();
      this.hide();
      this.callbacks.onSay(`${monLabel(mon)} is your lead.`);
      this.callbacks.onClose();
      return;
    }
    if (choice === "ASK JESS") {
      this.hide();
      this.callbacks.onSay(palMonTake(mon));
      this.callbacks.onClose();
      return;
    }
    this.hide();
    this.callbacks.onClose();
  }

  private paint(): void {
    const mon = this.mon;
    if (!mon) return;
    const x = (GBA_W - 224) / 2;
    const y = (GBA_H - 140) / 2;
    this.portrait?.destroy();
    this.portrait = this.scene.add
      .image(x + 28, y + 48, monBattleKey(mon.id))
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH + 3);
    if (mon.elem) this.portrait.setTint(ELEM_TINT[mon.elem]);
    this.root.add(this.portrait);

    const max = scaled(BATTLE[mon.id].hp, mon.lv);
    const need = xpToNext(mon.lv);
    const xp = mon.lv >= MAX_LV ? "MAX" : `${mon.xp}/${need}`;
    const moves = (mon.moves?.length ? mon.moves : [])
      .map((id) => MOVES[id]?.name ?? id.toUpperCase())
      .join(" ");
    const lead = run.party[run.lead] === mon ? " LEAD" : "";
    const elem = mon.elem ? ELEM_LABEL[mon.elem] : "—";
    const mood = mon.stubborn ? "Stubborn." : mon.cheeky ? "Cheeky." : "";
    this.body.setText(
      [
        `${monLabel(mon)}${lead}`,
        `Lv${mon.lv}  HP ${mon.hp}/${max}`,
        `XP ${xp}`,
        SPECIES[mon.id].kind,
        `Type ${elem}${mood ? `  ${mood}` : ""}`,
        moves ? `Moves ${moves}` : "Moves —",
      ].join("\n"),
    );

    for (const row of this.optRows) row.destroy();
    this.optRows = [];
    this.opts = [];
    if (mon.hp > 0) this.opts.push("LEAD");
    if (run.palJoined) this.opts.push("ASK JESS");
    this.opts.push("BACK");
    const optTop = y + 92;
    this.optTop = optTop;
    this.optRows = this.opts.map((label, i) =>
      this.scene.add.text(x + 22, optTop + i * 10, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );
    for (const row of this.optRows) this.root.add(row);
    this.index = 0;
    this.placeCursor();
  }

  private placeCursor(): void {
    this.cursor.setY(this.optTop + this.index * 10);
  }
}
