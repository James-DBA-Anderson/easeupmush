import Phaser from "phaser";
import { applyHit, BATTLE, canRun, doDefend, doDodge, makeBattler, rollCounter, rollDamage, rollDodge, rollHit, spendFight, STARTER_LV, tryCatch, xpForKo, type Battler } from "../battle";
import { GBA_H, GBA_W } from "../constants";
import { applyXp, battleBagEntries, beatTrainer, catchSpecies, ITEM, partnerMon, run, seeSpecies, useHealItem, useKebabBox, type BagEntry } from "../run";
import { SPECIES, type SpeciesId } from "../species";
import { ensureMonSheets, monBattleKey } from "../sprites/mon";
import { CatchMenu } from "../ui/CatchMenu";
import { BagMenu } from "../ui/BagUi";
import { HpPlate } from "../ui/HpPlate";
import { MsgBox, type Line } from "../ui/MsgBox";
import { justAction, justCancel, bindWalkKeys, type WalkKeys } from "../walk";

export type TrainerBattle = {
  id: string;
  title: string;
  mon: SpeciesId;
  lv: number;
  challenge: string;
  win: string;
  who: string;
};

type AfterText = "menu" | "foe" | "next" | "done" | "counter";

export class EncounterScene extends Phaser.Scene {
  private foeId!: SpeciesId;
  private foeLv = 4;
  private trainer?: TrainerBattle;
  private me!: Battler;
  private foe!: Battler;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private note?: MsgBox;
  private menu?: CatchMenu;
  private bag?: BagMenu;
  private meBar?: HpPlate;
  private foeBar?: HpPlate;
  private meSpr?: Phaser.GameObjects.Image;
  private foeSpr?: Phaser.GameObjects.Image;
  private done = false;
  private after: AfterText = "menu";
  private acts: Array<{ who: "me" | "foe"; kind: "fight" | "defend" }> = [];

  constructor() {
    super("encounter");
  }

  init(data: { wild?: SpeciesId; lv?: number; trainer?: TrainerBattle }): void {
    this.trainer = data.trainer;
    this.foeId = data.trainer?.mon ?? data.wild ?? "pidgeon";
    this.foeLv = data.trainer?.lv ?? data.lv ?? 4;
  }

  create(): void {
    this.done = false;
    this.after = "menu";
    const partner = partnerMon();
    const partnerId = partner?.id ?? run.starter ?? "scabfox";
    this.me = makeBattler(partnerId, partner?.lv ?? STARTER_LV, partner?.hp);
    this.foe = makeBattler(this.foeId, this.foeLv);
    seeSpecies(this.foeId);
    seeSpecies(partnerId);

    const g = this.add.graphics();
    g.fillStyle(0x183028, 1);
    g.fillRect(0, 0, GBA_W, GBA_H);
    g.fillStyle(0x2a4a38, 1);
    g.fillRect(0, 96, GBA_W, 64);
    g.fillStyle(0x3a6a48, 1);
    g.fillEllipse(168, 88, 90, 28);
    g.fillEllipse(56, 124, 70, 22);

    ensureMonSheets(this);
    this.foeSpr = this.add.image(168, 86, monBattleKey(this.foeId)).setScale(2).setOrigin(0.5, 1);
    this.meSpr = this.add.image(56, 132, monBattleKey(partnerId)).setScale(1.5).setOrigin(0.5, 1);
    this.tweens.add({
      targets: this.foeSpr,
      y: 84,
      duration: 640,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.foeBar = new HpPlate(this, 128, 8, this.foe.name, this.foe.max, this.foe.lv);
    this.foeBar.setSta(this.foe.sta, this.foe.staMax);
    this.meBar = new HpPlate(this, 8, 88, this.me.name, this.me.max, this.me.lv);
    this.meBar.setSta(this.me.sta, this.me.staMax);

    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.menu = new CatchMenu(this, { onPick: (opt) => this.picked(opt) }, !this.trainer);
    this.bag = new BagMenu(this, { onPick: (entry) => this.useBag(entry) }, true);

    if (this.trainer) {
      const who = this.trainer.who;
      this.say(
        [
          { who, text: `${this.trainer.title} wants to fight!` },
          { who, text: this.trainer.challenge },
        ],
        "menu",
      );
    } else {
      this.say(`Wild ${SPECIES[this.foeId].name}!`, "menu");
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);
    if (this.done) {
      if (this.note?.open && confirm) {
        this.note.advance();
        if (!this.note.open) this.goBack();
      }
      return;
    }
    if (this.bag?.active) {
      this.bag.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel);
      if (!this.bag.active && !this.note?.open) this.menu?.show();
      return;
    }
    if (this.menu?.active) {
      this.menu.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel);
      return;
    }
    if (this.note?.open) {
      if (confirm) this.note.advance();
      if (!this.note.open) this.afterText();
    }
  }

  private say(text: Line | Line[], after: AfterText): void {
    this.menu?.hide();
    this.after = after;
    this.note?.show(text);
  }

