import cors from 'cors'
import express from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleKit, paintFromPrompt, reviseKit } from '../src/lib/kit.ts'
import {
  ALTER_MODES,
  MODEL_NEGATIVE,
  NAMED_COLOURS,
  type AlterMode,
  type Density,
  type Kind,
  type Palette,
  type Pose,
  type ArtStyle,
  type PromptOptions,
} from '../src/lib/prompts.ts'
import type { ModelPart, ModelSpec, PartShape } from '../src/lib/spec.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'generated')
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const SHAPE_E_URL = process.env.SHAPE_E_URL ?? 'http://127.0.0.1:8791'
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5'
const FORCE_BACKEND = process.env.MODEL_BACKEND as
  | 'shap-e'
  | 'ollama'
  | 'kit'
  | undefined

const app = express()
app.use(cors())
app.use(express.json({ limit: '40mb' }))
app.use('/generated', express.static(OUTPUT_DIR))

app.get('/', (_req, res) => {
  res.redirect(302, 'http://localhost:5174/')
})

type GenerateBody = PromptOptions & {
  prompt?: string
  negativePrompt?: string
  seed?: number
  revise?: boolean
  currentSpec?: ModelSpec
  alterMode?: AlterMode
  targetPartId?: string | null
  change?: string
}

type Backend = 'shap-e' | 'ollama' | 'kit'

const SHAPES: PartShape[] = ['sphere', 'box', 'capsule', 'cylinder', 'cone', 'torus']

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
  return base || 'model'
}

async function probeOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { ok: false, error: `Ollama ${res.status}` }
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = (data.models ?? []).map((m) => m.name)
    return { ok: true, models, model: pickChatModel(models) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Ollama offline' }
  }
}

let ollamaProbeCache: { at: number; value: Awaited<ReturnType<typeof probeOllama>> } | null = null

async function probeOllamaCached() {
  if (ollamaProbeCache && Date.now() - ollamaProbeCache.at < 5000) return ollamaProbeCache.value
  const value = await probeOllama()
  ollamaProbeCache = { at: Date.now(), value }
  return value
}

