import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { hasFlyer, run, takeFlyer } from "../run";
import { kidAnim } from "../sprites/kid";
import { ensureSteve, steveRideAnim, steveSheet } from "../sprites/steve";
import { MsgBox, type Line } from "../ui/MsgBox";
import { BagUi } from "../ui/BagUi";
import {
  addWalls,
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
import { isTouchUi } from "../touch";
import { drawAvenue, type AvenueLayout } from "../world/drawAvenue";
import { BikeField } from "../world/bike";
import { PalField } from "../world/pal";

const STEVE_CHAT: Line[] = [
  { who: "STEVE", text: "Alright mush. New bike. Cushty init." },
  { who: "STEVE", text: "Your mum aint got the dosh for one. Beard." },
  { who: "STEVE", text: "I'm off. Gonna be the Pompeymon master." },
  { who: "YOU", text: "…Pompeymon? What you on about?" },
  { who: "STEVE", text: "The fings. On the paper. You wouldn't get it." },
];

function ensureFlyer(scene: Phaser.Scene): void {
  if (scene.textures.exists("flyer")) return;
  const g = scene.add.graphics().setVisible(false);
  g.fillStyle(0xf0e8b0, 1);
  g.fillRect(0, 0, 12, 8);
  g.lineStyle(1, 0xc8b848, 1);
  g.strokeRect(0, 0, 12, 8);
  g.fillStyle(0x201c18, 1);
  g.fillRect(2, 2, 8, 1);
  g.fillRect(2, 4, 6, 1);
  g.fillRect(2, 6, 7, 1);
  g.generateTexture("flyer", 12, 8);
  g.destroy();
}

export class AvenueScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: AvenueLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "down";
  private flip = 1;
  private reaching = false;
  private from = "hall";
  private steve?: Phaser.GameObjects.Sprite;
  private shout?: Phaser.GameObjects.Text;
  private flyerSpr?: Phaser.GameObjects.Image;
  private pendingRide = false;
  private riding = false;
  private bikes!: BikeField;
  private pal!: PalField;

  constructor() {
    super("avenue");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "hall";
  }

  create(): void {
    if (this.textures.exists("avenue")) this.textures.remove("avenue");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawAvenue(art);
    art.generateTexture("avenue", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "avenue").setOrigin(0);

    ensureSteve(this);
    ensureFlyer(this);
    if (!run.steveGone) {
      this.steve = this.add
        .sprite(this.layout.steve.x + 12, this.layout.steve.y + 20, steveSheet(), "idle")
        .setOrigin(0.5, 1)
        .setDepth(9);
      this.steve.setFlipX(true);
    }

    if (run.flyerOnRoad && !hasFlyer()) this.placeFlyer();

    if (this.from === "roundabout") {
      this.facing = "side";
      this.flip = -1;
      this.player = spawnKid(this, this.layout.spawnFromEast.x, this.layout.spawnFromEast.y);
      this.player.setFlipX(true);
    } else {
      this.facing = "down";
      this.flip = 1;
      this.player = spawnKid(this, this.layout.spawnFromHall.x, this.layout.spawnFromHall.y);
    }
    const walls = this.layout.solids.filter((s) => s !== this.layout.steve);
    addWalls(this, this.player, walls);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.bikes = new BikeField(this, this.player, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.riding && !hasFlyer()) run.flyerOnRoad = true;
    });

    if (this.from === "hall" && !run.steveGone) this.meetSteve();

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.busy) return;
        if (!this.reaching && !this.riding) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.pendingRide) {
      this.pendingRide = false;
      this.rideOff();
    }

    const walked = tickWalk(this.player, this.cursors, this.wasd, this.facing, this.flip);
    this.facing = walked.facing;
    this.flip = walked.flip;
    this.bikes.tick(this.facing);
    this.pal.tick(this.facing, this.flip);

    if (walkingInto(this.player, this.layout.homeDoor, "left")) {
      this.bikes.stashIndoor();
      this.scene.start("hall", { from: "avenue" });
      return;
    }

    if (this.player.x < 8 && this.player.y > 118) {
      this.reachThen("Not going up the road yet.");
      this.player.x = 10;
      return;
    }
    if (this.player.x > GBA_W - 8 && this.player.y > 118) {
      if (!run.steveGone) {
        this.player.x = GBA_W - 10;
        this.reachThen("Go see Steve first.");
        return;
      }
      this.scene.start("roundabout", { from: "avenue" });
      return;
    }

    if (cancel && this.bikes.tryBack()) return;
    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    if (run.flyerOnRoad && !hasFlyer() && near(this.player, this.layout.flyer, 12)) {
      takeFlyer();
      this.flyerSpr?.destroy();
      this.flyerSpr = undefined;
      this.bagUi?.sync();
      this.reachThen([
        "Professor Choke's Pompeymon research centre.",
        "New trainers wanted.",
        { who: "YOU", text: "Hmm. What is this?" },
      ]);
      return;
    }
    if (!run.steveGone && !this.riding && this.steve && near(this.player, this.layout.steve, 12)) {
      this.meetSteve();
      return;
    }
    if (near(this.player, this.layout.houses.ne, 8)) {
      this.reachThen(run.steveGone ? "Steve's. He's gone." : "Steve's. Bike's louder than their telly.");
      return;
    }
    if (near(this.player, this.layout.houses.sw, 8) || near(this.player, this.layout.houses.se, 8)) {
      this.reachThen("They're out.");
      return;
    }
    if (near(this.player, this.layout.fence, 8)) {
      this.reachThen("End of 2nd Avenue.");
      return;
    }
    this.pal.tryTalk();
  }

  private meetSteve(): void {
    this.facing = "side";
    this.flip = 1;
    this.player.setFlipX(false);
    this.player.anims.play(kidAnim(run.outfit, "idle-side"), true);
    this.pendingRide = true;
    this.showNote(STEVE_CHAT);
  }

  private rideOff(): void {
    if (!this.steve || this.riding || run.steveGone) return;
    this.riding = true;
    run.steveGone = true;
    const steve = this.steve;
    steve.setFlipX(false);
    steve.play(steveRideAnim());
    this.shout = this.add
      .text(steve.x, steve.y - 22, "Haha. Loser mush.", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#181828",
        backgroundColor: "#f8f0c8",
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.tweens.add({
      targets: steve,
      x: 120,
      y: 136,
      duration: 700,
      ease: "Sine.easeInOut",
      onUpdate: () => this.shout?.setPosition(steve.x, steve.y - 22),
      onComplete: () => {
        this.tweens.add({
          targets: steve,
          x: 280,
          duration: 1500,
          ease: "Linear",
          onUpdate: () => {
            // Subtle road hop on top of the pedal anim
            steve.y = 136 + Math.sin(this.time.now / 70) * 1.5;
            this.shout?.setPosition(steve.x, steve.y - 22);
            if (!run.flyerOnRoad && !hasFlyer() && steve.x > this.layout.flyer.x) {
              run.flyerOnRoad = true;
              this.placeFlyer();
            }
          },
          onComplete: () => {
            this.riding = false;
            steve.destroy();
            this.steve = undefined;
            this.shout?.destroy();
            this.shout = undefined;
          },
        });
      },
    });
  }

  private placeFlyer(): void {
    this.flyerSpr?.destroy();
    this.flyerSpr = this.add
      .image(this.layout.flyer.x + 6, this.layout.flyer.y + 4, "flyer")
      .setDepth(8);
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
