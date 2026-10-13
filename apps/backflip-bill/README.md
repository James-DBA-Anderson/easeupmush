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
- **Tuck in the air** — default is stick left/right (or A/D). Left straightens, limbs trailing, and slows the spin. Right crouches in and speeds it. The debug menu can switch this to up/down, or hold-FLIP-to-tuck / release-to-stretch.
- **Land on your feet** to keep speed. A bad angle is a stumble; worse is a fall.
- **Level 1** is flat with one gap. **Level 2** drops to a lower landing after the gap. **Level 3** is a huge drop. Falling in is death, then respawn.

### Desktop

- **A / D** or **arrows** — run
- **Space** (or **W** / **up** on the ground) — backflip
- **A / left** in the air — straighten (slow spin)
- **D / right** in the air — tuck (fast spin)
- **R** — respawn this level

### Mobile (portrait PoC)

- Floating virtual joystick, **bottom left** — left / right run on the ground. Left / right in the air changes tuck. Press the left half of the screen to float the stick under your thumb.
- **FLIP** button, **bottom right** — jump / backflip.

## Debug

`npm run dev:backflip-bill` (Vite DEV) shows a **Debug** panel. Production / deployed builds do not.

- Pick a tuck scheme, then sliders for speed, jump, accel, flip rates, and landing / stumble / fall / death timings.
- Tweaks apply immediately while you play.
- **Save** writes `src/game/tuning.json`, which the shipped game loads. Deploy that file (via a normal build) to keep the values outside debug mode.
- **Revert** goes back to the last save. **Factory** restores the original defaults (save if you want those to ship).
- `` ` `` hides or shows the panel.
