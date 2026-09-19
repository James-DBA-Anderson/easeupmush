/**
 * Top-of-screen flash when a scripted mission kicks off — name only, short life.
 */
export class MissionBanner {
  private root: HTMLElement;
  private title: HTMLElement;
  private left = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.title = root.querySelector(".mission-banner-title") as HTMLElement;
  }

  public show(name: string, duration = 4.8): void {
    this.title.textContent = name;
    this.root.classList.remove("show", "out");
    // Force reflow so the enter animation restarts if two missions fire close.
    void this.root.offsetWidth;
    this.root.classList.add("show");
    this.left = duration;
  }

  public update(delta: number): void {
    if (this.left <= 0) return;
    this.left -= delta;
    if (this.left <= 0.55) this.root.classList.add("out");
    if (this.left <= 0) {
      this.root.classList.remove("show", "out");
      this.title.textContent = "";
    }
  }
}