async function probeShapE() {
  try {
    const res = await fetch(`${SHAPE_E_URL}/health`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { ok: false, ready: false, error: `Shap-E ${res.status}` }
    return (await res.json()) as {
      ok?: boolean
      ready?: boolean
      loading?: boolean
      error?: string | null
      device?: string
    }
  } catch {
    return { ok: false, ready: false, error: 'Shap-E worker offline' }
  }
}

function preferredBackend(): Backend {
  if (FORCE_BACKEND === 'shap-e' || FORCE_BACKEND === 'ollama' || FORCE_BACKEND === 'kit') {
    return FORCE_BACKEND
  }
  return 'ollama'
}

function pickBackend(
  preferred: Backend,
  shapE: { ok?: boolean },
  ollama: { ok?: boolean; model?: string },
): Backend {
  if (preferred === 'kit') return 'kit'
  if (preferred === 'ollama') {
    if (ollama.ok && ollama.model) return 'ollama'
    if (shapE.ok) return 'shap-e'
    return 'kit'
  }
  if (preferred === 'shap-e') {
    if (shapE.ok) return 'shap-e'
    if (ollama.ok && ollama.model) return 'ollama'
    return 'kit'
  }
  if (ollama.ok && ollama.model) return 'ollama'
  if (shapE.ok) return 'shap-e'
  return 'kit'
}

function healthNote(
  backend: Backend,
  shapE: { ok?: boolean; ready?: boolean },
  ollama: { ok?: boolean; model?: string; error?: string },
): string | undefined {
  if (backend === 'ollama') return undefined
  if (backend === 'shap-e' && !shapE.ready) {
    return 'Shap-E is warming up. First mesh downloads the model.'
  }
  if (backend === 'kit' && !ollama.ok) {
    return 'Ollama is offline. Install it, then `npm run setup:ollama` — Generate still uses the option kit until then.'
  }
  if (backend === 'kit' && ollama.ok && !ollama.model) {
    return `Ollama is up but ${OLLAMA_CHAT_MODEL} is missing. Run \`npm run setup:ollama\`.`
  }
  return undefined
}

app.get('/api/health', async (_req, res) => {
  const shapE = await probeShapE()
  const ollama = await probeOllamaCached()
  const preferred = preferredBackend()
  const backend = pickBackend(preferred, shapE, ollama)

  res.json({
    ok: true,
    backend,
    preferred,
    model:
      backend === 'shap-e'
        ? 'openai/shap-e'
        : backend === 'ollama'
          ? ollama.model
          : 'option kit',
    shapE,
    ollama,
    note: healthNote(backend, shapE, ollama),
  })
})

app.post('/api/generate', async (req, res) => {
  const body = req.body as GenerateBody
  const description =
    body.description?.trim() || body.change?.trim() || body.prompt?.trim() || ''
  if (!description) {
    res.status(400).json({ error: 'Description is required' })
    return
  }

  const opts: PromptOptions = {
    description,
    kind: (body.kind ?? 'character') as Kind,
    style: (body.style ?? 'clay') as ArtStyle,
    pose: (body.pose ?? 'idle') as Pose,
    palette: (body.palette ?? 'candy') as Palette,
    density: (body.density ?? 'medium') as Density,
  }
  const prompt = body.prompt?.trim() || description
  const seed = body.seed && body.seed > 0 ? body.seed : Math.floor(Math.random() * 1_000_000)

  const shapE = await probeShapE()
  const ollama = await probeOllamaCached()
  const preferred = preferredBackend()
  let backend = pickBackend(preferred, shapE, ollama)

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const send = (obj: unknown) => res.write(JSON.stringify(obj) + '\n')

  try {
    await mkdir(OUTPUT_DIR, { recursive: true })
    const stamp = Date.now()
    const base = `${stamp}-${slug(description)}`
    const current = specFromBody(body.currentSpec, opts)
    const revising = Boolean(body.revise && current)
    const alterMode = body.alterMode && body.alterMode in ALTER_MODES ? body.alterMode : 'reshape'
    const targetPartId = body.targetPartId ? String(body.targetPartId) : null

    if (revising && current) {
      const useOllama = Boolean(ollama.ok && ollama.model)
      send({
        type: 'progress',
        message: useOllama ? 'Revising the loaded model with Ollama…' : 'Altering the loaded model…',
      })
      let spec = current
      let used: Backend = 'kit'
      if (useOllama && ollama.model) {
        try {
          spec = await ollamaSpec(ollama.model, opts, spec, {
            mode: alterMode,
            partId: targetPartId,
            change: body.change?.trim() || opts.description,
          })
          used = 'ollama'
        } catch (error) {
          send({
            type: 'progress',
            message: `Ollama failed (${error instanceof Error ? error.message : 'error'}); using option kit.`,
          })
          spec = reviseKit(spec, { ...opts, description: body.change?.trim() || opts.description }, seed, {
            mode: alterMode,
            partId: targetPartId,
          })
        }
      } else {
        spec = reviseKit(spec, { ...opts, description: body.change?.trim() || opts.description }, seed, {
          mode: alterMode,
          partId: targetPartId,
        })
      }
      const filename = `${base}.json`
      await writeFile(path.join(OUTPUT_DIR, filename), JSON.stringify(spec, null, 2))
      send({
        type: 'done',
        format: 'spec',
        spec,
        url: `/generated/${filename}`,
        filename,
        model: used === 'ollama' ? ollama.model : 'option kit',
        backend: used,
        seed,
        prompt,
      })
      res.end()
      return
    }

    if (backend === 'shap-e') {
      send({ type: 'progress', message: 'Sculpting with Shap-E…' })
      const upstream = await fetch(`${SHAPE_E_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${prompt}. ${MODEL_NEGATIVE}`,
          steps: 16,
          seed,
          frame_size: 64,
        }),
      })
      if (!upstream.ok) {
        const text = await upstream.text()
        throw new Error(text || `Shap-E error (${upstream.status})`)
      }
      const data = (await upstream.json()) as { glb?: string; model?: string; detail?: string }
      if (!data.glb) throw new Error(data.detail || 'Shap-E returned no mesh')
      const filename = `${base}.glb`
      await writeFile(path.join(OUTPUT_DIR, filename), Buffer.from(data.glb, 'base64'))
      send({
        type: 'done',
        format: 'glb',
        url: `/generated/${filename}`,
        filename,
        model: data.model ?? 'openai/shap-e',
        backend: 'shap-e',
        seed,
        prompt,
      })
      res.end()
      return
    }

    send({
      type: 'progress',
      message:
        backend === 'ollama'
          ? 'Asking Ollama for a layout (CPU, first call can take a few minutes)…'
          : 'Building mesh from options…',
    })

    let spec = assembleKit(opts, seed)
    let used: Backend = 'kit'
    if (backend === 'ollama' && ollama.model) {
      try {
        spec = await ollamaSpec(ollama.model, opts, spec, null)
        used = 'ollama'
      } catch (error) {
        send({
          type: 'progress',
          message: `Ollama failed (${error instanceof Error ? error.message : 'error'}); using option kit.`,
        })
      }
    }

    const filename = `${base}.json`
    await writeFile(path.join(OUTPUT_DIR, filename), JSON.stringify(spec, null, 2))
    send({
      type: 'done',
      format: 'spec',
      spec,
      url: `/generated/${filename}`,
      filename,
      model: used === 'ollama' ? ollama.model : 'option kit',
      backend: used,
      seed,
      prompt,
    })
    res.end()
  } catch (error) {
    send({ error: error instanceof Error ? error.message : 'Generation failed' })
    res.end()
  }
})

