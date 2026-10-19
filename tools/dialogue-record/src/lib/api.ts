import type { Take } from './types'

function asLiveIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string')
  if (typeof raw === 'string' && raw) return [raw]
  return []
}

export async function fetchTakes(
  game: string,
  character: string,
): Promise<{
  byLine: Record<string, Take[]>
  liveByLine: Record<string, string[]>
}> {
  const q = new URLSearchParams({ game, character })
  const res = await fetch(`/api/recordings?${q}`)
  if (!res.ok) throw new Error(`list failed (${res.status})`)
  const data = (await res.json()) as {
    byLine?: Record<string, Take[]>
    liveByLine?: Record<string, string | string[]>
  }
  const liveByLine: Record<string, string[]> = {}
  for (const [lineId, value] of Object.entries(data.liveByLine ?? {})) {
    const ids = asLiveIds(value)
    if (ids.length) liveByLine[lineId] = ids
  }
  return { byLine: data.byLine ?? {}, liveByLine }
}

export async function saveTake(opts: {
  game: string
  character: string
  lineId: string
  text: string
  set: string
  durationMs: number
  blob: Blob
  peakDb?: number
  rmsDb?: number
  gainDb?: number
}): Promise<Take> {
  const q = new URLSearchParams({
    game: opts.game,
    character: opts.character,
    line: opts.lineId,
    text: opts.text,
    set: opts.set,
    durationMs: String(Math.round(opts.durationMs)),
  })
  if (opts.peakDb !== undefined) q.set('peakDb', String(opts.peakDb))
  if (opts.rmsDb !== undefined) q.set('rmsDb', String(opts.rmsDb))
  if (opts.gainDb !== undefined) q.set('gainDb', String(opts.gainDb))
  const res = await fetch(`/api/recordings?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': opts.blob.type || 'audio/webm' },
    body: opts.blob,
  })
  if (!res.ok) throw new Error(`save failed (${res.status})`)
  const data = (await res.json()) as { take: Take }
  return data.take
}

export async function deleteTake(
  game: string,
  character: string,
  lineId: string,
  takeId: string,
): Promise<void> {
  const res = await fetch(
    `/api/recordings/${game}/${character}/${lineId}/${takeId}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(`delete failed (${res.status})`)
}

export function takeUrl(
  game: string,
  character: string,
  lineId: string,
  file: string,
): string {
  return `/recordings/${game}/${character}/${lineId}/${file}`
}

export async function patchTake(
  game: string,
  character: string,
  lineId: string,
  takeId: string,
  body: { gainDb?: number; peakDb?: number; rmsDb?: number },
): Promise<Take> {
  const res = await fetch(
    `/api/recordings/${game}/${character}/${lineId}/${takeId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `patch failed (${res.status})`)
  }
  const data = (await res.json()) as { take: Take }
  return data.take
}

/** Toggle a take in the live pool for a line, or pass null to clear the pool. */
export async function setLiveTake(
  game: string,
  character: string,
  lineId: string,
  takeId: string | null,
): Promise<void> {
  const res = await fetch('/api/live', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game, character, lineId, takeId }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `live failed (${res.status})`)
  }
}
