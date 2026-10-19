import { createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RECORDINGS = join(ROOT, 'recordings')
const LOG_PATH = join(RECORDINGS, 'log.json')
const PORT = Number(process.env.LINEBENCH_API_PORT ?? 8789)

const ID = /^[a-z0-9][a-z0-9-]{0,80}$/

type Take = {
  id: string
  file: string
  createdAt: string
  durationMs: number
  mime: string
  bytes: number
  peakDb?: number
  rmsDb?: number
  gainDb?: number
}

type LineMeta = {
  text?: string
  set?: string
  takes?: Take[]
  liveTakeId?: string | null
  liveTakeIds?: string[] | null
}

type LiveClip = {
  characterId: string
  lineId: string
  set: string
  text: string
  file: string
  takeId: string
  gainDb?: number
}

type LineLog = {
  game: string
  character: string
  lineId: string
  text: string
  set: string
  takes: Take[]
  liveTakeId: string | null
  liveTakeIds: string[]
}

type MasterLog = {
  updatedAt: string
  entries: LineLog[]
}

function extFor(mime: string): string {
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) {
    return 'm4a'
  }
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

function takeStamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function lineDir(game: string, character: string, lineId: string): string {
  return join(RECORDINGS, game, character, lineId)
}

function gamePublicDir(game: string): string {
  return resolve(ROOT, '../../apps', game, 'public')
}

function gameVoicesDir(game: string): string {
  return join(gamePublicDir(game), 'voices')
}

function extOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i >= 0 ? file.slice(i) : '.webm'
}

async function loadMeta(
  game: string,
  character: string,
  lineId: string,
): Promise<LineMeta> {
  return readJson<LineMeta>(takesPath(game, character, lineId), { takes: [] })
}

function liveIdsOf(meta: LineMeta): string[] {
  const takes = meta.takes ?? []
  const known = new Set(takes.map((t) => t.id))
  const listed = meta.liveTakeIds
  if (Array.isArray(listed)) {
    return listed.filter((id) => known.has(id))
  }
  const one = meta.liveTakeId ?? null
  return one && known.has(one) ? [one] : []
}

function liveIdOf(meta: LineMeta): string | null {
  return liveIdsOf(meta)[0] ?? null
}

function takesPath(game: string, character: string, lineId: string): string {
  return join(lineDir(game, character, lineId), 'takes.json')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function clearDirFiles(dir: string): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>> = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const here = join(dir, entry.name)
    if (entry.isDirectory()) {
      await rm(here, { recursive: true, force: true })
    } else {
      await rm(here, { force: true })
    }
  }
}

