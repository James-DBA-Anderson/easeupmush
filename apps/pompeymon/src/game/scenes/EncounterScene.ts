import Phaser from "phaser";
import { applyHit, BATTLE, canRun, doDefend, doDodge, drainSta, firstActor, makeBattler, pickFoeMove, rollCounter, rollDamage, rollDodge, rollHit, spendChase, spendFight, STARTER_LV, tickPoison, tryCatch, tryPoison, xpForKo, type Battler } from "../battle";
import { isDamaging, type MoveDef } from "../moves";
import { applyXp, beatTrainer, catchSpecies, ITEM, partnerMon, partyAlive, run, seeSpecies, setLead, useHealItem, useKebabBox, type BagEntry, type PartyMon } from "../run";
import { SPECIES, type SpeciesId } from "../species";
import { ensureKidSheets, kidAnim, kidSheet } from "../sprites/kid";
import { ensureMonSheets, monBattleKey } from "../sprites/mon";
import { CatchMenu } from "../ui/CatchMenu";
import { BagMenu } from "../ui/BagUi";
import { paintBattleBg } from "../ui/battleBg";
import {
  actorReact,
  attackLunge,
  attackMiss,
  braceGuard,
  dodgeLean,
  faintDrop,
  hitImpact,
} from "../ui/battleFx";
import { leaveDebugSession, mountDebugBack, inDebugSession } from "../ui/debugBack";
import { HpPlate } from "../ui/HpPlate";
import { MoveMenu } from "../ui/MoveMenu";
import { MsgBox, lineWho, type Line } from "../ui/MsgBox";
import { justAction, justCancel, bindWalkKeys, type WalkKeys } from "../walk";
import { clearField, markWildBeat } from "../world/wander";
import { ensureNpcSheets, npcAnim, npcSheet, type NpcLook } from "../sprites/npc";

const KID_X = 30;
const KID_REST_Y = 192;
const KID_TALK_Y = 76;

export type TrainerBattle = {
  id: string;
  title: string;
  mon: SpeciesId;
  lv: number;
  challenge: string;
  win: string;
  who: string;
  look: NpcLook;
  mate?: {
    who: string;
    look: NpcLook;
    mon: SpeciesId;
    lv: number;
    win: string;
  };
};

