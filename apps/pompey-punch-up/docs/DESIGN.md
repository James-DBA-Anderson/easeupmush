# Design notes — Pompey Punch-Up

Web game (browser). Phaser 3 + TypeScript + Vite.

## Setting hook

Player wakes on Southsea beach after a heavy night. A car pulls up; mean lads pile out. Combat starts immediately. He accidentally offended the first boss’s mum while drunk — the gang was sent to find him. He’s known throughout Pompey.

## Tone & art

Crude hand-drawn look a 14-year-old would sketch to make mates laugh: wonky proportions, thick marker lines, slapstick violence. Streets of Rage 2 structure, Pompey humour.

## Combat (locked) — no health bars

**Problem we’re solving:** Hate the moment where a lad is fighting at full intensity, you clip the last sliver of a health bar with a sweep kick, and he’s suddenly out cold. That feels fake.

**Rule:** Nobody has a health bar. You don’t “chip HP to zero.” You **wear people down**, create an opening, then land a strike that **immobilises** or **KOs** them. The body tells the truth — posture, limp limbs, stumbling, dropped guard, face — never a UI meter.

### Feel examples (canon)
- Dodge a haymaker → their chin is exposed → clean shot → lights out or long stun.
- Smash a forearm with a bottle → that arm hangs useless → they can’t block / grab on that side → you finish them.
- Keep landing body shots → they fold, breathe heavy, attacks get slower / more telegraphed → then a finisher sticks.
- Grab / takedown → enemy opened on the floor → boot to the head.
- Boot to the nuts → temporary slow / disable, but **anger spikes** (face shows it) → they fight more erratically and leave bigger openings.
- Throw into a wall / bin / bollard / off a ledge → landing itself can be the finisher.
- Wide weapon swing → wind or KO **several** lads in one arc if they’re in the path and vulnerable enough.

### Outcomes (locked)

| Result | When | What the player sees |
|--------|------|----------------------|
| **Crawl-away KO** | Normal finishers, worn enemies, non-critical openings | Flattened, stars, then dragging themselves off / out of the scrap |
| **Properly out cold** | Strong attack to an **exposed critical** (chin, temple, etc. while open) | Full lights-out — no crawl, done for this fight |
| **Temporary disable** | Low blows, limb hits, hard wind | Bent over, hopping, one arm dead — still in the fight soon |
| **Terrain finisher** | Throw / shove into danger or off an edge | Impact on object / fall sells the end — no extra “HP check” |

Most fights end crawl-away. Out cold is the punchline for a clean critical on someone you’ve opened up.

### Hidden model (player never sees numbers)

Each fighter has **structure**, not hit points:

| Layer | What it is | Player sees |
|-------|------------|-------------|
| **Balance** | How planted / upright they are | Stumble, hop back, on one knee |
| **Guard** | Can they still protect themselves | Arms up vs arms down / one arm dangling |
| **Wind** | Breath / stamina under pressure | Slower swings, longer recovery, hands on knees |
| **Limbs** | Per-arm / per-leg integrity | Bad arm → can’t punch/block/grab. Bad leg → slower walk / no run/kick |
| **Anger** | How steamed off they are (esp. after cheap shots) | Face: scowl → scarlet rage scribble; wilder swings |
| **Openings** | Short windows after whiffs, blocks broken, dodges, grabs, rage whiffs | Chin up, on the floor, mid-recovery freeze, overcommitted haymaker |

A “strong” punch on a fresh, guarded enemy mostly **chips wind / balance** and makes them flinch. The same punch on a **worn, exposed** enemy can **KO or put them out cold**. Context matters more than raw damage.

**Anger trade-off:** dirty hits (nuts, taunts later) buy a disable now, but raise anger. High anger = harder hits, worse telegraphs, bigger whiff recoveries — more dangerous *and* more finishable.

### How a fight ends
1. **Wear** — chips to wind/balance/limbs via pressure, weapons, combos; crowd can share weapon arcs.
2. **Break** — guard drops, limb disabled, hard stumble, or rage-induced overcommit.
3. **Open** — whiff, dodge, broken arm-guard, **grab/takedown**, floor state, rage haymaker.
4. **Finish** — boot to head on a downed/opened lad; chin/temple on expose → **out cold**; softer finish → **crawl-away**; throw into **terrain/edge** → impact finisher.

Random jabs should almost never floor a fresh enemy. Finishers should feel *earned*.

### Grabs, takedowns, throws (locked)
- **Grab / takedown:** primary job is to **open** them (on the floor / held) for a follow-up (boot to head). Not an instant win by itself unless they’re already broken.
- **Low blow (nuts):** temporary slow/disable + **anger up**. Visual face change is mandatory.
- **Throws:** reposition + soft wear on normal landings; **finisher** if they hit a dangerous prop (railings, bins, car, pier edge, steps) or go off an edge.

### Crowds & weapons (locked)
- Focusing one lad to break/open him remains the cleanest path.
- **Weapon swings** can hit a cone/arc: wind several at once; KO / out cold only those already open or critically struck in that swing.
- Cleaving a fresh crowd should stagger/wind them — not delete the whole beach in one bottle swipe.

### Readability (critical for a brawler)
Because there’s no bar, **animation is the HUD**:
- Fresh: upright, arms ready, sharp attacks.
- Worn: hunched, mouth open, slower tells.
- Hurt arm: scribble-limb dangling; that side can’t block.
- Angry: furious face, wilder commits, bigger openings after whiffs.
- Open chin / on floor: brief freeze, tipped head, grounded.
- Crawl-away KO vs out cold: distinct end poses (dragging off vs flat snoring scribble).

Same rules for the **player** — worn down, missing an arm, punch-drunk, or steamed. No secret green bar.

### MVP combat scope
- Balance + wind + anger + one arm/guard break + dodge→chin + grab→boot.
- One weapon (bottle): limb disable + **arc swing** that can wind a small group.
- Crawl-away as default KO; out cold only on strong critical-to-exposed.
- One terrain finisher prop on the beach (bin / railing / sea wall edge).
- No floating damage numbers, no health bars, no boss HP skull meters.

## MVP slice

Beach wake-up → car arrival → first brawl waves → reveal about Dave’s mum → tease / first boss beat.

## Open questions

See README — title, player name, rudeness level, co-op, art pipeline, locations, boss vibe.

## Delivery

Standalone static site. `npm run build` → `dist/`. Deployed via GitHub Actions to GitHub Pages on `main`. Any static host that serves `dist/` also works. Custom domain via `public/CNAME` when ready.
