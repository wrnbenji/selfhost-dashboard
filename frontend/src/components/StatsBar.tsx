import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Stats, StatsWindow } from '../types'

const WINDOWS: StatsWindow[] = ['1h', '24h', '7d', '30d']

interface Props {
  window: StatsWindow
  onWindowChange: (w: StatsWindow) => void
  bumpKey: number
}

function fmtUptime(pct: number | null): string {
  if (pct === null) return '—'
  if (pct >= 99.95) return '100.0%'
  if (pct >= 99) return pct.toFixed(2) + '%'
  return pct.toFixed(1) + '%'
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function StatsBar({ window, onWindowChange, bumpKey }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .stats(window)
      .then((s) => !cancelled && setStats(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [window, bumpKey])

  return (
    <div className="border-b border-border bg-surface/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 font-mono">
          <Stat label="uptime" value={fmtUptime(stats?.uptime_pct ?? null)} />
          <Stat label="avg latency" value={fmtLatency(stats?.avg_latency ?? null)} />
          <Stat
            label="p95"
            value={fmtLatency(stats?.p95_latency ?? null)}
            mute
          />
          <Stat
            label="incidents"
            value={stats ? String(stats.incident_count) : '—'}
            mute
          />
          <Stat
            label="checks"
            value={stats ? String(stats.check_count) : '—'}
            mute
            hidden="sm"
          />
        </div>

        <div className="flex items-center border border-border">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                window === w
                  ? 'bg-fg text-bg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  mute,
  hidden,
}: {
  label: string
  value: string
  mute?: boolean
  hidden?: 'sm'
}) {
  return (
    <div className={`leading-tight ${hidden === 'sm' ? 'hidden md:block' : ''}`}>
      <div className={`text-[15px] tabular ${mute ? 'text-fg-muted' : 'text-fg'}`}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
    </div>
  )
}
