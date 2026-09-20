# Dynamic image gen (Spritebench)

Local web app for generating **2D game character sprites**. Not shipped with the site — this is a repo tool for asset creation.

From the monorepo root:

```bash
npm run assets
```

Or from this folder:

```bash
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:8787
- Diffusers worker: http://localhost:8790 (optional)

PNGs land in `generated/` (gitignored). Download from the UI, then drop them into a game’s `public/` or `src/` assets.

## Backends

| Machine | Backend | Model |
| --- | --- | --- |
| Apple Silicon Mac | [Ollama](https://ollama.com) image gen | `x/flux2-klein:4b` (FLUX.2 Klein, Apache 2.0) |
| Intel Mac / CPU | Hugging Face Diffusers | `stabilityai/sd-turbo` (fast small SD) |

Ollama’s image generation is currently **Apple Silicon only**. On Intel Macs the app uses Diffusers. If the Python venv is missing, the UI still starts and uses Ollama when it is available.

### Ollama (Apple Silicon)

```bash
ollama pull x/flux2-klein:4b
```

### Diffusers (Intel / fallback)

From the monorepo root:

```bash
npm run setup:assets
```

First generation downloads SD-Turbo (~2.5GB) from Hugging Face.

## Stack

- Vite + React UI with sprite prompt presets (pixel, chibi, vector, …)
- Express API (progress streaming, gallery saves)
- Ollama FLUX.2 Klein **or** Diffusers SD-Turbo
