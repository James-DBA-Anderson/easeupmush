# Backflip Bill

2D side-scrolling platformer. The player is **Backflip Bill**, an animated stick man who can only jump as a backflip.

## Play

On the Ease Up Mush site (back room): `/games/backflip-bill/`

```bash
npm install
npm run dev:backflip-bill   # http://localhost:5306/
# or via the site proxy:
npm run dev                 # http://localhost:5300/games/backflip-bill/
```

## How to play

- **Run up** — ground movement accelerates. You need speed to clear the gap.
- **FLIP** — the only jump is a backflip. Bill always rotates backward. One flip per jump, not a spin.
- **No steering in the air.** Trajectory is locked from takeoff momentum.
- **Land on your feet** to keep speed. A bad angle is a stumble; worse is a fall.
- The test level is flat with **one gap**. Falling in is death, then respawn.

### Desktop

- **A / D** or **arrows** — run
- **Space** (or **W** / **up**) — backflip
- **R** — respawn

### Mobile (portrait PoC)

- Floating virtual joystick, **bottom left** — left / right run. Press the left half of the screen to float the stick under your thumb.
- **FLIP** button, **bottom right** — jump / backflip.