app.post('/api/save', async (req, res) => {
  const filenameRaw = String(req.body?.filename ?? 'model.glb')
  const filename = path.basename(filenameRaw).replace(/[^\w.-]+/g, '-') || 'model.glb'
  const glb = String(req.body?.glb ?? '')
  if (!glb) {
    res.status(400).json({ error: 'Missing glb' })
    return
  }
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(path.join(OUTPUT_DIR, filename), Buffer.from(glb, 'base64'))
  res.json({ url: `/generated/${filename}`, filename })
})

function pickChatModel(models: string[]): string | undefined {
  const usable = models.filter((name) => !/flux|vision|embed|nomic|minilm|shap/i.test(name))
  const tiny = (name: string) => /:(0\.5b|1b|1\.5b)\b/.test(name.toLowerCase())
  const rank = (name: string) => {
    const n = name.toLowerCase()
    if (tiny(n)) return 6
    if (/\b(70b|32b|14b|13b)/.test(n)) return 0
    if (/\b(8b|7b|9b)/.test(n) || (n.includes('qwen2.5') && /:latest$/.test(n))) return 1
    if (/\b3b|:latest$/.test(n) || n === 'llama3.2' || n === 'qwen2.5') return 2
    if (/\b2b/.test(n)) return 3
    return 4
  }
  const wanted = OLLAMA_CHAT_MODEL
  const base = wanted.split(':')[0]
  const tag = wanted.includes(':') ? wanted.slice(wanted.indexOf(':') + 1) : 'latest'
  const allowTiny = tiny(wanted)
  const family = usable.filter((name) => name === base || name.startsWith(`${base}:`))
  const pool = (allowTiny ? family : family.filter((name) => !tiny(name))).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  )
  const exact =
    usable.find((name) => name === wanted) ??
    usable.find((name) => name === `${base}:${tag}`) ??
    (tag === 'latest' ? usable.find((name) => name === base) : undefined)
  if (exact && (allowTiny || !tiny(exact))) return exact
  return pool[0] ?? usable.sort((a, b) => rank(a) - rank(b))[0]
}

function layoutBrief(opts: PromptOptions): string {
  if (opts.kind === 'food') {
    return 'Stack a food item on the ground: base or cake low, icing or filling in the middle, garnish on top. No head, ears, arms, or legs.'
  }
  if (opts.kind === 'vehicle') {
    return 'Build a small vehicle: chassis, cabin, four wheels at the corners near y=0, lamps at the front. No ears or arms.'
  }
  if (opts.kind === 'prop') {
    return 'Build a single object (lamp, crate, tool): a base on the ground and 2–5 pieces stacked or attached. No creature limbs.'
  }
  if (opts.kind === 'creature') {
    return 'Build an animal or monster: body in the middle, head attached above/in front of the body, legs reaching down to y=0, tail optional. Parts must connect.'
  }
  return 'Build a character: hips/body at centre, head sitting ON TOP of the body (higher y), two ears on the head, two arms on the sides, two legs going DOWN to the ground. The head must not sit on the floor.'
}

