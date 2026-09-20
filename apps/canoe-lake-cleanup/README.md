# Canoe Lake Clean Up

3D first-person shift at Canoe Lake, Southsea — wash swan mess, pick litter, and answer radio jobs while the park keeps making more of both.

**Status:** Playable prototype (Vite + TypeScript + Three.js). Design notes and a detailed build inventory live in `PLAN.md`.

## What you do

Clock on at the cleaner van after a heavy overnight tip on the paving. Hose droppings and graffiti, jab litter and overflowing bins with the picker, keep the cleanliness meter up, and deal with scripted missions as the 24‑minute day cycle runs from 06:00 round to the next morning.

The park is busy: swans (and cygnets), mallards, gulls, dogs, cyclists, BBQ parties, crabbing kids, foxes at night, and a phone full of Pompey depot texts.

## Scripted missions

Authored pins in the level editor; windows are on the shift clock.

| Id | Job |
| --- | --- |
| `picnic` | Gulls diving a picnic — hose them off |
| `geese` | Radar geese inbound — grab the van heavy hose |
| `swanboat` | Stolen swan pedalo |
| `fire` | Disposable BBQ grass fire |
| `racers` | Boy racers on the parade |
| `rebels` | Late‑night Gosport lot over the esplanade |

## Development

```bash
npm install
npm run dev:canoe-lake  # Game:   http://localhost:5304/
                        # Editor: http://localhost:5304/editor.html
```

On the same Wi‑Fi, open `http://<your-computer-ip>:5304/` on a phone (Vite listens on the LAN). Find the IP in the terminal Network URL, or `ipconfig getifaddr en0` on a Mac.

### Level editor

Trace the park over a Maps screenshot instead of guessing coordinates.

1. Open **http://localhost:5304/editor.html**
2. **Add image** / **Paste image** (or Ctrl/Cmd+V) — load a Maps screenshot. **Background** tool to drag it; sliders for opacity, size, rotation. Image + settings stay in this browser (IndexedDB); **Remove image** clears them
3. Ribbon tabs: Shore, Paths, Roads, Terraces, Fairy lights, Fencing, Play area, Car park, Beach, Terrain, Buildings, Bins, Foliage, **Missions**. Each tab has its own strip. **Foliage** places trees/shrubs/beds (only placed foliage appears in‑game). **Missions** pins jobs and their clock windows. **Walk** — first‑person place/select under the crosshair (`[` `]` rotate, Delete remove). **Debug** — real game, intro skipped; start of shift or a named mission
4. **Save** — browser save **and** writes `public/levels/canoe-lake.json` (Vite). Other devices pick it up after **Reset default** or a fresh load with no local save
5. **Download JSON** — manual copy of the level
6. **Reset default** — clears this browser’s save and reloads the shipped JSON

Load order: local editor save → bundled `public/levels/canoe-lake.json` → baked defaults.

### Testing mobile

Mobile play needs **landscape**. Portrait shows a rotate prompt. In DevTools, pick a phone preset and rotate to landscape.

### Controls

**Desktop**
- **WASD** — move · **Shift** — run
- **Mouse** — look · **Click** — spray / jab
- **1** / **2** / **Q** — hose · picker · swap (belt also auto‑picks from what’s ahead)
- **E** — grab heavy hose at the van (mission) · hire / board a pedalo when available
- **ESC** — pause

**Mobile (landscape)**
- Left stick — move
- Spray stick — aim and fire / jab (hold centred to climb out of the lake)
- Far right stick — look
- Pause — pause

## Links

- Design / build inventory: `PLAN.md`
- Real place: [Canoe Lake, Southsea](https://www.visit-hampshire.co.uk/things-to-do/canoe-lake-p1434811)
