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
npm run dev          # homepage → http://localhost:5300/
npm run dev:game     # Pompey Punch-Up → http://localhost:5299/
npm run debug        # fight sandbox → http://localhost:5299/debug
```

Stop any leftover Vite from before the monorepo move (Ctrl+C), then use those URLs — the old `:5173` / root game server will 404 or look empty.

Production URLs after deploy:

| Path | What |
|------|------|
| `/` | Ease Up Mush homepage |
| `/games/pompey-punch-up/` | Pompey Punch-Up |
| `/games/pompey-punch-up/debug.html` | Debug arena |

To try the full assembled site locally (homepage + Play link):

```bash
npm run build && npm run preview   # → http://localhost:4299/
```


## Build & deploy

```bash
npm run build        # site + games → dist/
npm run preview      # local production preview on :4299
```

### Cloudflare (easeupmush.com)

Domain DNS stays on Cloudflare. Deploy with **Workers / Pages** connected to this repo.

Build settings:

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Deploy / output | uses `wrangler.jsonc` → `./dist` |
| Root directory | `/` (repo root) |
| Node version | `22` (`NODE_VERSION=22`) |

`wrangler.jsonc` at the repo root tells Cloudflare this is a static site assembled into `dist/`, so it does **not** run workspace autoconfig (which fails on npm workspaces).

Push to `main` to redeploy, or run `npm run deploy` locally (needs `wrangler` login).

## Games

### [Pompey Punch-Up](apps/pompey-punch-up/)

Hungover on Southsea beach. Mean lads pile out of a car. Phaser 3 + TypeScript doodle brawler — see that app’s README for controls and design notes.

To add another game later: create `apps/<slug>/`, build it with `GAME_BASE=/games/<slug>/`, and copy into `dist/games/<slug>/` from `scripts/assemble-dist.mjs`.
