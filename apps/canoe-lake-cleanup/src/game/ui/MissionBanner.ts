/**
 * Top-of-screen flash when a scripted mission kicks off or wraps.
 */
export class MissionBanner {
  private root: HTMLElement;
  private eyebrow: HTMLElement;
  private title: HTMLElement;
  private left = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.eyebrow = root.querySelector(".mission-banner-eyebrow") as HTMLElement;
    this.title = root.querySelector(".mission-banner-title") as HTMLElement;
  }

  public show(
    name: string,
    duration = 4.8,
    kind: "start" | "done" = "start",
  ): void {
    this.title.textContent = name;
    this.eyebrow.textContent = kind === "done" ? "MISSION COMPLETE" : "MISSION";
    this.root.classList.toggle("complete", kind === "done");
    this.root.classList.remove("show", "out");
    void this.root.offsetWidth;
    this.root.classList.add("show");
    this.left = duration;
  }

  public update(delta: number): void {
    if (this.left <= 0) return;
    this.left -= delta;
    if (this.left <= 0.55) this.root.classList.add("out");
    if (this.left <= 0) {
      this.root.classList.remove("show", "out", "complete");
      this.title.textContent = "";
    }
  }
}
