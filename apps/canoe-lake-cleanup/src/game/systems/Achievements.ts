import { parkAudio } from "../audio/ParkAudio";
import type { AchievementBanner } from "../ui/AchievementBanner";

export type AchievementId =
  | "rc-sink"
  | "gym-spray"
  | "gardener-happy"
  | "gull-down";

export interface AchievementDef {
  id: AchievementId;
  title: string;
  detail: string;
}

export const ACHIEVEMENT_LIST: readonly AchievementDef[] = [
  {
    id: "rc-sink",
    title: "Toy navy",
    detail: "You sank a kid's radio boat.",
  },
  {
    id: "gym-spray",
    title: "Protein rinse",
    detail: "The muscle lads loved the lance.",
  },
  {
    id: "gardener-happy",
    title: "That's the stuff",
    detail: "You watered the beds. He almost smiled.",
  },
  {
    id: "gull-down",
    title: "Mayday",
    detail: "You knocked a herring gull out of the air.",
  },
] as const;

function defFor(id: AchievementId): AchievementDef {
  return ACHIEVEMENT_LIST.find((a) => a.id === id)!;
}

/** Unlocks once per shift, with a toast the first time each one lands. */
export class Achievements {
  readonly total = ACHIEVEMENT_LIST.length;
  private thisShift = new Set<AchievementId>();
  private banner: AchievementBanner;

  constructor(banner: AchievementBanner) {
    this.banner = banner;
  }

  public unlock(id: AchievementId): void {
    if (this.thisShift.has(id)) return;
    this.thisShift.add(id);
    const def = defFor(id);
    this.banner.show(def.title, def.detail);
    parkAudio.choreDone();
  }

  public update(delta: number): void {
    this.banner.update(delta);
  }

  public shiftCount(): number {
    return this.thisShift.size;
  }

  public shiftUnlocks(): AchievementDef[] {
    return ACHIEVEMENT_LIST.filter((a) => this.thisShift.has(a.id));
  }
}
