import { useEffect, useRef } from 'react'
import type { SpritePalette } from '../lib/api'
import { paintSprite } from './draw'

export type PaintTool = 'pencil' | 'eraser' | 'fill' | 'eyedrop'

type Props = {
  rows: string[]
  palette: SpritePalette | null
  tool: PaintTool
  scale: number
  grid: boolean
  onPaint: (x: number, y: number, opts: { shift: boolean; start: boolean }) => void
}

export function PixelCanvas({ rows, palette, tool, scale, grid, onPaint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.max(...rows.map((row) => row.length), 1)
  const height = rows.length

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = width * scale
    canvas.height = height * scale
    ctx.imageSmoothingEnabled = false
    paintSprite(ctx, rows, palette, scale, grid)
  }, [rows, palette, scale, grid, width, height])

  const xy = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * width)
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * height)
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    return { x, y }
  }

  const paint = (ev: React.PointerEvent<HTMLCanvasElement>, start: boolean) => {
    const at = xy(ev)
    if (!at) return
    onPaint(at.x, at.y, { shift: ev.shiftKey, start })
  }

  return (
    <canvas
      ref={canvasRef}
      className={`pixel-canvas tool-${tool}`}
      width={width * scale}
      height={height * scale}
      role="img"
      aria-label="Pixel canvas"
      onPointerDown={(ev) => {
        try {
          ev.currentTarget.setPointerCapture(ev.pointerId)
        } catch {
          /* untrusted test events cannot capture */
        }
        paint(ev, true)
      }}
      onPointerMove={(ev) => {
        if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return
        if (tool === 'fill' || tool === 'eyedrop') return
        paint(ev, false)
      }}
    />
  )
}
