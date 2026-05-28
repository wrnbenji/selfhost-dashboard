import type { TimelineBucket } from '../types'

interface Props {
  buckets: TimelineBucket[]
  height?: number
  gap?: number
}

const colors: Record<TimelineBucket['status'], string> = {
  online: 'bg-online',
  offline: 'bg-offline',
  mixed: 'bg-[var(--offline)]/50',
  none: 'bg-border',
  gap: '',
}

// monitor gap = "we have no data because the dashboard wasn't running"
// rendered as diagonal stripes so it's visually different from "no checks scheduled" (none)
const gapStyle: React.CSSProperties = {
  background:
    'repeating-linear-gradient(45deg, var(--border) 0 3px, transparent 3px 6px)',
}

function fmtTime(t: number): string {
  const d = new Date(t)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const labels: Record<TimelineBucket['status'], string> = {
  online: 'up',
  offline: 'down',
  mixed: 'flapping',
  none: 'no check',
  gap: 'monitor down',
}

export function Timeline({ buckets, height = 18, gap = 2 }: Props) {
  if (buckets.length === 0) return null
  return (
    <div
      className="flex w-full"
      style={{ gap: `${gap}px`, height: `${height}px` }}
    >
      {buckets.map((b) => (
        <div
          key={b.t}
          className={`flex-1 ${colors[b.status]} transition-colors`}
          style={b.status === 'gap' ? gapStyle : undefined}
          title={`${fmtTime(b.t)} · ${labels[b.status]}`}
        />
      ))}
    </div>
  )
}