  private afterText(): void {
    if (this.after === "menu") this.showMenu();
    else if (this.after === "foe") this.foeStrike();
    else if (this.after === "next") this.nextAct();
    else if (this.after === "counter") this.counterHit();
    else this.finishLeave();
  }

  private showMenu(): void {
    this.me.guard = false;
    this.foe.guard = false;
    this.me.dodging = false;
    this.foe.dodging = false;
    this.menu?.show();
  }

  private picked(opt: "fight" | "bag" | "defend" | "dodge" | "catch" | "run"): void {
    if (opt === "fight") this.startFight();
    else if (opt === "defend") this.startDefend();
    else if (opt === "dodge") this.startDodge();
    else if (opt === "bag") this.openBag();
    else if (opt === "catch") this.tryBall();
    else this.flee();
  }

  private openBag(): void {
    if (battleBagEntries().length === 0) {
      this.say("No items.", "menu");
      return;
    }
    this.menu?.hide();
    this.bag?.show();
  }

  private useBag(entry: BagEntry): void {
    if (entry.kind !== "item") {
      this.menu?.show();
      return;
    }
    if (this.me.hp >= this.me.max) {
      this.say("HP's full.", "menu");
      return;
    }
    const got = useHealItem(entry.id, this.me.hp, this.me.max);
    if (got <= 0) {
      this.say("Can't use that.", "menu");
      return;
    }
    this.me.hp += got;
    this.meBar?.setHp(this.me.hp);
    this.storeHp();
    this.say([`You gave it a ${ITEM[entry.id].label}.`, `${this.me.name} recovered ${got} HP.`], "foe");
  }

  private startFight(): void {
    if (!spendFight(this.me)) {
      this.say("Too tired. Defend.", "menu");
      return;
    }
    this.meBar?.setSta(this.me.sta, this.me.staMax);
    this.queueRound("fight");
  }

  private startDefend(): void {
    doDefend(this.me);
    this.meBar?.setSta(this.me.sta, this.me.staMax);
    this.queueRound("defend");
  }

  private startDodge(): void {
    doDodge(this.me);
    const theirs = this.planFoe();
    if (theirs === "defend") {
      this.say([`${this.me.name} waits to dodge.`, `Foe ${this.foe.name} is defending.`], "menu");
      return;
    }
    this.acts = [{ who: "foe", kind: "fight" }];
    this.say(`${this.me.name} waits to dodge.`, "next");
  }

  private planFoe(): "fight" | "defend" {
    const worn = this.foe.sta < this.foe.staMax && Math.random() < 0.22;
    if (this.foe.sta < 1 || worn) {
      doDefend(this.foe);
      this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
      return "defend";
    }
    spendFight(this.foe);
    this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
    return "fight";
  }

  private queueRound(mine: "fight" | "defend"): void {
    const theirs = this.planFoe();
    const me = { who: "me" as const, kind: mine };
    const foe = { who: "foe" as const, kind: theirs };
    this.acts = this.me.spd >= this.foe.spd ? [me, foe] : [foe, me];
    this.nextAct();
  }

  private nextAct(): void {
    const act = this.acts.shift();
    if (!act) {
      this.showMenu();
      return;
    }
    if (act.who === "me" && act.kind === "defend") {
      this.say(`${this.me.name} is defending.`, this.acts.length ? "next" : "menu");
      return;
    }
    if (act.who === "foe" && act.kind === "defend") {
      this.say(`Foe ${this.foe.name} is defending.`, this.acts.length ? "next" : "menu");
      return;
    }
    if (act.who === "me") this.hitMe();
    else this.foeStrike();
  }

  private hitLine(who: string, move: string, dmg: number, guarded: boolean): string {
    return guarded ? `${who} used ${move}! ${dmg}. Held.` : `${who} used ${move}! ${dmg}.`;
  }

  private hitMe(): void {
    const guarded = this.foe.guard;
    if (!rollHit(this.me, this.foe)) {
      this.say([`${this.me.name} used ${this.me.move.name}!`, "It missed."], this.acts.length ? "next" : "menu");
      return;
    }
    const dmg = applyHit(this.foe, rollDamage(this.me, this.foe));
    this.foeBar?.setHp(this.foe.hp);
    this.flash(this.foeSpr);
    if (this.foe.hp <= 0) {
      this.done = true;
      this.storeHp();
      const lines: Line[] = [this.hitLine(this.me.name, this.me.move.name, dmg, guarded), `Foe ${this.foe.name} fainted.`];
      if (this.trainer) {
        beatTrainer(this.trainer.id);
        lines.push("You won.", { who: this.trainer.who, text: this.trainer.win });
      }
      lines.push(...this.grantXp());
      this.say(lines, "done");
      return;
    }
    this.say(this.hitLine(this.me.name, this.me.move.name, dmg, guarded), this.acts.length ? "next" : "menu");
  }

