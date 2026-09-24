export type AnimPoseMesh = {
  partId: string
  position: [number, number, number]
  quaternion: [number, number, number, number]
  scale: [number, number, number]
  positions: Float32Array
}

export type AnimKey = {
  id: string
  time: number
  meshes: AnimPoseMesh[]
}

export type ClipInfo = {
  playing: boolean
  playhead: number
  duration: number
  selectedId: string | null
  keys: { id: string; time: number }[]
}

export const emptyClip = (): ClipInfo => ({
  playing: false,
  playhead: 0,
  duration: 1,
  selectedId: null,
  keys: [],
})

export function clipDuration(keys: { time: number }[], playhead = 0): number {
  let max = Math.max(1, playhead)
  for (const key of keys) max = Math.max(max, key.time)
  return max
}

export function lerpPose(a: AnimPoseMesh, b: AnimPoseMesh, t: number): AnimPoseMesh {
  const u = Math.min(1, Math.max(0, t))
  const positions =
    a.positions.length === b.positions.length
      ? lerpFloats(a.positions, b.positions, u)
      : u < 1
        ? a.positions
        : b.positions
  return {
    partId: a.partId,
    position: lerp3(a.position, b.position, u),
    quaternion: slerp4(a.quaternion, b.quaternion, u),
    scale: lerp3(a.scale, b.scale, u),
    positions,
  }
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function lerpFloats(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

function slerp4(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let ax = a[0]
  let ay = a[1]
  let az = a[2]
  let aw = a[3]
  let dot = ax * b[0] + ay * b[1] + az * b[2] + aw * b[3]
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  if (dot < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    dot = -dot
  }
  if (dot > 0.9995) {
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t
    const z = az + (bz - az) * t
    const w = aw + (bw - aw) * t
    const len = Math.hypot(x, y, z, w) || 1
    return [x / len, y / len, z / len, w / len]
  }
  const theta = Math.acos(Math.min(1, dot))
  const s = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / s
  const wb = Math.sin(t * theta) / s
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb]
}
