/** Spoken-word target: RMS around this after gain, without pushing peak over the ceiling. */
export const TARGET_RMS_DB = -20
export const CEIL_PEAK_DB = -1
export const GAIN_MIN_DB = -18
export const GAIN_MAX_DB = 18

let ctx: AudioContext | null = null

export function audioCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

export function gainToDb(gain: number): number {
  if (!(gain > 1e-8)) return -96
  return 20 * Math.log10(gain)
}

export function clampGainDb(db: number): number {
  return Math.min(GAIN_MAX_DB, Math.max(GAIN_MIN_DB, db))
}

export function matchGain(rmsDb: number, peakDb: number): number {
  const want = TARGET_RMS_DB - rmsDb
  const headroom = CEIL_PEAK_DB - peakDb
  return clampGainDb(Math.min(want, headroom))
}

/** Map dBFS into a 0–1 meter fill (−48 silent, 0 full). */
export function dbMeter(db: number): number {
  return Math.min(1, Math.max(0, (db + 48) / 48))
}

export function fmtDb(db: number | undefined): string {
  if (db === undefined || !Number.isFinite(db) || db <= -90) return '−∞'
  const n = Math.round(db * 10) / 10
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} dB`
}

export type Loudness = {
  peakDb: number
  rmsDb: number
}

export function measureBuffer(buf: AudioBuffer): Loudness {
  let peak = 0
  let sum = 0
  let n = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const s = data[i]!
      const a = Math.abs(s)
      if (a > peak) peak = a
      sum += s * s
      n++
    }
  }
  const rms = n > 0 ? Math.sqrt(sum / n) : 0
  return { peakDb: gainToDb(peak), rmsDb: gainToDb(rms) }
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const raw = await blob.arrayBuffer()
  return audioCtx().decodeAudioData(raw.slice(0))
}

export async function measureBlob(blob: Blob): Promise<Loudness> {
  return measureBuffer(await decodeBlob(blob))
}

export function analyserSamples(fftSize: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(fftSize))
}

/** Instantaneous peak 0–1 from an analyser time-domain buffer. */
export function analyserPeak(
  analyser: AnalyserNode,
  samples: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(samples)
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs((samples[i]! - 128) / 128)
    if (a > peak) peak = a
  }
  return peak
}
