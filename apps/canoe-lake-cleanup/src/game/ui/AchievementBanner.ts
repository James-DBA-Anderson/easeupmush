/**
 * Toast when a new achievement lands — sits under the mission flash.
 */
export class AchievementBanner {
  private root: HTMLElement;
  private title: HTMLElement;
  private detail: HTMLElement;
  private left = 0;
  private queue: { title: string; detail: string }[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.title = root.querySelector(".achievement-banner-title") as HTMLElement;
    this.detail = root.querySelector(".achievement-banner-detail") as HTMLElement;
  }

  public show(title: string, detail: string): void {
    if (this.left > 0) {
      this.queue.push({ title, detail });
      return;
    }
    this.present(title, detail);
  }

  public update(delta: number): void {
    if (this.left <= 0) return;
    this.left -= delta;
    if (this.left <= 0.5) this.root.classList.add("out");
    if (this.left > 0) return;
    this.root.classList.remove("show", "out");
    const next = this.queue.shift();
    if (next) this.present(next.title, next.detail);
  }

  private present(title: string, detail: string): void {
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.root.classList.remove("show", "out");
    void this.root.offsetWidth;
    this.root.classList.add("show");
    this.left = 4.4;
  }
}
