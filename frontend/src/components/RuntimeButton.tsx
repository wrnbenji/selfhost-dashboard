import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Runtime } from '../types'

interface Props {
  serviceId: string
  align?: 'left' | 'right'
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
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

function fmtTimestamp(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtRelative(ts: number | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M6 3.5V6L7.5 7.5" strokeLinecap="round" />
    </svg>
  )
}

export function RuntimeButton({ serviceId, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Runtime | null>(null)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    api
      .runtime(serviceId)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false))
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
      cancelled = true
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      clearInterval(t)
    }
  }, [open, serviceId])

  const liveDuration =
    data?.status_since !== null && data?.status_since !== undefined
      ? Date.now() - data.status_since
      : null
  const liveContainerDuration =
    data?.container_started_at !== null && data?.container_started_at !== undefined
      ? Date.now() - data.container_started_at
      : null

  const statusLabel =
    data?.current_status === 'online'
      ? 'Up for'
      : data?.current_status === 'offline'
        ? 'Down for'
        : 'Idle for'

  const isDocker = serviceId.startsWith('docker:')

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Show runtime"
        className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-border hover:bg-surface-hover hover:border-border-strong text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1"
      >
        <ClockIcon />
        runtime
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-1 w-[20rem] bg-surface border border-border-strong shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {loading && !data && (
            <p className="font-mono text-[11px] text-fg-subtle p-3">loading…</p>
          )}

          {data && (
            <>
              {/* header */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                    {statusLabel}
                  </span>
                  <span className="font-display text-2xl font-semibold tabular leading-none text-fg">
                    {fmtDuration(liveDuration)}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-fg-subtle mt-1">
                  since {fmtTimestamp(data.status_since)}
                  {data.monitor_downtime_in_status_ms !== null &&
                    data.monitor_downtime_in_status_ms > 60_000 && (
                      <>
                        {' · '}
                        <span className="text-fg-muted">
                          {fmtDuration(data.monitor_downtime_in_status_ms)}{' '}
                          unmonitored
                        </span>
                      </>
                    )}
                </div>
              </div>

              {/* compact 2-col grid of facts */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
                <Fact label="last online" value={fmtRelative(data.last_online_at)} />
                <Fact label="last offline" value={fmtRelative(data.last_offline_at)} />
                <Fact
                  label="checks"
                  value={`${data.successful_checks}/${data.total_checks}`}
                  sub={
                    data.total_checks > 0
                      ? `${((data.successful_checks / data.total_checks) * 100).toFixed(1)}%`
                      : undefined
                  }
                />
                <Fact label="incidents" value={String(data.incident_count)} />
                <Fact
                  label="avg latency"
                  value={fmtLatency(data.avg_latency_ms)}
                />
                <Fact
                  label="last latency"
                  value={fmtLatency(data.last_latency_ms)}
                />
                <Fact
                  label="longest up"
                  value={fmtDuration(data.longest_uptime_ms)}
                />
                <Fact
                  label="longest down"
                  value={fmtDuration(data.longest_downtime_ms)}
                />
              </div>

              {/* container (only when applicable) */}
              {isDocker && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 border-t border-border">
                  <Fact
                    label="container"
                    value={data.container_state ?? '—'}
                    accent={
                      data.container_state === 'running' ? 'online' : undefined
                    }
                  />
                  <Fact
                    label="container up"
                    value={fmtDuration(liveContainerDuration)}
                  />
                </div>
              )}
            </>
          )}

          {!loading && !data && (
            <p className="font-mono text-[11px] text-offline p-3">
              failed to load
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'online'
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle leading-tight">
        {label}
      </div>
      <div
        className={`font-mono text-[12px] tabular leading-tight mt-0.5 truncate ${accent === 'online' ? 'text-online' : 'text-fg'}`}
      >
        {value}
        {sub && (
          <span className="text-fg-subtle ml-1 normal-case">({sub})</span>
        )}
      </div>
    </div>
  )
}