  private foeStrike(): void {
    const move = this.foe.move.name;
    if (this.me.dodging) {
      if (rollDodge(this.me, this.foe)) {
        const lines: Line[] = [`Foe ${this.foe.name} used ${move}!`, `${this.me.name} dodged!`];
        if (rollCounter(this.me, this.foe)) {
          lines.push(`${this.me.name} strikes back!`);
          this.say(lines, "counter");
        } else {
          this.say(lines, this.acts.length ? "next" : "menu");
        }
        return;
      }
      const dmg = applyHit(this.me, rollDamage(this.foe, this.me));
      this.meBar?.setHp(this.me.hp);
      this.flash(this.meSpr);
      if (this.me.hp <= 0) {
        this.done = true;
        this.storeHp();
        run.whiteout = true;
        this.say([`Foe ${this.foe.name} used ${move}!`, `${this.me.name} couldn't dodge.`, `${this.me.name} fainted.`, "You blacked out."], "done");
        return;
      }
      this.say(
        [`Foe ${this.foe.name} used ${move}!`, `${this.me.name} couldn't dodge.`, this.hitLine(`Foe ${this.foe.name}`, move, dmg, false)],
        this.acts.length ? "next" : "menu",
      );
      return;
    }
    const guarded = this.me.guard;
    if (!rollHit(this.foe, this.me)) {
      this.say([`Foe ${this.foe.name} used ${move}!`, "It missed."], this.acts.length ? "next" : "menu");
      return;
    }
    const dmg = applyHit(this.me, rollDamage(this.foe, this.me));
    this.meBar?.setHp(this.me.hp);
    this.flash(this.meSpr);
    if (this.me.hp <= 0) {
      this.done = true;
      this.storeHp();
      run.whiteout = true;
      this.say([`${this.me.name} fainted.`, "You blacked out."], "done");
      return;
    }
    this.say(this.hitLine(`Foe ${this.foe.name}`, move, dmg, guarded), this.acts.length ? "next" : "menu");
  }

  private counterHit(): void {
    const guarded = this.foe.guard;
    const dmg = applyHit(this.foe, rollDamage(this.me, this.foe));
    this.foeBar?.setHp(this.foe.hp);
    this.flash(this.foeSpr);
    if (this.foe.hp <= 0) {
      this.done = true;
      this.storeHp();
      const lines: Line[] = [this.hitLine(this.me.name, this.me.move.name, dmg, guarded), `Foe ${this.foe.name} fainted.`];
      if (this.trainer) {
        beatTrainer(this.trainer.id);
        lines.push("You won.", { who: this.trainer.who, text: this.trainer.win });
      }
      lines.push(...this.grantXp());
      this.say(lines, "done");
      return;
    }
    this.say(this.hitLine(this.me.name, this.me.move.name, dmg, guarded), this.acts.length ? "next" : "menu");
  }

  private tryBall(): void {
    if (this.trainer) {
      this.say("That's someone else's.", "menu");
      return;
    }
    if (this.foe.hp >= this.foe.max) {
      this.say("Too lively. Weaken it first.", "menu");
      return;
    }
    if (!useKebabBox()) {
      this.say("No kebab boxes.", "menu");
      return;
    }
    if (tryCatch(this.foe)) {
      const again = !catchSpecies(this.foeId, this.foe.lv);
      this.done = true;
      this.storeHp();
      const lines: Line[] = [
        "You put down a kebab box.",
        "The smell got it. It crawled in.",
        "You snapped the box shut.",
      ];
      if (!run.kebabCatch) {
        run.kebabCatch = true;
        lines.push({ who: "YOU", text: "Wow it actually worked." });
      }
      lines.push(again ? `Gotcha. ${this.foe.name} again.` : `Gotcha. ${this.foe.name}.`);
      this.say(lines, "done");
      return;
    }
    this.say(["You put down a kebab box.", "It sniffed. Not interested."], "foe");
  }

  private flee(): void {
    if (this.trainer) {
      this.say("No running from a trainer.", "menu");
      return;
    }
    if (canRun(this.me, this.foe)) {
      this.done = true;
      this.storeHp();
      this.say("Got away.", "done");
      return;
    }
    this.say("Can't run!", "foe");
  }

  private grantXp(): string[] {
    const mine = partnerMon();
    if (!mine) return [];
    const gained = xpForKo(this.foe.lv, BATTLE[this.foe.id].exp, !!this.trainer);
    const grew = applyXp(mine, gained);
    return [`${this.me.name} gained ${gained} XP.`, ...grew];
  }

  private storeHp(): void {
    const mine = partnerMon();
    if (mine) mine.hp = this.me.hp;
  }

  private flash(spr?: Phaser.GameObjects.Image): void {
    if (!spr) return;
    this.tweens.add({
      targets: spr,
      alpha: 0.2,
      duration: 70,
      yoyo: true,
      repeat: 2,
    });
  }

  private finishLeave(): void {
    this.goBack();
  }

  private goBack(): void {
    if (run.whiteout) {
      run.overworld = null;
      this.scene.start("lab");
      return;
    }
    this.scene.start(run.overworld?.scene ?? "island");
  }
}
