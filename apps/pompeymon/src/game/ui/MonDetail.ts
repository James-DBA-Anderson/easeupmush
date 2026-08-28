import Phaser from "phaser";
import { BATTLE, MAX_LV, scaled, xpToNext } from "../battle";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { MOVES } from "../moves";
import { monLabel, persistRun, run, setLead, type PartyMon } from "../run";
import { ELEM_LABEL, ELEM_TINT, SPECIES } from "../species";
import { ensureMonSheets, monBattleKey } from "../sprites/mon";
import { consumeDir, isTouchUi } from "../touch";
import { palMonTake } from "../world/pal";
import { MsgBox, type Line } from "./MsgBox";

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
  private readonly chat: MsgBox;
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
    const h = 148;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.5);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    // 8px matches Press Start 2P's grid — 6px looks soft when the canvas is scaled.
    this.body = crispText(scene, x + 52, y + 10, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#e8f0f4",
      lineSpacing: 2,
      wordWrap: { width: w - 64 },
    });

    this.cursor = crispText(scene, x + 10, y + h - 40, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    const hint = crispText(
      scene,
      GBA_W / 2,
      y + h - 6,
      isTouchUi() ? "LOOK  PICK    BACK" : "SPACE  PICK    ESC  BACK",
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#8aa3b0",
      },
    ).setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, this.body, this.cursor, hint]);
    this.root.setDepth(UI_DEPTH + 2);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    this.chat = new MsgBox(scene);
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
    this.chat.hide();
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
    if (this.chat.open) {
      if (confirm || cancel) this.chat.advance();
      return;
    }
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
        this.chat.show("It's out.");
        return;
      }
      if (run.party[run.lead] === mon) {
        this.chat.show("Already lead.");
        return;
      }
      if (!setLead(mon)) {
        this.chat.show("It's out.");
        return;
      }
      persistRun();
      this.hide();
      this.callbacks.onSay(`${monLabel(mon)} is your lead.`);
      this.callbacks.onClose();
      return;
    }
    if (choice === "ASK JESS") {
      this.chat.show(palMonTake(mon));
      return;
    }
    this.hide();
    this.callbacks.onClose();
  }

  private paint(): void {
    const mon = this.mon;
    if (!mon) return;
    const x = (GBA_W - 224) / 2;
    const y = (GBA_H - 148) / 2;
    this.portrait?.destroy();
    this.portrait = this.scene.add
      .image(x + 28, y + 52, monBattleKey(mon.id))
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
    const lead = run.party[run.lead] === mon ? " *" : "";
    const elem = mon.elem ? ELEM_LABEL[mon.elem] : "—";
    const mood = mon.stubborn ? "Stubborn" : mon.cheeky ? "Cheeky" : "";
    this.body.setText(
      [
        `${monLabel(mon)}${lead}`,
        `Lv${mon.lv}  ${mon.hp}/${max}  XP ${xp}`,
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
    const optTop = y + 98;
    this.optTop = optTop;
    this.optRows = this.opts.map((label, i) =>
      crispText(this.scene, x + 22, optTop + i * 11, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );
    for (const row of this.optRows) this.root.add(row);
    this.index = Math.min(this.index, this.opts.length - 1);
    this.placeCursor();
  }

  private placeCursor(): void {
    this.cursor.setY(this.optTop + this.index * 11);
  }
}

/** Render UI text at device scale so FIT upscaling stays sharp. */
function crispText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, style);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  t.setResolution(Math.max(2, Math.round(dpr)));
  return t;
}
