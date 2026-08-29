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

---

**Not on the site yet.** Build order TBD. This document is the design foundation — implementation starts after approval.
