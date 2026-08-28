# Ease Up Mush

Browser games from Pompey for Pompey. Site: [easeupmush.com](https://easeupmush.com).

This is a **monorepo** — the marketing site plus games that ship under it.

```
apps/
  site/                 # easeupmush.com homepage
  pompey-punch-up/      # Southsea brawler
```

## Play / develop

```bash
npm install
npm run dev          # homepage + game → http://localhost:5300/ (Play works)
npm run dev:site     # homepage only (Play needs the game proxy target)
npm run dev:game     # Pompey Punch-Up alone → http://localhost:5299/
npm run debug        # fight sandbox → http://localhost:5299/debug
```

`npm run dev` starts the site on **:5300**, Pompey Punch-Up on **:5299** and Pompeymon on **:5303**, and proxies `/games/pompey-punch-up/` and `/games/pompeymon/` so Play / Debug match production.
Production URLs after deploy:

| Path | What |
|------|------|
| `/` | Ease Up Mush homepage |
| `/games/pompey-punch-up/` | Pompey Punch-Up |
| `/games/pompey-punch-up/debug.html` | Debug arena |
| `/mush/` | Back room — unlisted homepage with the in-progress games. Reached by clicking the logo on `/about/` |
| `/mush/phraseology/` | Pompey phraseology reference |
| `/games/pompeymon/` | Pompeymon (unlisted, linked from the back room only) |

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
