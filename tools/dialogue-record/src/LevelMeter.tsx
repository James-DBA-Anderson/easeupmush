type Props = {
  level: number
  clip?: boolean
  label?: string
}

/** 0–1 peak meter with a clip flag. */
export function LevelMeter({ level, clip, label }: Props) {
  const pct = Math.min(100, Math.max(0, level * 100))
  const hot = clip || level > 0.95
  const warn = !hot && level > 0.7
  return (
    <div
      className={`level-meter${hot ? ' clip' : warn ? ' warn' : ''}`}
      role="meter"
      aria-label={label ?? 'Level'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span className="level-meter-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