function layoutExample(kind: Kind): string {
  if (kind === 'food') {
    return '{"parts":[{"id":"cake","label":"Cake","shape":"cylinder","position":[0,0.32,0],"rotation":[0,0,0],"scale":[0.9,0.32,0.9],"color":"#c47a4a"},{"id":"icing","label":"Icing","shape":"cylinder","position":[0,0.68,0],"rotation":[0,0,0],"scale":[0.92,0.1,0.92],"color":"#f4efe6"},{"id":"cherry","label":"Cherry","shape":"sphere","position":[0.12,0.9,0],"rotation":[0,0,0],"scale":[0.14,0.14,0.14],"color":"#e23d28"}]}'
  }
  if (kind === 'vehicle') {
    return '{"parts":[{"id":"body","label":"Body","shape":"box","position":[0,0.28,0],"rotation":[0,0,0],"scale":[0.7,0.22,1.3],"color":"#3d7dff"},{"id":"cabin","label":"Cabin","shape":"box","position":[0,0.52,-0.15],"rotation":[0,0,0],"scale":[0.55,0.28,0.55],"color":"#7ad7ff"},{"id":"wheel-fl","label":"Wheel","shape":"cylinder","position":[-0.42,0.14,0.42],"rotation":[0,0,1.57],"scale":[0.16,0.1,0.16],"color":"#2a2a28"},{"id":"wheel-fr","label":"Wheel","shape":"cylinder","position":[0.42,0.14,0.42],"rotation":[0,0,1.57],"scale":[0.16,0.1,0.16],"color":"#2a2a28"},{"id":"wheel-bl","label":"Wheel","shape":"cylinder","position":[-0.42,0.14,-0.45],"rotation":[0,0,1.57],"scale":[0.16,0.1,0.16],"color":"#2a2a28"},{"id":"wheel-br","label":"Wheel","shape":"cylinder","position":[0.42,0.14,-0.45],"rotation":[0,0,1.57],"scale":[0.16,0.1,0.16],"color":"#2a2a28"}]}'
  }
  if (kind === 'prop') {
    return '{"parts":[{"id":"base","label":"Base","shape":"cylinder","position":[0,0.08,0],"rotation":[0,0,0],"scale":[0.5,0.08,0.5],"color":"#5c4033"},{"id":"stem","label":"Stem","shape":"cylinder","position":[0,0.5,0],"rotation":[0,0,0],"scale":[0.08,0.42,0.08],"color":"#c47a4a"},{"id":"shade","label":"Shade","shape":"cone","position":[0,0.95,0],"rotation":[0,0,0],"scale":[0.48,0.24,0.48],"color":"#ffe066"}]}'
  }
  return '{"parts":[{"id":"body","label":"Body","shape":"capsule","position":[0,0.72,0],"rotation":[0,0,0],"scale":[0.48,0.55,0.42],"color":"#ff7ab6"},{"id":"head","label":"Head","shape":"sphere","position":[0,1.42,0.04],"rotation":[0,0,0],"scale":[0.38,0.38,0.38],"color":"#ff7ab6"},{"id":"ear-l","label":"Ear","shape":"capsule","position":[-0.16,1.85,-0.02],"rotation":[0.15,0,0.35],"scale":[0.1,0.5,0.08],"color":"#ffe066"},{"id":"ear-r","label":"Ear","shape":"capsule","position":[0.16,1.85,-0.02],"rotation":[0.15,0,-0.35],"scale":[0.1,0.5,0.08],"color":"#ffe066"},{"id":"arm-l","label":"Arm","shape":"capsule","position":[-0.42,0.95,0],"rotation":[0.15,0,0.5],"scale":[0.12,0.36,0.12],"color":"#ff7ab6"},{"id":"arm-r","label":"Arm","shape":"capsule","position":[0.42,0.95,0],"rotation":[0.15,0,-0.5],"scale":[0.12,0.36,0.12],"color":"#ff7ab6"},{"id":"leg-l","label":"Leg","shape":"capsule","position":[-0.2,0.32,0],"rotation":[0,0,0],"scale":[0.14,0.36,0.14],"color":"#ff7ab6"},{"id":"leg-r","label":"Leg","shape":"capsule","position":[0.2,0.32,0],"rotation":[0,0,0],"scale":[0.14,0.36,0.14],"color":"#ff7ab6"}]}'
}

