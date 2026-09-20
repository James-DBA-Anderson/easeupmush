import cors from 'cors'
import express from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'generated')
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const DIFFUSERS_URL = process.env.DIFFUSERS_URL ?? 'http://127.0.0.1:8790'
const OLLAMA_MODEL = process.env.OLLAMA_IMAGE_MODEL ?? 'x/flux2-klein:4b'
const FORCE_BACKEND = process.env.IMAGE_BACKEND as 'ollama' | 'diffusers' | undefined

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/generated', express.static(OUTPUT_DIR))

type GenerateBody = {
  prompt?: string
  model?: string
  width?: number
  height?: number
  steps?: number
  seed?: number
}

type Backend = 'ollama' | 'diffusers'

function preferredBackend(): Backend {
  if (FORCE_BACKEND === 'ollama' || FORCE_BACKEND === 'diffusers') {
    return FORCE_BACKEND
  }
  // Ollama image generation is currently Apple Silicon only
  return os.arch() === 'arm64' ? 'ollama' : 'diffusers'
}

app.get('/api/health', async (_req, res) => {
  const backend = preferredBackend()
  const ollama = await probeOllama()
  const diffusers = await probeDiffusers()

  const active =
    backend === 'ollama'
      ? ollama.ok && ollama.hasImageModel
        ? 'ollama'
        : diffusers.ok
          ? 'diffusers'
          : 'ollama'
      : diffusers.ok
        ? 'diffusers'
        : ollama.ok && ollama.hasImageModel
          ? 'ollama'
          : 'diffusers'

  res.json({
    ok: active === 'ollama' ? ollama.ok : diffusers.ok || diffusers.ready !== false,
    backend: active,
    preferred: backend,
    arch: os.arch(),
    ollama,
    diffusers,
    model:
      active === 'ollama'
        ? OLLAMA_MODEL
        : (diffusers.model ?? 'stabilityai/sd-turbo'),
    note:
      os.arch() !== 'arm64'
        ? 'Ollama image gen needs Apple Silicon. Using Diffusers (SD-Turbo) on this Intel Mac.'
        : undefined,
  })
})

app.post('/api/generate', async (req, res) => {
  const body = req.body as GenerateBody
  const prompt = body.prompt?.trim()
  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' })
    return
  }

  const width = clamp(body.width ?? 512, 256, 1024)
  const height = clamp(body.height ?? 512, 256, 1024)
  const steps = body.steps && body.steps > 0 ? body.steps : undefined
  const seed = body.seed && body.seed > 0 ? body.seed : undefined

  const healthBackend = preferredBackend()
  let backend: Backend = healthBackend

  if (backend === 'ollama') {
    const ollama = await probeOllama()
    if (!ollama.ok || !ollama.hasImageModel) {
      const diffusers = await probeDiffusers()
      if (diffusers.ok) backend = 'diffusers'
    }
  } else {
    const diffusers = await probeDiffusers()
    if (!diffusers.ok) {
      const ollama = await probeOllama()
      if (ollama.ok && ollama.hasImageModel) backend = 'ollama'
    }
  }

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  try {
    if (backend === 'ollama') {
      await streamOllama({
        res,
        prompt,
        model: body.model?.trim() || OLLAMA_MODEL,
        width,
        height,
        steps,
        seed,
      })
    } else {
      await streamDiffusers({ res, prompt, width, height, steps, seed })
    }
  } catch (error) {
    res.write(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Generation failed',
      }) + '\n',
    )
    res.end()
  }
})

async function streamOllama(args: {
  res: express.Response
  prompt: string
  model: string
  width: number
  height: number
  steps?: number
  seed?: number
}) {
  const payload: Record<string, unknown> = {
    model: args.model,
    prompt: args.prompt,
    stream: true,
    width: args.width,
    height: args.height,
  }
  if (args.steps) payload.steps = Math.min(args.steps, 50)
  if (args.seed) payload.options = { seed: args.seed }

  const upstream = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text()
    throw new Error(text || `Ollama error (${upstream.status})`)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let imageBase64: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      let parsed: {
        image?: string
        completed?: number
        total?: number
        error?: string
      }
      try {
        parsed = JSON.parse(line) as typeof parsed
      } catch {
        continue
      }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.image) {
        imageBase64 = parsed.image
        continue
      }
      if (typeof parsed.total === 'number') {
        args.res.write(
          JSON.stringify({
            type: 'progress',
            completed: parsed.completed ?? 0,
            total: parsed.total,
          }) + '\n',
        )
      }
    }
  }

  if (!imageBase64) throw new Error('No image returned from Ollama')
  await finishImage(args.res, {
    imageBase64,
    model: args.model,
    width: args.width,
    height: args.height,
    seed: args.seed ?? null,
    prompt: args.prompt,
  })
}

