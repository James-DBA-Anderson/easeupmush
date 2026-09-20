export type HealthResponse = {
  ok: boolean
  backend?: 'ollama' | 'diffusers'
  preferred?: 'ollama' | 'diffusers'
  arch?: string
  model?: string
  note?: string
  ollama?: {
    ok?: boolean
    hasImageModel?: boolean
    models?: string[]
    model?: string
    error?: string
  }
  diffusers?: {
    ok?: boolean
    ready?: boolean
    loading?: boolean
    model?: string
    device?: string
    error?: string | null
  }
  error?: string
}

export type GenerateParams = {
  prompt: string
  width: number
  height: number
  steps?: number
  seed?: number
  model?: string
}

export type GenerateProgress = {
  type: 'progress'
  completed: number
  total: number
}

export type GenerateDone = {
  type: 'done'
  image: string
  url: string
  filename: string
  model: string
  width: number
  height: number
  seed: number | null
  prompt: string
}

export type GenerateEvent =
  | GenerateProgress
  | GenerateDone
  | { error: string }

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return (await res.json()) as HealthResponse
}

export async function generateSprite(
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
      if ('error' in event && event.error) {
        throw new Error(event.error)
      }
      if ('type' in event && event.type === 'done') {
        donePayload = event
      }
    }
  }

  if (!donePayload) {
    throw new Error('Generation finished without an image')
  }
  return donePayload
}
