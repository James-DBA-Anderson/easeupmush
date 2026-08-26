import Phaser from "phaser";
import { BATTLE, moveIdsForLevel, scaled } from "../battle";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { MOVES } from "../moves";
import { persistRun, run, seeSpecies } from "../run";
import { HIDDEN_IDS, SPECIES, type SpeciesId, type WildId } from "../species";
import { ensureMonSheets, monBattleKey } from "../sprites/mon";
import { isTouchUi } from "../touch";

/** How much the Pompdex knows about a species. */
export function pompdexComplete(id: SpeciesId): boolean {
  return run.owned.includes(id);
}

/** Open Pompdex on a wild — marks seen. Returns false if you have no Pompdex. */
export function canScan(): boolean {
  return run.items.includes("pompdex");
}

/** Pompdex species page. Incomplete until you've caught one. */
export class PompdexEntry {
  private root: Phaser.GameObjects.Container;
  private portrait?: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Text;
  private open = false;
  private onClose?: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    const w = 224;
    const h = 132;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.55);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0x48a0d8);

    const title = scene.add
      .text(GBA_W / 2, y + 6, "POMPDEX", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#48a0d8",
      })
      .setOrigin(0.5, 0);

    this.body = scene.add.text(x + 52, y + 22, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "6px",
      color: "#e8f0f4",
      lineSpacing: 4,
      wordWrap: { width: w - 60 },
    });

    const hint = scene.add
      .text(GBA_W / 2, y + h - 6, isTouchUi() ? "LOOK  CLOSE" : "SPACE  CLOSE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.body, hint]);
    this.root.setDepth(UI_DEPTH + 4);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  /** Scan / reopen a species. Marks seen and persists. */
  show(id: SpeciesId, onClose?: () => void): void {
    ensureMonSheets(this.scene);
    const fresh = !run.seen.includes(id);
    seeSpecies(id);
    persistRun();
    this.onClose = onClose;
    this.open = true;
    this.paint(id, fresh);
    this.root.setVisible(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.portrait?.destroy();
    this.portrait = undefined;
    this.root.setVisible(false);
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }

  update(confirm: boolean, cancel: boolean): void {
    if (!this.open) return;
    if (confirm || cancel) this.hide();
  }

  private paint(id: SpeciesId, fresh: boolean): void {
    const x = (GBA_W - 224) / 2;
    const y = (GBA_H - 132) / 2;
    this.portrait?.destroy();
    this.portrait = this.scene.add
      .image(x + 28, y + 70, monBattleKey(id))
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH + 5);
    const complete = pompdexComplete(id);
    if (!complete) this.portrait.setTint(0x3a4858);
    else this.portrait.clearTint();
    this.root.add(this.portrait);

    const spec = SPECIES[id];
    const rare = HIDDEN_IDS.has(id as WildId);
    const lines: string[] = [];
    if (fresh) lines.push("New data logged.");
    lines.push(spec.name);
    lines.push(complete || !rare ? spec.kind : "??? Rare. Sparse.");
    if (complete) {
      const b = BATTLE[id];
      lines.push(`HP ${scaled(b.hp, 5)}  ATK ${scaled(b.atk, 5)}  DEF ${scaled(b.def, 5)}`);
      lines.push(`SPD ${scaled(b.spd, 5)}  Catch ${b.catch}`);
      const moves = moveIdsForLevel(id, 8)
        .map((m) => MOVES[m]?.name ?? m)
        .join(" ");
      lines.push(moves ? `Moves ${moves}` : "Moves —");
      lines.push("Caught. Data complete.");
    } else {
      lines.push("HP ???  ATK ???  DEF ???");
      lines.push("SPD ???  Catch ???");
      lines.push("Moves ???");
      lines.push(rare ? "Rare. Catch to finish entry." : "Data incomplete. Catch one.");
    }
    this.body.setText(lines.join("\n"));
  }
}
