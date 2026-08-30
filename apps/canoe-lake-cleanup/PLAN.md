# Canoe Lake Clean Up

A 3D first-person game where you clean up swan droppings around the historic Canoe Lake in Southsea, Portsmouth using a high-pressure spray gun.

## Concept

Players patrol the area around Canoe Lake with a high-pressure cleaning gun, removing swan droppings as fast as they appear. Mute swans continuously roam the area, leaving messes behind. The challenge comes from keeping the popular public space clean while the swans — up to 60 of them — refuse to stop being swans.

**Tone:** Light-hearted frustration. You're fighting a losing battle against nature in a beautiful Victorian park. Think PowerWash Simulator meets duck chaos, but it's swans and they're proper menacing.

## Setting: Canoe Lake, Southsea

Real location: Victorian boating lake on Southsea seafront, Portsmouth, dating from 1886. Known locally as a "swan's nursery" where mute swans congregate, especially juveniles.

### Environment Layout

The playable area is a compact, authentic recreation of the lake and immediate surroundings:

**The Lake (Central Feature)**
- Man-made boating lake, roughly oval shape
- Topped up at high tide via sluice gates (visible/functional in game)
- Swan pedal boats on the water (static/decorative or gentle obstacles)
- Decorative lamp posts around the perimeter with coloured lights strung between them
- Continuous path encircling the lake

**East Side — Lumps Fort Area**
- Remains of Lumps Fort (1859-1869 defensive structure)
- Rose Gardens within the fort walls
  - Oval layout with rose beds
  - Red brick pergolas
  - Sundial at centre
  - Archway entrance with Cockleshell statue
- Model Village (miniature buildings)
- Fresco Café

**Boundaries & Features**
- **North:** St Helens Parade (road border)
- **South:** Eastney Esplanade (seafront, sea wall visible)
- **West:** Grassland areas, play equipment visible at distance
- Cumberland House Natural History Museum (cream building, visible but not accessible)
- Emanuel Emanuel drinking fountain (southwest corner, decorative Victorian fountain)
- Mature evergreen oaks (planted 1910) — large trees as landmarks
- Display flower beds at water's edge
- Tennis/basketball courts (eastern side, outside core play area)
- Scattered benches around lake perimeter

**Ground Surfaces**
- Paved paths (main cleaning surfaces)
- Grass areas (swans prefer these for landing/grazing)
- Shingle/pebble areas near water's edge
- Brick paving in Rose Garden sections

### Atmosphere & Time of Day

**Default:** Daytime, overcast British summer sky (accurate for Portsmouth coastal weather). Soft natural lighting, no harsh shadows.

**Optional Modes:**
- Golden hour evening (softer lighting, longer shadows, romantic Victorian park vibes)
- Winter afternoon (low sun, bare trees except the evergreen oaks, more swans congregating — up to 60)

## Gameplay Mechanics

### Core Loop

1. Patrol the paths and grass around the lake
2. Spot fresh swan droppings
3. Aim and spray with high-pressure gun
4. Droppings dissolve/wash away with satisfying visual/audio feedback
5. Repeat as swans continuously create new messes

### The High-Pressure Spray Gun

**Functionality:**
- First-person view with visible nozzle/gun model
- Continuous spray when trigger held (mouse button / controller trigger)
- Water pressure gauge — spray power decreases with sustained use, regenerates when not firing
- Satisfying particle effects: water spray, splash, mist
- Effective range: medium (realistic pressure washer range, ~5-8 metres)
- Can aim freely with mouse/controller look
- Spray produces sound: high-pressure water jet hiss, splatter on impact

**Upgrades (Optional Future Content):**
- Wider nozzle (cleans larger area, less range)
- Higher pressure (longer range, more satisfying blast)
- Faster recharge
- Detergent attachment (cleans faster, visual foam effect)

### Swan Behaviour

**Movement:**
- 10-20 swans active in the area at once (scales up to 60 in harder modes)
- Waddle on land, swim in lake, occasionally fly short distances
- Prefer grass areas for grazing and... production
- Gather near benches and the café (where tourists feed them)
- Territorial AI: swans hiss if player gets too close
- NOT hostile — you can't hurt them, they can't hurt you, but they're intimidating
- Mute swans: silent except for wing beats and hissing

**Dropping Generation:**
- Swans leave droppings at regular intervals (realistic frequency)
- More frequent when grazing on grass
- Visual cue: subtle animation when swan is "about to go"
- Droppings spawn on ground beneath swan
- Each dropping persists until cleaned

**Swan Personality:**
- Confident, unbothered by your efforts
- Will waddle directly through recently cleaned areas
- Occasionally give you a side-eye (head turn animation)
- Continue their routines regardless of player presence

### Objectives & Challenge

**Primary Goal:** Keep the paths and main areas clean

**Cleanliness Meter:**
- Visual HUD element showing overall park cleanliness percentage
- Decreases as droppings accumulate
- Increases as you clean
- Target: maintain above 70% cleanliness
- Below 50%: warning messages, tourists visibly annoyed
- Below 25%: game over / shift ends in shame

**Challenge Modes:**
- **Casual:** Fewer swans, slower dropping rate, infinite time
- **Shift:** 10-minute timed session, maintain cleanliness threshold
- **Swan Rush:** Maximum swans (60+), chaos mode, survival against the waddle
- **Tourist Day:** NPCs walking around, more droppings in high-traffic areas, can't spray tourists

