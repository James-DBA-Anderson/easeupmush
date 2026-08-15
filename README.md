# Ease Up Mush

Hand-drawn browser games from the South Coast. Site: [easeupmush.com](https://easeupmush.com).

This is a **monorepo** — the marketing site plus games that ship under it.

```
apps/
  site/                 # easeupmush.com homepage
  pompey-punch-up/      # Southsea brawler
```

## Play / develop

```bash
npm install
npm run dev          # homepage → http://localhost:5300
npm run dev:game     # Pompey Punch-Up → http://localhost:5299
npm run debug        # fight sandbox → http://localhost:5299/debug
```

Production URLs after deploy:

| Path | What |
|------|------|
| `/` | Ease Up Mush homepage |
| `/games/pompey-punch-up/` | Pompey Punch-Up |
| `/games/pompey-punch-up/debug.html` | Debug arena |

## Build & deploy

```bash
npm run build        # site + games → dist/
npm run preview      # local production preview on :4299
```

GitHub Pages: push to `main` (workflow builds `dist/`). DNS for **easeupmush.com** should point at GitHub Pages; `CNAME` is written into `dist/` on build.

## Games

### [Pompey Punch-Up](apps/pompey-punch-up/)

Hungover on Southsea beach. Mean lads pile out of a car. Phaser 3 + TypeScript doodle brawler — see that app’s README for controls and design notes.

To add another game later: create `apps/<slug>/`, build it with `GAME_BASE=/games/<slug>/`, and copy into `dist/games/<slug>/` from `scripts/assemble-dist.mjs`.
