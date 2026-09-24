import type { AlterMode, PromptOptions } from './prompts'
import type { ModelSpec } from './spec'

export type HealthResponse = {
  ok: boolean
  backend?: 'shap-e' | 'ollama' | 'kit'
  preferred?: string
  model?: string
  note?: string
  shapE?: {
    ok?: boolean
    ready?: boolean
    loading?: boolean
    error?: string | null
    device?: string
  }
  ollama?: {
    ok?: boolean
    model?: string
    models?: string[]
    error?: string
  }
  error?: string
}

export type GenerateParams = PromptOptions & {
  prompt: string
  negativePrompt?: string
  seed?: number
  revise?: boolean
  currentSpec?: ModelSpec
  alterMode?: AlterMode
  targetPartId?: string | null
  change?: string
}

export type GenerateProgress = {
  type: 'progress'
  message?: string
  completed?: number
  total?: number
}

export type GenerateDone = {
  type: 'done'
  format: 'spec' | 'glb'
  spec?: ModelSpec
  url?: string
  filename: string
  model: string
  backend: string
  seed: number | null
  prompt: string
}

export type GenerateEvent = GenerateProgress | GenerateDone | { error: string }

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return (await res.json()) as HealthResponse
}

export async function generateModel(
  params: GenerateParams,
  onEvent: (event: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<GenerateDone> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  })

  if (!res.ok || !res.body) {
    const text = await res.text()
    throw new Error(text || `Request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let donePayload: GenerateDone | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as GenerateEvent
      onEvent(event)
      if ('error' in event && event.error) throw new Error(event.error)
      if ('type' in event && event.type === 'done') donePayload = event
    }
  }

  if (!donePayload) throw new Error('Generation finished without a model')
  return donePayload
}

export async function saveGlb(filename: string, blob: Blob): Promise<{ url: string; filename: string }> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      glb: btoa(binary),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as { url: string; filename: string }
}
