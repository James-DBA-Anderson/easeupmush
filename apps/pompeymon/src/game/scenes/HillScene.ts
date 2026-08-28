import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { ensureLeadAlive, partnerMon, resumePos, returningTo, run } from "../run";
import { rollWildLv } from "../battle";
import { SPECIES, type WildId } from "../species";
import { kidAnim } from "../sprites/kid";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { isTouchUi } from "../touch";
import {
  addWalls,
  bindWalkKeys,
  justAction,
  justCancel,
  near,
  spawnKid,
  atSouthEdge,
  tickWalk,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawHill, type HillLayout } from "../world/drawHill";
import { BikeField } from "../world/bike";
import { PalField, palAside } from "../world/pal";
import { blockNpcs, HILL_NPCS, npcNear, npcTalk, spawnFieldNpcs, tickFieldNpcs, type FieldNpc } from "../world/npcs";
import {
  beginWildFight,
  leaveField,
  spawnAreaWilds,
  tickWanderers,
  wanderNear,
  areaDoorKeepOff,
  type Wanderer,
} from "../world/wander";

const nan = (text: string): Line => ({ who: "NAN", text });
const you = (text: string): Line => ({ who: "YOU", text });

export class HillScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: HillLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private npcs: FieldNpc[] = [];
  private wanderers: Wanderer[] = [];
  private bikes!: BikeField;
  private pal!: PalField;

  constructor() {
    super("hill");
  }

  create(): void {
    if (this.textures.exists("hill")) this.textures.remove("hill");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawHill(art);
    art.generateTexture("hill", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "hill").setOrigin(0);

    const returning = returningTo("hill");
    const spawn = resumePos("hill", this.layout.spawn);
    this.facing = "up";
    this.player = spawnKid(this, spawn.x, spawn.y);
    const specs = HILL_NPCS.filter((n) => !(n.id === "hill-view" && run.hillNanGone));
    this.npcs = spawnFieldNpcs(this, specs);
    this.wanderers = spawnAreaWilds(this, "hill", returning);
    addWalls(this, this.player, this.layout.solids);
    blockNpcs(this, this.player, this.npcs);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.bikes = new BikeField(this, this.player, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.busy) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const walked = tickWalk(this.player, this.cursors, this.wasd, this.facing, this.flip);
    this.facing = walked.facing;
    this.flip = walked.flip;
    this.bikes.tick(this.facing);
    this.pal.tick(this.facing, this.flip);
    tickFieldNpcs(this, this.npcs);
    tickWanderers(this, this.wanderers, this.player);
    this.player.setDepth(this.player.y);

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = wanderNear(this.player, this.wanderers);
    if (moving) {
      if (run.grassCalm > 0) run.grassCalm -= 1;
      else if (bumped && run.starter) {
        this.startWild(bumped.id, bumped);
        return;
      }
    }

    if (atSouthEdge(this.player)) {
      leaveField("hill");
      this.scene.start("roundabout", { from: "hill" });
      return;
    }

    if (cancel && this.bikes.tryBack()) return;
    if (confirm) this.tryExamine();
  }

  private startWild(wild: WildId, map?: Wanderer): void {
    if (!run.starter) {
      this.reachThen(`A ${SPECIES[wild].name}. Need a partner first.`);
      return;
    }
    if ((ensureLeadAlive()?.hp ?? 0) <= 0) {
      this.reachThen("Your Pompeymon's out.");
      return;
    }
    run.grassCalm = 28;
    beginWildFight("hill", { x: this.player.x, y: this.player.y }, this.wanderers, map);
    this.scene.start("encounter", { wild, lv: map?.lv ?? rollWildLv(6, 8) });
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    const person = npcNear(this.player, this.npcs, 16, areaDoorKeepOff("hill"));
    if (person) {
      this.reachThen(person.id === "hill-view" ? this.hillNanTalk() : npcTalk(person));
      return;
    }
    const wild = wanderNear(this.player, this.wanderers);
    if (wild) {
      this.bagUi?.scanWild(wild.id);
      return;
    }
    if (near(this.player, this.layout.van, 10)) {
      this.reachThen("Burger van. Hatch is down.");
      return;
    }
    if (near(this.player, this.layout.view, 14)) {
      this.reachThen("Portsdown. That's the island.");
      return;
    }
    this.pal.tryTalk();
  }

  /** Pep talk after you have a starter — then she's gone next visit. */
  private hillNanTalk(): Line[] {
    if (!run.starter) {
      return [nan("You can see the island from here mush.")];
    }
    const mon = partnerMon();
    const name = mon ? SPECIES[mon.id].name : "Pompeymon";
    const lv = mon?.lv ?? 5;
    run.hillNanGone = true;
    const extra = palAside("hill-view");
    return [
      nan("I see you have your first Pompeymon."),
      you("How did you know, lady?"),
      nan("Ahh, a trainer never forgets."),
      you("You trained Pompeymon?"),
      nan(`Oh yes, just a little. What level is your ${name}?`),
      you(`Lv${lv}.`),
      nan("What?? Is that it? You'll never make the finals with that!"),
      you("Oh..."),
      nan("Oh don't give up yet. Ask Choke about his training dungeon."),
      you("Err. OK, lady. Thanks, I think."),
      ...(extra ? [extra] : []),
    ];
  }

  private reachThen(line: Line | Line[]): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(run.outfit, reach));
    this.showNote(line);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      const idle = this.facing === "up" ? "idle-up" : this.facing === "side" ? "idle-side" : "idle-down";
      this.player.anims.play(kidAnim(run.outfit, idle));
    });
  }

  private showNote(text: Line | Line[]): void {
    this.note?.show(text);
  }
}
