# Pompey Punch-Up

A crude, hand-drawn Streets of Rage–style 2D brawler set in Portsmouth, UK.

You wake up on Southsea beach after a messy night out. A car pulls up. Mean lads pile out. The brawling starts. Turns out you’re known throughout Pompey — and last night, while bladdered, you accidentally offended the mother of the first boss. He’s sent his gang to find you.

**Art direction:** deliberately bad schoolboy sketchbook humour — thick marker lines, wonky proportions, stick-figure energy, the kind of drawings a 14-year-old makes to make his mates laugh.

---

## Open questions (need your answers)

### Story & tone
1. **Working title** — stick with *Pompey Punch-Up*, or something else?
2. **Player name / nickname** — e.g. “Jamie”, “The Legend”, a proper Pompey nickname?
3. **How rude?** — pub banter / mild swearing, or full Fratton End terrace language?
4. **Comedy vs serious** — mostly slapstick, or darker undercurrent under the jokes?

### Gameplay scope (MVP)
5. **First vertical slice** — Beach only (intro + first gang fight + mini-boss), or Beach → Parade → first full boss?
6. **Co-op** — solo only for v1, or 2-player local like Streets of Rage 2?
7. **Moveset** — punch / kick / grab / jump only, or specials (bottle smash, chip-shop weapons, etc.) early?
8. **Difficulty** — arcade-hard with lives/continues, or more forgiving modern feel?

### Tech & delivery
9. **Art pipeline** — scan real paper doodles, draw in a tablet app with “bad pen” brushes, or generate placeholder stick-sprites and replace later?
10. **Audio** — mute prototype first, or chiptune / pub-rock parody soundtrack early?

### Portsmouth flavour
13. **Must-have locations** for later levels? (Southsea Beach, The Hard, Fratton Park area, Guildhall, Spice Island, Cascades, etc.)
14. **Real landmarks / brands** — parody names only, or recognisable Pompey spots with care around trademarks?
15. **First boss** — name / vibe? (protective son, nightclub owner, taxi firm kingpin, etc.)

Reply with answers (even short ones) and we’ll lock the MVP.

---

## Plan (assumed defaults until you answer)

### Vision
Side-scrolling beat-’em-up: walk right, clear waves of thugs, pick up improvised weapons, face a boss. Camera and lane rhythm inspired by *Streets of Rage 2*; humour and setting are pure Pompey.

### Combat (locked) — no health bars
You **wear → break → open → finish**. No HP bars. Body language is the UI (posture, limbs, stumbles, **face/anger**). Default end state is crawl-away KO; **out cold** only on strong hits to exposed criticals. Grabs open for a boot to the head; low blows disable but raise anger (wilder, more open). Throws can finish via terrain/edges. Weapon arcs can wind or finish several if they’re in the swing and vulnerable. Details in [`docs/DESIGN.md`](docs/DESIGN.md).

### Assumed MVP — “Beach Wake-Up”
| Beat | What happens |
|------|----------------|
| 1 | Black screen → hungover wake-up on the beach (crude doodle background) |
| 2 | Car pulls up; 3–4 lads get out; fight tutorial via combat |
| 3 | Wave clears; short dialogue: *“You slagged off Dave’s mum last night, mate”* |
| 4 | More waves toward the promenade |
| 5 | Mini-boss or first boss intro tease; win → title card / “Level 1 Complete” |

**Out of MVP:** full campaign map, online multiplayer, complex RPG systems, pixel-perfect SOR2 cloning.

### Tech (locked)
- **Web game:** Phaser 3 + TypeScript + Vite
- **Standalone site:** `npm run build` → self-contained `dist/` (relative asset paths). GitHub Actions deploys to **GitHub Pages** on every push to `main`
- Custom domain later: drop a `CNAME` in `public/`
- Simple entity system: `Player`, `Enemy`, `WeaponPickup`, hitboxes + **structure** (balance / wind / limbs / openings) — not HP bars
- Combat states: idle → attack → recover → open → hurt → broken → KO (plus limb-disabled variants)
- Placeholder “sketch” art as SVG/PNG until real doodles land
- One level scene + boot/menu scene
- Keyboard (+ later touch) controls in the browser

### Art rules (non-negotiable for the feel)
- Wobbly outlines, uneven eyes, stick limbs OK
- No polished indie aesthetic; if it looks “nice”, redraw it worse
- Speech in messy handwriting / comic balloons
- Backgrounds: flat marker colour + scribbled detail (pier, pebbles, bin, seagull)

### Milestone roadmap
1. **Repo + scaffold + site deploy** ✓  
2. **Walk / punch / kick / grab / dodge** ✓  
3. **Wear-down combat v1** ✓ — wind/balance/anger, grab→boot, crawl-away vs out cold  
4. **Intro beat** (wake-up + car arrival animation)  
5. **Bottle arc + limb-break** + wave spawner + one terrain finisher  
6. **First boss pass** + win/lose flow (boss sells “worn” / anger through animation)  
7. **Pass of real doodle art + SFX**  
8. **Level 2 location** (once MVP feels fun)

### Repo layout
```
pompey-punch-up/
├── README.md
├── package.json
├── index.html
├── src/
│   ├── main.ts
│   ├── game/
│   │   ├── config.ts
│   │   └── scenes/
│   │       ├── BootScene.ts
│   │       ├── BeachScene.ts
│   │       └── UIScene.ts
│   └── entities/
│       ├── Player.ts
│       └── Enemy.ts
├── public/
│   └── assets/          # doodles, SFX later
└── docs/
    └── DESIGN.md
```

---

## Run locally

```bash
npm install
npm run dev
```

Open **http://localhost:5299/** (fixed port so it won’t clash with other Vite apps on 5173).

Boot screen → beach scrap (WASD / J K U L / Space).

## Standalone site

Production build is a static site in `dist/` — upload that folder anywhere, or use GitHub Pages.

```bash
npm run build          # write dist/
npm run site           # build + preview production locally
npm run preview        # preview an existing dist/
```

### GitHub Pages

1. Push this repo to GitHub (public or private with Pages enabled).
2. **Settings → Pages → Build and deployment → Source:** GitHub Actions.
3. Push to `main` (or run the **Deploy site** workflow). Site URL appears on the workflow run.

Custom domain: put the domain name in `public/CNAME`, then point DNS at GitHub Pages.
