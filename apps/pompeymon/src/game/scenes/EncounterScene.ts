import Phaser from "phaser";
import { applyHit, BATTLE, canRun, doDefend, doDodge, drainSta, firstActor, isTired, makeBattler, moveAllowed, movesForLevel, pickFoeMove, resolveSuper, restSta, rollCounter, rollDamage, rollDodge, rollHit, scaled, spendChase, spendFight, STARTER_LV, tickPoison, tickSuper, tryCatch, tryPoison, xpForKo, type Battler, type DefendResult } from "../battle";
import { GBA_W } from "../constants";
import { isDamaging, resolveMoves, type MoveDef } from "../moves";
import { applyXp, beatTrainer, catchSpecies, ensureLeadAlive, healParty, ITEM, MAX_PARTY, partnerMon, partyCanFight, persistRun, run, seeSpecies, setLead, takeCash, takePrize, useCatchBox, useHealItem, useKebabBox, bondStolenMon, findStolenMon, monLabel, STOLEN_NICK, type BagEntry, type ItemId, type PartyMon } from "../run";
import { ELEM_TINT, SPECIES, type SpeciesId } from "../species";
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
  flameAura,
  hitImpact,
  trainerDeploy,
  type FlameHandle,
} from "../ui/battleFx";
import { leaveDebugSession, mountDebugBack, inDebugSession } from "../ui/debugBack";
import { HpPlate, HP_PLATE_W } from "../ui/HpPlate";
import { MoveMenu } from "../ui/MoveMenu";
import { MsgBox, lineWho, type Line } from "../ui/MsgBox";
import { justAction, justCancel, bindWalkKeys, type WalkKeys } from "../walk";
import { clearField, markWildBeat } from "../world/wander";
import { joinPal, PAL_ID, PAL_LOOK, PAL_NAME, palBesidePlayer, palGymReply, pickPalCheer, type PalCheerKind } from "../world/pal";
import {
  finishSteveCatch,
  spawnBikeThief,
  spawnSteveBattleBike,
  STEVE_BIKE,
  STEVE_ID,
  STEVE_NAME,
} from "../world/steve";
import { ensureNpcSheets, npcAnim, npcSheet, type NpcLook } from "../sprites/npc";

const KID_X = 30;
const KID_REST_Y = 192;
const KID_TALK_Y = 76;
/** Jess stands just right of the kid on the battle deck. */
const PAL_X = 54;

export type TrainerBattle = {
  id: string;
  title: string;
  mon: SpeciesId;
  lv: number;
  challenge: string;
  win: string;
  who: string;
  look: NpcLook;
  prize?: ItemId;
  taunt?: string[];
  wipe?: string;
  palPast?: string[];
  palWin?: string;
  party?: { mon: SpeciesId; lv: number }[];
  mate?: {
    who: string;
    look: NpcLook;
    mon: SpeciesId;
    lv: number;
    win: string;
  };
};

