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

On the same Wi‑Fi, open `http://<your-computer-ip>:5304/` on your phone (Vite already listens on the LAN; find the IP in the terminal Network URL, or with `ipconfig getifaddr en0` on a Mac).

### Level editor

Trace the park over a Google Maps screenshot instead of guessing coordinates.

1. Open **http://localhost:5304/editor.html**
2. **Add image** / **Paste image** (or Ctrl/Cmd+V) — load a Maps screenshot. Use **Background** tool to drag it; sliders for image/map opacity, size, and rotation. Image + settings are kept in this browser (IndexedDB) across reloads; **Remove image** clears them
3. Use the **ribbon tabs** (Shore, Paths, Roads, Terraces, Park ring, Play area, Car park, Terrain, Buildings, Bins, Foliage, …). Each tab shows its own settings strip. **Roads** / **Terraces** zone parade stone and house runs like Paths. **Play area** edits the rubber outline. **Car park** draws an asphalt pad (cars fill it in-game). **Terrain** draws raised berms with a height slider. **Buildings** opens a side catalog for hire buildings and play kit. **Foliage**: trees, shrubs, and flower beds you place (only those appear in-game; **Clear foliage** empties the park). **Walk** (title bar) opens a first-person view of the park — same ribbon tools, click under the crosshair to place/select, hold to drag, `[` `]` rotate, Delete remove. **Debug** (next to Walk) opens the real game with the intro skipped — pick start of shift or a mission (picnic / geese / fire / rebels); no Maps underlay. **Undo** / Ctrl+Z reverses edits.
4. **Save** — stores in this browser **and** writes `public/levels/canoe-lake.json` (Vite dev server). Other devices then get it after **Reset default** (clears their old browser save) or a fresh load with no local save
5. **Download JSON** — manual copy of the level if you need the file outside the repo
6. **Reset default** — clears this browser’s save and reloads the shipped `public/levels/canoe-lake.json` (does not write a new save until you hit Save)

Load order: local editor save → bundled `public/levels/canoe-lake.json` → baked defaults.

Each device/browser has its own save. After you Save on your computer, **Reset default** on the phone so it isn’t still overriding with an old phone-side save.

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
