import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PIXEL_ROW = /^[A-Za-z0-9. ]{4,}$/
const HEX_PAIR = /(?:^|[,{\s])([A-Za-z])\s*:\s*0x([0-9a-fA-F]{6})/g
const MAX_DIM = 128

export type SpritePalette = {
  id: string
  label: string
  colors: Record<string, string>
}

export type SpriteFrame = {
  id: string
  label: string
  path: string[]
  rows: string[]
  width: number
  height: number
}

export type SpriteSheet = {
  id: string
  label: string
  file: string
  palettes: SpritePalette[]
  frames: SpriteFrame[]
}

export type SpriteGame = {
  id: string
  label: string
  sheets: SpriteSheet[]
}

export type SpriteCatalog = {
  games: SpriteGame[]
}

type PixelArray = {
  path: string[]
  rows: string[]
  start: number
  end: number
  indent: string
  trailingComma: boolean
}

export function isPixelRow(value: string): boolean {
  return PIXEL_ROW.test(value)
}

function skipTrivia(src: string, i: number): number {
  const n = src.length
  while (i < n) {
    if (src[i] === '/' && src[i + 1] === '/') {
      i += 2
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      i += 2
      while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r') {
      i++
      continue
    }
    break
  }
  return i
}

function readString(src: string, i: number): { value: string; end: number } | null {
  if (src[i] !== '"') return null
  let out = ''
  i++
  while (i < src.length) {
    const ch = src[i]!
    if (ch === '\\') {
      out += src[i + 1] ?? ''
      i += 2
      continue
    }
    if (ch === '"') return { value: out, end: i + 1 }
    out += ch
    i++
  }
  return null
}

function readIdent(src: string, i: number): { value: string; end: number } | null {
  if (!src[i] || !/[A-Za-z_]/.test(src[i]!)) return null
  let end = i + 1
  while (end < src.length && /[\w-]/.test(src[end]!)) end++
  return { value: src.slice(i, end), end }
}

function skipBracket(src: string, i: number, open: string, close: string): number {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '"') {
      const str = readString(src, j)
      j = str ? str.end - 1 : j
      continue
    }
    if (src[j] === open) depth++
    else if (src[j] === close) {
      depth--
      if (depth === 0) return j + 1
    }
  }
  return i + 1
}

function readIdentBack(src: string, i: number): { value: string; start: number } | null {
  if (i < 0 || !/[\w]/.test(src[i]!)) return null
  let start = i
  while (start > 0 && /[\w]/.test(src[start - 1]!)) start--
  if (!/[A-Za-z_]/.test(src[start]!)) return null
  return { value: src.slice(start, i + 1), start }
}

function tryPixelArray(src: string, open: number): Omit<PixelArray, 'path'> | null {
  if (src[open] !== '[') return null
  let i = skipTrivia(src, open + 1)
  const rows: string[] = []
  let indent = '  '
  const lineStart = src.lastIndexOf('\n', i)
  if (lineStart >= 0) indent = src.slice(lineStart + 1, i).match(/^[ \t]*/)?.[0] ?? '  '
  let trailingComma = false
  while (i < src.length) {
    i = skipTrivia(src, i)
    if (src[i] === ']') {
      if (rows.length < 3) return null
      return { rows, start: open, end: i + 1, indent, trailingComma }
    }
    const str = readString(src, i)
    if (!str || !isPixelRow(str.value)) return null
    rows.push(str.value)
    i = skipTrivia(src, str.end)
    trailingComma = src[i] === ','
    if (trailingComma) i++
  }
  return null
}

function isPixelArt(rows: string[]): boolean {
  if (rows.length < 3) return false
  const dotted = rows.filter((row) => row.includes('.')).length
  return dotted >= Math.max(2, Math.ceil(rows.length * 0.4))
}

function lookbehindKey(src: string, open: number): { kind: 'const' | 'prop'; name: string } | null {
  let i = open - 1
  while (i >= 0 && /\s/.test(src[i]!)) i--
  if (src[i] === '=') {
    i--
    while (i >= 0 && /\s/.test(src[i]!)) i--
    const right = readIdentBack(src, i)
    if (!right) return null
    i = right.start - 1
    while (i >= 0 && /\s/.test(src[i]!)) i--
    if (src[i] === ':') {
      i--
      while (i >= 0 && /\s/.test(src[i]!)) i--
      const left = readIdentBack(src, i)
      if (!left) return null
      i = left.start - 1
      while (i >= 0 && /\s/.test(src[i]!)) i--
      const word = readIdentBack(src, i)
      if (word?.value === 'const') return { kind: 'const', name: left.value }
      return { kind: 'prop', name: left.value }
    }
    const word = readIdentBack(src, i)
    if (word?.value === 'const') return { kind: 'const', name: right.value }
    return { kind: 'prop', name: right.value }
  }
  if (src[i] === ':') {
    i--
    while (i >= 0 && /\s/.test(src[i]!)) i--
    if (src[i] === '"') {
      const start = src.lastIndexOf('"', i - 1)
      if (start < 0) return null
      return { kind: 'prop', name: src.slice(start + 1, i) }
    }
    const ident = readIdentBack(src, i)
    return ident ? { kind: 'prop', name: ident.value } : null
  }
  return null
}

