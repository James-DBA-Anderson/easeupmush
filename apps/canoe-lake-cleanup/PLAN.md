# Canoe Lake Clean Up

A 3D first-person game where you clean swan mess and park rubbish around the historic Canoe Lake in Southsea, Portsmouth, with a high-pressure hose and a litter picker.

## Status

**Playable prototype** in `apps/canoe-lake-cleanup/` — Vite, TypeScript, Three.js. Shipped on the Ease Up Mush site under the games path; editable park lives in `public/levels/canoe-lake.json` plus a full level editor.

This document is the design foundation **and** a map of what the build actually does. Older “proposed Unity / Phase 1 flat plane” notes are gone. Run instructions and controls: `README.md`.

## Concept

Patrol Canoe Lake Gardens with council kit. Mute swans (and foxes, gulls, litterbugs) keep making work. Keep cleanliness up through a compressed day, answer radio jobs, and try not to get pecked into an early clock‑off.

**Tone:** Light-hearted frustration. PowerWash Simulator meets bird chaos — swans are proper menacing, speech bubbles and depot texts lean on Pompey phraseology where it fits. Glossary: `shared/phraseology.json` (`@easeupmush/phraseology`); site page `/mush/phraseology/`.

## Setting: Canoe Lake, Southsea

Victorian boating lake on the Southsea seafront (1886), locally a “swan’s nursery”. Playable area is a compact recreation of the lake and gardens (~275×125 m water, ~1 m per world unit, +Z north toward St Helens Parade, −Z south to the Esplanade).

**In the build today:** traced shoreline and reflective water; paving ring and spurs; holm oaks and deciduous planting; Victorian railings and gates; terraces / hotels / pier / Solent backdrop; café, boat house, toilets, play area, rose beds, bins, benches, fairy lights, cleaner van, car park, beach strip. Layout is authored in the editor, not hard-coded rings alone.

## Core loop (shipped)

1. Third-person van arrival → clock on with hose in hand after clearing most of the overnight tip
2. Patrol paths and grass; hose droppings, footprints, tyre trails, graffiti; jab litter and full bins with the picker
3. Auto tool belt picks hose vs picker from what’s ahead (`1` / `2` / `Q` still work)
4. Score, combo (up to ×5), cleanliness meter, health vs swan pecks
5. Day cycle: **1 real second = 1 game minute** → ~24 minute shift from 06:00
6. Weather drifts (clear → chucking it down); rain, clouds, sun disc / flare
7. Scripted radio missions on clock windows (see below)
8. Game over if pecked out (100 HP, ~15 per peck) or the shift ends in shame on cleanliness

### Tools

| Tool | Use |
| --- | --- |
| Hose | Ballistic jet — droppings, tags, prints, soaking birds / people / BBQs |
| Litter picker | Jab rubbish into the sack; swap overflowing bin sacks |
| Heavy hose | Van reel for the geese mission — limited tank, then back to normal |

**E** at the van grabs the heavy hose when the mission allows; **E** at the hire stand boards a pedalo when available.

### Fail / feedback

- Cleanliness meter + Doom-style mugshot that gets nastier as HP and park state drop
- Complaints for tread-ins, soaked public, bike/scooter flattening mess, snapped branches (if still wired), etc.
- Phone feed (`Messages` + `Callouts`) from depot, warden, tree officer, 999, PCSO Grant

## Scripted missions

Pins and clock windows are level data (`level/missions.ts`, editor **Missions** tab). Built-ins:

| Id | Rough window | What happens |
| --- | --- | --- |
| `picnic` | Late morning–afternoon | Gulls dive a picnic on the east green — hose them off |
| `geese` | Day | Flock inbound; take the van heavy hose before they settle |
| `swanboat` | Midday | Stolen swan pedalo on the water |
| `fire` | Afternoon–evening | Disposable BBQ sets the grass alight |
| `racers` | Late night | Boy racers on the parade |
| `rebels` | Small hours | Gosport lot over the esplanade |

Debug boot from the editor can skip intro and jump to start-of-shift or a named mission.

## Park life (summary)

Ambient systems already in the build (see inventory below for files):

