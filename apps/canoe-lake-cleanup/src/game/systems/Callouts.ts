import { line, sender } from "../../dialogue";
import type { Messages } from "../ui/Messages";

/** Everything the phone might go off about. */
export type Callout =
  | "shift"
  | "jobs"
  | "picnic"
  | "poo"
  | "litter"
  | "bin"
  | "graffiti"
  | "swan"
  | "ebike"
  | "drunks"
  | "dunk"
  | "gulls"
  | "fire"
  | "spitfire"
  | "rebels"
  | "racers"
  | "geese"
  | "swanboat"
  | "punchup"
  | "kingswan"
  | "praise";

/** How long before the same sort of job can be reported again. */
const COOLDOWN: Record<Callout, number> = {
  shift: 9999,
  jobs: 9999,
  picnic: 9999,
  poo: 160,
  litter: 140,
  bin: 120,
  graffiti: 200,
  swan: 90,
  ebike: 130,
  drunks: 160,
  dunk: 90,
  gulls: 180,
  fire: 9999,
  spitfire: 600,
  rebels: 9999,
  racers: 9999,
  geese: 9999,
  swanboat: 9999,
  punchup: 9999,
  kingswan: 9999,
  praise: 300,
};

/**
 * Jobs that need the player. Only one of these goes through at a time, with a
 * gap between, so the phone doesn't bury them under three things at once.
 */
const TROUBLE: ReadonlySet<Callout> = new Set([
  "poo",
  "litter",
  "bin",
  "graffiti",
  "swan",
  "ebike",
  "drunks",
  "gulls",
  "fire",
  "picnic",
  "geese",
]);

/** Breathing room between any two jobs that need sorting. */
const TROUBLE_GAP = 35;
/** Quiet stretch at the start of the shift before anything's phoned in. */
const SHIFT_GRACE = 55;

const VOICE: Record<Callout, string> = {
  shift: "depot",
  jobs: "depot",
  picnic: "depot",
  poo: "depot",
  litter: "park-warden",
  bin: "depot",
  graffiti: "park-warden",
  swan: "control-999",
  ebike: "pcso-grant",
  drunks: "pcso-grant",
  dunk: "control-999",
  gulls: "park-warden",
  fire: "control-999",
  spitfire: "dave-depot",
  rebels: "control-999",
  racers: "pcso-grant",
  geese: "control-999",
  swanboat: "boatman",
  punchup: "park-warden",
  kingswan: "solent-news",
  praise: "depot",
};

/** Names for the ends of the lake, so a job comes with somewhere to go. */
function whereabouts(x: number, z: number): string {
  const end = x > 55 ? "the east end" : x < -55 ? "the west end" : "the middle";
  const side = z > 12 ? "parade side" : z < -12 ? "seafront side" : "";
  return side ? `by ${end}, ${side}` : `by ${end}`;
}

/**
 * The work phone. Jobs are raised by the game as it spots them; this keeps
 * one of each sort on the go at a time so the corner doesn't fill up with
 * the same complaint.
 */
export class Callouts {
  private messages: Messages;
  private waits = new Map<Callout, number>();
  private troubleIn = SHIFT_GRACE;

  constructor(messages: Messages) {
    this.messages = messages;
  }

  public update(delta: number): void {
    if (this.troubleIn > 0) this.troubleIn -= delta;
    for (const [job, left] of this.waits) {
      if (left <= delta) this.waits.delete(job);
      else this.waits.set(job, left - delta);
    }
  }

  /** Raises a job if that sort hasn't been through recently. */
  public raise(
    job: Callout,
    clock: string,
    at?: { x: number; z: number },
  ): boolean {
    if (this.waits.has(job)) return false;
    if (TROUBLE.has(job) && this.troubleIn > 0) return false;

    this.waits.set(job, COOLDOWN[job]);
    if (TROUBLE.has(job)) this.troubleIn = TROUBLE_GAP;

    const who = VOICE[job];
    const where = at ? whereabouts(at.x, at.z) : "round the lake";
    this.messages.send(
      sender(who),
      line(who, job).replace("{where}", where),
      clock,
    );
    return true;
  }

  /** Hold reactive jobs (opening tip still on). */
  public lockTrouble(): void {
    this.troubleIn = 1e9;
  }

  /** Opening tip cleared enough — the rest of the shift can phone in. */
  public unlockTrouble(): void {
    this.troubleIn = 0;
  }
}
