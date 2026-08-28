import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeWhiteout, foundItem, hasChomp, healParty, markLabVisited, partyNeedsHeal, run, takeChomp, takeStarter, type StarterId } from "../run";
import { ensureChoke } from "../sprites/choke";
import { kidAnim } from "../sprites/kid";
import { ensureMonSheets, monOwAnim, monOwSheet } from "../sprites/mon";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { StarterMenu } from "../ui/StarterMenu";
import { isTouchUi } from "../touch";
import {
  addWalls,
  armSouthExit,
  bindWalkKeys,
  justAction,
  justCancel,
  near,
  spawnKid,
  tickWalk,
  walkingInto,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawLab, type LabLayout } from "../world/drawLab";
import { PalField, palAside } from "../world/pal";

const choke = (text: string): Line => ({ who: "CHOKE", text });
const you = (text: string): Line => ({ who: "YOU", text });

const INTRO: Line[] = [
  choke("Ah. You came. Professor Choke."),
  choke("This year's Pompeymon tournament. You excited?"),
  you("…Pompeymon? Tournament?"),
  choke("Creatures. Round here. You raise 'em. You battle."),
  choke("Tournament every year. Island's the real one."),
  choke("Anyone who's anyone goes over the bridge."),
  choke("You'll need a partner. Pick one."),
];

const TAKE: Record<StarterId, string> = {
  scabfox: "Scabfox. Rec fox. Keep it off the bins.",
  chipgull: "Chipgull. It'll have your chips.",
  moggit: "Moggit. Thinks it owns the precinct.",
  donerrat: "You what — this one was in the bin.",
};

const AFTER_TAKE: Line[] = [
  choke("And this. Pompdex."),
  choke("Head to Pompey. Catch Pompeymon."),
  you("How do I catch them?"),
  choke("Err. Hmm."),
  choke("I gave the last Pompeyballs away a minute ago."),
  choke("Here. Use these kebab boxes."),
  you("What do I do with them when I catch them?"),
  choke("Battle them!"),
  you("And when I'm not battling?"),
  choke("Oh just stuff them in your bag."),
  you("Err. OK."),
  choke("Let me know what you catch and I'll try to help."),
];

const HEAL: Line[] = [
  choke("You blacked out. I brought you in."),
  choke("Your Pompeymon's fainted. Hold still."),
  choke("There. They're up."),
  you("Cheers."),
  choke("Don't make a habit of it."),
];

const PATCH: Line[] = [
  choke("You look rough. Hold still."),
  choke("There. They're up."),
  you("Cheers."),
];

