import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchSprites,
  saveSprite,
  type SpriteCatalog,
  type SpriteFrame,
  type SpriteSheet,
} from '../lib/api'
import { cellAt, floodFill, frameThumb, setCell } from './draw'
import { PixelCanvas, type PaintTool } from './PixelCanvas'

const TOOLS: { id: PaintTool; label: string; key: string }[] = [
  { id: 'pencil', label: 'Pencil', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'fill', label: 'Fill', key: 'G' },
  { id: 'eyedrop', label: 'Pick', key: 'I' },
]

export function GameSprites({ active = true }: { active?: boolean }) {
  const [catalog, setCatalog] = useState<SpriteCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [frameId, setFrameId] = useState<string | null>(null)
  const [paletteId, setPaletteId] = useState<string | null>(null)
  const [rows, setRows] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [past, setPast] = useState<string[][]>([])
  const [tool, setTool] = useState<PaintTool>('pencil')
  const [color, setColor] = useState('k')
  const [scale, setScale] = useState(16)
  const [grid, setGrid] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const game = catalog?.games.find((g) => g.id === gameId) ?? catalog?.games[0]
  const sheet = game?.sheets.find((s) => s.id === sheetId) ?? game?.sheets[0]
  const frame = sheet?.frames.find((f) => f.id === frameId) ?? sheet?.frames[0]
  const palette =
    sheet?.palettes.find((p) => p.id === paletteId) ?? sheet?.palettes[0] ?? null
  const dirty = rows.join('\n') !== saved.join('\n')
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    let alive = true
    const load = async () => {
      let last = 'Could not load game sprites'
      for (let attempt = 0; attempt < 6 && alive; attempt++) {
        try {
          const data = await fetchSprites()
          if (!alive) return
          setCatalog(data)
          const firstGame = data.games[0]
          const firstSheet = firstGame?.sheets[0]
          const firstFrame = firstSheet?.frames[0]
          setGameId(firstGame?.id ?? null)
          setSheetId(firstSheet?.id ?? null)
          setFrameId(firstFrame?.id ?? null)
          setPaletteId(firstSheet?.palettes[0]?.id ?? null)
          if (firstFrame) {
            setRows(firstFrame.rows)
            setSaved(firstFrame.rows)
          }
          setLoading(false)
          return
        } catch (err) {
          last = err instanceof Error && err.message ? err.message : last
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
        }
      }
      if (alive) {
        setError(last)
        setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  const saveRef = useRef<() => void>(() => {})
  const undoRef = useRef<() => void>(() => {})
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!activeRef.current) return
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        saveRef.current()
        return
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault()
        undoRef.current()
        return
      }
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return
      const hit = TOOLS.find((t) => t.key.toLowerCase() === ev.key.toLowerCase())
      if (hit) setTool(hit.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const thumbs = useMemo(() => {
    if (!sheet) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const item of sheet.frames) {
      const live = item.id === frame?.id ? rows : item.rows
      map.set(item.id, frameThumb(live, palette))
    }
    return map
  }, [sheet, frame?.id, rows, palette])

  const selectFrame = (nextSheet: SpriteSheet, next: SpriteFrame, nextPalette?: string) => {
    if (dirty && !window.confirm('Discard unsaved pixels on this frame?')) return
    setSheetId(nextSheet.id)
    setFrameId(next.id)
    setPaletteId(nextPalette ?? nextSheet.palettes[0]?.id ?? null)
    setRows(next.rows)
    setSaved(next.rows)
    setPast([])
  }

  const undo = () => {
    setPast((prev) => {
      const last = prev.at(-1)
      if (!last) return prev
      setRows(last)
      return prev.slice(0, -1)
    })
  }

  const onPaint = (x: number, y: number, opts: { shift: boolean; start: boolean }) => {
    const current = rowsRef.current
    if (opts.shift || tool === 'eyedrop') {
      const ch = cellAt(current, x, y)
      if (ch && ch !== '.') setColor(ch)
      if (tool === 'eyedrop' || opts.shift) return
    }
    if (tool === 'fill') {
      const next = floodFill(current, x, y, color)
      if (next === current) return
      setPast((prev) => [...prev.slice(-40), current])
      setRows(next)
      return
    }
    const ch = tool === 'eraser' ? '.' : color
    const next = setCell(current, x, y, ch)
    if (next === current) return
    if (opts.start) setPast((prev) => [...prev.slice(-40), current])
    setRows(next)
  }

  const onSave = async () => {
    if (!sheet || !frame || !dirty || busy) return
    setBusy(true)
    setError(null)
    try {
      await saveSprite({ file: sheet.file, path: frame.path, rows })
      setSaved(rows)
      setCatalog((prev) => {
        if (!prev) return prev
        return {
          games: prev.games.map((g) => ({
            ...g,
            sheets: g.sheets.map((s) =>
              s.file === sheet.file && s.id === sheet.id
                ? {
                    ...s,
                    frames: s.frames.map((f) => (f.id === frame.id ? { ...f, rows } : f)),
                  }
                : s,
            ),
          })),
        }
      })
      setNotice(`Saved ${frame.label} back to ${sheet.file}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  saveRef.current = () => {
    void onSave()
  }
  undoRef.current = undo

  const colors = Object.entries(palette?.colors ?? {})

  return (
    <div className="editor-layout">
      <section className="panel controls editor-side">
        <div className="field">
          <span className="label">Game</span>
          <div className="seg wrap">
            {(catalog?.games ?? []).map((g) => (
              <button
                key={g.id}
                type="button"
                className={g.id === game?.id ? 'active' : ''}
                onClick={() => {
                  if (dirty && !window.confirm('Discard unsaved pixels on this frame?')) return
                  const nextSheet = g.sheets[0]
                  const nextFrame = nextSheet?.frames[0]
                  setGameId(g.id)
                  setSheetId(nextSheet?.id ?? null)
                  setFrameId(nextFrame?.id ?? null)
                  setPaletteId(nextSheet?.palettes[0]?.id ?? null)
                  setRows(nextFrame?.rows ?? [])
                  setSaved(nextFrame?.rows ?? [])
                  setPast([])
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Sheet</span>
          <div className="sheet-list">
            {(game?.sheets ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sheet-item ${s.id === sheet?.id ? 'active' : ''}`}
                onClick={() => {
                  const next = s.frames[0]
                  if (next) selectFrame(s, next)
                }}
              >
                <strong>{s.label}</strong>
                <span>
                  {s.frames.length} frame{s.frames.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {sheet && sheet.palettes.length > 1 && (
          <div className="field">
            <span className="label">Palette</span>
            <div className="seg wrap">
              {sheet.palettes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={p.id === palette?.id ? 'active' : ''}
                  onClick={() => setPaletteId(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="label">Tool</span>
          <div className="seg wrap">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? 'active' : ''}
                onClick={() => setTool(t.id)}
              >
                {t.label}
                <kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Palette colours</span>
          <div className="swatches">
            <button
              type="button"
              className={`swatch none ${color === '.' ? 'active' : ''}`}
              onClick={() => {
                setColor('.')
                setTool('eraser')
              }}
              title="Transparent"
            />
            {colors.map(([ch, hex]) => (
              <button
                key={ch}
                type="button"
                className={`swatch ${color === ch ? 'active' : ''}`}
                style={{ background: hex }}
                title={`${ch} ${hex}`}
                onClick={() => {
                  setColor(ch)
                  setTool('pencil')
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        <div className="row compact">
          <label className="check">
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
            Grid
          </label>
          <div className="zoom">
            <button type="button" className="ghost" onClick={() => setScale((n) => Math.max(4, n - 4))}>
              −
            </button>
            <span>{scale}×</span>
            <button type="button" className="ghost" onClick={() => setScale((n) => Math.min(40, n + 4))}>
              +
            </button>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="ghost" disabled={!past.length} onClick={undo}>
            Undo
          </button>
          <button
            type="button"
            className="primary"
            disabled={!dirty || busy || !frame}
            onClick={() => void onSave()}
          >
            {busy ? 'Saving…' : dirty ? 'Save to game' : 'Saved'}
          </button>
        </div>
        {notice && <p className="note">{notice}</p>}
        {error && <p className="error">{error}</p>}
        {sheet && (
          <p className="editor-file">
            {sheet.file}
            {frame ? ` · ${frame.path.join('.')}` : ''}
          </p>
        )}
      </section>

      <section className="panel stage editor-stage">
        <div className="stage-head">
          <h1>{sheet?.label ?? 'Game sprites'}</h1>
          <p>
            {loading
              ? 'Loading sprite sheets from the games…'
              : frame
                ? `${frame.label} · ${frame.width}×${frame.height}. Paint, then save back into the source file.`
                : 'No sprite sheets found.'}
          </p>
        </div>
        <div className="viewport checker pixel-stage">
          {rows.length ? (
            <PixelCanvas
              rows={rows}
              palette={palette}
              tool={tool}
              scale={scale}
              grid={grid}
              onPaint={onPaint}
            />
          ) : (
            <div className="placeholder">
              <span>{loading ? 'Loading…' : 'No frame selected'}</span>
              <p>{loading ? 'Reading pixel arrays from the game source files.' : 'Pick a sheet from the left.'}</p>
            </div>
          )}
        </div>
        {sheet && (
          <div className="frame-strip">
            {sheet.frames.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`frame-thumb ${item.id === frame?.id ? 'active' : ''}`}
                onClick={() => selectFrame(sheet, item, palette?.id)}
                title={item.label}
              >
                <img src={thumbs.get(item.id) ?? ''} alt="" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
