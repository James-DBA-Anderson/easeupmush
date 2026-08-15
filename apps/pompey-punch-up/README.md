# Pompey Punch-Up

A hand-drawn *Streets of Rage 2*–style web brawler set on the Southsea seafront.

Part of the [Ease Up Mush](https://easeupmush.com) monorepo — play at `/games/pompey-punch-up/` on the site.

You wake up on the beach after a messy night out. A car pulls up. Mean lads pile out. Turns out you’re known throughout Pompey — and last night, while bladdered, you accidentally offended the mother of the first boss. He’s sent his gang to find you.

**Art direction:** thick marker lines and wonky humour, but closer to SOR2 side-on sprites than stick figures — walk cycles, limp limbs, bloodied faces, chalk-red damage on the portrait.

---

## Play

From the **repo root**:

```bash
npm install
npm run debug    # fight sandbox at /debug (no auto-reload)
npm run dev:game # full beach at /
```

Or from this package:

```bash
npm run debug -w @easeupmush/pompey-punch-up
npm run dev -w @easeupmush/pompey-punch-up
```

Open **http://localhost:5299/debug** for the close-up arena, or **http://localhost:5299/** for the full promenade.

The debug server does **not** hot-reload. Save your changes, then hit **Refresh (restart server)** in the panel when you want them in.

| Key | Action |
|-----|--------|
| WASD / arrows | Move (double-tap a direction to run) |
| C | Duck behind cover (cars, bins) |
| Space | Jump (bonnet / car roof height) |
| Back + Space | Backflip — boots enemies behind you |
| H | Block (hold) |
| J | Punch combo (jab → hook → upper) |
| K | Kick |
| J + K | Back attack |
| Run + J | Headbutt |
| Down + K | Stomp floored foe / whirlwind crowd clear |
| Run + K | Slide |
| Space + J (air) | Jump kick |
| L | Grab / clinch — then J/K to body-toss |
| U | Low blow |
| E | Pick up weapons / board / buy food & kit |
| Q | Loot bodies (also drops weapon / hops off board) |
| Down + move (skate) | Manual — nose up while rolling |
| M | Mute / unmute music + SFX |
| R | Restart |

---

## What’s in the game

### Combat — no health bars
Nobody has an HP bar. You **wear → break → open → finish**.

- Wind, balance, guard, limbs, and anger are the hidden model
- Body language is the UI: hunched, limp arms, held gut, angry face
- Grab / takedown opens them for a boot to the head
- Low blows disable but raise anger (wilder, more open)
- Bottles smash on impact and leave the victim **bloodied**
- Crawl-away is the usual finish; **out cold** only on strong hits to exposed criticals
- Only **disabled legs** slow movement — busted arms affect punches / blocks / grabs
- Rising invincibility after a knockdown so a pack can’t stomp-loop you
- At most **two** lads press you at once; the rest hover and mouth off
- Wind / guard slowly recover out of combat; food stalls restore more

### Moves
- Punch string, kick, jump kick, headbutt, backhand, slide, whirl
- Grab → clinch → **body toss** (Batman Returns–style: hurled lad flips through the air and piles into others)
- Stomps on floored bodies — victims **twitch** under the boot
- Thrown bottles / bricks arc about ⅔ of the screen; bottles smash with a burst

### Weapons & money
- Ground pickups: bottle, bat, brick (also drop from smashed props)
- Cash from looting KO’d / cuffed fighters
- **Food stalls** along the prom (chips, whippy, doughnuts, jellied eels) — trade cash for a feed that restores condition

### Enemies
- Roles: **thugs**, **scouts** (report sightings), **sergeants** (bark orders)
- Cagey lads **block** a lot unless mad / angry; mad lads just come at you
- Weaker ones flank behind you; when you’re down they swarm in to stomp
- Searching chatter when they haven’t clocked you; insults, pain cries, scout reports once they have
- Cautious ones **phone mates** — interrupt the call before he says where and the wave never turns up
- Off-screen spawns only; limited waves that pull you east toward the pier
- Occasional lads loitering on the common — they sprint into the fight lane if they spot you
- Closest spotted enemy gets a **portrait** (top-right) with name, rank icon, and **damaged-limb highlights**

### Civilians & wanted
- Walkers, joggers (commit past the screen and dodge), bikes / scooters (pass through), wheelchairs, dog walkers
- Hitting civilians raises a **wanted** meter; it decays over time
- High wanted → **police** arrive (slower early) — hold, taser, cuff
- Some film scraps on their phones; some pile in with you if a lad hits them
- Dogs bolt when the owner goes down (you can kick them); cyclists dodge props or crash off
- Diverse Pompey looks — shapes, sizes, races

### World — Southsea strip
Side-scroller west → east (~5400 world units):

Clarence Pier / funfair → Common + Naval Memorial → Southsea Castle → The Pyramids → **pier entrance with visible arcades** → South Parade Pier (boss).

- Parallax sea, sky, Isle of Wight on the horizon, Solent fort, container ships (tiny because far), distant walkers / fisherman
- Occasional jet skis and boats across mid-Solent
- Road strip at the bottom with climbable / SF2-style **destructible cars**
- Smashable bins and bollards; chalk marks on hide spots
- Seagulls (fewer, smaller) — cautious before feeding on corpses
- Food kiosks with chalked price boards

### Stealth
- Duck (S) behind cars / bins — patrols walk past while you’re hidden
- Cover spots marked with a chalk crescent

### Level 1 captive & honour
- Beating the Pier Hardman frees **Casey**, the first potential party member
- Casey assesses your clear time, hits taken, and which combat techniques you actually landed
- High honour: Casey joins your party; if you skipped several moves, they spawn/face the last stragglers with you and promise to show you the missing tricks
- Low honour (hurting civilians/dogs and needless wrecking): Casey says you’re no better than the thugs hunting you and fights you instead
- The Level 1 report and party roster are stored in Phaser’s registry for Level 2

---

## Tech

- **Phaser 3 + TypeScript + Vite**
- Procedural doodle textures (versioned canvas art — bump `doodle_v*` when art changes)
- Wear-down combat in `Structure` — no HP
- Built into the monorepo at `dist/games/pompey-punch-up/` (`GAME_BASE=/games/pompey-punch-up/`)

```
src/game/
├── assets/          # doodleTextures, sorFigure, pompeyLooks
├── combat/          # Structure, resolveCombat
├── entities/        # Player, Enemy, Civilian, Police, Dog, Fighter
├── scenes/          # BootScene, BeachScene
├── systems/         # Wanted, climbCars, separateFighters, prop hits
├── ui/              # SpeechBubbles
└── world/           # ParallaxBeach, FoodStall, SeagullFlock, weapons, props
```

Deeper combat rules: [`docs/DESIGN.md`](docs/DESIGN.md)

---

## Still open / later

- Intro beat (wake-up + car arrival animation)
- Real scanned doodle art + SFX / soundtrack
- More locations (The Hard, Fratton, Spice Island, …)
- Local co-op
- Terrain / ledge finishers fully sold
