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
- **No left/right steering in the air.** Trajectory is locked from takeoff momentum.
- **Tuck in the air** — stick up/down (or W/S) blends how crouched he is. Up straightens, limbs trailing, and slows the spin. Down crouches in and speeds it. Default is the midpoint. The crouch is a smooth blend, not a snap.
- **Land on your feet** to keep speed. A bad angle is a stumble; worse is a fall.
- **Level 1** is flat with one gap. **Level 2** drops to a lower landing after the gap. Falling in is death, then respawn.

### Desktop

- **A / D** or **arrows** — run
- **Space** (or **W** / **up** on the ground) — backflip
- **W / up** in the air — straighten (slow spin)
- **S / down** in the air — tuck (fast spin)
- **R** — respawn this level

### Mobile (portrait PoC)

- Floating virtual joystick, **bottom left** — left / right run on the ground. Up / down in the air changes tuck. Press the left half of the screen to float the stick under your thumb.
- **FLIP** button, **bottom right** — jump / backflip.
