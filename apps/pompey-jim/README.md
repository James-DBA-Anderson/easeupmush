# Pompey Jim

Close-up 16-bit portrait of a Portsmouth fan. Type in the box and talk to him.

Jim is proper Pompey. He speaks from `shared/phraseology.json` — mush, shant, hanging, dane tane, scummers, the lot — sprinkled, not dumped.

On Cloudflare he runs on Workers AI free-tier (`@cf/meta/llama-3.2-3b-instruct`). The browser caches a caller card (`sessionStorage`, `localStorage`, and cookie) so Jim recognises you when you come back, while all the actual notes on you — plus everyone else, news, events, and his own takes — live in one Cloudflare KV notebook (`pompey-jim:knowledge` on the existing `SCORES` store). People lie, so he doesn't swallow everything: beard / beard on tash when it sounds like a wind-up.

In the background he quietly reads PFC, Pompey/Hampshire, and a bit of national news (seed feeds, then sites that actually load). Findings go in the notebook with dates and sources; he prefers decent sources that don't block him and weaves one bit into chat when it fits. Paste a link and he holds his phone up while he tries to read it — if it works he'll say that site's decent and remember it. Talk to him mid-read and he's distracted until it's stored. If the page won't load he'll say it ain't working, or that he's been banned off the site.

Local `npm run dev` uses the same API path; if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set it hits Workers AI, otherwise a phraseology fallback Jim. Local notes land in `apps/pompey-jim/.local/jim-knowledge.json`.

## Play

Back room: `/games/pompey-jim/`

```bash
npm install
npm run dev:pompey-jim   # http://localhost:5307/
# or via the site proxy:
npm run dev              # http://localhost:5300/games/pompey-jim/
```
