import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchHealth,
  generateModel,
  saveGlb,
  type GenerateDone,
  type HealthResponse,
} from './lib/api'
import {
  ART_STYLES,
  ALTER_MODES,
  DENSITIES,
  EXAMPLES,
  KINDS,
  MODEL_NEGATIVE,
  PALETTES,
  POSES,
  buildAlterPrompt,
  buildModelPrompt,
  isArtStyle,
  isDensity,
  isKind,
  type AlterMode,
  type ArtStyle,
  type Density,
  type Kind,
  type Palette,
  type Pose,
} from './lib/prompts'
import {
  bundleFromDrop,
  bundleFromFiles,
  isSidecar,
  overwriteOriginal,
  sniffModel,
  type ImportSource,
} from './lib/fileSource'
import type { CutLoopInfo } from './lib/cutMesh'
import type { ModelSpec, PartShape } from './lib/spec'
import { PART_SHAPE_LABELS, PART_SHAPES } from './lib/spec'
import { Viewport, type EditorTool, type ViewportApi } from './viewport/Viewport'
import { emptyClip, type ClipInfo } from './lib/anim'
import './App.css'

type GalleryItem = GenerateDone & { createdAt: number }

type AppSnap = {
  spec: ModelSpec | null
  current: GenerateDone | null
  selectedPartId: string | null
  importedSource: ImportSource | null
}

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'translate', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'scale', label: 'Scale' },
  { id: 'points', label: 'Nodes' },
  { id: 'cut', label: 'Cut' },
  { id: 'inflate', label: 'Inflate' },
  { id: 'smooth', label: 'Smooth' },
]

