import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mountToolSwitch } from '@easeupmush/shared/tool-switch'
import { LevelMeter } from './LevelMeter'
import { GAMES } from './catalog/games'
import {
  deleteTake,
  fetchTakes,
  patchTake,
  saveTake,
  setLiveTake,
  takeUrl,
} from './lib/api'
import {
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  analyserPeak,
  analyserSamples,
  audioCtx,
  clampGainDb,
  dbMeter,
  dbToGain,
  fmtDb,
  matchGain,
  measureBlob,
} from './lib/loudness'
import type { Take } from './lib/types'
import { CharacterStage } from './preview/CharacterStage'
import './App.css'

const EMPTY_TAKES: Take[] = []

function pickMime(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function fmtDur(ms: number): string {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  const r = (s - m * 60).toFixed(1)
  return m > 0 ? `${m}:${r.padStart(4, '0')}` : `${Number(r).toFixed(1)}s`
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function App() {
  const [gameId, setGameId] = useState(GAMES[0]!.id)
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0]!
  const [charId, setCharId] = useState(game.characters[0]!.id)
  const character =
    game.characters.find((c) => c.id === charId) ?? game.characters[0]!
  const [lineId, setLineId] = useState(character.lines[0]!.id)
  const line =
    character.lines.find((l) => l.id === lineId) ?? character.lines[0]!
  const [query, setQuery] = useState('')
  const [byLine, setByLine] = useState<Record<string, Take[]>>({})
  const [liveByLine, setLiveByLine] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [meter, setMeter] = useState(0)
  const [meterClip, setMeterClip] = useState(false)

  const brandRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const graphRef = useRef<{ disconnect: () => void } | null>(null)
  const meterSmoothRef = useRef(0)
  const gainSaveRef = useRef<Record<string, number>>({})
  const recordingRef = useRef(false)

  const lines = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return character.lines
    return character.lines.filter(
      (l) =>
        l.text.toLowerCase().includes(q) || l.set.toLowerCase().includes(q),
    )
  }, [character, query])

  const takes = byLine[line.id] ?? EMPTY_TAKES
  const recordedCount = Object.values(byLine).reduce(
    (n, list) => n + list.length,
    0,
  )

  const reload = useCallback(async () => {
    setByLine({})
    setLiveByLine({})
    try {
      const next = await fetchTakes(game.id, character.id)
      setByLine(next.byLine)
      setLiveByLine(next.liveByLine)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load takes')
    }
  }, [game.id, character.id])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const missing = takes.filter(
      (t) => t.peakDb === undefined || t.rmsDb === undefined,
    )
    if (missing.length === 0) return
    let stop = false
    void (async () => {
      for (const take of missing) {
        if (stop) return
        try {
          const res = await fetch(
            takeUrl(game.id, character.id, line.id, take.file),
          )
          if (!res.ok) continue
          const loud = await measureBlob(await res.blob())
          if (stop) return
          const next = await patchTake(
            game.id,
            character.id,
            line.id,
            take.id,
            {
              peakDb: loud.peakDb,
              rmsDb: loud.rmsDb,
              gainDb: take.gainDb ?? 0,
            },
          )
          if (stop) return
          setByLine((prev) => ({
            ...prev,
            [line.id]: (prev[line.id] ?? []).map((t) =>
              t.id === take.id ? { ...t, ...next } : t,
            ),
          }))
        } catch {
          /* skip takes the browser cannot decode */
        }
      }
    })()
    return () => {
      stop = true
    }
  }, [takes, game.id, character.id, line.id])

  useEffect(() => {
    setCharId(game.characters[0]!.id)
    setQuery('')
  }, [game])

  useEffect(() => {
    setLineId(character.lines[0]!.id)
    setQuery('')
  }, [character])

  useEffect(() => {
    recordingRef.current = recording
  }, [recording])

  useEffect(() => {
    return () => {
      recRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      audioRef.current?.pause()
      cancelAnimationFrame(tickRef.current)
      for (const id of Object.values(gainSaveRef.current)) {
        window.clearTimeout(id)
      }
    }
  }, [])

  const sampleMeter = () => {
    const an = analyserRef.current
    const buf = analyserBufRef.current
    if (!an || !buf) return
    const peak = analyserPeak(an, buf)
    const prev = meterSmoothRef.current
    const next = peak > prev ? prev + (peak - prev) * 0.55 : prev * 0.8
    meterSmoothRef.current = next
    setMeter(next)
    setMeterClip(peak > 0.98)
  }

  const clearMeter = () => {
    analyserRef.current = null
    analyserBufRef.current = null
    meterSmoothRef.current = 0
    setMeter(0)
    setMeterClip(false)
  }

  const stopPlayback = () => {
    cancelAnimationFrame(tickRef.current)
    graphRef.current?.disconnect()
    graphRef.current = null
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    gainNodeRef.current = null
    setPlayingId(null)
    if (!recordingRef.current) clearMeter()
  }

  const playTake = (take: Take) => {
    if (playingId === take.id) {
      stopPlayback()
      return
    }
    stopPlayback()
    const ctx = audioCtx()
    void ctx.resume()
    const audio = new Audio(takeUrl(game.id, character.id, line.id, take.file))
    const src = ctx.createMediaElementSource(audio)
    const gain = ctx.createGain()
    gain.gain.value = dbToGain(take.gainDb ?? 0)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(gain)
    gain.connect(analyser)
    analyser.connect(ctx.destination)
    graphRef.current = {
      disconnect: () => {
        src.disconnect()
        gain.disconnect()
        analyser.disconnect()
      },
    }
    analyserRef.current = analyser
    analyserBufRef.current = analyserSamples(analyser.fftSize)
    gainNodeRef.current = gain
    audioRef.current = audio
    setPlayingId(take.id)
    meterSmoothRef.current = 0
    audio.onended = () => {
      stopPlayback()
    }
    audio.onerror = () => {
      stopPlayback()
      setError('Playback failed')
    }
    const pulse = () => {
      if (audioRef.current !== audio) return
      sampleMeter()
      tickRef.current = requestAnimationFrame(pulse)
    }
    pulse()
    void ctx.resume().then(() => void audio.play())
  }

  const mergeTake = (next: Take) => {
    setByLine((prev) => ({
      ...prev,
      [line.id]: (prev[line.id] ?? []).map((t) =>
        t.id === next.id ? { ...t, ...next } : t,
      ),
    }))
  }

  const persistGain = (take: Take, gainDb: number) => {
    window.clearTimeout(gainSaveRef.current[take.id])
    gainSaveRef.current[take.id] = window.setTimeout(() => {
      void patchTake(game.id, character.id, line.id, take.id, { gainDb })
        .then(mergeTake)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Could not save gain')
        })
    }, 280)
  }

  const onGain = (take: Take, raw: number) => {
    const gainDb = clampGainDb(raw)
    mergeTake({ ...take, gainDb })
    if (playingId === take.id && gainNodeRef.current) {
      gainNodeRef.current.gain.value = dbToGain(gainDb)
    }
    persistGain(take, gainDb)
  }

  const matchTake = (take: Take) => {
    if (take.peakDb === undefined || take.rmsDb === undefined) return
    onGain(take, matchGain(take.rmsDb, take.peakDb))
    setStatus('Matched to target level')
  }

  const removeTake = async (take: Take) => {
    if (!confirm(`Delete ${take.id}?`)) return
    if (playingId === take.id) stopPlayback()
    try {
      await deleteTake(game.id, character.id, line.id, take.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const toggleLive = async (take: Take) => {
    const next = liveByLine[line.id] === take.id ? null : take.id
    try {
      await setLiveTake(game.id, character.id, line.id, next)
      await reload()
      setStatus(next ? 'Live take set — used on next game load' : 'Live take cleared')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set live take')
    }
  }

  const stopRecording = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (recording) {
      stopRecording()
      return
    }
    stopPlayback()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = audioCtx()
      await ctx.resume()
      const input = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      input.connect(analyser)
      analyserRef.current = analyser
      analyserBufRef.current = analyserSamples(analyser.fftSize)
      meterSmoothRef.current = 0
      const mime = pickMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      recRef.current = rec
      chunksRef.current = []
      startedRef.current = performance.now()
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onstop = () => {
        cancelAnimationFrame(tickRef.current)
        input.disconnect()
        setRecording(false)
        setElapsed(0)
        clearMeter()
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recRef.current = null
        const durationMs = performance.now() - startedRef.current
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        if (blob.size < 200) {
          setError('Take was empty')
          setStatus('Ready')
          return
        }
        void (async () => {
          try {
            let peakDb: number | undefined
            let rmsDb: number | undefined
            let gainDb: number | undefined
            try {
              const loud = await measureBlob(blob)
              peakDb = loud.peakDb
              rmsDb = loud.rmsDb
              gainDb = matchGain(loud.rmsDb, loud.peakDb)
            } catch {
              /* codec decode failed — still save the take */
            }
            await saveTake({
              game: game.id,
              character: character.id,
              lineId: line.id,
              text: line.text,
              set: line.set,
              durationMs,
              blob,
              peakDb,
              rmsDb,
              gainDb,
            })
            await reload()
            setStatus(
              gainDb !== undefined
                ? `Saved · ${fmtDb(gainDb)} to match`
                : 'Saved',
            )
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed')
          }
        })()
      }
      rec.start(120)
      setRecording(true)
      setStatus('Recording')
      const pulse = () => {
        setElapsed(performance.now() - startedRef.current)
        sampleMeter()
        tickRef.current = requestAnimationFrame(pulse)
      }
      pulse()
    } catch {
      setError('Microphone permission denied')
      setStatus('No mic')
    }
  }, [
    recording,
    stopRecording,
    game.id,
    character.id,
    line,
    reload,
  ])

  useEffect(() => {
    const el = brandRef.current
    if (!el) return
    return mountToolSwitch(el, 'linebench')
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return
      if (ev.key === 'r' || ev.key === 'R') {
        ev.preventDefault()
        void startRecording()
      }
      if (ev.key === 'Escape' && recording) {
        ev.preventDefault()
        stopRecording()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startRecording, stopRecording, recording])

  return (
    <div className="app">
      <div className="backdrop" />
      <header className="chrome">
        <div className="brand" ref={brandRef}>
          <div className="brand-mark" />
          <h1 className="brand-name">Linebench</h1>
        </div>
        <label className="pick">
          Game
          <select
            value={game.id}
            onChange={(e) => setGameId(e.target.value)}
          >
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pick">
          Character
          <select
            value={character.id}
            onChange={(e) => setCharId(e.target.value)}
          >
            {game.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`status ${recording ? 'hot' : 'ok'}`}>
          <span className="status-dot" />
          {recording ? `Rec ${fmtDur(elapsed)}` : status}
        </span>
      </header>

      <main className="layout">
        <section className="lines-pane">
          <div className="lines-head">
            <div>
              <h2>{character.name}</h2>
              <p>{character.role}</p>
            </div>
            <span className="count">
              {character.lines.length} lines · {recordedCount} takes
            </span>
          </div>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter lines…"
          />
          <ul className="lines">
            {lines.map((item) => {
              const n = byLine[item.id]?.length ?? 0
              const live = Boolean(liveByLine[item.id])
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === line.id ? 'active' : undefined}
                    onClick={() => setLineId(item.id)}
                  >
                    <span className="set">{item.set}</span>
                    <span className="text">{item.text}</span>
                    <span className="marks">
                      {live && <span className="badge live">live</span>}
                      {n > 0 && <span className="badge">{n}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="booth">
          <CharacterStage figure={character.figure} />
          <div className="desk">
            {error && <p className="err">{error}</p>}
            <p className="cue-set">{line.set}</p>
            <p className="cue">{line.text}</p>
            <div className="desk-row">
              <button
                type="button"
                className={`rec-btn ${recording ? 'on' : ''}`}
                onClick={() => void startRecording()}
              >
                {recording ? 'Stop' : 'Record'}
              </button>
              <LevelMeter
                level={meter}
                clip={meterClip}
                label={recording ? 'Input level' : 'Playback level'}
              />
              <span className="hint">
                {recording
                  ? 'Keep the meter out of red'
                  : 'R to record · Esc to stop'}
              </span>
            </div>
            <div className="takes">
              <h3>Takes</h3>
              {takes.length === 0 && (
                <p className="empty">No recordings for this line yet.</p>
              )}
              <ul>
                {takes.map((take, i) => {
                  const live = liveByLine[line.id] === take.id
                  return (
                    <li key={take.id} className={live ? 'is-live' : undefined}>
                      <span className="take-n">#{i + 1}</span>
                      <span className="take-meta">
                        {fmtWhen(take.createdAt)} · {fmtDur(take.durationMs)}
                        {live ? ' · in game' : ''}
                        {take.peakDb !== undefined
                          ? ` · peak ${fmtDb(take.peakDb + (take.gainDb ?? 0))}`
                          : ''}
                      </span>
                      <button type="button" onClick={() => playTake(take)}>
                        {playingId === take.id ? 'Pause' : 'Play'}
                      </button>
                      <button
                        type="button"
                        className={live ? 'live' : undefined}
                        onClick={() => void toggleLive(take)}
                      >
                        {live ? 'In game' : 'Use in game'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void removeTake(take)}
                      >
                        Delete
                      </button>
                      <div className="take-gain">
                        <LevelMeter
                          level={dbMeter(
                            (take.peakDb ?? -96) + (take.gainDb ?? 0),
                          )}
                          clip={
                            take.peakDb !== undefined &&
                            take.peakDb + (take.gainDb ?? 0) > -1
                          }
                          label={`Take ${i + 1} in-game peak`}
                        />
                        <input
                          type="range"
                          min={GAIN_MIN_DB}
                          max={GAIN_MAX_DB}
                          step={0.1}
                          value={take.gainDb ?? 0}
                          aria-label={`Gain for take ${i + 1}`}
                          onChange={(e) =>
                            onGain(take, Number(e.target.value))
                          }
                        />
                        <button
                          type="button"
                          className="db"
                          title="Match target level"
                          disabled={
                            take.peakDb === undefined ||
                            take.rmsDb === undefined
                          }
                          onClick={() => matchTake(take)}
                        >
                          {fmtDb(take.gainDb ?? 0)}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