async function streamDiffusers(args: {
  res: express.Response
  prompt: string
  width: number
  height: number
  steps?: number
  seed?: number
}) {
  const upstream = await fetch(`${DIFFUSERS_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: args.prompt,
      width: args.width,
      height: args.height,
      steps: Math.min(args.steps ?? 4, 8),
      seed: args.seed,
    }),
    // First run may download weights + CPU inference can take several minutes
    signal: AbortSignal.timeout(20 * 60 * 1000),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text()
    throw new Error(
      text ||
        `Diffusers worker error (${upstream.status}). Is the worker running on ${DIFFUSERS_URL}?`,
    )
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      const parsed = JSON.parse(line) as {
        type?: string
        image?: string
        completed?: number
        total?: number
        error?: string
        model?: string
        width?: number
        height?: number
        seed?: number | null
        prompt?: string
      }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.type === 'progress') {
        args.res.write(
          JSON.stringify({
            type: 'progress',
            completed: parsed.completed ?? 0,
            total: parsed.total ?? 0,
          }) + '\n',
        )
        continue
      }
      if (parsed.type === 'done' && parsed.image) {
        await finishImage(args.res, {
          imageBase64: parsed.image,
          model: parsed.model ?? 'stabilityai/sd-turbo',
          width: parsed.width ?? args.width,
          height: parsed.height ?? args.height,
          seed: parsed.seed ?? args.seed ?? null,
          prompt: parsed.prompt ?? args.prompt,
        })
        return
      }
    }
  }

  throw new Error('No image returned from Diffusers worker')
}

async function finishImage(
  res: express.Response,
  args: {
    imageBase64: string
    model: string
    width: number
    height: number
    seed: number | null
    prompt: string
  },
) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filename = `sprite-${Date.now()}-${args.seed ?? 'rnd'}.png`
  const filepath = path.join(OUTPUT_DIR, filename)
  await writeFile(filepath, Buffer.from(args.imageBase64, 'base64'))

  res.write(
    JSON.stringify({
      type: 'done',
      image: `data:image/png;base64,${args.imageBase64}`,
      url: `/generated/${filename}`,
      filename,
      model: args.model,
      width: args.width,
      height: args.height,
      seed: args.seed,
      prompt: args.prompt,
    }) + '\n',
  )
  res.end()
}

async function probeOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!response.ok) return { ok: false, hasImageModel: false, models: [] as string[] }
    const data = (await response.json()) as { models?: Array<{ name: string }> }
    const models = (data.models ?? []).map((m) => m.name)
    const hasImageModel = models.some(
      (name) =>
        name.includes('flux2-klein') ||
        name.includes('z-image-turbo') ||
        name.startsWith('x/'),
    )
    return { ok: true, hasImageModel, models, model: OLLAMA_MODEL }
  } catch (error) {
    return {
      ok: false,
      hasImageModel: false,
      models: [] as string[],
      error: error instanceof Error ? error.message : 'unreachable',
    }
  }
}

async function probeDiffusers() {
  try {
    const response = await fetch(`${DIFFUSERS_URL}/health`)
    if (!response.ok) return { ok: false, ready: false }
    return {
      ok: true,
      ...((await response.json()) as {
        ready?: boolean
        model?: string
        device?: string
        error?: string | null
      }),
    }
  } catch (error) {
    return {
      ok: false,
      ready: false,
      error: error instanceof Error ? error.message : 'unreachable',
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

const port = Number(process.env.PORT ?? 8787)
await mkdir(OUTPUT_DIR, { recursive: true })

const server = app.listen(port, () => {
  console.log(`Spritebench API on http://localhost:${port}`)
  console.log(`Preferred backend: ${preferredBackend()} (${os.arch()})`)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('API failed to start:', error.message)
  process.exit(1)
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
