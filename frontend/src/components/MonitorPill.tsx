import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { MonitorStatus, StatsWindow } from '../types'

interface Props {
  window: StatsWindow
  bumpKey: number
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

function fmtTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MonitorPill({ window, bumpKey }: Props) {
  const [data, setData] = useState<MonitorStatus | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .monitor(window)
      .then((r) => !cancelled && setData(r))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [window, bumpKey])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      clearInterval(t)
    }
  }, [open])

  const uptime = data?.current_session
    ? Date.now() - data.current_session.started_at
    : null

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={
          uptime !== null
            ? `Monitor up for ${fmtDuration(uptime)}`
            : 'Monitor status'
        }
        title={uptime !== null ? `monitor ${fmtDuration(uptime)}` : 'monitor'}
        className="p-1.5 text-fg-muted hover:text-fg transition-colors inline-flex items-center"
      >
        <span
          className="inline-block h-1.5 w-1.5 bg-online"
          style={{ boxShadow: '0 0 6px var(--online)' }}
        />
      </button>

      {open && data && (
        <div
          className="absolute right-0 mt-1 w-72 z-30 bg-surface border border-border-strong shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-border">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              monitor up for
            </div>
            <div className="font-display text-2xl font-semibold tabular leading-none mt-1">
              {fmtDuration(uptime ?? 0)}
            </div>
            {data.current_session && (
              <div className="font-mono text-[10px] text-fg-subtle mt-1.5">
                since {fmtTimestamp(data.current_session.started_at)}
              </div>
            )}
          </div>

          <Section title={`coverage · last ${data.window}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-xl font-semibold tabular">
                {data.coverage_pct.toFixed(1)}%
              </span>
              <span className="font-mono text-[10px] text-fg-subtle">
                {fmtDuration(data.coverage_ms)} monitored
              </span>
            </div>
            <Bar pct={data.coverage_pct} />
            <div className="flex justify-between font-mono text-[10px] text-fg-subtle mt-1.5">
              <span>{data.gap_count} gap{data.gap_count === 1 ? '' : 's'}</span>
              <span>{fmtDuration(data.total_gap_ms)} unmonitored</span>
            </div>
          </Section>

          <Section title="recent gaps">
            {data.gaps.length === 0 ? (
              <p className="font-mono text-[11px] text-fg-subtle">
                no gaps in window
              </p>
            ) : (
              <ul className="space-y-1">
                {data.gaps
                  .slice()
                  .reverse()
                  .slice(0, 4)
                  .map((g) => (
                    <li
                      key={g.start}
                      className="flex justify-between font-mono text-[11px]"
                    >
                      <span className="text-fg">
                        {fmtTimestamp(g.start)}
                      </span>
                      <span className="text-fg-muted tabular">
                        {fmtDuration(g.duration_ms)}
                        {g.crashed && (
                          <span className="ml-1 text-offline">crashed</span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-1.5 bg-border w-full">
      <div
        className="h-full bg-accent"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}
