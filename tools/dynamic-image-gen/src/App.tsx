import { useEffect, useRef, useState } from 'react'
import {
  fetchHealth,
  generateSprite,
  type GenerateDone,
  type HealthResponse,
} from './lib/api'
import {
  ART_STYLES,
  FACINGS,
  POSES,
  SIZE_PRESETS,
  buildSpritePrompt,
  type ArtStyle,
  type Facing,
  type Pose,
} from './lib/prompts'
import './App.css'

type GalleryItem = GenerateDone & { createdAt: number }

const EXAMPLES = [
  'fox-eared ranger in leather armor with a shortbow',
  'tiny mushroom wizard with a glowing staff',
  'armored knight with a cracked kite shield',
  'cyber courier in a neon hoodie and rollerblades',
]

function App() {
  const [description, setDescription] = useState(EXAMPLES[0])
  const [style, setStyle] = useState<ArtStyle>('pixel-32')
  const [facing, setFacing] = useState<Facing>('three-quarter')
  const [pose, setPose] = useState<Pose>('idle')
  const [chromaKey, setChromaKey] = useState(true)
  const [sizeIndex, setSizeIndex] = useState(0)
  const [seed, setSeed] = useState('')
  const [steps, setSteps] = useState('')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<GenerateDone | null>(null)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [checker, setChecker] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const size = SIZE_PRESETS[sizeIndex]
  const prompt = buildSpritePrompt({
    description,
    style,
    facing,
    pose,
    transparentHint: chromaKey,
  })

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
    const id = window.setInterval(load, 8000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const onGenerate = async () => {
    if (!description.trim() || busy) return
    setError(null)
    setProgress(null)
    setBusy(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await generateSprite(
        {
          prompt,
          width: size.width,
          height: size.height,
          seed: seed.trim() ? Number(seed) : undefined,
          steps: steps.trim() ? Number(steps) : undefined,
        },
        (event) => {
          if ('type' in event && event.type === 'progress') {
            setProgress({ completed: event.completed, total: event.total })
          }
        },
        controller.signal,
      )
      setCurrent(result)
      setGallery((prev) => [{ ...result, createdAt: Date.now() }, ...prev].slice(0, 24))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const statusLabel = !health
    ? 'Checking backends…'
    : health.diffusers?.loading
      ? 'Downloading SD-Turbo…'
      : health.backend === 'ollama' && health.ollama?.hasImageModel
        ? `Ready · Ollama · ${health.model}`
        : health.backend === 'diffusers' && health.diffusers?.ready
          ? `Ready · Diffusers · ${health.model}`
          : health.backend === 'diffusers' && health.diffusers?.ok
            ? 'Loading image model…'
            : health.note
              ? 'Waiting for image backend…'
              : health.error || 'Backend offline'

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : busy
        ? null
        : 0

  return (
    <div className="app">
      <div className="backdrop" aria-hidden />
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">Spritebench</p>
            <p className="brand-sub">Local character sprites for 2D games</p>
          </div>
        </div>
        <div
          className={`status ${
            health?.diffusers?.loading
              ? 'warn'
              : health?.backend === 'ollama'
                ? health.ollama?.hasImageModel
                  ? 'ok'
                  : 'warn'
                : health?.diffusers?.ready
                  ? 'ok'
                  : 'warn'
          }`}
        >
          <span className="status-dot" />
          {statusLabel}
        </div>
      </header>

      <main className="layout">
        <section className="panel controls">
          <div className="field">
            <label htmlFor="description">Character</label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the character…"
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
            <span className="label">Art style</span>
            <div className="style-grid">
              {(Object.keys(ART_STYLES) as ArtStyle[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`style-card ${style === key ? 'active' : ''}`}
                  onClick={() => setStyle(key)}
                >
                  <strong>{ART_STYLES[key].label}</strong>
                  <span>{ART_STYLES[key].hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="field grow">
              <span className="label">Facing</span>
              <div className="seg">
                {(Object.keys(FACINGS) as Facing[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={facing === key ? 'active' : ''}
                    onClick={() => setFacing(key)}
                  >
                    {FACINGS[key].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field grow">
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
          </div>

          <div className="row">
            <div className="field">
              <span className="label">Size</span>
              <div className="seg">
                {SIZE_PRESETS.map((preset, index) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={sizeIndex === index ? 'active' : ''}
                    onClick={() => setSizeIndex(index)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="row compact">
            <label className="check">
              <input
                type="checkbox"
                checked={chromaKey}
                onChange={(e) => setChromaKey(e.target.checked)}
              />
              Magenta backdrop (easy to key out)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={checker}
                onChange={(e) => setChecker(e.target.checked)}
              />
              Checker preview
            </label>
          </div>

          <details className="advanced">
            <summary>Advanced</summary>
            <div className="row">
              <div className="field grow">
                <label htmlFor="seed">Seed</label>
                <input
                  id="seed"
                  inputMode="numeric"
                  placeholder="random"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="field grow">
                <label htmlFor="steps">Steps</label>
                <input
                  id="steps"
                  inputMode="numeric"
                  placeholder="model default"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
          </details>

          <div className="prompt-preview">
            <div className="prompt-head">
              <span>Compiled prompt</span>
              <button
                type="button"
                className="linkish"
                onClick={() => void navigator.clipboard.writeText(prompt)}
              >
                Copy
              </button>
            </div>
            <p>{prompt}</p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !description.trim()}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Generating…' : 'Generate sprite'}
            </button>
            {busy && (
              <button
                type="button"
                className="ghost"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel
              </button>
            )}
          </div>

          {busy && (
            <div className="progress" role="status">
              <div
                className="progress-bar"
                style={{
                  width: progressPct == null ? '35%' : `${progressPct}%`,
                  animation: progressPct == null ? 'pulse 1.2s ease infinite' : 'none',
                }}
              />
              <span>
                {progress
                  ? `Step ${progress.completed} / ${progress.total}`
                  : 'Warming up model…'}
              </span>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {health?.note && <p className="note">{health.note}</p>}
        </section>

        <section className="panel stage">
          <div className="stage-head">
            <h1>Character sprite</h1>
            <p>Full-body game-ready frame, generated locally.</p>
          </div>

          <div className={`viewport ${checker ? 'checker' : ''} ${chromaKey ? 'magenta' : ''}`}>
            {current ? (
              <img src={current.image} alt="Generated character sprite" />
            ) : (
              <div className="placeholder">
                <span>No sprite yet</span>
                <p>Pick a style and generate a character.</p>
              </div>
            )}
          </div>

          {current && (
            <div className="meta">
              <span>
                {current.width}×{current.height}
              </span>
              <span>{current.model}</span>
              {current.seed != null && <span>seed {current.seed}</span>}
              <a href={current.url} download={current.filename}>
                Download PNG
              </a>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="gallery">
              <h2>Session gallery</h2>
              <div className="gallery-grid">
                {gallery.map((item) => (
                  <button
                    key={item.filename}
                    type="button"
                    className={`thumb ${current?.filename === item.filename ? 'active' : ''}`}
                    onClick={() => setCurrent(item)}
                  >
                    <img src={item.image} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
