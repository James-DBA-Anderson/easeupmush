/** First unlocks for Backflip Bill — no money in them. Persist in the browser. */

export type AchievementId = "breakfast";

export interface AchievementDef {
  id: AchievementId;
  title: string;
  detail: string;
}

export const ACHIEVEMENT_LIST: readonly AchievementDef[] = [
  {
    id: "breakfast",
    title: "Breakfast",
    detail: "You knocked the nest. Two eggs on the floor — no dosh in it.",
  },
];

const KEY = "backflip-bill-achievements";

function loadHave(): Set<AchievementId> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const known = new Set(ACHIEVEMENT_LIST.map((a) => a.id));
    return new Set(parsed.filter((id): id is AchievementId => known.has(id)));
  } catch {
    return new Set();
  }
}

function saveHave(have: Set<AchievementId>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...have]));
  } catch {
    /* private mode */
  }
}

export class AchievementBanner {
  private root: HTMLElement;
  private title: HTMLElement;
  private detail: HTMLElement;
  private left = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.title = root.querySelector(".achievement-banner-title") as HTMLElement;
    this.detail = root.querySelector(".achievement-banner-detail") as HTMLElement;
  }

  public show(title: string, detail: string): void {
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.root.classList.remove("show", "out");
    void this.root.offsetWidth;
    this.root.classList.add("show");
    this.left = 4.6;
  }

  public update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0.5) this.root.classList.add("out");
    if (this.left > 0) return;
    this.root.classList.remove("show", "out");
  }
}

export class Achievements {
  private have = loadHave();
  private banner: AchievementBanner | null;

  constructor(root: HTMLElement | null) {
    this.banner = root ? new AchievementBanner(root) : null;
  }

  public unlock(id: AchievementId): boolean {
    if (this.have.has(id)) return false;
    this.have.add(id);
    saveHave(this.have);
    const def = ACHIEVEMENT_LIST.find((a) => a.id === id);
    if (def) this.banner?.show(def.title, def.detail);
    return true;
  }

  public update(dt: number): void {
    this.banner?.update(dt);
  }
}