- **Swans** — swim / haul out / graze / foul the bank; fly in and out; roost overnight; busk and charge if soaked or crowding cygnets; mothers defend broods hard
- **Mallards, gulls, squirrels, foxes** — feeding, stooping on unattended food, night mess
- **Public** — path walkers by hour, dog leads that can slip, litterbugs, bread in the pond / hand-feeding, tread-ins, soak → lake
- **Traffic & toys** — cyclists / e-bikes, mobility scooters, parade cars, RC boats, crabbing, play visits, football kickabouts, BBQ parties, gazebos, gardeners on flower beds, drunks, wire birds, helicopters, airliners / Spitfire
- **Pedalos** — hire and ride on the lake when the boatman allows

## Level editor

`editor.html` — ribbon tools for shore, paths, roads, terraces, fairy lights, fencing, play area, car park, beach, terrain berms, buildings catalog, bins, foliage, mission pins. Walk mode places under the crosshair; Debug opens the real game. Save writes IndexedDB **and** `public/levels/canoe-lake.json` via the Vite middleware.

Load order: local save → bundled JSON → `defaultLevel` bake.

## Technical stack

- **Three.js** + TypeScript + Vite (workspace `@easeupmush/canoe-lake-cleanup`)
- Procedural / merged meshes (no GLTF swan farm); lake uses Three `Water`
- Procedural audio in `ParkAudio.ts`
- Static host with the rest of Ease Up Mush (Cloudflare); no backend
- Mobile: landscape-only dual sticks + spray stick

### Layout

```
apps/canoe-lake-cleanup/
├── PLAN.md / README.md
├── index.html / editor.html
├── public/levels/canoe-lake.json
└── src/
    ├── main.ts
    ├── level/          # load, apply, missions, storage, debug boot
    ├── editor/         # map editor + walk mode
    └── game/
        ├── Game.ts / Player.ts / MobileControls.ts
        ├── audio/ ParkAudio.ts
        ├── systems/    # DayCycle, Weather, Sun, Clouds, ShiftIntro, …
        ├── world/      # lake, park, trees, fence, buildings, terrain, …
        ├── entities/   # swans, public, missions, wildlife, …
        ├── effects/    # WaterJet, LitterPicker, Hands, fire, …
        └── ui/         # MiniMap, Mugshot, Messages, MissionBanner, …
```

## Art & audio (current)

Low-poly / flat-shaded park kit, British summer greens, reflective lake, day–night sky from the day cycle. HUD: cleanliness, score/combo, pressure, clock, minimap, compass, objective / mission arrows, mugshot, message stack, mission banner. Audio is synthesised park ambience, hose, birds, traffic — not a big licensed music bed.

## Still open / future

- Balance pass on mission difficulty and swan peck fairness
- Optional endless / winter 60-swan mode (design only)
- Cosmetic hose skins, online leaderboards
- More placeholder mission pins wired into `Game.ts`
- Historical info signs (design only — not in build)

## Historical notes

Optional flavour (not interactive panels yet): Lumps Fort 1859–1869; lake 1886; mute swan ecology; evergreen oaks 1910; Cumberland House. Environmental storytelling only for now.

## References

- Location: Canoe Lake, Southsea, Portsmouth, UK
- Inspiration: PowerWash Simulator, Untitled Goose Game, Viscera Cleanup Detail

---

## Build inventory

What the playable build does, and where it lives. Trimmed to match the repo (no `BranchKid` — that callout was never shipped as a file).

### World & day

- **`world/lake.ts`** — real traced outline (~275×125 m), water, shingle, point-in-lake, path offsets; `WATER_Y` shared with swans and splash height. Coping kerb, murky near-shore water, neighbour-based shoreline normals.
- **`world/trees.ts`** — holm oak avenues and deciduous ranks matching the real planting; seaward lean; seeded layout.
- **`world/park.ts`** — boat house, pedalos, café, toilets, play kit, rose beds, bins; building collision via `atParkBuilding`.
- **`world/buildings.ts`** — St Helens / Eastney terraces, pier, Pyramids, Spinnaker, IoW horizon; windows warm up at night.
- **`world/fence.ts`** — spear railings on road sides, solid; promenade side open.
- **`world/bench.ts`** — Victorian benches on the outer path edge, facing water.
- **`world/cleanerVan.ts`** — shift start / heavy hose bay.
- **`systems/DayCycle.ts`** — 06:00 start, 1 s = 1 min; sky and lights keyframed.
- **`systems/Sun.ts`** / **`Clouds.ts`** / **`Weather.ts`** — disc + flare; drifting cover; rain streaks.
- Reflective **`Water`** mesh; colour tracks the day cycle.

