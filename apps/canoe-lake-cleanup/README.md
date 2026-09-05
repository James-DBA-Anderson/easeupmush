# Canoe Lake Clean Up

3D FPS game where you clean up swan droppings around Canoe Lake in Southsea, Portsmouth using a high-pressure spray gun. The shift starts with two or three overnight dumps on the paving — jet-wash the streaks clear before the public arrives.

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
npm run dev:canoe-lake  # Runs on http://localhost:5304/
```

### Testing Mobile Controls

Mobile play requires **landscape**. On a phone, turn it sideways — portrait shows a rotate prompt. In DevTools, pick a phone preset and rotate to landscape.

### Controls

**Desktop:**
- WASD: Move
- Mouse: Look
- Click: Spray
- ESC: Lock/Unlock mouse

**Mobile (landscape):**
- Left stick: Move
- Spray stick (above look): Aim and fire in any direction / jab
- Far right stick: Look

## Links

- Full design doc: `PLAN.md`
- Real location: [Canoe Lake, Southsea, Portsmouth, UK](https://www.visit-hampshire.co.uk/things-to-do/canoe-lake-p1434811)
