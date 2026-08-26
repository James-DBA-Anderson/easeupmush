import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { STARTER_LV } from "../battle";
import { syncBagChrome, takeStarter, run } from "../run";
import { SPECIES } from "../species";
import { MON_IDS, ensureMonSheets, monBattleKey } from "../sprites/mon";
import { consumeAction, consumeCancel, consumeDir } from "../touch";
import { clearDebugLeaveLock, setDebugSession } from "../ui/debugBack";
import {
  BRIDGE_NPCS,
  HIGH_STREET_NPCS,
  ISLAND_NPCS,
  ROUNDABOUT_NPCS,
  SCHOOL_IN_NPCS,
  SCHOOL_NPCS,
  type NpcSpec,
} from "../world/npcs";

type DebugArea = {
  label: string;
  scene: string;
  data?: object;
  starter?: boolean;
  steveGone?: boolean;
};

const AREAS: DebugArea[] = [
  { label: "BEDROOM", scene: "bedroom" },
  { label: "LANDING", scene: "landing", data: { from: "bedroom" } },
  { label: "BATHROOM", scene: "bathroom" },
  { label: "HALL", scene: "hall", data: { from: "landing" } },
  { label: "KITCHEN", scene: "kitchen" },
  { label: "FRONT ROOM", scene: "frontroom" },
  { label: "2ND AVENUE", scene: "avenue", data: { from: "hall" } },
  { label: "ROUNDABOUT", scene: "roundabout", data: { from: "avenue" }, steveGone: true, starter: true },
  { label: "HILL", scene: "hill", starter: true },
  { label: "BRIDGE", scene: "bridge", starter: true },
  { label: "HIGH STREET", scene: "highstreet", data: { from: "roundabout" }, starter: true, steveGone: true },
  { label: "LAB", scene: "lab", starter: true, steveGone: true },
  { label: "BIKE SHOP", scene: "bikeshop", data: { from: "highstreet" }, starter: true, steveGone: true },
  { label: "CHARITY", scene: "junkshop", data: { kind: "charity", from: "highstreet" }, starter: true, steveGone: true },
  { label: "PAWN", scene: "junkshop", data: { kind: "pawn", from: "highstreet" }, starter: true, steveGone: true },
  { label: "CHIPPY", scene: "takeaway", data: { kind: "chippy", from: "highstreet" }, starter: true, steveGone: true },
  { label: "HILSEA", scene: "island", starter: true, steveGone: true, data: { from: "debug" } },
  { label: "SCHOOL", scene: "school", starter: true, steveGone: true },
  { label: "SCHOOL IN", scene: "schoolin", starter: true, steveGone: true },
];

const DEBUG_TRAINERS: NpcSpec[] = [
  ...HIGH_STREET_NPCS,
  ...ROUNDABOUT_NPCS,
  ...BRIDGE_NPCS,
  ...ISLAND_NPCS,
  ...SCHOOL_NPCS,
  ...SCHOOL_IN_NPCS,
].filter((n) => n.trainer);

export class DebugScene extends Phaser.Scene {
  private cursor = 0;
  private mode: "area" | "battle" = "area";
  private areaTexts: Phaser.GameObjects.Text[] = [];
  private monTexts: Phaser.GameObjects.Text[] = [];
  private preview?: Phaser.GameObjects.Image;
  private keyUp?: Phaser.Input.Keyboard.Key;
  private keyDown?: Phaser.Input.Keyboard.Key;
  private keyLeft?: Phaser.Input.Keyboard.Key;
  private keyRight?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyEnter?: Phaser.Input.Keyboard.Key;
  private keyEsc?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  /** Ignore leftover click/tap from leaving a battle. */
  private inputArmed = false;

  constructor() {
    super("debug");
  }

