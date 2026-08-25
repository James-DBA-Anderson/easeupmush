import Phaser from "phaser";

export const HP_PLATE_W = 128;
const PLATE_H = 24;
const BAR_W = 76;

/** FireRed-style name + Lv + HP strip. Stamina pips on the HP row. */
export class HpPlate {
  private bar: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private lvText: Phaser.GameObjects.Text;
  private hp = 0;
  private max = 1;
  private sta = 3;
  private staMax = 3;
  private teamN = 0;
  private teamLeft = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    name: string,
    max: number,
    lv: number,
  ) {
    this.max = max;
    this.hp = max;
    const plate = scene.add.rectangle(x + HP_PLATE_W / 2, y + PLATE_H / 2, HP_PLATE_W, PLATE_H, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);
    plate.setScrollFactor(0);
    plate.setDepth(20);
    this.nameText = scene.add
      .text(x + 6, y + 3, name, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      })
      .setDepth(21)
      .setScrollFactor(0);
    this.lvText = scene.add
      .text(x + HP_PLATE_W - 5, y + 3, `Lv${lv}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#c8e0a8",
      })
      .setOrigin(1, 0)
      .setDepth(21)
      .setScrollFactor(0);
    this.bar = scene.add.graphics().setDepth(21).setScrollFactor(0);
    this.paint();
  }

  setHp(hp: number): void {
    this.hp = Math.max(0, hp);
    this.paint();
  }

  setSta(sta: number, max = this.staMax): void {
    this.staMax = max;
    this.sta = Math.max(0, Math.min(max, sta));
    this.paint();
  }

  setTeam(total: number, left: number): void {
    this.teamN = Math.max(0, total);
    this.teamLeft = Math.max(0, Math.min(this.teamN, left));
    this.paint();
  }

  setMon(name: string, max: number, lv: number, hp: number, sta: number, staMax: number): void {
    this.max = max;
    this.nameText.setText(name);
    this.lvText.setText(`Lv${lv}`);
    this.lvText.setPosition(this.x + HP_PLATE_W - 5, this.y + 3);
    this.setHp(hp);
    this.setSta(sta, staMax);
  }

  private paint(): void {
    const ratio = this.max <= 0 ? 0 : this.hp / this.max;
    const w = Math.max(0, Math.floor(BAR_W * ratio));
    const color = ratio > 0.5 ? 0x48b048 : ratio > 0.2 ? 0xe0b030 : 0xd04030;
    this.bar.clear();
    this.bar.fillStyle(0x2a2820, 1);
    this.bar.fillRect(this.x + 6, this.y + 14, BAR_W, 4);
    this.bar.fillStyle(color, 1);
    this.bar.fillRect(this.x + 6, this.y + 14, w, 4);
    const pipX = this.x + 86;
    const pipY = this.y + 14;
    for (let i = 0; i < this.staMax; i += 1) {
      const x = pipX + i * 8;
      this.bar.fillStyle(0x2a2820, 1);
      this.bar.fillRect(x, pipY, 6, 4);
      this.bar.fillStyle(i < this.sta ? 0x48a0d8 : 0x3a3830, 1);
      this.bar.fillRect(x, pipY, 6, 4);
    }
    this.paintTeam();
  }

  private paintTeam(): void {
    if (this.teamN <= 0) return;
    const y = this.y + PLATE_H + 2;
    for (let i = 0; i < this.teamN; i += 1) {
      const x = this.x + 6 + i * 10;
      const live = i < this.teamLeft;
      this.bar.fillStyle(0x1a1814, 1);
      this.bar.fillRect(x, y, 8, 8);
      this.bar.fillStyle(live ? 0xf0a23a : 0x3a3830, 1);
      this.bar.fillRect(x + 1, y + 1, 6, 6);
      this.bar.fillStyle(0x1a1814, 1);
      this.bar.fillRect(x + 1, y + 3, 6, 1);
      this.bar.fillStyle(live ? 0xf8f0e0 : 0x5a5850, 1);
      this.bar.fillRect(x + 2, y + 2, 2, 1);
    }
  }
}