/** Copy Linebench live takes into the game's public/voices for the next load. */
async function publishLive(game: string): Promise<LiveClip[]> {
  const destRoot = gameVoicesDir(game)
  if (!(await pathExists(gamePublicDir(game)))) {
    throw new Error(`No game public folder for "${game}"`)
  }
  await mkdir(destRoot, { recursive: true })
  await clearDirFiles(destRoot)

  const clips: LiveClip[] = []
  const gameDir = join(RECORDINGS, game)
  let chars: string[] = []
  try {
    chars = (await readdir(gameDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    chars = []
  }

  for (const character of chars) {
    const lines = (
      await readdir(join(gameDir, character), { withFileTypes: true })
    )
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const lineId of lines) {
      const meta = await loadMeta(game, character, lineId)
      const liveIds = liveIdsOf(meta)
      for (const liveId of liveIds) {
        const take = meta.takes?.find((t) => t.id === liveId)
        if (!take) continue
        const src = join(lineDir(game, character, lineId), take.file)
        if (!(await pathExists(src))) continue
        const file = `${character}/${lineId}/${take.id}${extOf(take.file)}`
        const dest = join(destRoot, file)
        await mkdir(dirname(dest), { recursive: true })
        await copyFile(src, dest)
        clips.push({
          characterId: character,
          lineId,
          set: meta.set ?? '',
          text: meta.text ?? '',
          file,
          takeId: take.id,
          gainDb: take.gainDb ?? 0,
        })
      }
    }
  }

  await writeJson(join(destRoot, 'live.json'), {
    updatedAt: new Date().toISOString(),
    clips,
  })
  return clips
}

async function rebuildLog(): Promise<MasterLog> {
  const entries: LineLog[] = []
  let games: string[] = []
  try {
    games = (await readdir(RECORDINGS, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    games = []
  }

  for (const game of games) {
    const chars = (await readdir(join(RECORDINGS, game), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const character of chars) {
      const lines = (
        await readdir(join(RECORDINGS, game, character), { withFileTypes: true })
      )
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
      for (const lineId of lines) {
        const meta = await loadMeta(game, character, lineId)
        const takes = meta.takes ?? []
        if (takes.length === 0) continue
        entries.push({
          game,
          character,
          lineId,
          text: meta.text ?? '',
          set: meta.set ?? '',
          takes,
          liveTakeId: liveIdOf(meta),
          liveTakeIds: liveIdsOf(meta),
        })
      }
    }
  }

  entries.sort((a, b) => {
    const at = a.takes.at(-1)?.createdAt ?? ''
    const bt = b.takes.at(-1)?.createdAt ?? ''
    return bt.localeCompare(at)
  })

  const log: MasterLog = {
    updatedAt: new Date().toISOString(),
    entries,
  }
  await writeJson(LOG_PATH, log)
  return log
}

function idsOk(...ids: string[]): boolean {
  return ids.every((id) => ID.test(id))
}

function numQuery(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : undefined
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/log', async (_req, res) => {
  res.json(await rebuildLog())
})

app.get('/api/recordings', async (req, res) => {
  const game = String(req.query.game ?? '')
  const character = String(req.query.character ?? '')
  if (!idsOk(game, character)) {
    res.status(400).json({ error: 'bad ids' })
    return
  }

  const lineId = String(req.query.line ?? '')
  if (lineId) {
    if (!idsOk(lineId)) {
      res.status(400).json({ error: 'bad ids' })
      return
    }
    const meta = await loadMeta(game, character, lineId)
    const liveTakeIds = liveIdsOf(meta)
    res.json({
      takes: meta.takes ?? [],
      liveTakeId: liveTakeIds[0] ?? null,
      liveTakeIds,
    })
    return
  }

  const byLine: Record<string, Take[]> = {}
  const liveByLine: Record<string, string[]> = {}
  const charDir = join(RECORDINGS, game, character)
  let dirs: string[] = []
  try {
    dirs = (await readdir(charDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    dirs = []
  }
  for (const id of dirs) {
    const meta = await loadMeta(game, character, id)
    const takes = meta.takes ?? []
    if (takes.length === 0) continue
    byLine[id] = takes
    const liveIds = liveIdsOf(meta)
    if (liveIds.length) liveByLine[id] = liveIds
  }
  res.json({ byLine, liveByLine })
})

app.post('/api/recordings', async (req, res) => {
  const game = String(req.query.game ?? '')
  const character = String(req.query.character ?? '')
  const lineId = String(req.query.line ?? '')
  const text = String(req.query.text ?? '')
  const set = String(req.query.set ?? '')
  const durationMs = Number(req.query.durationMs ?? 0)
  const peakDb = numQuery(req.query.peakDb)
  const rmsDb = numQuery(req.query.rmsDb)
  const gainDb = numQuery(req.query.gainDb)
  const mime = String(req.headers['content-type'] ?? 'audio/webm')
  if (!idsOk(game, character, lineId)) {
    res.status(400).json({ error: 'bad ids' })
    return
  }

  const dir = lineDir(game, character, lineId)
  await mkdir(dir, { recursive: true })
  const takeId = `take-${takeStamp()}`
  const file = `${takeId}.${extFor(mime)}`
  const dest = join(dir, file)

  const stream = createWriteStream(dest)
  req.pipe(stream)
  await new Promise<void>((resolveWrite, reject) => {
    req.on('error', reject)
    stream.on('error', reject)
    stream.on('finish', () => resolveWrite())
  })

  const bytes = (await stat(dest)).size
  const take: Take = {
    id: takeId,
    file,
    createdAt: new Date().toISOString(),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    mime,
    bytes,
    ...(peakDb !== undefined ? { peakDb } : {}),
    ...(rmsDb !== undefined ? { rmsDb } : {}),
    ...(gainDb !== undefined ? { gainDb } : {}),
  }

  const existing = await loadMeta(game, character, lineId)
  const takes = [...(existing.takes ?? []), take]
  await writeJson(takesPath(game, character, lineId), {
    text: text || existing.text || '',
    set: set || existing.set || '',
    takes,
    liveTakeIds: liveIdsOf({ ...existing, takes }),
  })
  await rebuildLog()
  res.json({ take })
})

app.delete('/api/recordings/:game/:character/:line/:takeId', async (req, res) => {
  const { game, character, line, takeId } = req.params
  if (!idsOk(game, character, line) || !ID.test(takeId)) {
    res.status(400).json({ error: 'bad ids' })
    return
  }
  const existing = await loadMeta(game, character, line)
  const take = existing.takes?.find((t) => t.id === takeId)
  if (!take) {
    res.status(404).json({ error: 'missing take' })
    return
  }
  const dir = lineDir(game, character, line)
  await rm(join(dir, take.file), { force: true })
  const takes = existing.takes!.filter((t) => t.id !== takeId)
  const wasLive = liveIdsOf(existing).includes(takeId)
  if (takes.length === 0) {
    await rm(dir, { recursive: true, force: true })
    const charDir = join(RECORDINGS, game, character)
    const gameDir = join(RECORDINGS, game)
    if ((await readdir(charDir).catch(() => ['x'])).length === 0) {
      await rm(charDir, { recursive: true, force: true })
    }
    if ((await readdir(gameDir).catch(() => ['x'])).length === 0) {
      await rm(gameDir, { recursive: true, force: true })
    }
  } else {
    await writeJson(takesPath(game, character, line), {
      text: existing.text ?? '',
      set: existing.set ?? '',
      takes,
      liveTakeIds: liveIdsOf({
        ...existing,
        takes,
        liveTakeIds: liveIdsOf(existing).filter((id) => id !== takeId),
      }),
    })
  }
  await rebuildLog()
  if (wasLive) {
    try {
      await publishLive(game)
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'live publish failed',
      })
      return
    }
  }
  res.json({ ok: true })
})

app.patch('/api/recordings/:game/:character/:line/:takeId', async (req, res) => {
  const { game, character, line, takeId } = req.params
  if (!idsOk(game, character, line) || !ID.test(takeId)) {
    res.status(400).json({ error: 'bad ids' })
    return
  }
  const existing = await loadMeta(game, character, line)
  const take = existing.takes?.find((t) => t.id === takeId)
  if (!take) {
    res.status(404).json({ error: 'missing take' })
    return
  }
  const next: Take = { ...take }
  const peakDb = numQuery(req.body?.peakDb)
  const rmsDb = numQuery(req.body?.rmsDb)
  const gainDb = numQuery(req.body?.gainDb)
  if (peakDb !== undefined) next.peakDb = peakDb
  if (rmsDb !== undefined) next.rmsDb = rmsDb
  if (gainDb !== undefined) next.gainDb = gainDb
  const takes = existing.takes!.map((t) => (t.id === takeId ? next : t))
  const liveTakeIds = liveIdsOf({ ...existing, takes })
  await writeJson(takesPath(game, character, line), {
    text: existing.text ?? '',
    set: existing.set ?? '',
    takes,
    liveTakeIds,
  })
  await rebuildLog()
  if (liveTakeIds.includes(takeId)) {
    try {
      await publishLive(game)
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'live publish failed',
      })
      return
    }
  }
  res.json({ take: next })
})

app.put('/api/live', async (req, res) => {
  const game = String(req.body?.game ?? '')
  const character = String(req.body?.character ?? '')
  const lineId = String(req.body?.lineId ?? '')
  const takeIdRaw = req.body?.takeId
  const takeId =
    takeIdRaw === null || takeIdRaw === undefined || takeIdRaw === ''
      ? null
      : String(takeIdRaw)
  if (!idsOk(game, character, lineId) || (takeId !== null && !ID.test(takeId))) {
    res.status(400).json({ error: 'bad ids' })
    return
  }

  const meta = await loadMeta(game, character, lineId)
  const takes = meta.takes ?? []
  if (takes.length === 0) {
    res.status(404).json({ error: 'missing takes' })
    return
  }
  if (takeId && !takes.some((t) => t.id === takeId)) {
    res.status(404).json({ error: 'missing take' })
    return
  }

  const current = liveIdsOf(meta)
  const liveTakeIds =
    takeId === null
      ? []
      : current.includes(takeId)
        ? current.filter((id) => id !== takeId)
        : [...current, takeId]

  await writeJson(takesPath(game, character, lineId), {
    text: meta.text ?? '',
    set: meta.set ?? '',
    takes,
    liveTakeIds,
  })
  await rebuildLog()
  try {
    const clips = await publishLive(game)
    res.json({ liveTakeId: liveTakeIds[0] ?? null, liveTakeIds, clips })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'live publish failed',
    })
  }
})

app.use('/recordings', express.static(RECORDINGS))

await mkdir(RECORDINGS, { recursive: true })

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Linebench API http://127.0.0.1:${PORT}`)
  console.log(`Recordings → ${RECORDINGS}`)
})