function enclosingPath(src: string, index: number): string[] {
  const stack: string[] = []
  let i = 0
  while (i < index) {
    i = skipTrivia(src, i)
    if (i >= index) break
    if (src[i] === '"') {
      const str = readString(src, i)
      const after = skipTrivia(src, str?.end ?? i + 1)
      if (src[after] === ':') {
        const valueAt = skipTrivia(src, after + 1)
        if (src[valueAt] === '{' && valueAt < index) stack.push(str?.value ?? '')
        i = str?.end ?? i + 1
        continue
      }
      i = str?.end ?? i + 1
      continue
    }
    if (src.slice(i, i + 5) === 'const' && !/\w/.test(src[i + 5] ?? '')) {
      const after = skipTrivia(src, i + 5)
      const ident = readIdent(src, after)
      if (ident) {
        let j = skipTrivia(src, ident.end)
        if (src[j] === ':') {
          j++
          while (j < src.length && src[j] !== '=' && src[j] !== ';' && src[j] !== '{') {
            if (src[j] === '"') {
              j = readString(src, j)?.end ?? j + 1
              continue
            }
            j++
          }
        }
        j = skipTrivia(src, j)
        if (src[j] === '=') j = skipTrivia(src, j + 1)
        if (src[j] === '{' && j < index) stack.push(ident.value)
        i = ident.end
        continue
      }
    }
    const ident = readIdent(src, i)
    if (ident) {
      const after = skipTrivia(src, ident.end)
      if (src[after] === ':') {
        const valueAt = skipTrivia(src, after + 1)
        if (src[valueAt] === '{' && valueAt < index) stack.push(ident.value)
      }
      i = ident.end
      continue
    }
    if (src[i] === '{') {
      i++
      continue
    }
    if (src[i] === '}') {
      stack.pop()
      i++
      continue
    }
    if (src[i] === '[') {
      i = skipBracket(src, i, '[', ']')
      continue
    }
    i++
  }
  return stack
}

function parsePixelArrays(src: string): PixelArray[] {
  const out: PixelArray[] = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '[') continue
    const arr = tryPixelArray(src, i)
    if (!arr || !isPixelArt(arr.rows)) continue
    const key = lookbehindKey(src, i)
    if (!key) {
      i = arr.end - 1
      continue
    }
    const parents = enclosingPath(src, i)
    const path =
      key.kind === 'const' ? [key.name] : parents.length ? [...parents, key.name] : [key.name]
    out.push({ ...arr, path })
    i = arr.end - 1
  }
  return out
}

function parseColorBlock(block: string): Record<string, string> {
  const colors: Record<string, string> = {}
  HEX_PAIR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HEX_PAIR.exec(block))) {
    colors[match[1]!] = `#${match[2]!.toLowerCase()}`
  }
  return colors
}

function extractObject(src: string, open: number): string | null {
  if (src[open] !== '{') return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '"') {
      const str = readString(src, i)
      i = str ? str.end - 1 : i
      continue
    }
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return null
}

