# Canoe Lake Clean Up

3D FPS game where you clean up swan droppings around Canoe Lake in Southsea, Portsmouth using a high-pressure spray gun.

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

Mobile controls automatically appear on touch devices. To test on desktop:

- **Desktop browser:** Add `?mobile` to URL: `http://localhost:5304/?mobile`
- **Browser DevTools:** Use device emulation (Chrome: F12 → Device Toolbar)

### Controls

**Desktop:**
- WASD: Move
- Mouse: Look
- Click: Spray
- ESC: Lock/Unlock mouse

**Mobile:**
- Joystick (bottom-left): Move
- Touch right side: Look
- Spray button (bottom-right): Clean

## Links

- Full design doc: `PLAN.md`
- Real location: [Canoe Lake, Southsea, Portsmouth, UK](https://www.visit-hampshire.co.uk/things-to-do/canoe-lake-p1434811)