type AfterText = "menu" | "foe" | "next" | "done" | "counter" | "bag" | "afterPoison";

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
  private moves?: MoveMenu;
  private bag?: BagMenu;
  private meBar?: HpPlate;
  private foeBar?: HpPlate;
  private meSpr?: Phaser.GameObjects.Image;
  private foeSpr?: Phaser.GameObjects.Image;
  private trainerSpr?: Phaser.GameObjects.Sprite;
  private mateSpr?: Phaser.GameObjects.Sprite;
  private kidSpr?: Phaser.GameObjects.Sprite;
  private kidUp = false;
  private kidGoal = KID_REST_Y;
  private done = false;
  private after: AfterText = "menu";
  private acts: Array<{ who: "me" | "foe"; kind: "fight" | "defend" }> = [];
  private mustSwitch = false;
  private wantPoisonTick = false;
  private foeBob?: Phaser.Tweens.Tween;
  private foeRestY = 100;
  /** 0 = lead trainer's mon; 1 = mate's mon. */
  private foeSlot = 0;

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
    this.mustSwitch = false;
    this.foeSlot = 0;
    const partner = partnerMon();
    const partnerId = partner?.id ?? run.starter ?? "scabfox";
    this.me = makeBattler(partnerId, partner?.lv ?? STARTER_LV, partner?.hp, partner?.moves);
    this.foe = makeBattler(this.foeId, this.foeLv);
    seeSpecies(this.foeId);
    seeSpecies(partnerId);
    if (this.trainer?.mate) seeSpecies(this.trainer.mate.mon);

    paintBattleBg(this, run.overworld?.scene ?? "field");

    ensureMonSheets(this);
    ensureKidSheets(this);
    this.foeSpr = this.add.image(180, 100, monBattleKey(this.foeId)).setScale(2).setOrigin(0.5, 1).setDepth(10);
    this.meSpr = this.add.image(52, 76, monBattleKey(partnerId)).setScale(2).setOrigin(0.5, 1).setDepth(10);
    this.kidSpr = this.add
      .sprite(KID_X, KID_REST_Y, kidSheet(run.outfit), "idle-up")
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setScrollFactor(0);
    this.kidSpr.play(kidAnim(run.outfit, "idle-up"));
    this.kidUp = false;
    this.kidGoal = KID_REST_Y;
    if (this.trainer) {
      ensureNpcSheets(this);
      const hasMate = !!this.trainer.mate;
      this.trainerSpr = this.add
        .sprite(hasMate ? 198 : 218, 108, npcSheet(this.trainer.look), "idle-down")
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(4);
      this.trainerSpr.play(npcAnim(this.trainer.look, "idle-down"));
      if (this.trainer.mate) {
        this.mateSpr = this.add
          .sprite(228, 108, npcSheet(this.trainer.mate.look), "idle-down")
          .setScale(2)
          .setOrigin(0.5, 1)
          .setDepth(4);
        this.mateSpr.play(npcAnim(this.trainer.mate.look, "idle-down"));
      }
    }
    this.foeBob = this.tweens.add({
      targets: this.foeSpr,
      y: 98,
      duration: 640,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.foeRestY = 100;

    this.foeBar = new HpPlate(this, 116, 8, this.foe.name, this.foe.max, this.foe.lv);
    this.foeBar.setSta(this.foe.sta, this.foe.staMax);
    this.meBar = new HpPlate(this, 8, 80, this.me.name, this.me.max, this.me.lv);
    this.meBar.setSta(this.me.sta, this.me.staMax);

    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this, (line) => this.showTalker(line));
    this.menu = new CatchMenu(this, { onPick: (opt) => this.picked(opt) });
    this.moves = new MoveMenu(this, {
      onPick: (move) => this.pickedMove(move),
      onCancel: () => this.menu?.show(),
    });
    this.bag = new BagMenu(this, { onPick: (entry) => this.useBag(entry) }, true);
    mountDebugBack(this);

    if (this.trainer) {
      this.say(
        [
          `${this.trainer.title} ${this.trainer.mate ? "want" : "wants"} to fight!`,
          { who: this.trainer.who, text: this.trainer.challenge },
        ],
        "menu",
      );
    } else {
      this.say(`Wild ${SPECIES[this.foeId].name}!`, "menu");
    }
  }

  update(): void {
    if (this.kidSpr) {
      const cur = this.kidSpr.y;
      const goal = this.kidGoal;
      if (cur !== goal) {
        const next = cur + (goal - cur) * 0.3;
        this.kidSpr.y = Math.abs(goal - next) < 0.5 ? goal : next;
      }
    }
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);
    if (inDebugSession() && Phaser.Input.Keyboard.JustDown(this.wasd.ESC)) {
      leaveDebugSession(this);
      return;
    }
    if (this.done) {
      if (this.note?.open && confirm) {
        this.note.advance();
        if (!this.note.open) this.goBack();
      }
      return;
    }
    if (this.bag?.active) {
      this.bag.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel);
      if (!this.bag.active && !this.note?.open) {
        if (this.mustSwitch) this.bag.show();
        else this.menu?.show();
      }
      return;
    }
    if (this.moves?.active) {
      this.moves.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel);
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

  private showTalker(line?: Line): void {
    const who = line ? lineWho(line) : undefined;
    this.liftKid(who === "YOU");
  }

  private liftKid(up: boolean): void {
    if (!this.kidSpr || this.kidUp === up) return;
    this.kidUp = up;
    this.kidSpr.setDepth(up ? 12 : 6);
    this.kidGoal = up ? KID_TALK_Y : KID_REST_Y;
  }

  private say(text: Line | Line[], after: AfterText): void {
    this.menu?.hide();
    this.moves?.hide();
    this.after = after;
    this.note?.show(text);
  }

  private afterText(): void {
    if (this.after === "menu") this.settleToMenu();
    else if (this.after === "afterPoison") this.afterPoison();
    else if (this.after === "bag") this.openBag();
    else if (this.after === "foe") this.foeStrike();
    else if (this.after === "next") this.nextAct();
    else if (this.after === "counter") this.counterHit();
    else this.finishLeave();
  }

  private settleToMenu(): void {
    this.me.guard = false;
    this.foe.guard = false;
    this.me.dodging = false;
    this.foe.dodging = false;
    if (this.wantPoisonTick) {
      this.wantPoisonTick = false;
      const lines = this.poisonTicks();
      if (lines.length) {
        this.say(lines, "afterPoison");
        return;
      }
    }
    this.menu?.show();
  }

  private afterPoison(): void {
    if (this.foe.hp <= 0) {
      this.finishFoeKo([]);
      return;
    }
    if (this.me.hp <= 0) {
      this.faint();
      return;
    }
    this.menu?.show();
  }

  private poisonTicks(): Line[] {
    const lines: Line[] = [];
    if (this.foe.poisoned && this.foe.hp > 0) {
      const dmg = tickPoison(this.foe);
      this.foeBar?.setHp(this.foe.hp);
      this.pauseFoeBob();
      hitImpact(this, this.foeSpr, false);
      this.resumeFoeBob(220);
      actorReact(this, this.activeTrainerSpr(), "wince");
      lines.push(`Foe ${this.foe.name} is hurt by the rubbish! ${dmg}.`);
    }
    if (this.me.poisoned && this.me.hp > 0) {
      const dmg = tickPoison(this.me);
      this.meBar?.setHp(this.me.hp);
      hitImpact(this, this.meSpr, true, true);
      actorReact(this, this.kidSpr, "wince");
      lines.push(`${this.me.name} is hurt by poison! ${dmg}.`);
    }
    return lines;
  }

  private showMenu(): void {
    this.settleToMenu();
  }

  private picked(opt: "fight" | "bag" | "defend" | "dodge" | "run"): void {
    if (opt === "fight") this.openMoves();
    else if (opt === "defend") this.startDefend();
    else if (opt === "dodge") this.startDodge();
    else if (opt === "bag") this.openBag();
    else this.flee();
  }

  private openMoves(): void {
    this.menu?.hide();
    this.moves?.show(this.me.moves);
  }

  private pickedMove(move: MoveDef): void {
    if (!spendFight(this.me)) {
      this.say("Too tired. Defend.", "menu");
      return;
    }
    this.me.move = move;
    this.meBar?.setSta(this.me.sta, this.me.staMax);
    this.queueRound("fight");
  }

  private openBag(): void {
    this.menu?.hide();
    this.bag?.show();
  }

  private useBag(entry: BagEntry): void {
    if (entry.kind === "mon") {
      this.switchTo(entry.mon);
      return;
    }
    if (entry.id === "kebab") {
      this.tryBall();
      return;
    }
    if (this.me.hp >= this.me.max) {
      this.say("HP's full.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    const got = useHealItem(entry.id, this.me.hp, this.me.max);
    if (got <= 0) {
      this.say("Can't use that.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    this.me.hp += got;
    this.meBar?.setHp(this.me.hp);
    this.storeHp();
    const revived = this.mustSwitch && this.me.hp > 0;
    if (revived) this.mustSwitch = false;
    this.say(
      [`You gave it a ${ITEM[entry.id].label}.`, `${this.me.name} recovered ${got} HP.`],
      revived || this.mustSwitch ? "menu" : "foe",
    );
  }

  private switchTo(mon: PartyMon): void {
    if (mon.hp <= 0) {
      this.say("It's out.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    if (mon.id === this.me.id && partnerMon() === mon) {
      this.say("Already out.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    this.storeHp();
    if (!setLead(mon)) {
      this.say("Can't.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    const next = partnerMon();
    if (!next) {
      this.say("Can't.", "menu");
      return;
    }
    const forced = this.mustSwitch;
    this.mustSwitch = false;
    this.me = makeBattler(next.id, next.lv, next.hp, next.moves);
    this.meSpr?.setTexture(monBattleKey(next.id));
    this.meSpr?.clearTint();
    this.meSpr?.setAlpha(1);
    this.meSpr?.setPosition(52, 76);
    this.kidSpr?.clearTint();
    this.kidSpr?.setAlpha(1);
    if (this.kidSpr) this.kidSpr.y = this.kidUp ? KID_TALK_Y : KID_REST_Y;
    this.meBar?.setMon(this.me.name, this.me.max, this.me.lv, this.me.hp, this.me.sta, this.me.staMax);
    actorReact(this, this.kidSpr, "cheer");
    this.say(`Go ${this.me.name}!`, forced ? "menu" : "foe");
  }

  private startDefend(): void {
    doDefend(this.me);
    this.meBar?.setSta(this.me.sta, this.me.staMax);
    this.queueRound("defend");
  }

  private startDodge(): void {
    doDodge(this.me);
    dodgeLean(this, this.meSpr, true);
    actorReact(this, this.kidSpr, "stamp");
    const theirs = this.planFoe();
    if (theirs === "defend") {
      this.say([`${this.me.name} waits to dodge.`, `Foe ${this.foe.name} is defending.`], "menu");
      return;
    }
    this.wantPoisonTick = true;
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
    this.foe.move = pickFoeMove(this.foe);
    spendFight(this.foe);
    this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
    return "fight";
  }

  private queueRound(mine: "fight" | "defend"): void {
    this.wantPoisonTick = true;
    const theirs = this.planFoe();
    const me = { who: "me" as const, kind: mine };
    const foe = { who: "foe" as const, kind: theirs };
    const first = firstActor(this.me, this.foe, mine === "fight", theirs === "fight");
    this.acts = first === "me" ? [me, foe] : [foe, me];
    this.nextAct();
  }

  private nextAct(): void {
    const act = this.acts.shift();
    if (!act) {
      this.showMenu();
      return;
    }
    if (act.who === "me" && act.kind === "defend") {
      braceGuard(this, this.meSpr);
      actorReact(this, this.kidSpr, "stamp");
      this.say(`${this.me.name} is defending.`, this.acts.length ? "next" : "menu");
      return;
    }
    if (act.who === "foe" && act.kind === "defend") {
      this.pauseFoeBob();
      braceGuard(this, this.foeSpr);
      this.resumeFoeBob(200);
      actorReact(this, this.activeTrainerSpr(), "stamp");
      this.say(`Foe ${this.foe.name} is defending.`, this.acts.length ? "next" : "menu");
      return;
    }
    if (act.who === "me") this.hitMe();
    else this.foeStrike();
  }

  private hitLine(who: string, move: string, dmg: number, guarded: boolean): string {
    return guarded ? `${who} used ${move}! ${dmg}. Held.` : `${who} used ${move}! ${dmg}.`;
  }

  /** Extra lines when a poison move lands. */
  private poisonProcLines(atk: Battler, def: Battler, foeSide: boolean): Line[] {
    if (!tryPoison(atk, def)) return [];
    const who = foeSide ? `Foe ${def.name}` : def.name;
    if (atk.move.name === "BIN TIP") return ["Putrid rubbish!", `${who} was poisoned!`];
    return [`${who} was poisoned!`];
  }

  private flavorLead(atk: Battler, foeLabel: boolean): Line[] {
    const who = foeLabel ? `Foe ${atk.name}` : atk.name;
    const m = atk.move;
    if (m.kind === "quick") return [`${who} strikes first.`];
    if (m.kind === "defend") return [`${who} braced itself.`];
    if (m.kind === "speed") return [`${who} sped up!`];
    if (m.kind === "drain") return [`${who} goes for the stamina.`];
    if (m.kind === "poison") return [`${who} goes dirty.`];
    return [];
  }

  private resolveMove(
    atk: Battler,
    def: Battler,
    atkIsMe: boolean,
  ): { lines: Line[]; ko: boolean } {
    const move = atk.move;
    const foeLabel = !atkIsMe;
    const who = foeLabel ? `Foe ${atk.name}` : atk.name;
    const lines: Line[] = [...this.flavorLead(atk, foeLabel)];

    if (move.kind === "defend") {
      atk.guard = true;
      atk.dodging = false;
      if (atkIsMe) {
        braceGuard(this, this.meSpr);
        actorReact(this, this.kidSpr, "stamp");
      } else {
        this.pauseFoeBob();
        braceGuard(this, this.foeSpr);
        this.resumeFoeBob(200);
        actorReact(this, this.activeTrainerSpr(), "stamp");
      }
      if (!lines.length) lines.push(`${who} braced itself.`);
      return { lines, ko: false };
    }

    if (move.kind === "speed") {
      const boost = move.boost ?? 4;
      atk.spdBoost += boost;
      if (atkIsMe) actorReact(this, this.kidSpr, "cheer");
      else actorReact(this, this.activeTrainerSpr(), "cheer");
      if (!lines.length) lines.push(`${who} sped up!`);
      lines.push(`${who} used ${move.name}!`);
      return { lines, ko: false };
    }

    if (!rollHit(atk, def, move)) {
      if (atkIsMe) {
        attackMiss(this, this.meSpr, true);
        actorReact(this, this.kidSpr, "wince");
      } else {
        this.pauseFoeBob();
        attackMiss(this, this.foeSpr, false);
        this.resumeFoeBob(200);
        actorReact(this, this.activeTrainerSpr(), "wince");
      }
      lines.push(`${who} used ${move.name}!`, "It missed.");
      return { lines, ko: false };
    }

    const guarded = def.guard;
    const dmg = isDamaging(move) ? applyHit(def, rollDamage(atk, def, move)) : 0;
    if (atkIsMe) {
      this.foeBar?.setHp(this.foe.hp);
      this.pauseFoeBob();
      attackLunge(this, this.meSpr, true, () => {
        if (dmg > 0) hitImpact(this, this.foeSpr, false);
        actorReact(this, this.activeTrainerSpr(), "wince");
        actorReact(this, this.kidSpr, "cheer");
      });
    } else {
      this.meBar?.setHp(this.me.hp);
      this.pauseFoeBob();
      attackLunge(this, this.foeSpr, false, () => {
        if (dmg > 0) hitImpact(this, this.meSpr, true, true);
        actorReact(this, this.kidSpr, "wince");
        actorReact(this, this.activeTrainerSpr(), "cheer");
      });
      this.resumeFoeBob(280);
    }

    if (dmg > 0) {
      lines.push(this.hitLine(who, move.name, dmg, guarded));
    } else if (!lines.some((l) => typeof l === "string" && l.includes(move.name))) {
      lines.push(`${who} used ${move.name}!`);
    }

    if (move.kind === "drain" && (move.drain ?? 0) > 0) {
      const took = drainSta(atk, def, move.drain ?? 1);
      if (atkIsMe) {
        this.meBar?.setSta(this.me.sta, this.me.staMax);
        this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
      } else {
        this.meBar?.setSta(this.me.sta, this.me.staMax);
        this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
      }
      if (took > 0) lines.push(`${who} nicked some stamina!`);
      else lines.push(`${who} found no stamina to nick.`);
    }

    lines.push(...this.poisonProcLines(atk, def, !atkIsMe));

    if (atkIsMe && def.hp > 0) this.resumeFoeBob(280);
    return { lines, ko: def.hp <= 0 };
  }

  private activeTrainerSpr(): Phaser.GameObjects.Sprite | undefined {
    return this.foeSlot === 1 && this.mateSpr ? this.mateSpr : this.trainerSpr;
  }

  private finishFoeKo(lead: Line[]): void {
    this.storeHp();
    this.pauseFoeBob();
    faintDrop(this, this.foeSpr);
    actorReact(this, this.activeTrainerSpr(), "loss");
    const fainted = this.foe.name;
    const xpLines = this.grantXp();
    const mate = this.trainer?.mate;
    if (this.trainer && mate && this.foeSlot === 0) {
      this.foeSlot = 1;
      this.foeId = mate.mon;
      this.foeLv = mate.lv;
      this.foe = makeBattler(mate.mon, mate.lv);
      seeSpecies(mate.mon);
      const lines: Line[] = [
        ...lead,
        `Foe ${fainted} fainted.`,
        ...xpLines,
        { who: mate.who, text: `Go ${this.foe.name}!` },
      ];
      this.time.delayedCall(300, () => {
        if (!this.foeSpr) return;
        this.tweens.killTweensOf(this.foeSpr);
        this.foeSpr.setTexture(monBattleKey(mate.mon));
        this.foeSpr.setAlpha(1);
        this.foeSpr.setPosition(180, this.foeRestY);
        this.foeBar?.setMon(this.foe.name, this.foe.max, this.foe.lv, this.foe.hp, this.foe.sta, this.foe.staMax);
        this.resumeFoeBob(0);
      });
      this.say(lines, "menu");
      return;
    }
    this.done = true;
    const lines: Line[] = [...lead, `Foe ${fainted} fainted.`];
    if (this.trainer) {
      beatTrainer(this.trainer.id);
      lines.push("You won.", { who: this.trainer.who, text: this.trainer.win });
      if (this.trainer.mate) {
        lines.push({ who: this.trainer.mate.who, text: this.trainer.mate.win });
        actorReact(this, this.mateSpr, "loss");
      }
    } else {
      markWildBeat();
    }
    lines.push(...xpLines);
    this.say(lines, "done");
  }

  private hitMe(): void {
    const { lines, ko } = this.resolveMove(this.me, this.foe, true);
    if (ko) {
      this.finishFoeKo(lines);
      return;
    }
    this.say(lines, this.acts.length ? "next" : "menu");
  }

  private foeStrike(): void {
    if (this.me.dodging) {
      const move = this.foe.move;
      if (!isDamaging(move)) {
        // Status moves ignore dodge — just resolve
        const { lines } = this.resolveMove(this.foe, this.me, false);
        this.say(lines, this.acts.length ? "next" : "menu");
        return;
      }
      if (rollDodge(this.me, this.foe)) {
        const chased = spendChase(this.foe);
        this.foeBar?.setSta(this.foe.sta, this.foe.staMax);
        this.pauseFoeBob();
        attackLunge(this, this.foeSpr, false, () => {
          dodgeLean(this, this.meSpr, true);
          actorReact(this, this.kidSpr, "cheer");
          actorReact(this, this.activeTrainerSpr(), chased ? "wince" : "stamp");
        });
        this.resumeFoeBob(260);
        const lines: Line[] = [
          ...this.flavorLead(this.foe, true),
          `Foe ${this.foe.name} used ${move.name}!`,
          `${this.me.name} dodged!`,
        ];
        if (chased) lines.push(`Foe ${this.foe.name} wore itself out chasing.`);
        if (rollCounter(this.me, this.foe)) {
          // Counter with first damaging move
          const strike = this.me.moves.find(isDamaging) ?? this.me.move;
          this.me.move = strike;
          lines.push(`${this.me.name} strikes back!`);
          this.say(lines, "counter");
        } else {
          this.say(lines, this.acts.length ? "next" : "menu");
        }
        return;
      }
      const { lines, ko } = this.resolveMove(this.foe, this.me, false);
      lines.splice(1, 0, `${this.me.name} couldn't dodge.`);
      if (ko) {
        this.faint();
        return;
      }
      this.say(lines, this.acts.length ? "next" : "menu");
      return;
    }
    const { lines, ko } = this.resolveMove(this.foe, this.me, false);
    if (ko) {
      this.faint();
      return;
    }
    this.say(lines, this.acts.length ? "next" : "menu");
  }

  private counterHit(): void {
    const { lines, ko } = this.resolveMove(this.me, this.foe, true);
    if (ko) {
      this.finishFoeKo(lines);
      return;
    }
    this.say(lines, this.acts.length ? "next" : "menu");
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
      markWildBeat();
      this.say(lines, "done");
      return;
    }
    this.wantPoisonTick = true;
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
    this.wantPoisonTick = true;
    this.say("Can't run!", "foe");
  }

  private faint(): void {
    this.storeHp();
    faintDrop(this, this.meSpr);
    actorReact(this, this.kidSpr, "loss");
    actorReact(this, this.activeTrainerSpr(), "cheer");
    if (partyAlive()) {
      this.mustSwitch = true;
      this.say([`${this.me.name} fainted.`, "Send out another."], "bag");
      return;
    }
    this.done = true;
    run.whiteout = true;
    this.say([`${this.me.name} fainted.`, "You blacked out."], "done");
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

  private pauseFoeBob(): void {
    this.foeBob?.pause();
    if (this.foeSpr) this.foeSpr.y = this.foeRestY;
  }

  private resumeFoeBob(afterMs = 0): void {
    if (this.done || !this.foeSpr || this.foe.hp <= 0) return;
    const kick = (): void => {
      if (this.done || !this.foeSpr || this.foe.hp <= 0) return;
      this.foeSpr.y = this.foeRestY;
      // Attack tweens may have killed the idle bob — restart if needed.
      if (this.foeBob && (this.foeBob.isPaused() || this.foeBob.isPlaying())) {
        this.foeBob.resume();
        return;
      }
      this.foeBob = this.tweens.add({
        targets: this.foeSpr,
        y: this.foeRestY - 2,
        duration: 640,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    };
    if (afterMs <= 0) kick();
    else this.time.delayedCall(afterMs, kick);
  }

  private finishLeave(): void {
    this.goBack();
  }

  private goBack(): void {
    if (inDebugSession()) {
      leaveDebugSession(this);
      return;
    }
    if (run.whiteout) {
      run.overworld = null;
      clearField();
      this.scene.start("lab");
      return;
    }
    this.scene.start(run.overworld?.scene ?? "island");
  }
}
