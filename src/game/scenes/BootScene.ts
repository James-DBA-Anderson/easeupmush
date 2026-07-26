import Phaser from "phaser";
import { generateDoodleTextures } from "../assets/doodleTextures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    generateDoodleTextures(this);

    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x1a1410).setOrigin(0);

    // Preview doodle sprites on the title
    this.add.image(width / 2 - 80, height / 2 + 100, "player_idle").setOrigin(0.5, 1);
    this.add.image(width / 2 + 80, height / 2 + 100, "enemy_angry").setOrigin(0.5, 1).setFlipX(true);
    this.add.image(width / 2, height / 2 + 100, "police_idle").setOrigin(0.5, 1).setScale(0.9);

    this.add
      .text(width / 2, height / 2 - 48, "POMPEY PUNCH-UP", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "42px",
        color: "#f2e6d8",
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 12, "click / press any key — wake up on the beach", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "18px",
        color: "#c4a882",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.keyboard?.once("keydown", () => this.startBeach());
    this.input.once("pointerdown", () => this.startBeach());
  }

  private startBeach() {
    this.scene.start("BeachScene");
  }
}