  create(): void {
    clearDebugLeaveLock();
    setDebugSession(false);
    this.inputArmed = false;
    this.cursor = 0;
    this.mode = "area";
    // Scene instance is reused — drop stale refs to Text objects destroyed on shutdown.
    this.areaTexts = [];
    this.monTexts = [];
    this.preview = undefined;
    consumeAction();
    consumeCancel();
    consumeDir("up");
    consumeDir("down");
    consumeDir("left");
    consumeDir("right");
    this.paintBg();
    ensureMonSheets(this);
    this.bindKeys();

    this.add
      .text(8, 8, "DEBUG", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setDepth(2);

    this.add
      .text(8, 22, "LEFT / RIGHT SWITCH", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#d8e8f0",
      })
      .setDepth(2);
    this.add
      .text(8, 32, "UP / DOWN PICK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#d8e8f0",
      })
      .setDepth(2);
    this.add
      .text(8, 42, "SPACE LAUNCH  ESC TITLE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#d8e8f0",
      })
      .setDepth(2);

    this.addPanel(6, 58, 108, 94, "AREAS");
    this.addPanel(126, 58, 108, 94, "BATTLES");

    AREAS.forEach((area, i) => {
      const text = this.add
        .text(12, 72, area.label, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: "#b8c8d8",
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          if (!this.inputArmed) return;
          this.mode = "area";
          this.cursor = i;
          this.refresh();
          this.launchArea();
        });
      this.areaTexts.push(text);
    });

    MON_IDS.forEach((id, i) => {
      const text = this.add
        .text(132, 72, SPECIES[id].name, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: "#b8c8d8",
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          if (!this.inputArmed) return;
          this.mode = "battle";
          this.cursor = i;
          this.refresh();
          this.launchBattle();
        });
      this.monTexts.push(text);
    });

    this.preview = this.add.image(214, 54, monBattleKey(MON_IDS[0])).setOrigin(0.5, 1);

    this.refresh();

    // Arm after the click that brought us here is fully released.
    this.input.once("pointerup", () => {
      this.time.delayedCall(80, () => {
        this.inputArmed = true;
      });
    });
    this.time.delayedCall(400, () => {
      this.inputArmed = true;
    });
  }

  update(): void {
    if (!this.inputArmed) {
      consumeAction();
      consumeCancel();
      consumeDir("up");
      consumeDir("down");
      consumeDir("left");
      consumeDir("right");
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyLeft!) || consumeDir("left")) {
      this.mode = "area";
      this.cursor = Math.min(this.cursor, AREAS.length - 1);
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyRight!) || consumeDir("right")) {
      this.mode = "battle";
      this.cursor = Math.min(this.cursor, MON_IDS.length - 1);
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyUp!) || consumeDir("up")) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyDown!) || consumeDir("down")) {
      const max = this.mode === "area" ? AREAS.length - 1 : MON_IDS.length - 1;
      this.cursor = Math.min(max, this.cursor + 1);
      this.refresh();
    }

    const launch =
      Phaser.Input.Keyboard.JustDown(this.keySpace!) ||
      Phaser.Input.Keyboard.JustDown(this.keyEnter!) ||
      consumeAction();
    if (launch) {
      if (this.mode === "area") this.launchArea();
      else this.launchBattle();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.keyEsc!) ||
      Phaser.Input.Keyboard.JustDown(this.keyD!) ||
      consumeCancel()
    ) {
      this.scene.start("title");
    }
  }

  private bindKeys(): void {
    const kb = this.input.keyboard!;
    this.keyUp = kb.addKey("UP");
    this.keyDown = kb.addKey("DOWN");
    this.keyLeft = kb.addKey("LEFT");
    this.keyRight = kb.addKey("RIGHT");
    this.keySpace = kb.addKey("SPACE");
    this.keyEnter = kb.addKey("ENTER");
    this.keyEsc = kb.addKey("ESC");
    this.keyD = kb.addKey("D");
  }

  private paintBg(): void {
    const g = this.add.graphics();
    g.fillStyle(0x102030, 1);
    g.fillRect(0, 0, GBA_W, GBA_H);
    g.fillStyle(0x183848, 1);
    g.fillRect(0, 0, GBA_W, 52);
    g.fillStyle(0x142c38, 1);
    g.fillRect(0, 52, GBA_W, GBA_H - 52);
  }

  private addPanel(x: number, y: number, w: number, h: number, title: string): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a1814, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0xf0a23a, 1);
    g.strokeRect(x, y, w, h);
    this.add.text(x + 6, y + 4, title, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f0a23a",
    });
  }

  private refresh(): void {
    const areaTop = Math.max(0, Math.min(this.cursor - 7, AREAS.length - 8));
    this.areaTexts.forEach((text, i) => {
      const active = this.mode === "area" && this.cursor === i;
      const row = i - areaTop;
      text.setVisible(row >= 0 && row < 8);
      if (row >= 0 && row < 8) text.setPosition(12, 72 + row * 10);
      text.setColor(active ? "#f8f0d8" : "#9cb0c0");
      text.setText(`${active ? ">" : " "} ${AREAS[i].label}`);
    });
    const monTop = Math.max(0, Math.min(this.cursor - 7, MON_IDS.length - 8));
    this.monTexts.forEach((text, i) => {
      const active = this.mode === "battle" && this.cursor === i;
      const row = i - monTop;
      text.setVisible(row >= 0 && row < 8);
      if (row >= 0 && row < 8) text.setPosition(132, 72 + row * 10);
      text.setColor(active ? "#f8f0d8" : "#9cb0c0");
      text.setText(`${active ? ">" : " "} ${SPECIES[MON_IDS[i]].name}`);
    });

    const mon = MON_IDS[this.mode === "battle" ? this.cursor : 0];
    this.preview?.setTexture(monBattleKey(mon));
  }

  private resetRun(): void {
    run.outfit = "jumper";
    run.dressed = true;
    run.hasBag = true;
    run.items = [];
    run.steveGone = false;
    run.flyerOnRoad = false;
    run.starter = null;
    run.refusedStarters = false;
    run.seen = [];
    run.owned = [];
    run.party = [];
    run.lead = 0;
    run.islandPos = null;
    run.overworld = null;
    run.field = null;
    run.wildKey = null;
    run.wildGone = false;
    run.beaten = [];
    run.grassCalm = 0;
    run.kebabBoxes = 0;
    run.kebabCatch = false;
    run.empties = 0;
    run.whiteout = false;
    run.chompKept = false;
    run.hillNanGone = false;
    run.lockChored = false;
    run.mumRentPaid = false;
    run.palJoined = false;
    run.palWon = false;
    run.palGreeted = false;
    run.cash = 200;
    run.mounted = false;
    run.parked = null;
    run.plasters = 0;
    run.stale = 0;
    run.curry = 0;
    run.doner = 0;
    run.chips = 0;
    run.fish = 0;
    syncBagChrome();
  }

  private seedStarter(): void {
    takeStarter("scabfox");
  }

  private launchArea(): void {
    const area = AREAS[this.cursor];
    this.resetRun();
    if (area.starter) this.seedStarter();
    if (area.steveGone) run.steveGone = true;
    setDebugSession(true);
    this.scene.start(area.scene, area.data);
  }

  private launchBattle(): void {
    const mon = MON_IDS[this.cursor];
    this.resetRun();
    this.seedStarter();
    run.steveGone = true;
    setDebugSession(true);
    const places = ["island", "school", "highstreet", "roundabout", "bridge"];
    const place = places[Math.floor(Math.random() * places.length)];
    run.overworld = { scene: place, x: 120, y: 80 };
    const npc = DEBUG_TRAINERS[Math.floor(Math.random() * DEBUG_TRAINERS.length)];
    const t = npc.trainer!;
    this.scene.start("encounter", {
      trainer: {
        id: `debug-${npc.id}`,
        title: t.title,
        mon,
        lv: STARTER_LV,
        challenge: t.challenge,
        win: t.win,
        look: npc.look,
        who: npc.name,
      },
    });
  }
}