function App() {
  const [description, setDescription] = useState(EXAMPLES[0])
  const [kind, setKind] = useState<Kind>('character')
  const [style, setStyle] = useState<ArtStyle>('plush')
  const [pose, setPose] = useState<Pose>('sitting')
  const [palette, setPalette] = useState<Palette>('earth')
  const [density, setDensity] = useState<Density>('medium')
  const [alterMode, setAlterMode] = useState<AlterMode>('recolour')
  const [alteration, setAlteration] = useState('')
  const [seed, setSeed] = useState('')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<GenerateDone | null>(null)
  const [spec, setSpec] = useState<ModelSpec | null>(null)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<EditorTool>('orbit')
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const [liveParts, setLiveParts] = useState<{ id: string; label: string }[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptMode, setPromptMode] = useState<'create' | 'edit'>('create')
  const [brushRadius, setBrushRadius] = useState(0.32)
  const [brushStrength, setBrushStrength] = useState(0.7)
  const abortRef = useRef<AbortController | null>(null)
  const viewRef = useRef<ViewportApi | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importUrlRef = useRef<string | null>(null)
  const [importedSource, setImportedSource] = useState<ImportSource | null>(null)
  const [overwriteAsk, setOverwriteAsk] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sceneRev, setSceneRev] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [showTextures, setShowTextures] = useState(false)
  const [canShowTextures, setCanShowTextures] = useState(false)
  const [clip, setClip] = useState<ClipInfo>(emptyClip)
  const [animOpen, setAnimOpen] = useState(false)
  const specRef = useRef(spec)
  const currentRef = useRef(current)
  const selectedRef = useRef(selectedPartId)
  const importedRef = useRef(importedSource)
  const appPast = useRef<AppSnap[]>([])
  const appFuture = useRef<AppSnap[]>([])
  specRef.current = spec
  currentRef.current = current
  selectedRef.current = selectedPartId
  importedRef.current = importedSource
  const hasModel = Boolean(current || spec)
  useEffect(() => {
    if (!hasModel) setAnimOpen(false)
  }, [hasModel])

  useEffect(() => {
    if (promptOpen || (!notice && !error)) return
    const id = window.setTimeout(() => {
      setNotice(null)
      setError(null)
    }, 5000)
    return () => window.clearTimeout(id)
  }, [notice, error, promptOpen])
  const sculpting = tool === 'inflate' || tool === 'smooth'
  const editingNodes = tool === 'points'
  const cutting = tool === 'cut'
  const [cutLoop, setCutLoop] = useState<CutLoopInfo>({ count: 0, closed: false })
  const [cutPieces, setCutPieces] = useState<{ id: string; label: string }[] | null>(null)
  const promptParts = spec?.parts?.length ? spec.parts : liveParts
  const selectedPart =
    spec?.parts.find((p) => p.id === selectedPartId) ??
    liveParts.find((p) => p.id === selectedPartId) ??
    null
  const selectedColor =
    spec?.parts.find((p) => p.id === selectedPartId)?.color ?? '#c47a4a'

  const creating = promptMode === 'create'
  const prompt = useMemo(
    () =>
      creating
        ? buildModelPrompt({ description, kind, style, pose, palette, density })
        : buildAlterPrompt({
            change: alteration,
            mode: alterMode,
            partId: selectedPartId,
            partLabel: selectedPart?.label ?? null,
            style,
            pose,
            palette,
          }),
    [
      alteration,
      alterMode,
      creating,
      density,
      description,
      kind,
      palette,
      pose,
      selectedPart?.label,
      selectedPartId,
      style,
    ],
  )

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await fetchHealth()
        if (alive) setHealth(data)
      } catch {
        if (alive) setHealth({ ok: false, error: 'API offline' })
      }
    }
    void load()
    const id = window.setInterval(() => {
      if (!busy) void load()
    }, 8000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [busy])

  const onSelectPart = useCallback((id: string | null) => {
    if (!id) return
    setSelectedPartId(id)
    setEditing(true)
    setTool((current) => (current === 'orbit' ? 'translate' : current))
  }, [])

  const onParts = useCallback((parts: { id: string; label: string }[]) => {
    setLiveParts(parts)
  }, [])

  const takeAppSnap = useCallback(
    (): AppSnap => ({
      spec: specRef.current ? structuredClone(specRef.current) : null,
      current: currentRef.current,
      selectedPartId: selectedRef.current,
      importedSource: importedRef.current,
    }),
    [],
  )

  const applyAppSnap = useCallback((snap: AppSnap) => {
    setSpec(snap.spec)
    setCurrent(snap.current)
    setSelectedPartId(snap.selectedPartId)
    setImportedSource(snap.importedSource)
  }, [])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(appPast.current.length > 0)
    setCanRedo(appFuture.current.length > 0)
  }, [])

  const recordAppSnap = useCallback(() => {
    appPast.current = [...appPast.current, takeAppSnap()].slice(-16)
    appFuture.current = []
    syncHistoryFlags()
  }, [syncHistoryFlags, takeAppSnap])

  const commitHistory = useCallback(() => {
    viewRef.current?.pushHistory()
    recordAppSnap()
  }, [recordAppSnap])

  const onUndo = useCallback(() => {
    if (!appPast.current.length || !viewRef.current?.canUndo()) {
      syncHistoryFlags()
      return
    }
    appFuture.current = [...appFuture.current, takeAppSnap()].slice(-16)
    const prev = appPast.current.pop()
    if (!prev) {
      syncHistoryFlags()
      return
    }
    viewRef.current.undo()
    applyAppSnap(prev)
    syncHistoryFlags()
  }, [applyAppSnap, syncHistoryFlags, takeAppSnap])

  const onRedo = useCallback(() => {
    if (!appFuture.current.length || !viewRef.current?.canRedo()) {
      syncHistoryFlags()
      return
    }
    appPast.current = [...appPast.current, takeAppSnap()].slice(-16)
    const next = appFuture.current.pop()
    if (!next) {
      syncHistoryFlags()
      return
    }
    viewRef.current.redo()
    applyAppSnap(next)
    syncHistoryFlags()
  }, [applyAppSnap, syncHistoryFlags, takeAppSnap])

  const onCheckpoint = useCallback(() => {
    recordAppSnap()
  }, [recordAppSnap])

  const onHistoryChange = useCallback((_state: { undo: boolean; redo: boolean }) => {
    // Button enablement follows the app stacks, updated after each App history write.
  }, [])

  const onClipChange = useCallback((next: ClipInfo) => {
    setClip(next)
  }, [])

  const onCutLoopChange = useCallback((next: CutLoopInfo) => {
    setCutLoop(next)
  }, [])

  const onReady = useCallback((api: ViewportApi) => {
    viewRef.current = api
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        onUndo()
      } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
        event.preventDefault()
        onRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRedo, onUndo])

  const onGenerate = async () => {
    const revising = promptMode === 'edit' && hasModel
    if (busy) return
    if (!revising && !description.trim()) return
    const currentSpec = revising ? (viewRef.current?.captureSpec(spec) ?? spec) : undefined
    if (revising && !currentSpec?.parts.length) {
      setError('Could not read the loaded model to revise it')
      return
    }
    if (revising && alterMode === 'remove' && !selectedPartId) {
      setError('Select a part to remove')
      return
    }
    const keepPart = revising ? selectedPartId : null
    commitHistory()
    setError(null)
    setNotice(null)
    setProgress(null)
    setBusy(true)
    setEditing(false)
    setTool('orbit')
    if (!revising) {
      setSelectedPartId(null)
      setImportedSource(null)
      if (importUrlRef.current) {
        URL.revokeObjectURL(importUrlRef.current)
        importUrlRef.current = null
      }
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await generateModel(
        {
          description: revising ? currentSpec?.name || description : description,
          kind,
          style,
          pose,
          palette,
          density,
          prompt,
          negativePrompt: MODEL_NEGATIVE,
          seed: seed.trim() ? Number(seed) : undefined,
          revise: revising,
          currentSpec: currentSpec ?? undefined,
          alterMode: revising ? alterMode : undefined,
          targetPartId: revising ? selectedPartId : undefined,
          change: revising ? alteration : undefined,
        },
        (event) => {
          if ('type' in event && event.type === 'progress') {
            setProgress(event.message ?? 'Working…')
          }
        },
        controller.signal,
      )
      setCurrent(result)
      setSpec(result.spec ?? null)
      const still =
        keepPart && result.spec?.parts.some((part) => part.id === keepPart) ? keepPart : null
      setSelectedPartId(still)
      setGallery((prev) => [{ ...result, createdAt: Date.now() }, ...prev].slice(0, 16))
      setPromptOpen(false)
      setSceneRev((rev) => rev + 1)
      setShowTextures(false)
      setCanShowTextures(false)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const onSave = async () => {
    if (!hasModel) return
    if (importedSource) {
      setNotice(null)
      setOverwriteAsk(true)
      return
    }
    const api = viewRef.current
    if (!api) return
    try {
      const blob = await api.exportGlb()
      const filename = (current?.filename ?? 'model').replace(/\.(json|glb)$/i, '') + '-edit.glb'
      const saved = await saveGlb(filename, blob)
      setNotice(`Saved ${saved.filename}`)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const onExport = async () => {
    const api = viewRef.current
    if (!api || !hasModel) return
    try {
      const blob = await api.exportGlb()
      const filename = (current?.filename ?? 'model').replace(/\.(json|glb)$/i, '') + '-edit.glb'
      const saved = await saveGlb(filename, blob)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = saved.filename
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const onCut = () => {
    const api = viewRef.current
    if (!api || !hasModel) return
    setError(null)
    if (cutLoop.count < 3) {
      setNotice('Click at least three nodes. Cut follows the plane through those nodes.')
      return
    }
    try {
      const result = api.cut()
      const nextSpec = api.captureSpec(spec)
      if (nextSpec) setSpec(nextSpec)
      if (result.split && result.pieces.length) {
        setCutPieces(result.pieces)
        setNotice(`Split into ${result.pieces.length} pieces — name each one`)
      } else {
        setNotice('Cut applied. Nothing fully disconnected from the rest.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cut failed')
    }
  }

  const onConfirmCutLabels = () => {
    if (!cutPieces || cutPieces.some((piece) => !piece.label.trim())) return
    viewRef.current?.setPartLabels(cutPieces)
    const nextSpec = viewRef.current?.captureSpec(spec)
    if (nextSpec) setSpec(nextSpec)
    setCutPieces(null)
    setNotice('Pieces named')
  }

  const onAddShape = (shape: PartShape) => {
    const color = selectedColor || '#c47a4a'
    const label = PART_SHAPE_LABELS[shape]
    setError(null)
    if (!hasModel) {
      const part = {
        id: shape,
        label,
        shape,
        position: [0, 0.55, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.42, 0.42, 0.42] as [number, number, number],
        color,
        roughness: 0.72,
        metalness: 0.05,
      }
      const next: ModelSpec = {
        name: label,
        kind,
        style,
        density,
        parts: [part],
      }
      setSpec(next)
      setCurrent({
        type: 'done',
        format: 'spec',
        spec: next,
        filename: `${Date.now()}-${shape}.json`,
        model: 'kit',
        backend: 'kit',
        seed: null,
        prompt: label,
      })
      setSelectedPartId(shape)
      setEditing(true)
      setTool('translate')
      setPromptOpen(false)
      setSceneRev((rev) => rev + 1)
      setNotice(`Added ${label}`)
      return
    }
    const added = viewRef.current?.addShape(shape, color)
    const next = viewRef.current?.captureSpec(spec)
    if (next) setSpec(next)
    if (added) setSelectedPartId(added.id)
    setEditing(true)
    setTool('translate')
    setNotice(`Added ${added?.label ?? label}`)
  }

  const onImport = async (bundle: { file: File; extras: File[]; source: ImportSource | null }) => {
    setError(null)
    setNotice(null)
    try {
      const kind = await sniffModel(bundle.file)
      if (!kind) throw new Error('Use a GLB, GLTF, OBJ, or Meshbench JSON file')
      commitHistory()
      setSelectedPartId(null)
      setEditing(true)
      setImportedSource(bundle.source)
      setPromptOpen(false)
      setShowTextures(false)
      const extras = bundle.extras
      const files = [bundle.file, ...extras]
      const loaded = await viewRef.current?.loadFile(files)
      if (importUrlRef.current) {
        URL.revokeObjectURL(importUrlRef.current)
        importUrlRef.current = null
      }
      setCurrent({
        type: 'done',
        format: loaded?.spec ? 'spec' : 'glb',
        spec: loaded?.spec,
        filename: `${Date.now()}-${bundle.file.name || `model.${kind}`}`,
        model: 'import',
        backend: 'import',
        seed: null,
        prompt: bundle.file.name || `model.${kind}`,
      })
      setSpec(loaded?.spec ?? null)
      setCanShowTextures(Boolean(loaded?.hasTextures))
      const missingSidecar =
        kind === 'obj' && !extras.some((file) => isSidecar(file.name) || file.name.toLowerCase().endsWith('.mtl'))
      setNotice(
        missingSidecar
          ? `Loaded ${bundle.file.name} without an MTL/image. Select the .mtl and texture too, then use Textures.`
          : `Loaded ${bundle.file.name}${loaded?.hasTextures ? ' — Textures is available in the toolbar' : ''}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const onImportClick = () => {
    fileRef.current?.click()
  }

  const onOverwrite = async () => {
    const api = viewRef.current
    if (!api || !importedSource) return
    try {
      const blob = await api.exportAs(importedSource.ext)
      await overwriteOriginal(importedSource, blob)
      setOverwriteAsk(false)
      setNotice(`Overwrote ${importedSource.name}`)
      setError(null)
    } catch (err) {
      setOverwriteAsk(false)
      setError(err instanceof Error ? err.message : 'Overwrite failed')
    }
  }

  const statusLabel = !health
    ? 'Checking…'
    : health.backend === 'shap-e' && health.shapE?.ready
      ? `Shap-E · ${health.model}`
      : health.backend === 'shap-e'
        ? 'Shap-E warming…'
        : health.backend === 'ollama'
          ? `Ollama · ${health.model}`
          : health.ollama?.ok
            ? 'Option kit'
            : 'Option kit · Ollama off'

  return (
    <div className="app">
      <div className="backdrop" aria-hidden />
      <header className="chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <p className="brand-name">Meshbench</p>
        </div>
        <button
          type="button"
          className={`chrome-btn ${promptOpen && creating ? 'active' : ''}`}
          disabled={busy}
          onClick={() => {
            setPromptMode('create')
            setPromptOpen(true)
            setError(null)
          }}
        >
          New model
        </button>
        <button
          type="button"
          className={`chrome-btn ${promptOpen && !creating ? 'active' : ''}`}
          disabled={!hasModel || busy}
          onClick={() => {
            setPromptMode('edit')
            setPromptOpen(true)
            setError(null)
          }}
        >
          Edit model
        </button>
        <button
          type="button"
          className="chrome-btn"
          disabled={!hasModel || busy}
          title={
            importedSource
              ? `Save over ${importedSource.name}`
              : 'Save a GLB into generated/'
          }
          onClick={() => void onSave()}
        >
          Save
        </button>
        <button type="button" className="chrome-btn" disabled={busy} onClick={onImportClick}>
          Import
        </button>
        <button type="button" className="chrome-btn" disabled={!hasModel || busy} onClick={() => void onExport()}>
          Export
        </button>
        <button
          type="button"
          className={`chrome-btn ${animOpen ? 'active' : ''}`}
          disabled={!hasModel || busy}
          onClick={() => {
            setAnimOpen((open) => {
              const next = !open
              if (!next) viewRef.current?.pauseAnim()
              return next
            })
          }}
        >
          Animate
        </button>
        {busy && (
          <button type="button" className="chrome-btn" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        )}
        <div className={`status ${health?.ok ? 'ok' : 'warn'}`}>
          <span className="status-dot" />
          {statusLabel}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf,.obj,.json,.mtl,.bin,.png,.jpg,.jpeg,.webp"
          multiple
          hidden
          onChange={(e) => {
            const list = e.target.files
            if (list?.length) {
              void bundleFromFiles([...list])
                .then((bundle) => onImport(bundle))
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : 'Import failed')
                })
            }
            e.target.value = ''
          }}
        />
      </header>

      <div
        className={`stage${animOpen ? ' stage-anim' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void bundleFromDrop(e.dataTransfer)
            .then((dropped) => {
              if (dropped) return onImport(dropped)
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Import failed')
            })
        }}
      >
        <Viewport
          sourceKey={current?.filename ?? 'empty'}
          sceneRev={sceneRev}
          spec={spec}
          glbUrl={current?.format === 'glb' ? current.url ?? null : null}
          editing={editing}
          tool={tool}
          selectedPartId={selectedPartId}
          brushRadius={brushRadius}
          brushStrength={brushStrength}
          showTextures={showTextures}
          onSelectPart={onSelectPart}
          onParts={onParts}
          onCheckpoint={onCheckpoint}
          onHistoryChange={onHistoryChange}
          onClipChange={onClipChange}
          onCutLoopChange={onCutLoopChange}
          onReady={onReady}
        />

        {!hasModel && !promptOpen && (
          <div className="placeholder">
            <span>No model yet</span>
            <p>New model, drop an OBJ/GLB, or add a shape.</p>
            <div className="part-list">
              {PART_SHAPES.map((shape) => (
                <button key={shape} type="button" onClick={() => onAddShape(shape)}>
                  {PART_SHAPE_LABELS[shape]}
                </button>
              ))}
            </div>
          </div>
        )}

        {promptOpen && (
          <aside className="prompt-overlay">
            <div className="overlay-head">
              <strong>{creating ? 'New model' : 'Edit model'}</strong>
              <button type="button" className="linkish" onClick={() => setPromptOpen(false)}>
                Close
              </button>
            </div>
            <div className="overlay-body">
            {!creating ? (
              <>
                <div className="field">
                  <span className="label">Which part?</span>
                  <div className="chips part-list">
                    <button
                      type="button"
                      className={!selectedPartId ? 'active' : ''}
                      onClick={() => setSelectedPartId(null)}
                    >
                      Whole model
                    </button>
                    {promptParts.map((part) => (
                      <button
                        key={part.id}
                        type="button"
                        className={selectedPartId === part.id ? 'active' : ''}
                        onClick={() => setSelectedPartId(part.id)}
                      >
                        {part.label || part.id}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">
                    {selectedPart
                      ? `Changing ${selectedPart.label || selectedPart.id}. Click the mesh or pick here.`
                      : 'Changing the whole model. Pick a part to target one piece.'}
                  </p>
                </div>
                <div className="field">
                  <span className="label">How?</span>
                  <div className="seg wrap">
                    {(Object.keys(ALTER_MODES) as AlterMode[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={alterMode === key ? 'active' : ''}
                        onClick={() => setAlterMode(key)}
                      >
                        {ALTER_MODES[key].label}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">{ALTER_MODES[alterMode].hint}</p>
                </div>
                <div className="field">
                  <label htmlFor="alteration">What should change?</label>
                  <textarea
                    id="alteration"
                    rows={2}
                    value={alteration}
                    onChange={(e) => setAlteration(e.target.value)}
                    placeholder={ALTER_MODES[alterMode].placeholder}
                  />
                </div>
                {(alterMode === 'recolour' || alterMode === 'add') && (
                  <div className="field">
                    <span className="label">Palette</span>
                    <p className="field-hint">
                      {alterMode === 'recolour'
                        ? 'Fallback if you do not name a colour in the request.'
                        : 'Colour for a new part if you do not name one.'}
                    </p>
                    <div className="seg wrap">
                      {(Object.keys(PALETTES) as Palette[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={palette === key ? 'active' : ''}
                          onClick={() => setPalette(key)}
                        >
                          {PALETTES[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {alterMode === 'restyle' && (
                  <div className="field">
                    <span className="label">Style</span>
                    <div className="seg wrap">
                      {(Object.keys(ART_STYLES) as ArtStyle[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={style === key ? 'active' : ''}
                          onClick={() => setStyle(key)}
                        >
                          {ART_STYLES[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {alterMode === 'pose' && (
                  <div className="field">
                    <span className="label">Pose</span>
                    <div className="seg wrap">
                      {(Object.keys(POSES) as Pose[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={pose === key ? 'active' : ''}
                          onClick={() => setPose(key)}
                        >
                          {POSES[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {alterMode === 'reshape' && (
                  <div className="field">
                    <span className="label">How much</span>
                    <div className="seg">
                      {(Object.keys(DENSITIES) as Density[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={density === key ? 'active' : ''}
                          onClick={() => setDensity(key)}
                        >
                          {DENSITIES[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="description">What is it?</label>
                  <textarea
                    id="description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the model…"
                  />
                  <div className="chips">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="chip"
                        onClick={() => setDescription(example)}
                      >
                        {example.split(' ').slice(0, 3).join(' ')}…
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Kind</span>
                  <div className="seg wrap">
                    {(Object.keys(KINDS) as Kind[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={kind === key ? 'active' : ''}
                        onClick={() => setKind(key)}
                      >
                        {KINDS[key].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Style</span>
                  <div className="seg wrap">
                    {(Object.keys(ART_STYLES) as ArtStyle[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={style === key ? 'active' : ''}
                        onClick={() => setStyle(key)}
                      >
                        {ART_STYLES[key].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Pose</span>
                  <div className="seg wrap">
                    {(Object.keys(POSES) as Pose[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={pose === key ? 'active' : ''}
                        onClick={() => setPose(key)}
                      >
                        {POSES[key].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Palette</span>
                  <div className="seg wrap">
                    {(Object.keys(PALETTES) as Palette[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={palette === key ? 'active' : ''}
                        onClick={() => setPalette(key)}
                      >
                        {PALETTES[key].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Detail</span>
                  <div className="seg">
                    {(Object.keys(DENSITIES) as Density[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={density === key ? 'active' : ''}
                        onClick={() => setDensity(key)}
                      >
                        {DENSITIES[key].label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="seed">Seed</label>
              <input
                id="seed"
                inputMode="numeric"
                placeholder="random"
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <p className="prompt-line">{prompt}</p>
            {error && <p className="error">{error}</p>}
            {!creating && (
              <p className="note">Apply change edits the loaded model.</p>
            )}
            {notice && <p className="note">{notice}</p>}
            {health?.note && <p className="note">{health.note}</p>}
            {busy && (
              <div className="progress" role="status">
                <div className="progress-bar" style={{ width: '42%', animation: 'pulse 1.2s ease infinite' }} />
                <span>{progress ?? 'Warming up…'}</span>
              </div>
            )}
            {gallery.length > 0 && (
              <div className="gallery-strip">
                {gallery.map((item) => (
                  <button
                    key={item.filename}
                    type="button"
                    className={current?.filename === item.filename ? 'active' : ''}
                    onClick={() => {
                      commitHistory()
                      setCurrent(item)
                      setSpec(item.spec ?? null)
                      setEditing(false)
                      setTool('orbit')
                      setImportedSource(null)
                      setShowTextures(false)
                      setCanShowTextures(false)
                      setSceneRev((rev) => rev + 1)
                      if (item.spec?.name) setDescription(item.spec.name)
                      if (item.spec?.kind && isKind(item.spec.kind)) setKind(item.spec.kind)
                      if (item.spec?.style && isArtStyle(item.spec.style)) setStyle(item.spec.style)
                      if (item.spec?.density && isDensity(item.spec.density)) setDensity(item.spec.density)
                    }}
                  >
                    {item.filename.split('-').slice(1).join('-').slice(0, 14) || item.backend}
                  </button>
                ))}
              </div>
            )}
            </div>
            <div className="overlay-foot">
              <button
                type="button"
                className="primary slim"
                disabled={busy || (creating && !description.trim())}
                onClick={() => void onGenerate()}
              >
                {busy ? (creating ? 'Generating…' : 'Applying…') : creating ? 'Generate' : 'Apply change'}
              </button>
              {busy && (
                <button type="button" className="chrome-btn" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </button>
              )}
            </div>
          </aside>
        )}

        <div className="tool-dock" role="toolbar" aria-label="Viewport tools">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? 'active' : ''}
              disabled={!hasModel}
              onClick={() => {
                setEditing(true)
                if (cutting && item.id === 'orbit') return
                setTool(item.id)
              }}
            >
              {item.label}
            </button>
          ))}
          <span className="dock-gap" />
          <button type="button" disabled={!hasModel} onClick={() => viewRef.current?.ground()}>
            Ground
          </button>
          <button type="button" disabled={!hasModel} onClick={() => viewRef.current?.recenter()}>
            Recenter
          </button>
          <span className="dock-gap" />
          <button
            type="button"
            className={showTextures ? 'active' : ''}
            disabled={!hasModel || !canShowTextures}
            title={
              canShowTextures
                ? showTextures
                  ? 'Hide imported textures'
                  : 'Show textures from the imported file'
                : 'No texture in this model'
            }
            onClick={() => setShowTextures((on) => !on)}
          >
            Textures
          </button>
          <span className="dock-gap" />
          <button
            type="button"
            disabled={!canUndo}
            aria-disabled={!canUndo}
            onClick={() => {
              if (!canUndo) return
              onUndo()
            }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            aria-disabled={!canRedo}
            onClick={() => {
              if (!canRedo) return
              onRedo()
            }}
          >
            Redo
          </button>
        </div>

        {hasModel && animOpen && (
          <div className="timeline-dock">
            <div className="timeline-actions">
              <button
                type="button"
                disabled={clip.keys.length < 2}
                onClick={() => {
                  if (clip.playing) viewRef.current?.pauseAnim()
                  else viewRef.current?.playAnim()
                }}
              >
                {clip.playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" onClick={() => viewRef.current?.addAnimFrame()}>
                Add frame
              </button>
              <button type="button" disabled={!clip.selectedId} onClick={() => viewRef.current?.updateAnimFrame()}>
                Save frame
              </button>
              <button
                type="button"
                disabled={!clip.selectedId || clip.keys.length < 1}
                onClick={() => {
                  if (clip.selectedId) viewRef.current?.deleteAnimFrame(clip.selectedId)
                }}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={clip.keys.length < 2}
                onClick={() => {
                  void (async () => {
                    const api = viewRef.current
                    if (!api) return
                    try {
                      const blob = await api.exportAnimatedGlb()
                      const filename =
                        (current?.filename ?? 'model').replace(/\.(json|glb)$/i, '') + '-anim.glb'
                      const saved = await saveGlb(filename, blob)
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = saved.filename
                      a.click()
                      setNotice(`Exported animation ${saved.filename}`)
                      setError(null)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Animation export failed')
                    }
                  })()
                }}
              >
                Export clip
              </button>
              <span>
                {clip.keys.length} frame{clip.keys.length === 1 ? '' : 's'} · {clip.playhead.toFixed(2)}s / {clip.duration.toFixed(2)}s
              </span>
            </div>
            <div className="timeline-track">
              <input
                type="range"
                min={0}
                max={clip.duration}
                step={0.01}
                value={Math.min(clip.playhead, clip.duration)}
                aria-label="Animation playhead"
                onChange={(e) => viewRef.current?.setAnimPlayhead(Number(e.target.value))}
              />
              {clip.keys.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  className={`timeline-key${clip.selectedId === key.id ? ' active' : ''}`}
                  style={{ left: `${(key.time / Math.max(clip.duration, 0.01)) * 100}%` }}
                  title={`${key.time.toFixed(2)}s`}
                  onClick={() => viewRef.current?.selectAnimFrame(key.id)}
                />
              ))}
            </div>
            <p>
              Add a frame, mutate the model, then add the next. Games load the exported GLB with Three.js AnimationMixer.
            </p>
          </div>
        )}

        {hasModel && editingNodes && (
          <div className="brush-dock">
            <span>Click a vertex for the move gizmo. Right-click to add one. Zoom in on dense scans to reveal more nodes.</span>
          </div>
        )}

        {hasModel && cutting && (
          <div className="cut-dock">
            <strong>Plane cut</strong>
            <span>
              {cutLoop.count >= 3
                ? `Plane fitted to ${cutLoop.count} nodes — Cut splits the mesh on that plane.`
                : cutLoop.count
                  ? `${cutLoop.count} node${cutLoop.count === 1 ? '' : 's'} — add ${3 - cutLoop.count} more to define the plane.`
                  : 'Click nodes along the cut. Three or more fit a plane through them.'}
            </span>
            <div className="part-list">
              <button
                type="button"
                disabled={!cutLoop.count}
                onClick={() => viewRef.current?.undoCutNode()}
              >
                Undo last
              </button>
              <button
                type="button"
                disabled={!cutLoop.count}
                onClick={() => viewRef.current?.clearCutLoop()}
              >
                Clear
              </button>
            </div>
            <span>Drag empty space to orbit, then click the surface to add the next node. Right-click undoes the last node.</span>
            <button type="button" className="primary slim" disabled={cutLoop.count < 3} onClick={onCut}>
              Cut
            </button>
          </div>
        )}

        {hasModel && sculpting && (
          <div className="brush-dock">
            <label>
              Brush
              <input
                type="range"
                min="0.12"
                max="0.7"
                step="0.02"
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
              />
            </label>
            <label>
              Strength
              <input
                type="range"
                min="0.15"
                max="1"
                step="0.05"
                value={brushStrength}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
              />
            </label>
            <span>Drag the selected part to sculpt. Drag empty space to orbit without losing the selection.</span>
          </div>
        )}

        {hasModel && !cutting && (
          <div className="inspector">
            <strong>{selectedPart?.label ?? 'Parts'}</strong>
            {selectedPart ? (
              <>
                <p className="gizmo-hint">Click an arrow or coloured plane, then drag. Click empty space to orbit — this part stays selected.</p>
                <label>
                  Colour
                  <input
                    type="color"
                    value={selectedColor}
                    onPointerDown={() => commitHistory()}
                    onChange={(e) => {
                      const color = e.target.value
                      setSpec((prev) =>
                        prev
                          ? {
                              ...prev,
                              parts: prev.parts.map((p) =>
                                p.id === selectedPart.id ? { ...p, color } : p,
                              ),
                            }
                          : prev,
                      )
                      viewRef.current?.updatePart(selectedPart.id, { color })
                    }}
                  />
                </label>
              </>
            ) : (
              <p className="gizmo-hint">Add a shape, or click a part to select it.</p>
            )}
            <span className="label">Add shape</span>
            <div className="part-list">
              {PART_SHAPES.map((shape) => (
                <button key={shape} type="button" onClick={() => onAddShape(shape)}>
                  {PART_SHAPE_LABELS[shape]}
                </button>
              ))}
            </div>
            <div className="part-list">
              {(spec?.parts ?? liveParts).map((part) => (
                <button
                  key={part.id}
                  type="button"
                  className={part.id === selectedPartId ? 'active' : ''}
                  onClick={() => {
                    setSelectedPartId(part.id)
                    setEditing(true)
                    setTool((current) => (current === 'orbit' ? 'translate' : current))
                  }}
                >
                  {part.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!promptOpen && (notice || error) && (
        <div className="toasts" role="status">
          {notice && (
            <p key={`n-${notice}`} className="toast">
              {notice}
            </p>
          )}
          {error && (
            <p key={`e-${error}`} className="toast">
              {error}
            </p>
          )}
        </div>
      )}

      {cutPieces && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="cut-title">
          <div className="modal">
            <h2 id="cut-title">Name the new pieces</h2>
            <p>Each disconnected chunk is its own object. Give every piece a name.</p>
            <div className="cut-labels">
              {cutPieces.map((piece, index) => (
                <label key={piece.id}>
                  Piece {index + 1}
                  <input
                    type="text"
                    value={piece.label}
                    placeholder={`e.g. ${index === 0 ? 'head' : index === 1 ? 'body' : 'shard'}`}
                    onFocus={() => {
                      setSelectedPartId(piece.id)
                      viewRef.current?.updatePart(piece.id, {})
                    }}
                    onChange={(e) => {
                      const label = e.target.value
                      setCutPieces((current) =>
                        current?.map((item) => (item.id === piece.id ? { ...item, label } : item)) ?? null,
                      )
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="primary slim" disabled={cutPieces.some((piece) => !piece.label.trim())} onClick={onConfirmCutLabels}>
                Save names
              </button>
            </div>
          </div>
        </div>
      )}
      {overwriteAsk && importedSource && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="overwrite-title">
          <div className="modal">
            <h2 id="overwrite-title">Overwrite original file?</h2>
            <p>
              This will replace <strong>{importedSource.name}</strong> on disk with the edited model in the
              same format. That file will be overwritten.
            </p>
            <div className="modal-actions">
              <button type="button" className="chrome-btn" onClick={() => setOverwriteAsk(false)}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={() => void onOverwrite()}>
                Overwrite file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
