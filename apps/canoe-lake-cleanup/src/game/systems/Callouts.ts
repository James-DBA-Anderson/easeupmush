import type { Messages } from "../ui/Messages";

/** Everything the phone might go off about. */
export type Callout =
  | "shift"
  | "poo"
  | "litter"
  | "bin"
  | "graffiti"
  | "swan"
  | "ebike"
  | "branches"
  | "gulls"
  | "spitfire"
  | "praise";

/** How long before the same sort of job can be reported again. */
const COOLDOWN: Record<Callout, number> = {
  shift: 9999,
  poo: 160,
  litter: 140,
  bin: 120,
  graffiti: 200,
  swan: 90,
  ebike: 130,
  branches: 150,
  gulls: 180,
  spitfire: 600,
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
  "branches",
  "gulls",
]);

/** Breathing room between any two jobs that need sorting. */
const TROUBLE_GAP = 35;
/** Quiet stretch at the start of the shift before anything's phoned in. */
const SHIFT_GRACE = 55;

const SENDERS: Record<Callout, string> = {
  shift: "DEPOT",
  poo: "DEPOT",
  litter: "PARK WARDEN",
  bin: "DEPOT",
  graffiti: "PARK WARDEN",
  swan: "999 CONTROL",
  ebike: "PCSO GRANT",
  branches: "TREE OFFICER",
  gulls: "PARK WARDEN",
  spitfire: "DAVE (DEPOT)",
  praise: "DEPOT",
};

/**
 * The wording. Each job has a few versions so the same text isn't coming
 * through all afternoon, and some take a place name.
 */
const LINES: Record<Callout, readonly string[]> = {
  shift: [
    "Morning. Lake's yours today. Washer's charged, sack's in the van.",
    "You look hanging, mush. Coffee's in the van if you need it.",
  ],
  poo: [
    "Complaints piling up about swan mess on the paving. Get the lance on it.",
    "That's three calls now about the state of the path. Sort it out please.",
    "Mess by the {where} needs doing before someone goes over on it.",
    "Public's copped the needle about the mess {where}. Lance it.",
  ],
  litter: [
    "Litter reported {where}. Spike it before the gulls get at it.",
    "Rubbish blowing about {where}. Bag it up when you can.",
    "Someone's tipped their grub out {where}. Over to you.",
    "Chip paper and all sorts {where}. Spike the grub wrappers.",
  ],
  bin: [
    "Bin's overflowing {where}. Swap the sack out.",
    "Public reporting a full bin {where}. Can you get to it?",
    "That bin {where} is heaving again. Empty it.",
  ],
  graffiti: [
    "Fresh tag on the wall {where}. Washer should shift it.",
    "They've been at the brickwork again {where}. Get it off today.",
    "Graffiti reported {where}. Before the paper gets a photo of it.",
    "Some scummer's had a go at the wall {where}. Scrub it.",
  ],
  swan: [
    "Caller says a swan's gone for someone {where}. Can you get between them?",
    "Swan attacking a member of the public {where}. Careful, they bite.",
    "Report of a bird going mad at a woman {where}. Have a look.",
    "Caller's copped it from a swan {where}. Get between them.",
  ],
  ebike: [
    "Lads on e-bikes tearing round the path again. Keep out of their way.",
    "Two on an e-bike doing forty past the café. Not your problem, but mind out.",
    "E-bikes on the footpath {where}. Nothing you can do, just don't get flattened.",
  ],
  branches: [
    "Kids swinging on the low branches {where}. Move them on before it snaps.",
    "Tree officer's been on: someone's hanging off the limbs {where}.",
    "They've had a branch off the oak {where}. That's a written report, that.",
  ],
  gulls: [
    "Gulls have got at somebody's chips again. Expect a mess after.",
    "Flock of gulls down on the paving {where}. Whatever they're eating, it wasn't theirs.",
    "Caller's lost her grub to a seagull {where}. Nothing we can do, but mind the aftermath.",
  ],
  spitfire: [
    "Spitfire's coming down the front. Look up, you'll miss it.",
    "That's the Spitfire over again. Best thing you'll see all shift.",
    "Spitfire inbound from Hayling, off out over the Island. Stop and watch it.",
    "Spitfire up. Sweet as nut, that. Have a look.",
  ],
  praise: [
    "Park's looking smart today. Whatever you're doing, keep at it.",
    "Not a single complaint this hour. Don't get used to it.",
    "Sweet as nut up there. You're clued up, I'll give you that.",
  ],
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

    const options = LINES[job];
    const line = options[Math.floor(Math.random() * options.length)]!;
    const where = at ? whereabouts(at.x, at.z) : "round the lake";
    this.messages.send(SENDERS[job], line.replace("{where}", where), clock);
    return true;
  }
}