**Score/Progression:**
- Points per dropping cleaned
- Combo multiplier for cleaning multiple droppings quickly
- Bonus for keeping high cleanliness rating
- Leaderboards (local or online)

## Technical Implementation

### Engine & Framework

**Three.js** (JavaScript 3D library)
- Lightweight, runs in browser
- Good for stylised 3D environments
- Easy integration with existing site
- Works on desktop and mobile (with touch controls)

**Alternative:** Unity WebGL export
- More robust 3D features
- Heavier build size
- Professional tooling for FPS mechanics

### 3D Assets

**Environment:**
- Low-poly stylised art style (keeps performance good, visually appealing)
- Key landmarks modeled: lake, fort walls, rose garden archway, fountain, oaks, café
- Modular path/grass tiles for ground
- Simple geometric buildings (Cumberland House, model village structures)
- Decorative elements: lamp posts, benches, pedal boats

**Characters:**
- Mute swan model: white body, orange beak with black knob, ~10-12kg bird appearance
- Multiple LODs (level of detail) for performance
- Animations: idle, walking waddle, swimming, head turn, hissing, wing flap, pecking/grazing
- Juvenile swans (grey-brown plumage) for winter mode

**Effects:**
- Water spray particles (high-pressure stream)
- Splash/mist on impact
- Droppings: simple mesh, white-green texture, subtle specular (gross but not gratuitous)
- Dissolve effect when cleaned (alpha fade + particle puff)

### Camera & Controls

**Desktop (Mouse + Keyboard):**
- WASD: movement
- Mouse: look/aim
- Left click: spray
- Shift: sprint (limited stamina)
- E: interact (open info signs, optional)
- Tab: show cleanliness map overlay

**Mobile/Touch:**
- Virtual joystick (left side): movement
- Touch drag (right side): look/aim
- On-screen button: spray
- Simplified controls, may lock vertical look axis

**Gamepad:**
- Left stick: move
- Right stick: look
- Right trigger: spray
- Face buttons: sprint, interact

### Performance Targets

- 60 FPS on modern desktop browsers
- 30 FPS stable on mid-range mobile devices
- Draw distance culling: far scenery fades/simplifies
- Max active swans: 60, with LOD system reducing detail for distant birds

## Art Direction

### Visual Style

**Low-poly stylised realism** — recognisable landmarks but simplified geometry, hand-painted textures, soft colours.

