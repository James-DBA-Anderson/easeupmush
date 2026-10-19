import type { SpritePalette } from '../lib/api'

export function cellAt(rows: string[], x: number, y: number): string {
  return rows[y]?.[x] ?? '.'
}

export function setCell(rows: string[], x: number, y: number, ch: string): string[] {
  if (y < 0 || y >= rows.length || x < 0) return rows
  const width = Math.max(...rows.map((row) => row.length), x + 1)
  const next = rows.map((row) => row.padEnd(width, '.'))
  const row = next[y]
  if (!row || row[x] === ch) return rows
  next[y] = row.slice(0, x) + ch + row.slice(x + 1)
  return next
}

export function floodFill(rows: string[], x: number, y: number, ch: string): string[] {
  const width = Math.max(...rows.map((row) => row.length), 1)
  const height = rows.length
  const target = cellAt(rows, x, y)
  if (target === ch) return rows
  let next = rows.map((row) => row.padEnd(width, '.'))
  const stack = [[x, y]]
  const seen = new Set<string>()
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    const key = `${cx},${cy}`
    if (seen.has(key)) continue
    seen.add(key)
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    if (cellAt(next, cx, cy) !== target) continue
    next = setCell(next, cx, cy, ch)
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
  return next
}

export function paintSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  palette: SpritePalette | null,
  scale: number,
  grid: boolean,
): void {
  const width = Math.max(...rows.map((row) => row.length), 1)
  const height = rows.length
  ctx.clearRect(0, 0, width * scale, height * scale)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = cellAt(rows, x, y)
      const color = ch === '.' || ch === ' ' ? null : palette?.colors[ch]
      if (!color) {
        const odd = (x + y) % 2 === 0
        ctx.fillStyle = odd ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)'
        ctx.fillRect(x * scale, y * scale, scale, scale)
        continue
      }
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  if (grid && scale >= 8) {
    ctx.strokeStyle = 'rgba(232, 247, 239, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 1; x < width; x++) {
      ctx.moveTo(x * scale + 0.5, 0)
      ctx.lineTo(x * scale + 0.5, height * scale)
    }
    for (let y = 1; y < height; y++) {
      ctx.moveTo(0, y * scale + 0.5)
      ctx.lineTo(width * scale, y * scale + 0.5)
    }
    ctx.stroke()
  }
}

export function frameThumb(
  rows: string[],
  palette: SpritePalette | null,
  size = 48,
): string {
  const width = Math.max(...rows.map((row) => row.length), 1)
  const height = Math.max(rows.length, 1)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  const scale = Math.max(1, Math.floor(size / Math.max(width, height)))
  const ox = Math.floor((size - width * scale) / 2)
  const oy = Math.floor((size - height * scale) / 2)
  ctx.fillStyle = '#0a1a16'
  ctx.fillRect(0, 0, size, size)
  ctx.translate(ox, oy)
  paintSprite(ctx, rows, palette, scale, false)
  return canvas.toDataURL()
}