function ollamaInstruction(
  opts: PromptOptions,
  draft: ModelSpec,
  alter: { mode: AlterMode; partId: string | null; change: string } | null,
): string {
  const subject = (alter?.change || opts.description).trim()
  if (alter) {
    return `You design 3D models from primitive parts. Return JSON only: {"parts":[...]}
Rebuild the model so it matches this change: ${subject}
Action: ${alter.mode}. Scope: ${alter.partId ? `focus on part id "${alter.partId}"` : 'whole model'}.
Keep a readable ${opts.kind}. Y-up, base at y=0, height about 2. 5–12 parts.
Each part: id,label,shape,position,rotation,scale,color. Shapes: sphere, box, capsule, cylinder, cone, torus.
Current: ${JSON.stringify({ name: draft.name, kind: opts.kind, parts: compactParts(draft.parts).slice(0, 12) })}`
  }
  return `You design 3D models from primitive parts. Return JSON only: {"parts":[...]}
Build a new model of: ${subject}
Kind: ${opts.kind}. Style: ${opts.style}. Pose: ${opts.pose}.
${layoutBrief(opts)}
Invent the parts this object actually has. Do not copy a generic mascot if the subject is something else.
Y-up. Ground at y=0. Height about 1.6–2.2. 5–12 connected parts. Hex colours. Use colours named in the subject.
Each: {"id":"str","label":"str","shape":"sphere"|"box"|"capsule"|"cylinder"|"cone"|"torus","position":[x,y,z],"rotation":[x,y,z],"scale":[x,y,z],"color":"#rrggbb"}
Example layout (adapt shapes and colours to the subject, do not copy colours blindly):
${layoutExample(opts.kind)}`
}

function groundAndCenter(parts: ModelPart[]): ModelPart[] {
  if (!parts.length) return parts
  let minY = Infinity
  let cx = 0
  let cz = 0
  for (const part of parts) {
    minY = Math.min(minY, part.position[1] - Math.abs(part.scale[1]) * 0.5)
    cx += part.position[0]
    cz += part.position[2]
  }
  cx /= parts.length
  cz /= parts.length
  const lift = Number.isFinite(minY) ? -minY : 0
  return parts.map((part) => ({
    ...part,
    position: [
      part.position[0] - cx,
      part.position[1] + lift,
      part.position[2] - cz,
    ] as [number, number, number],
  }))
}

function finalizeCreated(draft: ModelSpec, parts: ModelPart[], description: string): ModelSpec {
  const next = groundAndCenter(
    paintFromPrompt(
      parts.map((part) => ({
        ...part,
        position: [
          num(part.position[0], 0, -2.4, 2.4),
          num(part.position[1], 0.5, -0.2, 3.6),
          num(part.position[2], 0, -2.4, 2.4),
        ],
        scale: [
          num(part.scale[0], 0.3, 0.05, 2.6),
          num(part.scale[1], 0.3, 0.05, 2.6),
          num(part.scale[2], 0.3, 0.05, 2.6),
        ],
      })),
      description,
    ),
  )
  return { ...draft, name: description || draft.name, parts: next }
}

async function ollamaSpec(
  model: string,
  opts: PromptOptions,
  draft: ModelSpec,
  alter: { mode: AlterMode; partId: string | null; change: string } | null,
): Promise<ModelSpec> {
  const instruction = ollamaInstruction(opts, draft, alter)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  const upstream = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: instruction,
      system:
        'Output one JSON object with a parts array. No markdown, no commentary. Parts must form the requested object.',
      stream: true,
      format: 'json',
      keep_alive: '30m',
      options: { temperature: 0.15, num_predict: 900, num_ctx: 2048 },
    }),
    signal: controller.signal,
  })
  if (!upstream.ok) {
    clearTimeout(timer)
    const text = await upstream.text()
    throw new Error(text || `Ollama error (${upstream.status})`)
  }
  const responseText = await readOllamaStream(upstream, controller)
  clearTimeout(timer)
  const parsed = parseOllamaJson(responseText)
  const parts = sanitizeParts(parsed.parts ?? parsed.model?.parts)
  if (parts.length < 3) throw new Error('Ollama returned no usable parts')
  return finalizeCreated(draft, parts, alter?.change || opts.description)
}

async function readOllamaStream(upstream: Response, controller: AbortController): Promise<string> {
  if (!upstream.body) throw new Error('Ollama returned no body')
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let response = ''
  while (true) {
    const { done, value } = await reader.read().catch((error: unknown) => {
      if (response && jsonLooksComplete(response)) return { done: true, value: undefined }
      throw error
    })
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { response?: string; done?: boolean; error?: string }
      if (event.error) throw new Error(event.error)
      response += event.response ?? ''
      if (event.done) return response
      if (jsonLooksComplete(response)) {
        controller.abort()
        return response
      }
    }
  }
  return response
}