**Colour Palette:**
- Lake water: soft blue-green (slightly murky, it's a tidal lake)
- Grass: British summer green (not tropical bright)
- Paths: grey-beige paving
- Swans: clean white with orange accents
- Fort walls: weathered grey stone
- Rose Gardens: pops of red, pink, yellow roses against green
- Oaks: deep green, thick foliage
- Sky: overcast white-grey, or golden hour warm tones

**Mood:**
- Peaceful Victorian park aesthetic
- Slightly comedic (the absurdity of the task)
- No grim or dirty visuals despite the premise — keep it light

### UI Design

**HUD Elements:**
- Cleanliness meter: circular gauge, top-left
- Water pressure gauge: bar below crosshair
- Score/combo counter: top-right
- Timer (if applicable): top-centre
- Minimal, transparent backgrounds, clean sans-serif font

**Menus:**
- Simple flat design
- Pompey colour accents (blue theme, nod to Portsmouth FC)
- Historical postcard aesthetic for background images

## Audio Design

### Sound Effects

**Spray Gun:**
- High-pressure water hiss (looping when active)
- Splatter impact sounds (wet slap, vary pitch/volume)
- Pump recharge sound when pressure regenerates

**Swans:**
- Wing beats (whoosh, heavy bird)
- Hissing (territorial warning, occasional)
- Waddle footsteps (subtle, soft thuds on grass/path)
- Water splashing when swimming

**Environment:**
- Gentle water lapping at lake edge
- Distant seagull cries (Southsea seafront ambience)
- Breeze rustling oak leaves
- Faint café/tourist chatter (very low mix)

**Feedback:**
- Satisfying "pop" or sparkle sound when dropping is fully cleaned
- Combo chime for rapid cleanings
- Warning alert when cleanliness drops too low
- End-of-shift jingle (success or failure)

### Music

**Optional Background Track:**
- Light, jaunty acoustic piece (British seaside/park vibe)
- Doesn't overpower ambient sounds
- Loops seamlessly
- Can be muted in settings

**Alternative:** No music, just ambient soundscape (more immersive)

## Progression & Content

### Launch Version (v1.0)

- Single playable area: Canoe Lake, full layout
- One game mode: Shift (10-minute timed)
- Basic swan AI and dropping mechanics
- Core spray gun functionality
- Cleanliness meter and score
- Local high scores

### Potential Updates

**More Modes:**
- Endless mode
- Tourist Day (NPCs added)
- Winter Swan Rush (60 swans)
- Night shift (different lighting, foxes as additional mess-makers?)

**Upgrades & Customisation:**
- Gun upgrades (nozzle types, pressure)
- Cosmetic skins for spray gun
- Player uniform customisation (council worker, park ranger)

**Challenges:**
- Daily/weekly challenges (clean X droppings in Y time)
- Achievements (first 100 cleaned, maintain 100% for 5 mins, etc.)

**Environmental Expansion:**
- Extend playable area to include play park, Cumberland House grounds
- Seasonal variations (spring flowers, autumn leaves, winter bare trees)

**Leaderboards:**
- Online score tracking
- Friends leaderboards

## Historical & Educational Notes

Optional info panels around the park (interactive signs) that give real historical facts:

- Lumps Fort history (built 1859-1869, Napoleonic defence)
- Canoe Lake creation (1886, constructed by unemployed workers)
- Mute swan ecology (why they congregate, diet, behaviour)
- Victorian park design principles
- Cumberland House museum history

Educational without being preachy. Players can ignore or engage.

## Technical Stack Summary

**Frontend:**
- Three.js or Unity WebGL
- TypeScript (if Three.js)
- Vite build system (consistent with repo setup)
- Module structure under `apps/canoe-lake-cleanup/`

**Assets:**
- 3D models: GLTF/GLB format
- Textures: PNG/WebP, compressed
- Audio: MP3/OGG, compressed, lazy-loaded

**Hosting:**
- Static build, served via Cloudflare Pages (same as other games)
- No backend needed for v1.0
- LocalStorage for high scores
- Optional future: Firebase/Supabase for online leaderboards

## File Structure (Proposed)

```
apps/canoe-lake-cleanup/
├── PLAN.md                          # This document
├── README.md                        # Build/run instructions
├── index.html                       # Entry point
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── vite.config.ts                   # Build config
├── public/
│   ├── assets/
│   │   ├── models/                  # GLTF swan, environment models
│   │   ├── textures/                # PNGs for materials
│   │   ├── audio/                   # MP3s for SFX and music
│   │   └── favicon.svg
│   └── robots.txt
└── src/
    ├── main.ts                      # App entry
    ├── game/
    │   ├── Game.ts                  # Main game loop
    │   ├── Scene.ts                 # Three.js scene setup
    │   ├── Camera.ts                # FPS camera controller
    │   ├── Controls.ts              # Input handling
    │   ├── entities/
    │   │   ├── Swan.ts              # Swan AI and behaviour
    │   │   ├── Dropping.ts          # Dropping object
    │   │   └── Player.ts            # Player state/spray gun
    │   ├── environment/
    │   │   ├── Lake.ts              # Lake mesh/water
    │   │   ├── Terrain.ts           # Paths, grass, ground
    │   │   ├── Landmarks.ts         # Fort, fountain, trees, buildings
    │   │   └── Lighting.ts          # Scene lighting
    │   ├── systems/
    │   │   ├── CleanlinessSystem.ts # Tracks cleanliness meter
    │   │   ├── SpawnSystem.ts       # Manages swan population
    │   │   └── ScoreSystem.ts       # Points, combos
    │   ├── ui/
    │   │   ├── HUD.ts               # Cleanliness, pressure, score
    │   │   └── Menu.ts              # Main menu, pause, settings
    │   └── assets/
    │       ├── loadModels.ts        # Asset loader
    │       └── loadAudio.ts         # Audio loader
    └── styles.css                   # Minimal CSS for HTML elements
```

## Development Phases

### Phase 1: Prototype (Core Mechanics)
- Basic 3D environment (flat plane, simple lake shape)
- FPS camera and movement controls
- Spray gun mechanic (raycast, particle effect)
- Single swan with basic AI (waddle, drop, repeat)
- Dropping spawning and cleanup detection
- Cleanliness meter (simple percentage)

### Phase 2: Environment Build
- Model and texture the full Canoe Lake area
- Key landmarks: fort walls, rose garden entrance, fountain, oaks
- Proper ground textures (paths, grass, water)
- Lighting and sky setup
- Swan model with animations

### Phase 3: Gameplay Loop
- Full swan population (10-20 active)
- Refined AI (swimming, territorial behaviour)
- Cleanliness meter with HUD
- Score system and combos
- Timer and win/lose conditions

### Phase 4: Polish & Content
- Sound effects and music
- UI design (HUD, menus)
- Game modes (shift, casual)
- Mobile controls
- Performance optimization

### Phase 5: Launch
- Integration with main site (add to unlisted `/mush/` back room if not public)
- Testing across browsers and devices
- Bug fixes
- Soft launch, gather feedback

## Open Questions / Design Decisions

- **Swan count balance:** How many swans feel challenging but not overwhelming?
- **Dropping visibility:** How large/obvious should droppings be? Realistic vs. gameplay clarity.
- **Spray gun feel:** How powerful should it feel? Instant clean vs. gradual scrub?
- **Fail state:** Is "shift ends in shame" enough, or do we need a more dramatic game over?
- **Tourist NPCs:** Essential for v1.0 or save for updates? (Lean toward save for updates)
- **Historical content:** Interactive signs or just environmental storytelling?

## References

- **Location research:** Canoe Lake, Southsea, Portsmouth, UK
- **Mute swan behaviour:** Up to 60 congregate in winter, territorial, prefer grass for grazing
- **Victorian park design:** Lumps Fort (1859-1869), lake constructed 1886, evergreen oaks planted 1910
- **Existing games for inspiration:**
  - PowerWash Simulator (satisfying cleaning mechanics)
  - Untitled Goose Game (bird chaos, light-hearted menace)
  - Viscera Cleanup Detail (cleaning as core gameplay)

## Prototype Status

What the playable build currently does, and where it lives:

- **`src/game/world/lake.ts`** — the lake outline traced from the real Canoe Lake
  (roughly 230m by 105m, long axis WSW-ENE, rounded west end, squarer east end,
  island near the eastern end). One world unit is one metre. The same smoothed
  shoreline drives the water mesh, the shingle bank, the point-in-lake test used
  for collision, and the offset rings used for the path, benches and trees.
- **`src/game/world/trees.ts`** — the planting follows the real park rather than
  a ring of identical lollipops. +Z is north, where St Helens Parade runs, and
  -Z is south towards the Esplanade and the beach. The 1910 rows of evergreen
  holm oaks frame the water: a formal, evenly spaced avenue the length of the
  north side, a more exposed line along the southern boundary, and a group
  wrapping the rounded west end. Deciduous trees stand in a looser second rank
  behind the north avenue and inside the Lumps Fort walls where the rose garden
  is, and salt-burnt scrub runs along the seafront edge. Nothing is planted at
  the water's edge, which the real park keeps for bedding displays.
- **Tree models** — a holm oak is a short thick bole dividing low into heavy
  limbs under a deep dome of near-black foliage that skirts down over the
  branches; planes are taller and lighter with a more open oval crown. Each
  tree's lumps are merged into a single mesh, so a full park of them is about
  120 draw calls. Everything on the seaward side leans inland, and the layout
  is seeded so the park is identical every load.
- **Paths** — a closed ring of paving running from the waterline itself out to
  12m, plus four spurs heading outwards to the park edges. Nothing crosses the
  water, and there's no grass verge between the path and the lake.
- **Water level** — the surface sits 20cm below the paving, inside a vertical
  stone retaining wall that drops to the lake bed. The grass is built as a shape
  with the lake cut out of it, since a solid ground plane would otherwise cap
  over water that sits below ground level. `WATER_Y` is the single source of
  truth: the swans' floating height and the spray's splash height both derive
  from it.
- **The water's edge** — left as bare paving against water it came to a knife
  line with nothing to read the drop against, so the wall is capped with a run
  of coping: pale kerbstones 55cm out over the paving and overhanging the water
  by 25cm, sat 9cm proud with a dark little face onto the path. That shadow
  line is what makes it look like something you'd stub a boot on. One stone per
  shoreline segment, each weathered a shade off its neighbours so the joints
  show without the run turning into stripes. Below the overhang the wall face
  goes green at the waterline and stays dark down to the bed, and the first
  metre and a half of water is a touch murkier than the open lake, so the
  surface doesn't stop flat against the stone. You pull up at the kerb rather
  than stood on it.
- **Shoreline normals** — offsets from the shore (the coping, the path ring and
  everything placed off it) run along a normal worked out from each point's
  neighbours, not straight out from the middle of the lake. On a shape 230m by
  105m the two are a long way apart down the sides, and the radial guess left
  the kerb fatter at the ends than along the front.
- **`src/game/world/bench.ts`** — Victorian park benches with cast-iron ends,
  scrolled armrests and finials, and wooden slats for the seat and raked back.
  They're placed along the outer edge of the path and squared to the local run
  of that edge, backs out, facing the water.
- **`src/game/systems/DayCycle.ts`** — the shift starts at 06:00 and one real
  second is one game minute, so a full day takes 24 minutes. Sky colour, ambient
  and sun colour, intensity and position all interpolate between keyframes
  through dawn, midday, dusk and night. Shown on the clock bottom-left.
- **`src/game/systems/Weather.ts`** — clear, cloudy, overcast, drizzle and
  chucking it down. The weather drifts to a neighbouring state every minute or
  two and crossfades over twelve seconds, pulling the sky, fog and light levels
  with it. Rain is drawn as falling streaks in a box that rides along with the
  player.
- **`src/game/world/buildings.ts`** — what you can actually see from the lake,
  roughly where it really is. St Helens Parade runs along the north side: a
  wall of five and six storey Victorian terraces with bay windows, sash
  windows, slate roofs and chimney stacks, the odd seafront hotel standing
  taller, and gaps where the side roads come down. Eastern Parade carries on
  round the west end and Eastney sits behind Lumps Fort to the east. South is
  the Esplanade with its railings, the shingle, and the Solent out to the
  horizon, with South Parade Pier on its iron legs and its domed pavilion to
  the south-west, the glass of the Pyramids beyond that, and the Isle of Wight
  a grey line across the water. The Spinnaker Tower stands up over the rooftops
  away to the north-west. The lot is merged down to one mesh per material, none
  of it casts shadows since it's all outside the shadow camera, and the windows
  light up warm as the daylight goes.
- **`src/game/world/fence.ts`** — the park's Victorian iron railings along the
  two road sides: spear-topped bars every 13cm between a top and bottom rail,
  square posts every 2.4m with capped tops, all on a low stone kerb. One run
  goes the length of the north side under St Helens Parade and the other turns
  the corner and heads south down the eastern boundary, with taller gate posts
  either side of the openings where people come in off the pavement. It's
  merged into two meshes and it's solid: the same axis-by-axis collision that
  keeps you out of the lake stops you walking through the ironwork, so you go
  round to a gateway like everybody else. The south side is left open to the
  promenade.
- **`src/game/systems/Clouds.ts`** — twenty-six lumps of cumulus, each a
  handful of squashed spheres merged into one mesh, drifting downwind on the
  same wind as the rain at about 3.5 m/s and wrapping round the player so the
  sky never runs out. They match the weather: cover runs from a couple of wisps
  when it's clear to a full lid when it's chucking it down, and as it closes in
  they grey off, sit lower and spread until the gaps shut. They're lit from the
  sky rather than the sun — you only ever see the underside of a cloud — so
  they go white at noon, orange at sunset and near enough black at night, and
  ground fog is turned off for them so the murk doesn't wash them out.
- **Scoring** — the top-right panel shows the running score, a total of
  droppings cleaned, and a combo multiplier. Finishing a dropping within four
  seconds of the last one steps the multiplier up, capped at x5, and the bar
  under it drains to show how long you've got left to keep the run going.
- **`src/game/ui/MiniMap.ts`** — top-left plan of the park drawn on a 2D canvas:
  the lake, the path ring, swans in white, the public in dark grey, uncleaned
  mess as faint specks, and the player as a yellow arrow.
- **`src/game/ui/Mugshot.ts`** — Doom-style status face bottom-centre. He glances
  about and blinks, bares his teeth while spraying, squints in the rain, and
  gets progressively more fed up as cleanliness drops.
- **`src/game/effects/WaterJet.ts`** — the spray is ballistic. Droplets leave the
  lance and fall under gravity, so the stream arcs and you lob water at the mess
  rather than pointing a laser at it. Anything within 1.6m of where a droplet
  lands gets scrubbed. No crosshair — the visible lance is the aim reference.
- **Swans** — cycle between swimming, hauling out, grazing on the bank and
  returning to the water, always crossing at the nearest stretch of shore. They
  only foul the ground while grazing, which keeps the mess in a band a few
  metres wide right along the water's edge.
- **Swan animation** — afloat they ride low with a bob and roll, trail spreading
  wake rings, swing their heads about and now and then duck under for a feed.
  Ashore they stand on orange legs (hidden while swimming) and waddle, rocking
  over the planted foot with the neck bobbing to the stride. Crossing the
  waterline plays a scramble: they slow right down, pitch nose-up, beat their
  wings and heave themselves up over the wall, and reverse it with a splash on
  the way back in.
- **Swans fight back** — soak one three times and it takes offence: wings up,
  neck out flat, and it comes for you at 4 m/s, scrambling out over the wall if
  it has to. Every 1.6s within striking distance it pecks, which shoves you
  backwards, shakes the camera, flashes the screen red, kills your combo and
  costs 15 points. Any swan within 16m squares up alongside it, so one loses its
  temper and a second soaking sets the whole corner off. They give up after 9
  seconds, or sooner if you get far enough away.
- **Getting pecked to death** — you have 100 health, shown on a bar beside the
  mugshot, and every peck takes 15 of it. Seven of them and that's the shift
  over: the screen tips as you go down on the paving and a game over panel gives
  the time, your score, what you cleaned and what the park was left at. Stay out
  of their way for seven seconds and you start mending at four a second. The
  face in the mugshot keeps the score of it — a beak mark across the cheek by
  75%, a swollen eye and a split lip by 50%, and by 25% he's bleeding from the
  hairline with his nose spread across his face.
- **Dogs on leads** — about a third of the people out here are walking one, and
  it trots at their side on a drawn lead. Breeds run from a pug or an old lab
  through spaniels, labs and lurchers to a staffie or a jack russell, and the
  temperament is what matters. Soak the owner and seven times out of ten the
  lead hits the floor. A steady dog just potters about near them; a lively or
  fierce one is straight off after any swan on the bank, putting the whole line
  of them back into the water — and a fierce one goes through anybody in its
  way, which is a complaint each and can shove someone at the water's edge
  clean into the lake. They stop at the waterline, so a bird that makes it out
  onto the lake is safe, and the lead drags along the ground behind them the
  whole time. After nine seconds or so the owner shouts them back and gets them
  on the lead again. Swans can only be put up once every couple of seconds, so
  a dog stood over one can't pin it in place.
- **Cygnets and mothers** — two of this year's broods are out on the water, two
  to five grey-brown juveniles at about a third the size of an adult, dull beaks
  and no knob yet. They don't make their own decisions: they take whatever their
  mother is doing and string out in a line astern of her, putting a spurt on if
  they drop behind. A mother is not a normal swan about them. Come inside five
  metres of any of her brood, or catch one with the hose, and she charges on the
  spot with no warning soakings — and keeps coming back for fourteen seconds
  after you last bothered them, so there's no waiting her out at close range.
  The cygnets themselves never fight; soak one all you like and it just brings
  its mother. She won't fly off while she has a brood, and neither will they.
  They show as small buff dots on the minimap.
- **Flying in** — every minute or so, up to a flock of 22, another swan arrives
  from somewhere else on the harbour. It comes in from 170m out and nearly 30m
  up, wings spread to their full span and beating slowly, neck stretched out
  front, feet tucked back under the tail, riding a shallow glide down onto a
  patch of open water. Twenty metres out it flares: nose up, wings held high
  and cupped, big feet thrust forward like water skis, and the speed washes off
  from 15 to 7 m/s. The feet hit first and it planes along the surface for
  five or six metres throwing spray and wake rings, wings still out, before the
  water takes the weight, everything folds away and it's just another swan on
  the lake. Nothing distracts it on the way in — no bread, no begging, and it
  won't pick a fight until it's down.
- **Flying out** — the other half of it: about once a minute, as long as there
  are more than twelve birds on the water, one decides it's had enough. It
  sights down sixteen headings for whichever gives it the most clear water
  ahead, then goes for it — wings hammering, neck flat out in front, both feet
  slapping the surface in turn and leaving a ripple and a burst of spray with
  every step. That's a twenty-odd metre run and about three seconds to work up
  to 11 m/s, at which point it unsticks, tucks the feet away and climbs out
  over the trees, gone for good once it's 24m up. The flock is capped at 22 and
  floored at 12, so the lake never empties and never silts up with swans.
- **Roosting** — from half nine at night until half five in the morning the
  whole flock comes off the water, walks up onto the grass well outside the
  path, and sits down: body low, legs folded away, neck laid right back with
  the beak in the feathers and a slow breathing rise and fall. Nothing shifts
  them — bread and food carriers are ignored — though a soaking still gets one
  up and charging. They tick over on the mess front at a fifth of the daytime
  rate, so a night's roosting leaves a scattering across the grass rather than
  burying it.
- **`src/game/entities/Fox.ts`** — in the small hours, between ten and four,
  there's a fox about the park once every few minutes. It slips in from the
  dark at the edge of the map and trots the grass outside the path at 3.2 m/s,
  never going near the water, stopping two to four times to nose about or to
  hunch up and leave something behind — a smaller, darker, tapered mess than a
  swan's, lying on its side wherever it was dropped. It's wary: get within 16m
  and it bolts at 8 m/s for somewhere else, and within 7m it gives up on the
  park altogether and heads off into the dark. It shows as an orange dot on the
  minimap, and dawn sees it off whatever it was doing.
- **`src/game/entities/Person.ts`** — members of the public stroll the perimeter
  path in both directions at varying speeds, with a walk cycle.
- **`src/game/entities/Crabber.ts`** — crabbing has gone on at Canoe Lake since
  it opened, so parties of one to three kids settle in along a stretch of the
  wall with buckets and hand lines. The line hangs in the water twitching for
  five to fifteen seconds, then they haul it up: a bit under half the time
  there's a crab dangling and spinning on the end, which gets shouted about
  ("GOT ONE!") and dropped in the bucket, where the catch piles up visibly.
  Otherwise it's "NOTHING AGAIN" and the line goes straight back in. They stay
  for a few minutes before packing up.
- **`src/game/entities/RcBoat.ts`** — every minute or two a kid turns up on the
  bank somewhere round the lake with a radio-controlled boat, stands at the
  water's edge with the transmitter held out in front of them, and turns on the
  spot to follow it about. The boat planes around on a leash of 26m from where
  they're stood, slowing through the turns, throwing a wake behind it and
  breaking off into circles every so often when they get bored of driving in
  straight lines. It bounces off the wall if it noses into the bank, so it can
  never end up on dry land. They pack up and go after a minute or two.
- **`src/game/entities/Cyclist.ts`** — the odd rider cuts through along the
  lakeside path every half minute or so, two at most, keeping to the outside
  away from the water. They ride at 5.5–8 m/s with the pedals and wheels
  turning and lean into the bends, brake hard to walking pace for anyone in a
  cone in front of them — public, swans or you — and ring as they come past.
  Ride through a dropping and it gets flattened under the tyres, which counts
  as a complaint and gets them swearing about their bike. They show as red dots
  on the minimap, and leave the park after most of a lap.
- **`src/game/world/park.ts`** — the things marked on a map of Canoe Lake,
  each placed by bearing round the lake and pushed far enough back to clear
  the twelve metres of paving, then turned to face the water. The wooden boat
  house sits at the eastern end: a clapboard shed with three bays open to the
  lake, a painted board over the doors and a veranda on posts, with a planked
  jetty running out across the paving and over the water on piles. Swan
  pedalos are moored either side of it, riding the water on a slow bob. Round
  the rest of the circuit there's the café on the seaward side with its
  serving hatch, striped awning and terrace of parasol tables, a brick toilet
  block, the play park behind its bow-top railing with swings, a slide tower
  and a springy animal, the rose beds on the parade side, and council bins
  every forty degrees for all the good they do. The buildings block movement
  via `atParkBuilding`, checked in `Player.canStand`; the play park doesn't,
  since it's meant to be walked into.
- **The work phone** — jobs come in as texts in the bottom right corner, from
  the depot, the park warden, the tree officer, 999 control and PCSO Grant.
  Each stacks in, sits there fourteen seconds and fades, four on screen at a
  time, stamped with the park clock. `ui/Messages.ts` is the feed;
  `systems/Callouts.ts` holds the wording and a cooldown per sort of job so
  the same complaint isn't coming through all afternoon, and drops the end of
  the lake and which side into the text so there's somewhere to go. The shift
  opens with one from the depot, and if the place is spotless they say so.
  Jobs raised: swan mess building up, litter building up, a bin gone over,
  a fresh tag, a swan going for a member of the public, e-bikes on the path,
  and kids on the branches.
- **`src/game/entities/Bin.ts`** — the bins round the circuit fill on their own
  over about a park day, quicker where the public are stood, and once they're
  four fifths full a heap of rubbish appears on the lid and the depot rings
  in. Jab one with the litter picker to swap the sack, which scores like any
  other cleaned job.
- **`src/game/entities/Graffiti.ts`** — tags go up on the blank walls of the
  toilet block, the boat house and the café, drawn to a canvas as a fat
  outlined scrawl (`POMPEY`, `PFC`, `6.57`, `BAZ`) and hung just proud of the
  brickwork. The pressure washer lifts them: droplets that land on the panel
  are absorbed and take a bit of the paint with them, and a fully scrubbed
  wall scores. `world/park.ts` records which faces are taggable as it builds.
- **E-bike lads** — `Cyclist` takes a kind now. The e-bikes run at 9–12 m/s on
  fat tyres with a battery in the frame and a phone playing out loud, hood up
  instead of a helmet, feet planted rather than pedalling. They ride wherever
  they like across the path rather than keeping to the outside, and they
  don't brake for anybody — they just shout and keep going. Roughly a third
  of the riders that turn up are them.
- **`src/game/entities/BranchKid.ts`** — a pair of kids hanging off a low limb
  of one of the park's trees, bouncing on it and egging each other on while
  the branch bends further. Walk within seven metres, or catch them with the
  hose, and they leg it. Leave them twenty-six seconds and the branch comes
  off, stays down on the grass, and counts as a complaint against you.
- **`src/game/entities/Duck.ts`** — mallards, drakes with the green head and
  white collar and hens in their browns, about a third the size of a swan.
  Nine are already on the water at six o'clock and more come in through the
  day in twos and threes, wings going as they lose height across the park and
  a long tail-down skid onto the surface. On the water they paddle between
  spots, upend for weed with their tails in the air, or doze with the bill
  tucked back. They won't square up to anything: get within six metres, or
  catch one with the hose, and they paddle off or clear the lake altogether.
- **Which way a bird points** — everything that flies or swims is modelled
  nose-first along +Z, the same as the swans, so a heading works out as
  `atan2(x, z)` and drops straight onto the group's yaw. With +Z forward a
  positive pitch is nose down, so climbing away is negative, a landing flare is
  negative and a duck upending for weed is a big positive. The ducks and gulls
  were originally built facing -Z while their movement code assumed +Z, which
  had them travelling tail-first, and the gulls carried a further ninety
  degrees of error on top that had them wheeling round the lake sideways-on.
  Circling gulls take their heading from the true tangent of their (squashed)
  circle and bank into whichever way it turns them.
- **`src/game/entities/Gull.ts`** — herring gulls, wheeling over the lake at
  twenty-six metres on stiff wings. Every few seconds one has a look at what's
  on the ground: bread sprinkled on the paving and food litter — chip paper,
  crisps, a coffee cup — count as fair game, but only if nobody, player
  included, is stood within six metres of it. The moment it's unattended the
  gull shrieks, stoops on it in one long slant, and stands over it taking a
  beakful every half second until it's gone. Bread gets pecked away crumb by
  crumb; a chip paper it carries off whole, so the job's done for you but
  you've had none of the credit. About a third of what goes in comes back out
  as a white splat on the paving that you then have to wash off. Walk within
  five metres and it's up and away, still shouting. The warden texts in when
  they're down on the deck.
- **`src/game/entities/Plane.ts`** — every couple of minutes something goes
  over. Three times in four it's an airliner on the Gatwick run at about
  three hundred metres, small and silver with swept wings, dragging a
  contrail that spreads and thins for twenty seconds behind it; the rest are
  lower and slower off the Solent, with no trail. They cross the whole map in
  a straight line and are purely scenery — nothing to clean, nothing to dodge
  — but they stop the sky being empty. None are sent up once the cloud closes
  in, and the trails wash out as the weather greys over.

  Once or twice a shift, on a clear afternoon, the Spitfire comes over. It
  always runs the same way — in from the east down the seafront and out over
  the Isle of Wight — low and quick at about eighty-five metres, camouflage
  on top and Sky underneath, roundels under the elliptical wings, propeller a
  blur, rocking gently as it's hand-flown. The depot texts to tell you to
  look up.
- **`src/game/entities/Footprint.ts`** — treading in a dropping doesn't end
  with the swearing. Whoever's done it carries it off on the sole and leaves a
  print at every footfall for the next six steps, left and right either side
  of the line they're walking, each one fainter than the last as it wears off.
  A trail counts against the park at about a third of the weight of the mess
  that caused it, so it's a job worth doing but not a big one; the prints lift
  quickly under the washer and wear off on their own after a couple of
  minutes. Cleaning them doesn't score on its own — it just stops the trail
  dragging the cleanliness down while it's there.

  Bikes do the same thing but worse. A rider who goes through a dropping
  prints it off the back tyre for the next nine metres as one continuous line
  with the tread pattern across it, laid in sixty-centimetre lengths that
  fade as the wheel runs itself clean. It follows the bend of the path, so
  one careless dropping near the café can end up drawn halfway round the
  lake. Same as the shoe prints, it washes off easily and counts lightly.
- **`src/game/entities/Squirrel.ts`** — seven greys living in the holm oaks,
  each with its own tree. Ordinary business is short bounding runs across the
  grass within about nine metres of home, then sat up on the haunches with the
  paws under the chin, head jerking about between mouthfuls and the tail
  flicking the whole time. They are all nerves: anything within four and a
  half metres, or a touch of the hose, and they bolt for their trunk and go up
  it in a spiral, out of sight in the crown for a few seconds before coming
  back down.

  About a third of them are bold, and those ones share the gulls' view of
  unattended food. If bread or a food wrapper is lying more than six metres
  from anybody they'll cross up to twenty-six metres of open park for it, take
  it, and leg it home with the crust in their mouth to eat it up the tree —
  so, like the gulls, they clear the job but you get none of the credit. A
  bold one mid-raid will let you get within two and a half metres before it
  gives up its dinner.
- **Litter and the litter picker** — about a third of the public can't be
  doing with finding a bin. Every half minute or so they drop something where
  they stand — a lager can, a green bottle, a screwed-up crisp packet, a
  newspaper, a coffee cup, chip paper with the last few chips still in it —
  and sometimes mutter "NOBODY SAW THAT" as they go. An empty bread bag gets
  the same treatment. Rubbish counts against the park's cleanliness exactly
  like a dropping, shows as orange dots on the minimap, and the light stuff
  shifts about more the windier the weather gets.

  Hosing it down does nothing, so there's a second tool: `Q`, or `1` and `2`,
  swaps between the pressure washer and a council-issue litter picker — alloy
  grabber in one hand, bin sack in the other, and the sack sags heavier as it
  fills. Clicking jabs the spike at the ground about two metres in front; the
  jaws bite partway through the swing and take the nearest piece within 1.3m,
  which then arcs up into the sack. Each one scores the same as a cleaned
  dropping and keeps the combo running, so a line of rubbish is worth
  chaining. Files: `entities/Litter.ts`, `effects/LitterPicker.ts`.
- **The tool belt sorts itself out** — you rarely need those keys, because the
  belt reads whatever you're looking at. Rubbish or a full bin within about
  four and a half metres ahead brings the picker up; a dropping, a tag or a
  set of trodden-in prints within nine brings the washer. Whatever's already
  in your hands wins the tie, so standing between a full bin and a mess
  doesn't set them swapping back and forth. Four seconds looking at nothing
  that needs doing and it goes away altogether — empty hands, and the panel
  reads NOTHING IN HAND. Every change is a proper move rather than a swap on
  the spot: the tool drops out of sight and tilts down over about a quarter
  of a second, the belt changes over at the bottom of it and the new one
  comes back up the same way, and neither will spray or jab until it's up.
  Pulling the trigger empty-handed fetches whatever the job in front of you
  needs. Picking a tool by hand holds the automatic swapping off for ten
  seconds so it doesn't argue with you. Files: `Player.ts`, `Game.jobInSight`.
- **`src/game/entities/Scooter.ts`** — the odd older resident doing a slow lap
  on a mobility scooter, two at most, sat well back from the water. Four small
  wheels under a moulded deck, a tiller with a wire basket, a high-backed seat
  and the little orange flag whipping about on its pole behind them. They
  trundle at 1.4–2.4 m/s, pull up dead — no swerving — for anything in a wide
  cone ahead and beep about it, and every twenty-odd seconds they stop for a
  natter whether you want one or not. Driving through a dropping flattens it,
  counts as a complaint and gets a proper earful. Orange dots on the minimap,
  and off home for their tea after a lap or so.
- **Bread on the path** — half the people carrying food have a kid with them,
  and rather than hand-feeding they stop and tip the whole bag out on the path,
  the pair of them flinging it about while the swans converge. A pile is
  fourteen crumbs and pulls swans in from 40m whether they're hungry or not,
  which beats trailing someone who only might share. They shoulder in round it
  with wings half-open, heads down, and peck it away in about ten seconds.
  Then comes the bill: every swan that ate owes two to four droppings over the
  next minute, dropped wherever it happens to be stood, which is the middle of
  a busy path rather than the usual band along the water's edge. Empty-handed
  people pick up a fresh bag after a minute or two, standing in for the crowd
  turning over, so bread events keep happening all session.
- **Feeding the swans** — about a third of the public carry a paper bag with
  four handfuls in it. A swan that hasn't eaten for 40 seconds will spot a
  carrier up to 24m off and trail after them, climbing out of the lake to do it
  and following them up the path with its neck craned. Get within 1.7m and the
  person stops to lob a handful, which fills the swan up and — inevitably —
  brings its next dropping forward. Empty bags disappear and the swans lose
  interest. A swan mid-charge is far too angry to care about food.
- **Treading in it** — walk anywhere near a mess and the public will find it.
  They recoil with their arms up, then stand there for three seconds scraping
  the shoe on the path while a speech bubble goes up over their head. Each one
  is a complaint on your record in the score panel, breaks your combo and costs
  25 points, and the mess they found is left squashed flat and spread wider.
  They won't grumble at the same one twice, but the next person along will.
- **Soaking the public** — catch anyone with the hose and they kick off about
  it, their clothes going dark and drying out over the next 45 seconds, and it
  goes on your record as a complaint. Do it to someone stood within three
  metres of the water and they pitch straight over the edge: a shout, chest-deep
  floundering on the bottom for three seconds, then they haul themselves back
  out onto the paving and rejoin the walk from wherever they came up. The
  entry throws up rings and a shower of droplets that soaks anyone within seven
  metres — which can put a second person in the lake — and rattles every swan
  within eight, so a single misplaced blast can set the whole bank off.
- **Player** — 9 m/s walk, 15 m/s with Shift held, blocked from walking into the
  lake.

---

**Not on the site yet.** Build order TBD. This document is the design foundation — implementation continues against it.
