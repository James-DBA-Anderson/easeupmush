# Linebench

Local booth for **recording game dialogue**. Takes stay here until you mark one **Use in game** — that copy is written into the game's `public/voices/` for the next load. Unmarked takes are never played.

```bash
npm run dialogue          # → http://localhost:5175
```

## Use

1. Pick a game (Canoe Lake Cleanup for now) and a character.
2. Click a line. The cue and a model preview sit on the right.
3. **Record** (or press `R`). Stop when the take is done.
4. Play or delete any take. Several takes can sit on the same line.
5. **Use in game** on a take to make it the live one for that line. Reload the game to hear it. Click again to clear.

`{where}` in radio copy is a place-name slot filled in-game.

Lines come from each game's own catalog — Canoe Lake's is `apps/canoe-lake-cleanup/src/dialogue/`. Add a new line there and Linebench picks it up on reload. New games export the same `DialogueCatalog` shape (`@easeupmush/shared/dialogue`) and register it in `src/catalog/games.ts`.

## Where files go

```
tools/dialogue-record/recordings/
  canoe-lake-cleanup/
    <character>/
      <line-id>/
        takes.json          # log for this line
        take-….webm
  log.json                  # index of every take
```

The `recordings/` tree is gitignored.
