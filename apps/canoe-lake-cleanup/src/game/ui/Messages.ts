/**
 * The work phone. Jobs come in as texts from the depot and from the public,
 * stacking up in the bottom right corner and fading out once they're stale.
 */

/** How long a message sits there, and how many are on screen at once. */
const LIFE = 14;
const MAX_ON_SCREEN = 4;

interface Note {
  element: HTMLElement;
  left: number;
}

export class Messages {
  private panel: HTMLElement;
  private notes: Note[] = [];

  constructor(panel: HTMLElement) {
    this.panel = panel;
  }

  /** A new text, from whoever, with the time it landed. */
  public send(from: string, text: string, clock: string): void {
    const element = document.createElement("div");
    element.className = "message";
    element.innerHTML = `<div class="message-from">${from}<span>${clock}</span></div>${text}`;
    this.panel.appendChild(element);
    // Let the browser see it in its starting state before it slides in.
    requestAnimationFrame(() => element.classList.add("in"));

    this.notes.push({ element, left: LIFE });
    while (this.notes.length > MAX_ON_SCREEN) this.drop(0);
  }

  public update(delta: number): void {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i]!;
      note.left -= delta;
      if (note.left <= 1.2) note.element.classList.remove("in");
      if (note.left <= 0) this.drop(i);
    }
  }

  private drop(index: number): void {
    const note = this.notes[index]!;
    note.element.remove();
    this.notes.splice(index, 1);
  }
}