type AfterText = "menu" | "foe" | "next" | "done" | "counter" | "bag" | "afterPoison" | "steveTheft" | "steveChase" | "steveCatch" | "stubborn" | "deanFlee" | "deanBlowKo";

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
  private palSpr?: Phaser.GameObjects.Sprite;
  private kidUp = false;
  private kidGoal = KID_REST_Y;
  private palCheerN = 0;
  private lastPalCheer = -1;
  private done = false;
  /** GIVE UP asks twice — losing a trainer fight by fat finger is grim. */
  private quitArmed = false;
  private myBrace?: DefendResult;
  private after: AfterText = "menu";
  private acts: Array<{ who: "me" | "foe"; kind: "fight" | "defend" }> = [];
  private mustSwitch = false;
  private wantPoisonTick = false;
  private foeBob?: Phaser.Tweens.Tween;
  private foeRestY = 100;
  /** Next extra mon in this trainer's party. */
  private partyI = 0;
  private mateOut = false;
  private foeTeam = 0;
  private foeLeft = 0;
  private lastTaunt = -1;
  /** Steve fight: bike theft already played. */
  private steveStolen = false;
  /** Steve ran off — mon is catchable. */
  private steveAbandoned = false;
  private steveBusy = false;
  private steveBike?: Phaser.GameObjects.Image;
  private steveThief?: Phaser.GameObjects.Sprite;
  /** Youngster Dean self-destruct / PRICKLES event. */
  private deanEvent = false;
  /** Party index currently in battle — not species id (duplicates share an id). */
  private meSlot = 0;
  private meFlame?: FlameHandle;
  private foeFlame?: FlameHandle;

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
    this.partyI = 0;
    this.mateOut = false;
    this.lastTaunt = -1;
    this.steveStolen = false;
    this.steveAbandoned = false;
    this.steveBusy = false;
    this.steveBike = undefined;
    this.steveThief = undefined;
    this.deanEvent = false;
    const wanted = partnerMon();
    const partner = ensureLeadAlive();
    this.meSlot = run.lead;
    const partnerId = partner?.id ?? run.starter ?? "scabfox";
    this.me = makeBattler(partnerId, partner?.lv ?? STARTER_LV, partner?.hp, partner?.moves, partner?.elem, partner?.nick);
    this.foe = makeBattler(this.foeId, this.foeLv);
    seeSpecies(this.foeId);
    seeSpecies(partnerId);
    const refusedLead =
      !!wanted?.stubborn && wanted.hp > 0 && (!partner || wanted !== partner)
        ? monLabel(wanted)
        : undefined;

    paintBattleBg(this, run.overworld?.scene ?? "field");

    ensureMonSheets(this);
    ensureKidSheets(this);
    this.foeSpr = this.add.image(180, 100, monBattleKey(this.foeId)).setScale(2).setOrigin(0.5, 1).setDepth(10);
    this.meSpr = this.add.image(52, 76, monBattleKey(partnerId)).setScale(2).setOrigin(0.5, 1).setDepth(10);
    if (partner?.elem) this.meSpr.setTint(ELEM_TINT[partner.elem]);
    this.kidSpr = this.add
      .sprite(KID_X, KID_REST_Y, kidSheet(run.outfit), "idle-up")
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setScrollFactor(0);
    this.kidSpr.play(kidAnim(run.outfit, "idle-up"));
    this.kidUp = false;
    this.kidGoal = KID_REST_Y;
    this.palCheerN = 0;
    this.lastPalCheer = -1;
    this.palSpr = undefined;
    if (palBesidePlayer(this.trainer?.id)) {
      ensureNpcSheets(this);
      this.palSpr = this.add
        .sprite(PAL_X, KID_REST_Y, npcSheet(PAL_LOOK), "idle-up")
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(5)
        .setScrollFactor(0);
      this.palSpr.play(npcAnim(PAL_LOOK, "idle-up"));
    }
    if (this.trainer) {
      ensureNpcSheets(this);
      const hasMate = !!this.trainer.mate;
      this.trainerSpr = this.add
        .sprite(hasMate ? 198 : 218, 108, npcSheet(this.trainer.look), "idle-down")
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(4);
      this.trainerSpr.play(npcAnim(this.trainer.look, "idle-down"));
      if (this.trainer.id === STEVE_ID) {
        this.steveBike = spawnSteveBattleBike(this);
      }
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

    this.foeBar = new HpPlate(this, GBA_W - HP_PLATE_W - 4, 8, this.foe.name, this.foe.max, this.foe.lv, this.foe.hp);
    this.foeBar.setSta(this.foe.sta, this.foe.staMax, this.foe.overcharged);
    if (this.trainer) {
      this.foeTeam = 1 + (this.trainer.party?.length ?? 0) + (this.trainer.mate ? 1 : 0);
      this.foeLeft = this.foeTeam;
      this.foeBar.setTeam(this.foeTeam, this.foeLeft);
    }
    this.meBar = new HpPlate(this, 8, 80, this.me.name, this.me.max, this.me.lv, this.me.hp);
    this.meBar.setSta(this.me.sta, this.me.staMax, this.me.overcharged);

    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this, (line) => this.showTalker(line));
    this.menu = new CatchMenu(this, { onPick: (opt) => this.picked(opt) }, { trainer: !!this.trainer });
    this.moves = new MoveMenu(this, {
      onPick: (move) => this.pickedMove(move),
      onCancel: () => this.menu?.show(),
    });
    this.bag = new BagMenu(this, { onPick: (entry) => this.useBag(entry) }, true);
    mountDebugBack(this);

    if (this.trainer) {
      const open: Line[] = [
        `${this.trainer.title} ${this.trainer.mate ? "want" : "wants"} to fight!`,
        { who: this.trainer.who, text: this.trainer.challenge },
      ];
      if (refusedLead) open.push(`${refusedLead} won't come out of the bag!`);
      if (run.palJoined && this.trainer.palPast?.length) {
        for (const text of this.trainer.palPast) {
          open.push({ who: this.trainer.who, text });
        }
        const reply = palGymReply(this.trainer.id);
        if (reply) open.push(reply);
      }
      this.pushPalCheer(open, "open");
      this.say(open, "menu");
    } else {
      const open: Line[] = [`Wild ${SPECIES[this.foeId].name}!`];
      if (refusedLead) open.push(`${refusedLead} won't come out of the bag!`);
      this.say(open, "menu");
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
    if (this.steveBusy) return;
    if (this.bag?.active) {
      this.bag.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel);
      if (!this.bag.active && !this.note?.open) {
        if (this.mustSwitch) {
          if (!partyCanFight()) this.blackoutStubborn();
          else this.bag.show();
        } else this.menu?.show();
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
    if (who === PAL_NAME) actorReact(this, this.palSpr, "cheer");
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
    else if (this.after === "foe") this.enemyReply();
    else if (this.after === "next") this.nextAct();
    else if (this.after === "counter") this.counterHit();
    else if (this.after === "steveTheft") this.playSteveTheft();
    else if (this.after === "steveChase") this.chaseSteveThief();
    else if (this.after === "steveCatch") this.autoSteveCatch();
    else if (this.after === "stubborn") this.startDefend();
    else if (this.after === "deanFlee") this.finishDeanFlee();
    else if (this.after === "deanBlowKo") this.finishFoeKo([]);
    else this.finishLeave();
  }

  private settleToMenu(): void {
    this.me.guard = false;
    this.foe.guard = false;
    this.me.dodging = false;
    this.foe.dodging = false;
    const meDrop = tickSuper(this.me);
    const foeDrop = tickSuper(this.foe);
    this.syncPowerFx();
    if (this.wantPoisonTick) {
      this.wantPoisonTick = false;
      const lines = this.poisonTicks();
      if (meDrop) lines.unshift(`${this.me.name}'s power faded.`);
      if (foeDrop) lines.unshift(`Foe ${this.foe.name}'s power faded.`);
      if (lines.length) {
        this.say(lines, "afterPoison");
        return;
      }
    }
    if (meDrop || foeDrop) {
      const lines: Line[] = [];
      if (meDrop) lines.push(`${this.me.name}'s power faded.`);
      if (foeDrop) lines.push(`Foe ${this.foe.name}'s power faded.`);
      this.say(lines, "menu");
      return;
    }
    this.menu?.show();
  }

  private syncSta(side: "me" | "foe" | "both" = "both"): void {
    if (side !== "foe") this.meBar?.setSta(this.me.sta, this.me.staMax, this.me.overcharged);
    if (side !== "me") this.foeBar?.setSta(this.foe.sta, this.foe.staMax, this.foe.overcharged);
  }

  private syncPowerFx(): void {
    this.syncSta();
    if (this.me.overcharged) {
      if (!this.meFlame) this.meFlame = flameAura(this, this.meSpr);
    } else if (this.meFlame) {
      this.meFlame.stop();
      this.meFlame = undefined;
    }
    if (this.foe.overcharged) {
      if (!this.foeFlame) this.foeFlame = flameAura(this, this.foeSpr);
    } else if (this.foeFlame) {
      this.foeFlame.stop();
      this.foeFlame = undefined;
    }
  }

  /** Cash in a charge defend as the move plays — buffs, gold bar, flames. */
  private playSuper(side: "me" | "foe"): boolean {
    const lit = resolveSuper(side === "me" ? this.me : this.foe);
    if (lit) this.syncPowerFx();
    return lit;
  }

  private stopFlames(): void {
    this.meFlame?.stop();
    this.foeFlame?.stop();
    this.meFlame = undefined;
    this.foeFlame = undefined;
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
    if (opt !== "run") this.quitArmed = false;
    if (opt === "fight" || opt === "dodge") {
      if (this.ignoresOrder()) {
        this.refuseOrder();
        return;
      }
    }
    if (opt === "fight") this.openMoves();
    else if (opt === "defend") this.startDefend();
    else if (opt === "dodge") this.startDodge();
    else if (opt === "bag") this.openBag();
    else this.flee();
  }

  private openMoves(): void {
    this.menu?.hide();
    const moves = this.me.moves;
    this.moves?.show(
      moves,
      moves.map((m) => moveAllowed(this.me, m)),
    );
  }

  private pickedMove(move: MoveDef): void {
    if (move.kind === "defend") {
      this.me.move = move;
      this.startDefend(move);
      return;
    }
    if (move.kind === "mega" && !this.me.overcharged) {
      this.say("Not powered up.", "menu");
      return;
    }
    if (!moveAllowed(this.me, move)) {
      this.say(move.kind === "mega" ? "Not powered up." : "Too tired for that.", "menu");
      return;
    }
    if (this.ignoresOrder()) {
      this.moves?.hide();
      this.refuseOrder();
      return;
    }
    spendFight(this.me);
    this.me.move = move;
    this.syncSta("me");
    this.queueRound("fight");
  }

  /** Soft bond — sometimes ignores Fight/Dodge while out. */
  private leadCheeky(): boolean {
    const mon = run.party[this.meSlot];
    return !!mon?.cheeky && !mon.stubborn;
  }

  private refuseOrder(): void {
    const who = this.me.name;
    this.say([`${who} doesn't feel like it.`, `${who} just braces.`], "stubborn");
  }

  /** Cheeky only — stubborn never leaves the bag. */
  private ignoresOrder(): boolean {
    return this.leadCheeky() && Math.random() < 0.4;
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
    if (entry.id === "kebab" || entry.id === "empty") {
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
    const lines: Line[] = [`You used ${ITEM[entry.id].label}.`, `${this.me.name} recovered ${got} HP.`];
    const costsTurn = !(revived || this.mustSwitch);
    if (costsTurn) {
      const pip = restSta(this.me);
      this.syncSta("me");
      if (pip > 0) lines.push(`${this.me.name} caught its breath.`);
    }
    this.say(lines, costsTurn ? "foe" : "menu");
  }

  private switchTo(mon: PartyMon): void {
    const slot = run.party.indexOf(mon);
    if (slot < 0) {
      this.say("Can't.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    if (mon.hp <= 0) {
      this.say("It's out.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    if (mon.stubborn) {
      const who = monLabel(mon);
      if (this.mustSwitch && !partyCanFight()) {
        this.blackoutStubborn([`${who} won't come out of the bag!`]);
        return;
      }
      this.say(`${who} won't come out of the bag!`, this.mustSwitch ? "bag" : "menu");
      return;
    }
    if (slot === this.meSlot && this.me.hp > 0) {
      this.say("Already out.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    this.storeHp();
    if (!setLead(mon)) {
      this.say("Can't.", this.mustSwitch ? "bag" : "menu");
      return;
    }
    this.meSlot = run.lead;
    const next = run.party[this.meSlot];
    if (!next) {
      this.say("Can't.", "menu");
      return;
    }
    const forced = this.mustSwitch;
    this.mustSwitch = false;
    this.meFlame?.stop();
    this.meFlame = undefined;
    this.me = makeBattler(next.id, next.lv, next.hp, next.moves, next.elem, next.nick);
    this.meSpr?.setTexture(monBattleKey(next.id));
    this.meSpr?.clearTint();
    if (next.elem) this.meSpr?.setTint(ELEM_TINT[next.elem]);
    this.meSpr?.setAlpha(1);
    this.meSpr?.setPosition(52, 76);
    this.kidSpr?.clearTint();
    this.kidSpr?.setAlpha(1);
    if (this.kidSpr) this.kidSpr.y = this.kidUp ? KID_TALK_Y : KID_REST_Y;
    this.meBar?.setMon(this.me.name, this.me.max, this.me.lv, this.me.hp, this.me.sta, this.me.staMax, false);
    actorReact(this, this.kidSpr, "cheer");
    this.say(`Go ${this.me.name}!`, forced ? "menu" : "foe");
  }

  private startDefend(move?: MoveDef): void {
    this.myBrace = doDefend(this.me, move);
    this.syncSta("me");
    this.queueRound("defend");
  }

  private startDodge(): void {
    doDodge(this.me);
    dodgeLean(this, this.meSpr, true);
    actorReact(this, this.kidSpr, "stamp");
    const theirs = this.planFoe();
    if (theirs === "defend") {
      const lines: Line[] = [`${this.me.name} waits to dodge.`, `Foe ${this.foe.name} is defending.`];
      if (this.playSuper("foe")) lines.push(`Foe ${this.foe.name} powered up!`);
      this.say(lines, "menu");
      return;
    }
    this.wantPoisonTick = true;
    this.acts = [{ who: "foe", kind: "fight" }];
    this.say(`${this.me.name} waits to dodge.`, "next");
  }

  private planFoe(): "fight" | "defend" {
    const worn = this.foe.sta < this.foe.staMax && Math.random() < 0.22;
    if (worn && !isTired(this.foe) && Math.random() < 0.5) {
      doDefend(this.foe);
      this.syncSta("foe");
      return "defend";
    }
    this.foe.move = pickFoeMove(this.foe);
    if (this.foe.move.kind === "defend") {
      doDefend(this.foe, this.foe.move);
      this.syncSta("foe");
      return "defend";
    }
    spendFight(this.foe);
    this.syncSta("foe");
    return "fight";
  }

  /** Extra foe action after bag / flee fail — pick a fresh move and pay stamina. */
  private enemyReply(): void {
    this.wantPoisonTick = true;
    const theirs = this.planFoe();
    if (theirs === "defend") {
      this.pauseFoeBob();
      braceGuard(this, this.foeSpr);
      this.resumeFoeBob(200);
      actorReact(this, this.activeTrainerSpr(), "stamp");
      const lines: Line[] = [`Foe ${this.foe.name} is defending.`];
      if (this.playSuper("foe")) lines.push(`Foe ${this.foe.name} powered up!`);
      this.say(lines, "menu");
      return;
    }
    this.foeStrike();
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
      const lines: Line[] = [`${this.me.name} is defending.`];
      const got = this.myBrace?.gained ?? 0;
      if (got > 0) lines.push(`${this.me.name} got its breath back.`);
      this.myBrace = undefined;
      if (this.playSuper("me")) lines.push(`${this.me.name} powered up!`);
      this.say(lines, this.acts.length ? "next" : "menu");
      return;
    }
    if (act.who === "foe" && act.kind === "defend") {
      this.pauseFoeBob();
      braceGuard(this, this.foeSpr);
      this.resumeFoeBob(200);
      actorReact(this, this.activeTrainerSpr(), "stamp");
      const lines: Line[] = [`Foe ${this.foe.name} is defending.`];
      if (this.playSuper("foe")) lines.push(`Foe ${this.foe.name} powered up!`);
      this.say(lines, this.acts.length ? "next" : "menu");
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
    const lines: Line[] = [];
    if (atk.weary && m.kind !== "defend") lines.push(`${who} is worn out.`);
    if (m.kind === "quick") lines.push(`${who} strikes first.`);
    else if (m.kind === "defend") lines.push(`${who} braced itself.`);
    else if (m.kind === "speed") lines.push(`${who} sped up!`);
    else if (m.kind === "drain") lines.push(`${who} goes for the stamina.`);
    else if (m.kind === "poison") lines.push(`${who} goes dirty.`);
    else if (m.kind === "mega") lines.push(`${who} goes all out!`);
    return lines;
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
      this.syncSta();
      if (took > 0) lines.push(`${who} nicked some stamina!`);
      else if (def.guard) lines.push(`${def.name} kept hold of it.`);
      else lines.push(`${who} found no stamina to nick.`);
    }

    lines.push(...this.poisonProcLines(atk, def, !atkIsMe));

    if (atkIsMe && def.hp > 0) this.resumeFoeBob(280);
    return { lines, ko: def.hp <= 0 };
  }

  private activeTrainerSpr(): Phaser.GameObjects.Sprite | undefined {
    return this.mateOut && this.mateSpr ? this.mateSpr : this.trainerSpr;
  }

  private sendNextFoe(id: SpeciesId, lv: number): void {
    this.foeId = id;
    this.foeLv = lv;
    this.foeFlame?.stop();
    this.foeFlame = undefined;
    this.foe = makeBattler(id, lv);
    seeSpecies(id);
    const deployer = this.activeTrainerSpr();
    this.time.delayedCall(280, () => {
      trainerDeploy(this, deployer, this.foeSpr, { x: 180, y: this.foeRestY }, monBattleKey(id), () => {
        this.foeBar?.setMon(this.foe.name, this.foe.max, this.foe.lv, this.foe.hp, this.foe.sta, this.foe.staMax, false);
        this.resumeFoeBob(0);
      });
    });
  }

  private finishFoeKo(lead: Line[]): void {
    this.storeHp();
    this.pauseFoeBob();
    faintDrop(this, this.foeSpr);
    const fainted = this.foe.name;
    const xpLines = this.grantXp();
    if (this.trainer) {
      this.foeLeft = Math.max(0, this.foeLeft - 1);
      this.foeBar?.setTeam(this.foeTeam, this.foeLeft);
    }
    const party = this.trainer?.party ?? [];
    const nextOwn = this.trainer && this.partyI < party.length ? party[this.partyI] : undefined;
    if (nextOwn) {
      this.partyI += 1;
      this.sendNextFoe(nextOwn.mon, nextOwn.lv);
      const lines: Line[] = [
        ...lead,
        `Foe ${fainted} fainted.`,
        ...xpLines,
        { who: this.trainer!.who, text: `Go ${this.foe.name}!` },
      ];
      this.pushPalCheer(lines, "foeDown", 0.55);
      this.say(lines, "menu");
      return;
    }
    const mate = this.trainer?.mate;
    if (this.trainer && mate && !this.mateOut) {
      actorReact(this, this.trainerSpr, "loss");
      this.mateOut = true;
      this.sendNextFoe(mate.mon, mate.lv);
      const lines: Line[] = [
        ...lead,
        `Foe ${fainted} fainted.`,
        ...xpLines,
        { who: mate.who, text: `Go ${this.foe.name}!` },
      ];
      this.pushPalCheer(lines, "foeDown", 0.55);
      this.say(lines, "menu");
      return;
    }
    actorReact(this, this.activeTrainerSpr(), "loss");
    this.done = true;
    const lines: Line[] = [...lead, `Foe ${fainted} fainted.`];
    if (this.trainer) {
      beatTrainer(this.trainer.id);
      const dosh = this.trainer.lv * 5;
      takeCash(dosh);
      lines.push("You won.", `Got £${dosh} dosh.`, { who: this.trainer.who, text: this.trainer.win });
      if (run.palJoined && this.trainer.palWin) {
        lines.push({ who: this.trainer.who, text: this.trainer.palWin });
      }
      if (this.trainer.prize && takePrize(this.trainer.prize)) {
        const label = ITEM[this.trainer.prize].label;
        lines.push(`You got the ${label}!`);
        if (label.includes("BADGE")) {
          lines.push({ who: this.trainer.who, text: "Alright mush, what do you want, a chuffdy badge?" });
          lines.push({ who: "YOU", text: "I'm well chuffed with that." });
        }
      }
      if (this.trainer.mate) {
        lines.push({ who: this.trainer.mate.who, text: this.trainer.mate.win });
        actorReact(this, this.mateSpr, "loss");
      }
      if (this.trainer.id === PAL_ID) joinPal(true);
      this.pushPalCheer(lines, "win", 0.65);
    } else {
      markWildBeat();
    }
    lines.push(...xpLines);
    this.say(lines, "done");
  }

  private hitMe(): void {
    const { lines, ko } = this.resolveMove(this.me, this.foe, true);
    if (this.handleSteveBeat(lines, ko, "foe")) return;
    if (ko) {
      this.finishFoeKo(lines);
      return;
    }
    if (this.tryDeanBlow(lines)) return;
    this.maybeClutchCheer(lines);
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
        this.syncSta("foe");
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
      if (this.handleSteveBeat(lines, ko, "me")) return;
      if (ko) {
        this.faint();
        return;
      }
      this.maybeClutchCheer(lines);
      this.say(lines, this.acts.length ? "next" : "menu");
      return;
    }
    const { lines, ko } = this.resolveMove(this.foe, this.me, false);
    if (this.handleSteveBeat(lines, ko, "me")) return;
    if (ko) {
      this.faint();
      return;
    }
    this.maybeClutchCheer(lines);
    this.say(lines, this.acts.length ? "next" : "menu");
  }

  private counterHit(): void {
    const { lines, ko } = this.resolveMove(this.me, this.foe, true);
    if (this.handleSteveBeat(lines, ko, "foe")) return;
    if (ko) {
      this.finishFoeKo(lines);
      return;
    }
    if (this.tryDeanBlow(lines)) return;
    this.maybeClutchCheer(lines);
    this.say(lines, this.acts.length ? "next" : "menu");
  }

  private tryBall(): void {
    if (this.trainer && !this.steveAbandoned) {
      this.say("That's someone else's.", "menu");
      return;
    }
    if (this.foe.hp >= this.foe.max) {
      this.say("Too lively. Weaken it first.", "menu");
      return;
    }
    if (run.party.length >= MAX_PARTY) {
      this.say("Six is enough. No room.", "menu");
      return;
    }
    const vessel = useCatchBox();
    if (!vessel) {
      this.say("No boxes or bags.", "menu");
      return;
    }
    const putDown = vessel === "kebab" ? "You put down a kebab box." : "You put down an empty takeaway.";
    const caught = this.steveAbandoned || tryCatch(this.foe);
    if (caught) {
      const again = run.owned.includes(this.foeId);
      catchSpecies(this.foeId, this.foe.lv, this.steveAbandoned ? { stubborn: true, nick: STOLEN_NICK } : undefined);
      if (this.steveAbandoned) finishSteveCatch();
      this.done = true;
      this.storeHp();
      const lines: Line[] = [
        putDown,
        "The smell got it. It crawled in.",
        "You snapped it shut.",
      ];
      if (!run.kebabCatch) {
        run.kebabCatch = true;
        lines.push({ who: "YOU", text: "Wow it actually worked." });
      }
      lines.push(
        this.steveAbandoned
          ? `Gotcha. ${STOLEN_NICK}!`
          : again
            ? `Gotcha. ${this.foe.name} again.`
            : `Gotcha. ${this.foe.name}.`,
      );
      if (!this.steveAbandoned) markWildBeat();
      this.say(lines, "done");
      return;
    }
    this.wantPoisonTick = true;
    const pip = restSta(this.me);
    this.syncSta("me");
    const lines: Line[] = [putDown, "It sniffed. Not interested."];
    if (pip > 0) lines.push(`${this.me.name} caught its breath.`);
    this.say(lines, "foe");
  }

  /** Trainer fights have GIVE UP where a wild has RUN — you concede the scrap. */
  private giveUp(): void {
    const t = this.trainer;
    if (!t) return;
    if (!this.quitArmed) {
      this.quitArmed = true;
      this.say("Give up? Pick GIVE UP again.", "menu");
      return;
    }
    this.menu?.hide();
    this.done = true;
    const lines: Line[] = ["You gave up."];
    if (t.id === PAL_ID) {
      joinPal(false);
      healParty();
      this.say(lines, "done");
      return;
    }
    lines.push({ who: t.who, text: t.win });
    run.whiteout = true;
    this.say(lines, "done");
  }

  private flee(): void {
    if (this.trainer) {
      this.giveUp();
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


  private tryDeanBlow(lead: Line[]): boolean {
    if (this.deanEvent || this.trainer?.id !== "br-dean") return false;
    if (this.foe.hp <= 0 || this.foe.hp / this.foe.max > 0.55) return false;
    this.deanEvent = true;
    this.acts = [];
    const dean = this.trainer.who;
    const stolen = findStolenMon();
    if (!stolen) {
      this.foe.hp = 0;
      this.foeBar?.setHp(0);
      this.say(
        [
          ...lead,
          { who: dean, text: "Blow yourself up. Don't care about you." },
          `Foe ${this.foe.name} blew itself up!`,
        ],
        "deanBlowKo",
      );
      return true;
    }
    const who = monLabel(stolen);
    this.say(
      [
        ...lead,
        { who: dean, text: "Blow yourself up. Don't care about you." },
        `Foe ${this.foe.name} starts shaking…`,
        `${who} burst out of the bag!`,
        `${who} slammed into ${dean}!`,
        { who: dean, text: "Ow! Mad hedgehog—!" },
        { who: dean, text: "Forget it. Keep your weird mons." },
        `${dean} ran off.`,
        `${who} is watching you.`,
        `${who} might listen… if it feels like it.`,
      ],
      "deanFlee",
    );
    return true;
  }

  private finishDeanFlee(): void {
    bondStolenMon();
    if (this.trainer) beatTrainer(this.trainer.id);
    const dosh = (this.trainer?.lv ?? 6) * 5;
    takeCash(dosh);
    this.done = true;
    this.storeHp();
    actorReact(this, this.trainerSpr, "loss");
    if (this.trainerSpr) {
      this.tweens.add({
        targets: this.trainerSpr,
        x: this.trainerSpr.x + 80,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          this.trainerSpr?.destroy();
          this.trainerSpr = undefined;
        },
      });
    }
    this.say([`Got £${dosh} dosh.`, "You won."], "done");
  }

  /** PRICKLES may jump in when a mate faints. */
  private tryPricklesGuard(lead: Line[]): boolean {
    const stolen = findStolenMon();
    if (!stolen || !stolen.cheeky || stolen.stubborn) return false;
    if (stolen.hp <= 0) return false;
    const slot = run.party.indexOf(stolen);
    if (slot < 0 || slot === this.meSlot) return false;
    if (Math.random() > 0.55) return false;
    const who = monLabel(stolen);
    const fallen = this.me.name;
    this.storeHp();
    if (!setLead(stolen)) return false;
    this.meSlot = run.lead;
    this.mustSwitch = false;
    this.meFlame?.stop();
    this.meFlame = undefined;
    this.me = makeBattler(stolen.id, stolen.lv, stolen.hp, stolen.moves, stolen.elem, stolen.nick);
    const scrape = Math.max(1, Math.floor(this.me.max * 0.12));
    this.me.hp = Math.max(1, this.me.hp - scrape);
    stolen.hp = this.me.hp;
    this.meSpr?.setTexture(monBattleKey(stolen.id));
    this.meSpr?.clearTint();
    if (stolen.elem) this.meSpr?.setTint(ELEM_TINT[stolen.elem]);
    this.meSpr?.setAlpha(1);
    this.meBar?.setMon(this.me.name, this.me.max, this.me.lv, this.me.hp, this.me.sta, this.me.staMax, false);
    actorReact(this, this.kidSpr, "cheer");
    this.say(
      [
        ...lead,
        `${who} burst out of the bag!`,
        `${who} shoved ${fallen} aside and braced!`,
      ],
      "menu",
    );
    return true;
  }

  private isBigBattle(): boolean {
    if (!this.trainer || this.trainer.id === PAL_ID || !this.palSpr) return false;
    return (
      !!this.trainer.prize ||
      !!this.trainer.party?.length ||
      !!this.trainer.mate ||
      this.foeTeam > 1 ||
      this.trainer.id === "si-stevie" ||
      this.trainer.id === "si-atkins"
    );
  }

  /** Occasional Jess shout in gym / multi-mon fights — capped per battle. */
  private pushPalCheer(lines: Line[], kind: PalCheerKind, chance = 0.48): void {
    if (!this.isBigBattle() || this.palCheerN >= 2) return;
    if (Math.random() > chance) return;
    const jab = pickPalCheer(kind, this.lastPalCheer);
    if (!jab) return;
    this.lastPalCheer = jab.i;
    this.palCheerN += 1;
    actorReact(this, this.palSpr, "cheer");
    lines.push(jab.line);
  }

  /** Clutch shout when someone is on the ropes. */
  private maybeClutchCheer(lines: Line[]): void {
    if (!(this.nearDefeat(this.me) || this.nearDefeat(this.foe))) return;
    this.pushPalCheer(lines, "clutch", 0.38);
  }

  private gymTaunt(wiped: boolean): string | undefined {
    if (!this.trainer) return undefined;
    if (wiped && this.trainer.wipe) return this.trainer.wipe;
    // Gym wipe/taunt on faint still needs a prize; mid-fight uses pickTaunt.
    if (wiped && !this.trainer.prize) return undefined;
    if (!wiped && !this.trainer.prize && this.trainer.id !== STEVE_ID) return undefined;
    return this.pickTaunt();
  }

  private pickTaunt(): string | undefined {
    const pool = this.trainer?.taunt ?? [];
    if (!pool.length) return undefined;
    let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && i === this.lastTaunt) i = (i + 1) % pool.length;
    this.lastTaunt = i;
    return pool[i];
  }

  /** Steve mid-fight jab — not every hit, and avoid the last line. */
  private pickSteveTaunt(): string | undefined {
    if (Math.random() > 0.4) return undefined;
    return this.pickTaunt();
  }

  /** Near-defeat window for Steve's bike theft — close, but not a KO. */
  private nearDefeat(b: { hp: number; max: number }): boolean {
    const r = b.hp / b.max;
    return r > 0.18 && r <= 0.48;
  }

  private handleSteveBeat(lines: Line[], ko: boolean, victim: "me" | "foe"): boolean {
    if (!this.trainer || this.trainer.id !== STEVE_ID || this.steveStolen) return false;
    const jab = this.pickSteveTaunt();
    if (jab) lines.push({ who: this.trainer.who, text: jab });
    const target = victim === "me" ? this.me : this.foe;
    if (ko) {
      target.hp = Math.max(1, Math.floor(target.max * 0.32));
      if (victim === "me") this.meBar?.setHp(this.me.hp);
      else this.foeBar?.setHp(this.foe.hp);
    }
    if (!(ko || this.nearDefeat(this.me) || this.nearDefeat(this.foe))) return false;
    this.beginSteveTheft(lines);
    return true;
  }

  private beginSteveTheft(lead: Line[]): void {
    this.steveStolen = true;
    this.acts = [];
    if (lead.length) this.say(lead, "steveTheft");
    else this.playSteveTheft();
  }

  private playSteveTheft(): void {
    this.steveBusy = true;
    const bikeX = this.steveBike?.x ?? STEVE_BIKE.x;
    const bikeY = this.steveBike?.y ?? STEVE_BIKE.y;
    const thief = spawnBikeThief(this, -24, bikeY);
    this.steveThief = thief;
    this.tweens.add({
      targets: thief,
      x: bikeX,
      duration: 900,
      ease: "Linear",
      onComplete: () => this.grabSteveBike(),
    });
  }

  private grabSteveBike(): void {
    const thief = this.steveThief;
    if (!thief) {
      this.steveBusy = false;
      return;
    }
    this.steveBike?.destroy();
    this.steveBike = undefined;
    const held = this.add
      .image(thief.x, thief.y + 8, "bike-park")
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(4);
    this.tweens.add({
      targets: held,
      y: held.y - 4,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    // Run off with the bike before any dialogue.
    this.tweens.add({
      targets: thief,
      x: GBA_W + 48,
      duration: 900,
      ease: "Linear",
      delay: 120,
      onUpdate: () => {
        if (held.active && thief.active) held.setPosition(thief.x, thief.y + 8);
      },
      onComplete: () => {
        held.destroy();
        thief.destroy();
        this.steveThief = undefined;
        this.steveBusy = false;
        this.say(
          [
            "Steve's bike just got chored!",
            { who: STEVE_NAME, text: "OI! My bike! Come back you!" },
            { who: STEVE_NAME, text: "Leave it — that's my new…" },
          ],
          "steveChase",
        );
      },
    });
  }

  private chaseSteveThief(): void {
    this.steveBusy = true;
    const trainer = this.trainerSpr;
    if (trainer) {
      trainer.play(npcAnim(this.trainer?.look ?? "cap", "walk-side"));
      this.tweens.add({
        targets: trainer,
        x: GBA_W + 50,
        duration: 700,
        ease: "Sine.easeIn",
        onComplete: () => {
          trainer.destroy();
          this.trainerSpr = undefined;
        },
      });
    }
    this.time.delayedCall(800, () => {
      this.trainer = undefined;
      this.steveAbandoned = true;
      this.steveBusy = false;
      this.say(
        [
          "Steve ran after the thief.",
          "He left his Pompeymon behind.",
          "You put down a kebab box.",
        ],
        "steveCatch",
      );
    });
  }

  private autoSteveCatch(): void {
    if (run.party.length >= MAX_PARTY) {
      this.done = true;
      finishSteveCatch();
      this.storeHp();
      this.say(["No room in the party.", "The mon wandered off."], "done");
      return;
    }
    if (run.kebabBoxes > 0) useKebabBox();
    catchSpecies(this.foeId, this.foe.lv, { stubborn: true, nick: STOLEN_NICK });
    finishSteveCatch();
    this.done = true;
    this.storeHp();
    const lines: Line[] = [
      "The smell got it. It crawled in.",
      "You snapped the box shut.",
    ];
    if (!run.kebabCatch) {
      run.kebabCatch = true;
      lines.push({ who: "YOU", text: "Wow it actually worked." });
    }
    lines.push(`Gotcha. ${STOLEN_NICK}!`);
    this.say(lines, "done");
  }

  private faint(): void {
    this.storeHp();
    faintDrop(this, this.meSpr);
    actorReact(this, this.kidSpr, "loss");
    actorReact(this, this.activeTrainerSpr(), "cheer");
    const canFight = partyCanFight();
    const lines: Line[] = [`${this.me.name} fainted.`];
    const jab = this.gymTaunt(!canFight);
    if (jab && this.trainer) lines.push({ who: this.trainer.who, text: jab });
    if (canFight) {
      if (this.tryPricklesGuard(lines)) return;
      this.mustSwitch = true;
      lines.push("Send out another.");
      this.pushPalCheer(lines, "pinch", 0.55);
      this.say(lines, "bag");
      return;
    }
    if (this.trainer?.id === PAL_ID) {
      this.done = true;
      joinPal(false);
      healParty();
      lines.push("You lost.");
      this.say(lines, "done");
      return;
    }
    const sulk = run.party.find((p) => p.hp > 0 && p.stubborn);
    if (sulk) lines.push(`${monLabel(sulk)} won't come out of the bag!`);
    this.done = true;
    run.whiteout = true;
    lines.push("You blacked out.");
    this.say(lines, "done");
  }

  /** Only stubborn left awake — treat as a wipe. */
  private blackoutStubborn(extra: Line[] = []): void {
    this.mustSwitch = false;
    this.bag?.hide();
    this.menu?.hide();
    if (this.trainer?.id === PAL_ID) {
      this.done = true;
      joinPal(false);
      healParty();
      this.say([...extra, "You lost."], "done");
      return;
    }
    this.done = true;
    run.whiteout = true;
    const sulk = run.party.find((p) => p.hp > 0 && p.stubborn);
    const lines = [...extra];
    if (sulk && !extra.some((l) => (typeof l === "string" ? l : l.text).includes("won't come out"))) {
      lines.push(`${monLabel(sulk)} won't come out of the bag!`);
    }
    lines.push("You blacked out.");
    this.say(lines, "done");
  }

  private grantXp(): string[] {
    const mine = run.party[this.meSlot];
    if (!mine) return [];
    const beforeLv = mine.lv;
    const gained = xpForKo(this.foe.lv, BATTLE[this.foe.id].exp, !!this.trainer);
    const grew = applyXp(mine, gained);
    this.syncMeFromParty(mine.lv > beforeLv);
    return [`${this.me.name} gained ${gained} XP.`, ...grew];
  }

  /** Pull party level / HP / moves onto the active battler after XP. */
  private syncMeFromParty(leveled: boolean): void {
    const mine = run.party[this.meSlot];
    if (!mine) return;
    const spec = BATTLE[mine.id];
    this.me.lv = mine.lv;
    this.me.max = scaled(spec.hp, mine.lv);
    this.me.atk = scaled(spec.atk, mine.lv);
    this.me.def = scaled(spec.def, mine.lv);
    this.me.spd = scaled(spec.spd, mine.lv);
    this.me.hp = Math.max(0, Math.min(mine.hp, this.me.max));
    const known = resolveMoves(mine.moves.length ? mine.moves : []);
    this.me.moves = known.length ? known : movesForLevel(mine.id, mine.lv);
    if (!this.me.moves.some((m) => m.id === this.me.move.id)) {
      this.me.move = this.me.moves[0] ?? this.me.move;
    }
    this.meBar?.setMon(this.me.name, this.me.max, this.me.lv, this.me.hp, this.me.sta, this.me.staMax, this.me.overcharged);
    if (leveled) this.meBar?.flashLevel(this.me.lv);
  }

  private storeHp(): void {
    const mine = run.party[this.meSlot];
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
    this.stopFlames();
    this.goBack();
  }

  private goBack(): void {
    if (inDebugSession()) {
      leaveDebugSession(this);
      return;
    }
    if (run.whiteout) {
      // Over the bridge you come round in the Hilsea centre, not Choke's.
      const where = run.overworld?.scene ?? "";
      const hilsea = where === "island" || where === "school" || where === "schoolin" || where === "bridge";
      run.overworld = null;
      clearField();
      persistRun();
      this.scene.start(hilsea ? "centre" : "lab");
      return;
    }
    const dest = run.overworld?.scene ?? "island";
    persistRun();
    this.scene.start(dest, { from: "battle" });
  }
}
