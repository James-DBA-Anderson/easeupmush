import type { MissionId } from "./missions";

/** Where a debug boot drops you into the shift. */
export type DebugFrom = "start" | MissionId;

const FROM_VALUES: readonly DebugFrom[] = [
  "start",
  "picnic",
  "geese",
  "fire",
  "racers",
  "rebels",
] as const;

export function isDebugFrom(v: unknown): v is DebugFrom {
  return typeof v === "string" && (FROM_VALUES as readonly string[]).includes(v);
}

/** `?debug=1&from=geese` — skip van intro and optionally jump a mission. */
export function readDebugBoot(): { from: DebugFrom } | null {
  if (typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  const flag = q.get("debug");
  if (flag !== "1" && flag !== "true") return null;
  const raw = q.get("from") ?? "start";
  return { from: isDebugFrom(raw) ? raw : "start" };
}

export function debugPlayUrl(from: DebugFrom): string {
  const q = new URLSearchParams({ debug: "1", from });
  return `./?${q.toString()}`;
}

export const DEBUG_FROM_LABELS: Record<DebugFrom, string> = {
  start: "Start of shift",
  picnic: "Picnic raid",
  geese: "Geese inbound",
  fire: "Grass fire",
  racers: "Boy racers",
  rebels: "Rebel raid",
};
