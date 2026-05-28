import { useEffect, useState } from 'react'
import { api } from '../api'
import type {
  OverviewTimelineBucket,
  Service,
  Stats,
  StatsWindow,
} from '../types'
import { Sparkline } from './Sparkline'

interface Props {
  services: Service[] | null
  window: StatsWindow
  onWindowChange: (w: StatsWindow) => void
  bumpKey: number
}

const WINDOWS: StatsWindow[] = ['1h', '24h', '7d', '30d']

function fmtUptime(pct: number | null): string {
  if (pct === null) return '—'
  if (pct >= 99.95) return '100%'
  if (pct >= 99) return pct.toFixed(2) + '%'
  return pct.toFixed(1) + '%'
}

export function StatCards({ services, window, onWindowChange, bumpKey }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [timeline, setTimeline] = useState<OverviewTimelineBucket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.stats(window), api.overviewTimeline(window, 32)])
      .then(([s, t]) => {
        if (cancelled) return
        setStats(s)
        setTimeline(t.buckets)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [window, bumpKey])

  const active = services?.filter((s) => s.enabled) ?? []
  const total = active.length
  const online = active.filter((s) => s.status === 'online').length
  const offline = active.filter((s) => s.status === 'offline').length

  const uptimeSeries = (timeline ?? []).map((b) => b.uptime)

  return (
    <section className="px-4 sm:px-6 pt-4 pb-2">
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center border border-border bg-surface">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Services" value={String(total)} />
        <Card label="Online" value={String(online)} accent="var(--online)" />
        <Card label="Offline" value={String(offline)} />
        <Card
          label="Uptime"
          value={fmtUptime(stats?.uptime_pct ?? null)}
          accent="var(--accent)"
          spark={uptimeSeries}
          hint={
            stats?.coverage_pct !== undefined && stats.coverage_pct < 99.5
              ? `${stats.coverage_pct.toFixed(0)}% coverage`
              : stats?.avg_latency !== null && stats?.avg_latency !== undefined
                ? `${Math.round(stats.avg_latency)}ms avg`
                : undefined
          }
          hintWarn={
            stats?.coverage_pct !== undefined && stats.coverage_pct < 95
          }
        />
      </div>
    </section>
  )
}

function Card({
  label,
  value,
  accent,
  spark,
  hint,
  hintWarn,
}: {
  label: string
  value: string
  accent?: string
  spark?: (number | null)[]
  hint?: string
  hintWarn?: boolean
}) {
  return (
    <div className="bg-surface border border-border p-4 flex flex-col gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tracking-tight text-fg tabular">
          {value}
        </span>
        {hint && (
          <span
            className={`font-mono text-[11px] ${hintWarn ? 'text-offline' : 'text-fg-subtle'}`}
          >
            {hint}
          </span>
        )}
      </div>
      {spark && accent && (
        <div className="mt-auto">
          <Sparkline values={spark} color={accent} height={22} />
        </div>
      )}
    </div>
  )
}
