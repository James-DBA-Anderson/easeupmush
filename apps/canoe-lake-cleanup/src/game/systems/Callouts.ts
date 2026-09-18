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

const SENDERS: Record<Callout, string> = {
  shift: "DEPOT",
  jobs: "DEPOT",
  picnic: "DEPOT",
  poo: "DEPOT",
  litter: "PARK WARDEN",
  bin: "DEPOT",
  graffiti: "PARK WARDEN",
  swan: "999 CONTROL",
  ebike: "PCSO GRANT",
  drunks: "PCSO GRANT",
  dunk: "999 CONTROL",
  gulls: "PARK WARDEN",
  fire: "999 CONTROL",
  spitfire: "DAVE (DEPOT)",
  rebels: "999 CONTROL",
  racers: "PCSO GRANT",
  geese: "999 CONTROL",
  praise: "DEPOT",
};

/**
 * The wording. Each job has a few versions so the same text isn't coming
 * through all afternoon, and some take a place name.
 */
const LINES: Record<Callout, readonly string[]> = {
  shift: [
    "Morning. Overnight tip's right by you — lance that paving first.",
    "You look hanging, mush. Swans have carpeted the path by the van. Get stuck in.",
  ],
  jobs: [
    "Feeders in the north-west section. Get there before the birds carpet the place.",
    "We've got feeders on the north-west stretch. Birds'll bury that path if you hang about.",
    "North-west feeding corner's busy. Get over before the swans and gulls carpet it.",
    "Caller says bags out on the north-west path. Move — the birds will carpet it.",
  ],
  picnic: [
    "Gulls have got into a picnic {where}. Get over and hose them out of the sky.",
    "Seagulls diving a picnic on the east green. Spray them off before they strip it.",
    "Caller says herring gulls are all over a picnic {where}. Lance them mid-air.",
    "Picnic under attack {where}. Get the washer up and knock those gulls out of it.",
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
  drunks: [
    "Drinkers on the grass {where} after closing. Move them on, please.",
    "Caller says a group with cans {where}. Ask them to clear off.",
    "Late drinkers reported {where}. PCSO wants them shifted before it kicks off.",
    "They're still on the green {where} with the tins. Move them on.",
  ],
  dunk: [
    "Someone's gone in the lake {where}. Get down there and see they're alright.",
    "Old dear's fallen in the pond {where}. Make sure she gets out.",
    "Caller says a lady's in the water {where}. You're nearest.",
    "Public in the drink {where}. Check on them — don't hang about.",
  ],
  gulls: [
    "Gulls have got at somebody's chips again. Expect a mess after.",
    "Flock of gulls down on the paving {where}. Whatever they're eating, it wasn't theirs.",
    "Caller's lost her grub to a seagull {where}. Nothing we can do, but mind the aftermath.",
  ],
  fire: [
    "BBQ's set the grass off {where}. Get the washer on it before it walks.",
    "Caller says the green's alight by a barbecue {where}. Hose it. Now.",
    "Grass fire spreading from a disposable {where}. You're nearest — put it out.",
    "Fire on the lawn {where}. Lance it before the brigade's got to roll.",
  ],
  spitfire: [
    "Spitfire's coming down the front. Look up, you'll miss it.",
    "That's the Spitfire over again. Best thing you'll see all shift.",
    "Spitfire inbound from Hayling, off out over the Island. Stop and watch it.",
    "Spitfire up. Sweet as nut, that. Have a look.",
  ],
  rebels: [
    "MAJOR INCIDENT. Gosport separatist rebels storming Southsea Beach — intent on Canoe Lake. Hold the park.",
  ],
  racers: [
    "Boy racers on the esplanade again — Skylines hammering it up and down. Keep clear of the road.",
    "Reports of modified cars racing the seafront. Loud as you like. Watch the esplanade.",
    "PCSO Grant: two GTs thrashing Eastney Esplanade. If one of them bottles it, you'll know about it.",
  ],
  geese: [
    "Radar's picked up a flock of geese inbound. Get back to the van — heavy hose in the load bay.",
    "Incoming geese on radar. Van. Back doors. Heavy hose. You haven't got long.",
    "Control says a V of Canada geese is coming in. Heavy washer from the van — take them out of the sky.",
    "Geese on the scope heading for the lake. Open the back of the van and grab the heavy reel.",
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

  /** Hold reactive jobs (opening tip still on). */
  public lockTrouble(): void {
    this.troubleIn = 1e9;
  }

  /** Opening tip cleared enough — the rest of the shift can phone in. */
  public unlockTrouble(): void {
    this.troubleIn = 0;
  }
}
