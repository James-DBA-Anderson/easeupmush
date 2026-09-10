# Canoe Lake Clean Up

3D FPS game where you clean up swan droppings around Canoe Lake in Southsea, Portsmouth using a high-pressure spray gun. The shift starts with a heavy overnight tip on the paving by the van — wash most of that clear and the next jobs come in further round the lake.

**Status:** Planning phase. See `PLAN.md` for full game design document.

## Concept

Patrol the historic Victorian park around Canoe Lake with a high-pressure cleaning gun. Mute swans continuously make messes. Keep the cleanliness meter above the threshold before your shift ends.

## Setting

Authentic recreation of Canoe Lake, Southsea — Victorian boating lake from 1886, known as a "swan's nursery" where up to 60 mute swans congregate.

**Key landmarks:**
- The boating lake with pedal boats
- Rose Gardens within Lumps Fort remains
- Cumberland House Natural History Museum
- Emanuel Emanuel fountain
- Mature evergreen oaks (planted 1910)

## Development

```bash
npm install
npm run dev:canoe-lake  # Game: http://localhost:5304/
                        # Editor: http://localhost:5304/editor.html
```

### Level editor

Trace the park over a Google Maps screenshot instead of guessing coordinates.

1. Open **http://localhost:5304/editor.html**
2. **Add image** / **Paste image** (or Ctrl/Cmd+V) — load a Maps screenshot. Use **Background** tool to drag it; sliders for image/map opacity, size, and rotation. Image + settings are kept in this browser (IndexedDB) across reloads; **Remove image** clears them
3. Edit layers: **Shore**, **Paths**, **Park ring**, **Buildings**, **Bins**. **Buildings** opens a left panel — pick an object for a 3D preview (drag to orbit, scroll to zoom, yaw slider / Shift-drag to turn). Paths: click an edge to add a node; **Shift-drag** to move a whole path. **Undo** / Ctrl+Z reverses edits
4. **Save** — stores in this browser; the game loads it on next boot
5. **Download JSON** — put the file at `public/levels/canoe-lake.json` to ship with the build

Load order: local editor save → bundled `public/levels/canoe-lake.json` → baked defaults.

### Testing Mobile Controls

Mobile play requires **landscape**. On a phone, turn it sideways — portrait shows a rotate prompt. In DevTools, pick a phone preset and rotate to landscape.

### Controls

**Desktop:**
- WASD: Move
- Mouse: Look
- Click: Spray
- ESC / Pause button: Pause

**Mobile (landscape):**
- Left stick: Move
- Spray stick (above look): Aim and fire in any direction / jab
- Far right stick: Look
- Pause button: Pause

## Links

- Full design doc: `PLAN.md`
- Real location: [Canoe Lake, Southsea, Portsmouth, UK](https://www.visit-hampshire.co.uk/things-to-do/canoe-lake-p1434811)