### Player & cleaning

- **`Player.ts`** — FPS move (walk / sprint), pointer lock, swim / climb-out, tools hose · picker · heavyHose, auto belt from `Game.jobInSight`.
- **`effects/WaterJet.ts`** — ballistic column → cone → arc; scrub radius ~1.6 m at impact; chunky lance + `Hands.ts`.
- **`effects/LitterPicker.ts`** — grabber + bin sack; jab ~2 m ahead.
- **`entities/Dropping.ts`** — washable splat canvas; footprint bite when trodden; soft cap with litter.
- **`entities/Litter.ts`**, **`Bin.ts`**, **`Graffiti.ts`**, **`Footprint.ts`** — rubbish, lid heaps, wall tags, shoe/tyre trails.
- Scoring — cleaned count, combo ×5 with drain bar; complaints hit score and combo.

### Birds & beasts

- **`Swan.ts`** — swim / bank / graze / foul; scramble over the wall; fly in/out (flock 12–22); roost 21:30–05:30; charge after soaks; cygnet lines and aggressive mothers; busking puts public to flight.
- **`Duck.ts`**, **`Gull.ts`**, **`Squirrel.ts`**, **`Fox.ts`**, **`GooseFlock.ts`**, **`WireBird.ts`** — park wildlife and mission geese.
- Bread / feeding — bags into the lake and hand-feeds pull birds and schedule mess (`Bread.ts`, person carriers).

### Public & vehicles

- **`Person.ts`** + **`Face.ts`** + **`Dog.ts`** — hourly crowd, moods, litter, soak, lake splash chain; dogs off lead after owner soak.
- **`Cyclist.ts`** (push + e-bike), **`Scooter.ts`**, **`TrafficCar.ts`**, **`BoyRacers.ts`**, **`Helicopter.ts`**, **`Plane.ts`** (airliner / Spitfire).
- **`Crabber.ts`**, **`RcBoat.ts`**, **`PlayVisit.ts`**, **`FootballKickabout.ts`**, **`BbqParty.ts`**, **`Gazebo.ts`**, **`Gardener.ts`**, **`Drunks.ts`**, **`BenchSit.ts`**.
- **`PedaloHire.ts`**, **`Boatman.ts`**, **`StolenSwanboat.ts`**, **`Picnic.ts`**, **`RebelRaid.ts`**, **`effects/GrassFire.ts`**.

### UI, audio, intro

- **`ui/MiniMap.ts`**, **`Mugshot.ts`**, **`Messages.ts`**, **`MissionBanner.ts`**, **`ObjectiveArrow.ts`**, **`Compass.ts`**
- **`systems/Callouts.ts`**, **`ShiftIntro.ts`**, **`HeavyHoseIntro.ts`**
- **`audio/ParkAudio.ts`** — procedural ambience and SFX
- **`MobileControls.ts`** — landscape sticks

### Level pipeline

- **`level/types.ts`**, **`defaultLevel.ts`**, **`storage.ts`**, **`apply.ts`**, **`missions.ts`**, **`debugBoot.ts`**
- **`editor/`** — map UI, walk mode, place previews

### Combat with nature (numbers)

- ~100 HP, ~15 per peck; regen after ~7 s clear; mugshot damage stages
- Charge after three soaks; allies within ~16 m join; ~9 s temper
- Mother swan: instant charge inside ~5 m of brood or on hose hit; long memory

### Player movement

- ~9 m/s walk, ~15 m/s sprint; blocked from walking into the lake without swimming rules; climb-out via spray stick on mobile / movement on desktop