function jsonLooksComplete(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.endsWith('}')) return false
  try {
    const parsed = parseOllamaJson(trimmed)
    return sanitizeParts(parsed.parts ?? parsed.model?.parts).length >= 5
  } catch {
    return false
  }
}

function compactParts(parts: ModelPart[]) {
  return parts.map((p) => ({
    id: p.id,
    label: p.label,
    shape: p.shape,
    position: p.position.map((n) => Math.round(n * 100) / 100),
    rotation: p.rotation.map((n) => Math.round(n * 100) / 100),
    scale: p.scale.map((n) => Math.round(n * 100) / 100),
    color: p.color,
  }))
}

function parseOllamaJson(text: string): { parts?: unknown; model?: { parts?: unknown } } {
  const trimmed = text.trim()
  const candidates: string[] = []
  if (trimmed) candidates.push(trimmed)
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))
  const arrStart = trimmed.indexOf('[')
  const arrEnd = trimmed.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(trimmed.slice(arrStart, arrEnd + 1))

  for (const raw of candidates) {
    for (const extra of ['', '}', ']}', '"]}', ']}]}']) {
      const attempt = (raw + extra).replace(/,\s*([}\]])/g, '$1')
      try {
        const value = JSON.parse(attempt) as unknown
        if (Array.isArray(value)) return { parts: value }
        if (value && typeof value === 'object') {
          const rec = value as { parts?: unknown; id?: unknown; shape?: unknown }
          if (Array.isArray(rec.parts)) return rec
          if (rec.id != null || rec.shape != null) return { parts: [rec] }
          return rec
        }
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`Ollama returned invalid JSON (${trimmed.slice(0, 120) || 'empty'})`)
}

function specFromBody(raw: unknown, opts: PromptOptions): ModelSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const parts = sanitizeParts(rec.parts)
  if (!parts.length) return null
  return {
    name: String(rec.name ?? opts.description),
    kind: String(rec.kind ?? opts.kind),
    style: opts.style,
    density: opts.density,
    parts,
  }
}

const SHAPE_ALIAS: Record<string, PartShape> = {
  circle: 'sphere',
  ball: 'sphere',
  cube: 'box',
  rect: 'box',
  rectangle: 'box',
  triangle: 'cone',
  tube: 'cylinder',
  disc: 'cylinder',
}

function partColor(raw: unknown): string {
  if (typeof raw !== 'string') return '#c47a4a'
  const named = NAMED_COLOURS[raw.trim().toLowerCase()]
  if (named) return named
  if (/^#?[0-9a-fA-F]{6}$/.test(raw)) return raw.startsWith('#') ? raw : `#${raw}`
  if (/^#?[0-9a-fA-F]{3}$/.test(raw)) {
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return '#c47a4a'
}

function sanitizeParts(raw: unknown): ModelPart[] {
  if (!Array.isArray(raw)) return []
  const parts: ModelPart[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const shapeName = String(rec.shape ?? 'sphere').toLowerCase()
    const shape = SHAPES.includes(shapeName as PartShape)
      ? (shapeName as PartShape)
      : (SHAPE_ALIAS[shapeName] ?? 'sphere')
    parts.push({
      id: String(rec.id ?? `part-${parts.length}`).slice(0, 40),
      label: String(rec.label ?? rec.id ?? 'Part').slice(0, 40),
      shape,
      position: vec3(rec.position, [0, 0.5, 0]),
      rotation: vec3(rec.rotation, [0, 0, 0]),
      scale: vec3(rec.scale, [0.4, 0.4, 0.4], 0.04, 6),
      color: partColor(rec.color),
      roughness: num(rec.roughness, 0.7, 0, 1),
      metalness: num(rec.metalness, 0.05, 0, 1),
    })
  }
  return parts.slice(0, 24)
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function vec3(
  v: unknown,
  fallback: [number, number, number],
  min = -4,
  max = 4,
): [number, number, number] {
  if (typeof v === 'number') return [num(v, fallback[0], min, max), fallback[1], fallback[2]]
  if (!Array.isArray(v) || v.length < 2) return fallback
  return [
    num(v[0], fallback[0], min, max),
    num(v[1], fallback[1], min, max),
    num(v[2], fallback[2], min, max),
  ]
}

app.listen(8788, () => {
  console.log('Meshbench API http://127.0.0.1:8788')
})