function parsePalettes(src: string): SpritePalette[] {
  const palettes: SpritePalette[] = []
  const base: Record<string, string> = {}

  const takeConst = (name: string, id: string, label: string): Record<string, string> | null => {
    const match = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\{`).exec(src)
    if (!match) return null
    const block = extractObject(src, match.index + match[0].length - 1)
    if (!block) return null
    const colors = parseColorBlock(block)
    if (id !== 'base' && Object.keys(colors).length) {
      palettes.push({ id, label, colors })
    }
    return colors
  }

  Object.assign(base, takeConst('BASE', 'base', 'Base') ?? {})
  takeConst('PAL', 'default', 'Default')

  const palsMatch = /const\s+PALS\b[^=]*=\s*\{/.exec(src)
  if (palsMatch) {
    const block = extractObject(src, palsMatch.index + palsMatch[0].length - 1)
    if (block) {
      const inner = /(?:^|[{\s,])(\w+)\s*:\s*\{/g
      let m: RegExpExecArray | null
      while ((m = inner.exec(block))) {
        const obj = extractObject(block, m.index + m[0].length - 1)
        if (!obj) continue
        const colors = { ...base, ...parseColorBlock(obj) }
        if (Object.keys(colors).length) {
          palettes.push({ id: m[1]!, label: m[1]!, colors })
        }
      }
    }
  }

  const palProp = /(?:^|\n)\s*pal\s*:\s*\{/g
  let pm: RegExpExecArray | null
  while ((pm = palProp.exec(src))) {
    const block = extractObject(src, pm.index + pm[0].length - 1)
    if (!block) continue
    const parents = enclosingPath(src, pm.index)
    const id = parents.at(-1) ?? 'default'
    const colors = parseColorBlock(block)
    if (Object.keys(colors).length) {
      palettes.push({ id: id.toLowerCase(), label: id, colors })
    }
  }

  if (!palettes.length) {
    const colors = parseColorBlock(src)
    if (Object.keys(colors).length) palettes.push({ id: 'default', label: 'Default', colors })
  }
  return palettes
}

function sheetLabel(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

function frameLabel(parts: string[]): string {
  const rest = parts.length > 1 ? parts.slice(1) : parts
  return rest.join(' / ').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function groupSheets(file: string, arrays: PixelArray[], palettes: SpritePalette[]): SpriteSheet[] {
  const byRoot = new Map<string, PixelArray[]>()
  const fileSheet = path.basename(file, '.ts')
  for (const arr of arrays) {
    const root = arr.path.length > 1 ? arr.path[0]! : fileSheet
    const list = byRoot.get(root) ?? []
    list.push(arr)
    byRoot.set(root, list)
  }
  const sheets: SpriteSheet[] = []
  for (const [root, frames] of byRoot) {
    if (/^(PAL|BASE|PALS|FRAMES|ART|ANIM)$/.test(root)) continue
    const own = palettes.filter((p) => p.id === root.toLowerCase() || p.label === root)
    sheets.push({
      id: root,
      label: sheetLabel(root),
      file,
      palettes: own.length ? own : palettes,
      frames: frames.map((f) => ({
        id: f.path.join('.'),
        label: frameLabel(f.path),
        path: f.path,
        rows: f.rows,
        width: Math.max(...f.rows.map((row) => row.length), 1),
        height: f.rows.length,
      })),
    })
  }
  return sheets.filter((s) => s.frames.length)
}

export function parseSpriteSource(relFile: string, src: string): SpriteSheet[] {
  const arrays = parsePixelArrays(src)
  if (!arrays.length) return []
  return groupSheets(relFile, arrays, parsePalettes(src))
}

export function formatPixelArray(rows: string[], indent: string, trailingComma: boolean): string {
  const width = Math.max(...rows.map((row) => row.length), 1)
  const padded = rows.map((row) => row.padEnd(width, '.').slice(0, MAX_DIM))
  const body = padded.map((row) => `${indent}"${row}"`).join(',\n')
  const close = indent.length >= 2 ? indent.slice(0, -2) : ''
  const tail = trailingComma ? ',' : ''
  return `[\n${body}${tail}\n${close}]`
}

export function applyFrameRows(src: string, framePath: string[], rows: string[]): string {
  const arrays = parsePixelArrays(src)
  const key = framePath.join('\0')
  const match = arrays.find((arr) => arr.path.join('\0') === key)
  if (!match) throw new Error(`Frame ${framePath.join('.')} not found`)
  return src.slice(0, match.start) + formatPixelArray(rows, match.indent, match.trailingComma) + src.slice(match.end)
}

export function validateRows(rows: unknown): string[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_DIM) {
    throw new Error('Frame is the wrong size')
  }
  const out: string[] = []
  for (const row of rows) {
    if (typeof row !== 'string' || row.length > MAX_DIM || !/^[A-Za-z0-9. ]*$/.test(row)) {
      throw new Error('Frame rows must be palette characters')
    }
    out.push(row)
  }
  return out
}

async function listTsFiles(dir: string, into: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      await listTsFiles(full, into)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      into.push(full)
    }
  }
}

export async function loadCatalog(repoRoot: string): Promise<SpriteCatalog> {
  const appsDir = path.join(repoRoot, 'apps')
  const games: SpriteGame[] = []
  let appEntries: { name: string; isDirectory: () => boolean }[]
  try {
    appEntries = await readdir(appsDir, { withFileTypes: true })
  } catch {
    return { games }
  }
  for (const app of appEntries) {
    if (!app.isDirectory()) continue
    const files: string[] = []
    try {
      await listTsFiles(path.join(appsDir, app.name, 'src'), files)
    } catch {
      continue
    }
    const spriteFiles = files.filter((file) => file.includes(`${path.sep}sprites${path.sep}`))
    const sheets: SpriteSheet[] = []
    for (const file of spriteFiles) {
      const src = await readFile(file, 'utf8')
      const rel = path.relative(repoRoot, file).split(path.sep).join('/')
      sheets.push(...parseSpriteSource(rel, src))
    }
    if (!sheets.length) continue
    games.push({
      id: app.name,
      label: app.name.replace(/-/g, ' '),
      sheets,
    })
  }
  return { games }
}

export async function saveFrame(
  repoRoot: string,
  relFile: string,
  framePath: string[],
  rows: string[],
): Promise<void> {
  const normalized = relFile.split('\\').join('/')
  if (!normalized.startsWith('apps/') || normalized.includes('..') || !normalized.endsWith('.ts')) {
    throw new Error('Can only save into a game sprite source file')
  }
  if (!normalized.includes('/sprites/')) throw new Error('Can only save sprite sheets')
  const abs = path.resolve(repoRoot, normalized)
  if (!abs.startsWith(path.resolve(repoRoot, 'apps') + path.sep)) {
    throw new Error('Can only save into a game sprite source file')
  }
  const src = await readFile(abs, 'utf8')
  const next = applyFrameRows(src, framePath, validateRows(rows))
  await writeFile(abs, next, 'utf8')
}
