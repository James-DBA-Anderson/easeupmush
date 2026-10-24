# Pompey Jim

Close-up 16-bit portrait of a Portsmouth fan. Type in the box and talk to him.

Jim is proper Pompey. He speaks from `shared/phraseology.json` — mush, shant, hanging, dane tane, scummers, the lot — sprinkled, not dumped.

On Cloudflare he runs on Workers AI free-tier (`@cf/meta/llama-3.2-3b-instruct`). Local `npm run dev` uses the same API path; if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set it hits Workers AI, otherwise a phraseology fallback Jim.

## Play

Back room: `/games/pompey-jim/`

```bash
npm install
npm run dev:pompey-jim   # http://localhost:5307/
# or via the site proxy:
npm run dev              # http://localhost:5300/games/pompey-jim/
```
