/** Title-screen voices toggle. On unless the player has turned them off. */

const KEY = "canoe-lake-voices";

export function readVoicesEnabled(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "off" || raw === "0" || raw === "false") return false;
  } catch {
    /* private mode */
  }
  return true;
}

export function writeVoicesEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}
