# Bunsterstons and Chippy

3D platformer — two characters take turns.

- **Bunsterstons** (pink bunny) — odd levels (collect carrots)
- **Chippy** (guinea pig) — even levels

## Level 2 (Chippy)

1. Approach the metal gate and **climb** it (hold **W** against the bars)
2. Reach the top — drop onto the **wooden boat in lava**
3. **Bunsterstons** is already waiting on the boat
4. Team up against **Ken** — bash with **F / E** to knock him into the lava
5. Ken falls off the boat → level clear

## Development

```bash
npm install
npm run dev:bunsterstons   # http://localhost:5305/
# Chippy's stage:
# http://localhost:5305/?level=2
```

### Controls

**Desktop**
- **WASD / arrows** — move
- **Space** — jump
- **Shift** — sprint
- **F / E** — attack (Level 2 boat battle)
- **R** — restart current level anytime
- **Enter** — next level after a clear

**Mobile / touch** (narrow screens, short landscape, or coarse pointer)
- Left stick — move / climb
- **Jump**, **Sprint**, **Attack** (Attack on Level 2)
- Clear screen — **Next level** / **Replay** buttons
