# Ease Up Mush

Browser games from Pompey for Pompey. Site: [easeupmush.com](https://easeupmush.com).

This is a **monorepo** — the marketing site plus games that ship under it.

```
apps/
  site/                 # easeupmush.com homepage
  pompey-punch-up/      # Southsea brawler
shared/
  phraseology.json      # Pompey slang — all games + /mush/phraseology/
tools/
  dynamic-image-gen/    # local sprite generator for asset creation
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
| `/mush/phraseology/` | Pompey phraseology reference (generated from `shared/phraseology.json`) |
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

Domain DNS stays on Cloudflare. Automated deployment via GitHub Actions using the new **cf CLI**.

Deployment is triggered automatically on every push to `main`. The GitHub Actions workflow:
1. Installs dependencies
2. Builds the site (`npm run build`)
3. Writes Cloudflare build output from `dist/`
4. Deploys with `cf deploy --prebuilt`

Configuration is in `cloudflare.config.ts` which specifies:
- Project name: `easeupmush`
- Assets directory: `./dist`
- Compatibility date: `2026-08-15`

Manual deployment is also available: run `npm run deploy` locally (requires `CLOUDFLARE_API_TOKEN` environment variable).

## Games

### [Pompey Punch-Up](apps/pompey-punch-up/)

Hungover on Southsea beach. Mean lads pile out of a car. Phaser 3 + TypeScript doodle brawler — see that app’s README for controls and design notes.

To add another game later: create `apps/<slug>/`, build it with `GAME_BASE=/games/<slug>/`, and copy into `dist/games/<slug>/` from `scripts/assemble-dist.mjs`.

## Tools

### [Dynamic image gen](tools/dynamic-image-gen/)

Local Spritebench UI for generating 2D character sprites. Not part of the site build.

```bash
npm run assets          # → http://localhost:5173
npm run setup:assets    # once, Intel Mac / CPU Diffusers fallback
```

On Apple Silicon, pull an Ollama image model first (`ollama pull x/flux2-klein:4b`). Generated PNGs go to `tools/dynamic-image-gen/generated/` (gitignored).
