# Pompey Jim

Close-up 16-bit portrait of a Portsmouth fan. Type in the box and talk to him.

Jim is proper Pompey. He speaks from `shared/phraseology.json` — mush, shant, hanging, dane tane, scummers, the lot — sprinkled, not dumped.

On Cloudflare he runs on Workers AI free-tier (`@cf/meta/llama-3.2-3b-instruct`). He asks about whoever's talking and keeps one notebook for everyone in Cloudflare KV (`pompey-jim:knowledge` on the existing `SCORES` store). Any session can read the whole book — people, news, events, and his own takes. People lie, so he doesn't swallow everything: beard / beard on tash when it sounds like a wind-up.

Paste a link and he holds his phone up while he tries to read it. Talk to him mid-read and he's distracted until it's stored. If the page won't load he'll say it ain't working, or that he's been banned off the site.

Local `npm run dev` uses the same API path; if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set it hits Workers AI, otherwise a phraseology fallback Jim. Local notes land in `apps/pompey-jim/.local/jim-knowledge.json`.

## Play

Back room: `/games/pompey-jim/`

```bash
npm install
npm run dev:pompey-jim   # http://localhost:5307/
# or via the site proxy:
npm run dev              # http://localhost:5300/games/pompey-jim/
```
