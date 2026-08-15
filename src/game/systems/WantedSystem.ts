/** Stars go up when you batter civilians; decay over time. Police at high heat. */

export class WantedSystem {
  /** 0–5 */
  level = 0;
  private heat = 0;
  private decayAcc = 0;
  /** Heat must hold before the first copper turns up. */
  private policeHold = 0;
  /** Longer hold so a scrap doesn't bring Bill every minute. */
  private readonly policeHoldNeed = 7.5;

  bump(amount: number): void {
    this.heat = Math.min(5, this.heat + amount * 0.55);
    this.syncLevel();
  }

  update(dt: number): void {
    if (this.heat <= 0) {
      this.policeHold = 0;
      return;
    }
    this.decayAcc += dt;
    if (this.decayAcc >= 12) {
      this.decayAcc = 0;
      this.heat = Math.max(0, this.heat - 0.38);
      this.syncLevel();
    }

    // Bill only commits once you're properly hot — and it takes a while
    if (this.level >= 4) {
      this.policeHold = Math.min(this.policeHoldNeed + 14, this.policeHold + dt);
    } else {
      this.policeHold = Math.max(0, this.policeHold - dt * 0.55);
    }
  }

  private syncLevel(): void {
    this.level = Math.min(5, Math.floor(this.heat + 0.001));
  }

  /** How many bill should be on the beach right now. */
  desiredPoliceCount(): number {
    if (this.policeHold < this.policeHoldNeed) return 0;
    // One copper is enough — second only at max heat after a long hold
    if (this.level >= 5 && this.policeHold >= this.policeHoldNeed + 10) return 2;
    if (this.level >= 4) return 1;
    return 0;
  }

  /** Slip them a bung — cools the heat and buys the Bill off for a bit. */
  acceptBribe(heatDrop = 2.4): void {
    this.heat = Math.max(0, this.heat - heatDrop);
    this.policeHold = 0;
    this.decayAcc = 0;
    this.syncLevel();
  }

  /** Cash the Bill expect for looking the other way. */
  bribeCost(): number {
    return 18 + this.level * 12;
  }

  starsLabel(): string {
    if (this.level <= 0) return "";
    return "★".repeat(this.level) + "☆".repeat(5 - this.level);
  }
}
