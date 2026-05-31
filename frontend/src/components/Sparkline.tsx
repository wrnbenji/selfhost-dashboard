interface Props {
  values: (number | null)[]
  color?: string
  height?: number
  fill?: boolean
  /** Scale to the data's own min/max instead of a fixed 0–100 (for non-% series). */
  autoScale?: boolean
}

export function Sparkline({
  values,
  color = 'var(--accent)',
  height = 28,
  fill = true,
  autoScale = false,
}: Props) {
  if (values.length === 0) return null
  const w = 100
  const h = 24
  const clean = values.map((v) => (v ?? 0))
  const max = autoScale ? Math.max(...clean) : Math.max(100, ...clean)
  const min = autoScale ? Math.min(...clean) : Math.min(0, ...clean)
  const range = max - min || 1

  const step = clean.length > 1 ? w / (clean.length - 1) : 0
  const points = clean.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * h
    return [x, y] as const
  })
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const area = `M 0 ${h} ${points.map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} L ${w} ${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
      aria-hidden
    >
      {fill && (
        <path
          d={area}
          fill={color}
          opacity="0.16"
        />
      )}
      <path d={path} stroke={color} strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
