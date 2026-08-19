# Pompeymon

Game Boy Advance Pokémon-style adventure set in Portsmouth. **Not on the site yet.**

Tone: Ease Up Mush doodle scrap, but GBA — 16×16 tiles, overworld sprites, 240×160. Turn-based fights, types, a Pomdex. Creatures are local wildlife and street life with funny Pokémon-style names. The map is real places.

---

## Pitch

You wake up **in bed** in a Cosham bedroom on 2nd Avenue. Mum’s downstairs. Your rival (next door, already got a better bike) is waiting outside Iceland. A professor at the community centre gives you a Pompeymon and a **Pomdex**. The island is across the creek. Everyone says if you want to be anyone, you have to go **over the bridge**.

Victory: beat the eight island gyms, then the Elite Four, then the Champion — at a real Portsmouth landmark.

---

## Starters

Pick one. Hidden fourth if you refuse all three.

| Starter | Species | Type | Line |
| --- | --- | --- | --- |
| **Scabfox** | urban fox | Dark / Normal | Scabfox → Binraider → Foxlord |
| **Chipgull** | herring gull | Flying / Water | Chipgull → Stealchip → Herringterror |
| **Moggit** | alley cat | Normal | Moggit → Scratchmog → Bossmog |
| **Donerrat** (refuse all) | kebab-shop rat | Poison / Dark | “You what — this one was in the bin.” |

---

## Pomdex ideas

Original creatures and names — not Pokémon clones.

**Streets:** Donerrat, Kebabite, Pidgeon, Pidgeonot, Busstopper, Staffychomp, Yorksnap, Greyhounder

**Pests / parks:** Squirral, Binraider, Spikehedge, Starlimur, Honkace (Canada goose), Swanlord (Canoe Lake — Water / Fairy, murderous)

**Seafront:** Pincermush, Shorecrab, Sealmush, Whelkite, Limpetank, Groyneguard

**Homes:** Swearrot (pet parrot, Flying / Dark — random insult cry), goldfish as a Magikarp gag, Tortidle

**Legendaries (late):** Hoverbeast (hovercraft), Spinnakeon (tower), Victorygull (one gull to rule the Common)

Types: GBA-era set as needed. Core for v1: Normal, Flying, Water, Dark, Poison, Steel (dockyard), Fighting (Fratton), Rock (Hilsea Lines / sea defences), Fire, Grass, Fairy, Ghost.

---

## Map (Cosham → island champion)

Kanto-shaped, but the “leave home” moment is **crossing onto Portsea Island**. Cosham is Pallet Town; Cosham is not a gym.

1. **Cosham** — house, high street, Portsdown Hill lookout (you *see* the island). First rival fight on the Northern Road.
2. **Portsbridge / Hilsea Lines** — checkpoint, old forts. Steel/Rock gym in the bunkers. First “you’re on the island now.”
3. **North End / Fratton** — Fighting gym at a rec / Fratton Park shadow. Rival nicks a Staffychomp.
4. **Commercial Road** — indoor Cascades maze, shopping trainers. Poison gym (Donerrat line).
5. **The Hard / Gunwharf** — Water/Steel. Navy trainers; ferry as a later Surf analogue.
6. **Southsea Common / Clarence Pier** — Flying gym. Gull gauntlet. Punch-Up cameos optional, later.
7. **Canoe Lake / Eastney** — Water. Swanlord is the gym ace. Bread items (“Loaf” = Super Potion).
8. **Old Portsmouth / Dockyard / Guildhall stretch** — Victory Road: walls, cobbles, historic Rock/Steel. Champion’s chamber: **Southsea Castle** (or Guildhall).

### Badges (island only)

Hilsea Badge, Fratton Badge, Cascades Badge, Hard Badge, Common Badge, Lake Badge, Camber Badge, Castle Badge.

---

## Elite Four and Champion

Not only type specialists — four locals:

- The Copper (Steel / Fighting)
- The chip-shop cook (Fire / Water — fryer)
- The Dockyard welder (Steel)
- The Common park-keeper (Flying / Grass)

**Champion:** a Cosham kid who left before you and already did the island. Working name: Darren “Daz” Champion. Casey / Punch-Up wink is optional later — not required.

---

## Systems (GBA)

- Native **240×160**, pixel-art, Phaser FIT scale
- Interiors like Ruby/Sapphire / FireRed: 16×16 tiles, wallpaper, floorboards, drop shadows under furniture
- Overworld sprites ~16×24, four-dir walk later; battles full-colour sprite art (doodle, not GB 4-shade)
- Turn-based, 4 moves, 6-in-party, wild grass in parks / shingle / car parks at night
- Items: chips, kebab, loaf, bus pass (repel), Hover ticket
- Bike: BMX from the precinct
- PC: library computers
- Day/night: gulls worse in daytime, foxes at night

### Progress (no accounts, no database)

Static site. Anyone can play. Nothing is stored on a server.

**This browser:** `localStorage`. Refresh, close the tab, come back tomorrow — still here. Not a cloud save; it never leaves the machine.

**Another phone / a mate:** a **continue code**. Optional. Typed in on the title screen, same as old handheld passwords.

Keep codes short by packing bits, not JSON:

| In the code | How |
| --- | --- |
| Time of day | 2 bits (morning / day / evening / night) |
| Map + tile | ~20 bits |
| Clothes | 3 bits |
| Badges | 8 bits |
| Areas unlocked | ~16 bits |
| Story / “spoken to” | **checkpoint id**, not one bit per NPC (~6 bits) |
| Inventory | item id × count, small table (~48 bits) |
| Party (6) | species id + level only (~15 bits each) |
| Pomdex | seen/owned bitfield, v1 species cap ~40–64 |

**Leave out of the code:** nicknames, PC boxes, move PP, exact money. Those stay in `localStorage`. Default species names in the code. Checksum so typos don’t load junk.

Expect something like **16–24 characters**, grouped: `POMP-7K3Q-M91F-2VWR`. Crockford Base32 (no `I`/`L`/`O`/`U`). One version nibble at the front so later saves can grow.

If a later build needs boxes + nicks, that’s a second longer code or “this browser only” — don’t bloated the pocket code.

---

## Story beat

Wake in bed. Mum: *“Don’t go over the island till you’ve had your tea.”*

You go anyway. Rival texts: *“I’m already in North End mush.”*

Professor: *“Fill the Pomdex. Not for science. For bragging.”*

End: you beat the Champion looking back at Portsdown from the castle. Credits: bus home to Cosham. Mum: *“Tea’s in the microwave.”*

---

## Out of scope for now

No homepage card, no production deploy. Local placeholder only.

## Local play

```bash
npm run dev:pompeymon
```

Opens http://localhost:5303/ — title screen, then the 2nd Avenue bedroom. Not on the public site yet.
