# Adding a New Game to Ease Up Mush

Follow these steps when creating a new browser game in this monorepo. Every new game must integrate with the existing asset tools, use Pompey phraseology, and list itself on the back-room page.

---

## 1. Create the game workspace

```
apps/<slug>/
  package.json
  vite.config.ts
  index.html
  src/
    main.ts (or main.tsx)
```

- Use npm workspaces — the root `package.json` already manages them.
- Set the package `name` to `@easeupmush/<slug>`.
- In `vite.config.ts`, read `base` from `process.env.GAME_BASE ?? "./"` so production builds work under `/games/<slug>/`.
- The game should be a self-contained Vite app. See `apps/backflip-bill/` for a minimal working example.

---

## 2. Build & deploy wiring

Add the game to two places so it ships:

### Root `package.json` build script

Append a build step to the existing `build` script (kept on one line):

```bash
GAME_BASE=/games/<slug>/ npm run build -w @easeupmush/<slug> &&
```

### `scripts/assemble-dist.mjs`

Import the game's `dist` path, add a guard `if (!existsSync(...))`, and copy it into `dist/games/<slug>/` exactly like the existing games. Update the final `console.log` to list the new slug.

---

## 3. Asset creation — use the repo's tool benches

All images, 3D models (non-terrain), and voiced dialogue must be produced through the existing local tools so they land in catalogs the repo can read and write.

### Images — Spritebench (`tools/dynamic-image-gen/`)

```bash
npm run assets   # → http://localhost:5173
```

- Generate 2D sprites, characters, items, backgrounds, etc.
- PNGs land in `tools/dynamic-image-gen/generated/` (gitignored).
- Download from the UI, then commit the resulting PNGs into the game's own `public/` or `src/` assets folder.
- The **Game sprite editor** can also paint frames directly into a game's `src/**/sprites` TypeScript pixel-array files.

### 3D Models — Meshbench (`tools/dynamic-model-gen/`)

```bash
npm run models   # → http://localhost:5174
```

- Generate and edit 3D props, characters, vehicles, etc.
- Export as **GLB** (or animated GLB with morph + TRS clips).
- GLBs land in `tools/dynamic-model-gen/generated/` (gitignored).
- Drop the exported GLB into the game's `public/` folder (e.g. `public/models/`).
- **Terrain models are not yet supported** by Meshbench — do not use this tool for level geometry / terrain. Hand-build terrain or use a separate pipeline.

### Audio / Dialogue — Linebench (`tools/dialogue-record/`)

```bash
npm run dialogue   # → http://localhost:5175
```

1. Create a dialogue catalog in the game:
   ```
   apps/<slug>/src/dialogue/
     catalog.ts   # exports DialogueCatalog
     index.ts     # re-exports catalog + helper
   ```
2. In `catalog.ts`, import `{ pack, type DialogueCatalog } from "@easeupmush/shared/dialogue"` and export a catalog object with characters, sets, and lines.
3. In `index.ts`, re-export `catalog` and a `lines(characterId, set)` helper using `linesOf` from `@easeupmush/shared/dialogue`.
4. In the game's `package.json`, add:
   ```json
   "exports": {
     "./dialogue": "./src/dialogue/index.ts"
   }
   ```
5. Register the catalog in `tools/dialogue-record/src/catalog/games.ts` by importing it alongside the existing games.
6. Record takes in Linebench. Mark a take **Use in game** to copy it into the game's `public/voices/` folder. Unmarked takes stay in `tools/dialogue-record/recordings/` and are never played.

---

## 4. Pompey phraseology

All games speak Portsmouth. Import the glossary and sprinkle it — don't dump every slang word into every line.

```typescript
import phraseology from '@easeupmush/shared/phraseology';
```

Or read `shared/phraseology.json` directly. Keep spoken lines short. Use words like *mush*, *geez*, *copped*, *beard*, *chore*, *shant*, *dane tane*, *sweet as nut*, *cushty*, *init* naturally — as locals would, not as a checklist.

Linebench itself highlights glossary words that appear in a cue, so you'll see phraseology matches while recording.

---

## 5. List the game on the back-room page

The public homepage only shows shipped, out-now games. In-progress or proof-of-concept games live on the hidden **back room** at `/mush/` (reached by clicking the Ease Up Mush logo on `/about/`).

Add an `<article class="feature feature--wip">` block to `apps/site/mush/index.html` inside `<section id="games">`. Include:

| Element | Required | Notes |
|---------|----------|-------|
| `.feature__visual` + screenshot | Yes | Put a PNG in `apps/site/public/shots/<slug>.png` and reference it from the `<img>`. If no shot yet, use the `.feature__visual--none` / `.feature__none` placeholder. |
| `.feature__eyebrow` | Yes | Short status label, e.g. `Proof of concept`, `Half built`, `Alpha`. |
| `.feature__title` | Yes | Human-readable game name. |
| `.feature__version` | Yes | Version string, build label, or stage name (e.g. `v0.2.0`, `Three.js PoC`). |
| `.feature__blurb` | Yes | One-paragraph description of the game. |
| `.feature__actions` Play link | Yes | `<a class="btn btn--primary" href="/games/<slug>/">Play</a>` |
| Debug / extra links | Optional | Only if the game has a debug page or secondary link. |

Follow the existing markup pattern exactly (see Pompeymon, Canoe Lake, Backflip Bill, etc. in that file). The back room is the only place unlisted games are linked from.

---

## 6. Run the full stack locally

```bash
npm install
npm run dev          # site + all games via proxy
```

Or run the game standalone:

```bash
npm run dev -w @easeupmush/<slug>
```

Preview the production assembly:

```bash
npm run build && npm run preview   # → http://localhost:4299/
```

Check the back room at `http://localhost:4299/mush/` and verify your new game appears with the correct screenshot, blurb, version, and Play link.

---

## Checklist

- [ ] `apps/<slug>/` created with Vite, `GAME_BASE` wired
- [ ] Root `package.json` build script updated
- [ ] `scripts/assemble-dist.mjs` updated
- [ ] Spritebench used for any 2D images; assets committed to game's `public/`
- [ ] Meshbench used for any 3D models (not terrain); GLBs committed to game's `public/`
- [ ] Linebench catalog created, registered in `tools/dialogue-record/src/catalog/games.ts`, `package.json` exports `./dialogue`
- [ ] Pompey slang sprinkled via `shared/phraseology.json`
- [ ] Back-room entry added to `apps/site/mush/index.html` with screenshot, blurb, version, and Play link
- [ ] Full `npm run build && npm run preview` passes and game is reachable
