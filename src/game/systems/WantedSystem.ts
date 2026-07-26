/** Stars go up when you batter civilians; decay over time. Police at high heat. */

export class WantedSystem {
  /** 0–5 */
  level = 0;
  private heat = 0;
  private decayAcc = 0;
  /** Heat must hold before the first copper turns up. */
  private policeHold = 0;
  private readonly policeHoldNeed = 9;

  bump(amount: number): void {
    // Civilian heat builds slowly — you get a few free swings before Bill clocks it
    this.heat = Math.min(5, this.heat + amount * 0.55);
    this.syncLevel();
  }

  update(dt: number): void {
    if (this.heat <= 0) {
      this.policeHold = 0;
      return;
    }
    this.decayAcc += dt;
    // Cool off slower to feel fair, but pip drop is gentler
    if (this.decayAcc >= 16) {
      this.decayAcc = 0;
      this.heat = Math.max(0, this.heat - 0.4);
      this.syncLevel();
    }

    // Bill only commits after sustained heat
    if (this.level >= 4) {
      this.policeHold = Math.min(this.policeHoldNeed, this.policeHold + dt);
    } else {
      this.policeHold = Math.max(0, this.policeHold - dt * 0.5);
    }
  }

  private syncLevel(): void {
    this.level = Math.min(5, Math.floor(this.heat + 0.001));
  }

  /** How many bill should be on the beach right now. */
  desiredPoliceCount(): number {
    if (this.policeHold < this.policeHoldNeed) return 0;
    if (this.level >= 5 && this.policeHold >= this.policeHoldNeed + 8) return 2;
    if (this.level >= 4) return 1;
    return 0;
  }

  starsLabel(): string {
    if (this.level <= 0) return "";
    return "★".repeat(this.level) + "☆".repeat(5 - this.level);
  }
}