export class LabScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: LabLayout;
  private room!: Phaser.GameObjects.Image;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private menu!: StarterMenu;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private offerMenu = false;
  private tableMons: Phaser.GameObjects.Sprite[] = [];
  private rude: "off" | "walk" | "line" = "off";
  private southExit = { armed: false };

  constructor() {
    super("lab");
  }

  create(): void {
    this.southExit = { armed: false };
    markLabVisited();
    this.paint();
    ensureChoke(this);
    this.add.image(this.layout.choke.x + 8, this.layout.choke.y + 10, "choke").setDepth(9);

    this.facing = "up";
    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));
    this.menu = new StarterMenu(this, { onPick: (opt) => this.picked(opt.id) });

    if (consumeWhiteout()) {
      this.player.setPosition(120, 84);
      this.facing = "up";
      this.player.anims.play(kidAnim(run.outfit, "idle-up"));
      this.showNote(HEAL);
    }

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.rude !== "off") return;
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.busy || this.menu.active) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.rude !== "off") {
      this.player.body.setVelocity(0, 0);
      if (this.note?.open && confirm) this.note.advance();
      if (this.rude === "line" && !this.note?.open) {
        this.scene.start("highstreet", { from: "lab-rude" });
      }
      return;
    }

    if (this.menu.active) {
      this.player.body.setVelocity(0, 0);
      this.menu.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel);
      return;
    }

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.offerMenu) {
      this.offerMenu = false;
      this.menu.show();
      return;
    }

    if (this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const walked = tickWalk(this.player, this.cursors, this.wasd, this.facing, this.flip);
    this.facing = walked.facing;
    this.flip = walked.flip;
    this.pal.tick(this.facing, this.flip);

    if (armSouthExit(this.player, this.cursors, this.wasd, this.southExit) && walkingInto(this.player, this.layout.door, "down")) {
      if (!run.starter) {
        this.reachThen(
          choke(
            run.refusedStarters
              ? "Bin's there. Rougher than Fratton Wetherspoons."
              : "Pick one first.",
          ),
        );
        return;
      }
      if (hasChomp() && !run.chompKept) {
        this.playRudeLeave();
        return;
      }
      this.scene.start("highstreet", { from: "lab" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (!hasChomp() && near(this.player, this.layout.chomp, 10)) {
      this.findChomp();
      return;
    }
    if (near(this.player, this.layout.choke, 12) || near(this.player, this.layout.table, 10)) {
      this.talkChoke();
      return;
    }
    if (near(this.player, this.layout.bin, 10)) {
      this.lookBin();
      return;
    }
    if (near(this.player, this.layout.desk, 8)) {
      this.reachThen("Notes. Tournament brackets.");
      return;
    }
    if (near(this.player, this.layout.shelves, 6)) {
      this.reachThen(hasChomp() ? "Folders. Empty wrapper." : "Folders. Dust.");
      return;
    }
    this.pal.tryTalk();
  }

  private findChomp(): void {
    takeChomp();
    this.paint();
    this.bagUi?.sync();
    this.reachThen([foundItem("chomp"), choke("Hey. That's mine.")]);
  }

  private playRudeLeave(): void {
    this.rude = "walk";
    this.player.body.setVelocity(0, 0);
    this.player.body.setEnable(false);
    this.player.setCollideWorldBounds(false);
    this.facing = "down";
    this.player.anims.play(kidAnim(run.outfit, "walk-down"), true);
    this.tweens.add({
      targets: this.player,
      y: 176,
      duration: 760,
      ease: "Linear",
      onComplete: () => {
        this.rude = "line";
        this.showNote(choke("Rude."));
      },
    });
  }

  private talkChoke(): void {
    if (hasChomp() && !run.chompKept) {
      run.chompKept = true;
      this.reachThen([choke("Oh OK you can keep it."), choke("Pompeymon love them.")]);
      return;
    }
    if (run.starter) {
      const extra = palAside("lab-choke");
      if (partyNeedsHeal()) {
        healParty();
        this.reachThen(extra ? [...PATCH, extra] : PATCH);
        return;
      }
      this.reachThen(
        extra ? [choke("Kebab boxes. Throw 'em. That's catching."), extra] : choke("Kebab boxes. Throw 'em. That's catching."),
      );
      return;
    }
    if (run.refusedStarters) {
      this.reachThen(
        choke("That one's rooting around in the bin. Rougher than Fratton Wetherspoons."),
      );
      return;
    }
    this.offerMenu = true;
    this.showNote(INTRO);
  }

  private lookBin(): void {
    if (run.starter) {
      this.reachThen("Bin. Don't.");
      return;
    }
    if (!run.refusedStarters) {
      this.reachThen("Bin. Smells of kebab.");
      return;
    }
    takeStarter("donerrat");
    this.paint();
    this.bagUi?.sync();
    this.showNote([choke(TAKE.donerrat), ...AFTER_TAKE]);
  }

  private picked(id: StarterId | "none"): void {
    if (id === "none") {
      run.refusedStarters = true;
      this.paint();
      this.showNote([
        choke("Well there's that one rooting around in the bin,"),
        choke("but be careful, it's rougher than Fratton Wetherspoons."),
      ]);
      return;
    }
    takeStarter(id);
    this.paint();
    this.bagUi?.sync();
    this.showNote([choke(TAKE[id]), ...AFTER_TAKE]);
  }

  private paint(): void {
    if (this.textures.exists("lab")) this.textures.remove("lab");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawLab(art);
    art.generateTexture("lab", GBA_W, GBA_H);
    art.destroy();
    if (this.room) this.room.destroy();
    this.room = this.add.image(0, 0, "lab").setOrigin(0).setDepth(0);
    this.placeLabMons();
  }

  private placeLabMons(): void {
    this.tableMons.forEach((s) => s.destroy());
    this.tableMons = [];
    ensureMonSheets(this);
    if (run.starter) return;
    const placed: { id: StarterId; x: number; y: number }[] = run.refusedStarters
      ? [{ id: "donerrat", x: 44, y: 122 }]
      : [
          { id: "scabfox", x: 105, y: 76 },
          { id: "chipgull", x: 123, y: 76 },
          { id: "moggit", x: 141, y: 76 },
        ];
    for (const spec of placed) {
      const s = this.add.sprite(spec.x, spec.y, monOwSheet(spec.id), "idle-down");
      s.setOrigin(0.5, 1);
      s.setDepth(3);
      s.play(monOwAnim(spec.id, "idle-down"));
      this.tableMons.push(s);
    }
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
