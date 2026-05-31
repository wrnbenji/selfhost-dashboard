import { useEffect, useState } from 'react'
import { api } from '../api'
import type {
  ContainerStats,
  Incident,
  NotificationConfig,
  Service,
  ServiceStats,
  StatsHistory,
  StatsWindow,
  TimelineBucket,
} from '../types'
import { Sparkline } from './Sparkline'
import { StatusIndicator } from './StatusBadge'
import { Timeline } from './Timeline'

interface Props {
  service: Service | null
  window: StatsWindow
  bumpKey: number
  onClose: () => void
  onEdit: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>
}

function fmtUptime(pct: number | null): string {
  if (pct === null) return '—'
  if (pct >= 99.95) return '100.00%'
  if (pct >= 99) return pct.toFixed(2) + '%'
  return pct.toFixed(1) + '%'
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return 'ongoing'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function fmtTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DetailPanel({
  service,
  window,
  bumpKey,
  onClose,
  onEdit,
  onToggleEnabled,
}: Props) {
  const [stats, setStats] = useState<ServiceStats | null>(null)
  const [timeline, setTimeline] = useState<TimelineBucket[] | null>(null)
  const [incidents, setIncidents] = useState<Incident[] | null>(null)
  const [notifyCfg, setNotifyCfg] = useState<NotificationConfig | null>(null)
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(null)
  const [statsHistory, setStatsHistory] = useState<StatsHistory | null>(null)

  useEffect(() => {
    if (!service) return
    let cancelled = false
    api
      .notifications()
      .then((c) => !cancelled && setNotifyCfg(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [service])

  // Live CPU/RAM + short history, only for Docker-discovered services. Refreshes
  // with bumpKey.
  useEffect(() => {
    if (!service || !service.id.startsWith('docker:')) {
      setContainerStats(null)
      setStatsHistory(null)
      return
    }
    let cancelled = false
    api
      .containerStats(service.id)
      .then((s) => !cancelled && setContainerStats(s))
      .catch(() => !cancelled && setContainerStats(null))
    api
      .statsHistory(service.id)
      .then((h) => !cancelled && setStatsHistory(h))
      .catch(() => !cancelled && setStatsHistory(null))
    return () => {
      cancelled = true
    }
    // Depend on the id (not the whole service object): live status/stats SSE updates
    // replace the service object every tick, and the one-shot /stats call takes ~1-2s
    // (Docker sampling) — keying on the object would cancel each fetch before it lands.
  }, [service?.id, bumpKey])

  const muted = service ? (notifyCfg?.muted.includes(service.id) ?? false) : false
  const toggleMute = async () => {
    if (!service || !notifyCfg) return
    const next = muted
      ? notifyCfg.muted.filter((m) => m !== service.id)
      : [...notifyCfg.muted, service.id]
    setNotifyCfg({ ...notifyCfg, muted: next }) // optimistic
    try {
      const saved = await api.setNotifications({ muted: next })
      setNotifyCfg(saved)
    } catch {
      api.notifications().then(setNotifyCfg).catch(() => {})
    }
  }

  useEffect(() => {
    if (!service) return
    setStats(null)
    setTimeline(null)
    setIncidents(null)
    let cancelled = false
    Promise.all([
      api.serviceStats(service.id, window),
      api.timeline(service.id, window, 72),
      api.incidents(service.id, window),
    ])
      .then(([s, t, i]) => {
        if (cancelled) return
        setStats(s)
        setTimeline(t.buckets)
        setIncidents(i.incidents)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [service, window, bumpKey])

  useEffect(() => {
    if (!service) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [service, onClose])

  if (!service) return null

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-bg/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-surface border-l border-border-strong overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border sticky top-0 bg-surface z-10">
          <div className="flex items-center gap-2">
            <StatusIndicator status={service.status} />
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
              service · {window}
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-fg-subtle hover:text-fg"
          >
            esc
          </button>
        </div>

        <div className="px-4 py-4 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-semibold text-fg leading-tight">
              {service.name}
            </h2>
            <a
              href={service.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-fg-muted hover:text-fg break-all"
            >
              {service.url}
            </a>
            {service.description && (
              <p className="text-sm text-fg-muted mt-2">{service.description}</p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => onEdit(service.id)}
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-border hover:bg-surface-hover hover:border-border-strong text-fg-muted hover:text-fg transition-colors"
              >
                edit
              </button>
              <button
                onClick={() =>
                  onToggleEnabled(service.id, !service.enabled)
                }
                className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border transition-colors ${
                  service.enabled
                    ? 'border-border hover:bg-surface-hover hover:border-border-strong text-fg-muted hover:text-fg'
                    : 'border-accent/40 bg-accent/10 text-accent'
                }`}
              >
                {service.enabled ? 'disable' : 'enable'}
              </button>
              {notifyCfg?.enabled && (
                <button
                  onClick={toggleMute}
                  title={
                    muted
                      ? 'notifications muted for this service'
                      : 'mute notifications for this service'
                  }
                  className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border transition-colors ${
                    muted
                      ? 'border-border bg-surface-hover text-fg-subtle hover:text-fg'
                      : 'border-border hover:bg-surface-hover hover:border-border-strong text-fg-muted hover:text-fg'
                  }`}
                >
                  {muted ? 'muted' : 'mute'}
                </button>
              )}
              {!service.enabled && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  paused
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <BigStat label="uptime" value={fmtUptime(stats?.uptime_pct ?? null)} />
            <BigStat label="avg latency" value={fmtLatency(stats?.avg_latency ?? null)} />
            <BigStat label="p95 latency" value={fmtLatency(stats?.p95_latency ?? null)} mute />
            <BigStat
              label="incidents"
              value={stats ? String(stats.incident_count) : '—'}
              mute
            />
            <BigStat
              label="checks"
              value={stats ? String(stats.check_count) : '—'}
              mute
            />
            <BigStat
              label="last incident"
              value={stats?.last_incident_at ? fmtTimestamp(stats.last_incident_at) : 'none'}
              mute
              small
            />
          </div>

          {containerStats && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-2">
                resources · live
              </div>
              <div className="space-y-3 border border-border px-3 py-3">
                <ResourceBar
                  label="cpu"
                  pct={containerStats.cpu_pct}
                  value={`${containerStats.cpu_pct}%`}
                />
                <ResourceBar
                  label="memory"
                  pct={containerStats.mem_pct}
                  value={`${fmtBytes(containerStats.mem_used_bytes)} / ${fmtBytes(containerStats.mem_limit_bytes)}`}
                />
                {statsHistory && statsHistory.cpu.length > 1 && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Trend label="cpu" values={statsHistory.cpu} />
                    <Trend label="memory" values={statsHistory.mem} autoScale color="var(--fg-muted)" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-2">
              timeline · {window}
            </div>
            {timeline ? (
              <Timeline buckets={timeline} height={28} gap={1} />
            ) : (
              <div className="h-7 bg-border/40" />
            )}
            <div className="flex justify-between font-mono text-[10px] text-fg-subtle mt-1">
              <span>{window} ago</span>
              <span>now</span>
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-2">
              incidents
            </div>
            {incidents && incidents.length > 0 ? (
              <ul className="border border-border divide-y divide-border">
                {incidents.map((inc) => (
                  <li
                    key={inc.start}
                    className="px-3 py-2 flex items-center justify-between font-mono text-xs"
                  >
                    <span className="text-fg">{fmtTimestamp(inc.start)}</span>
                    <span className="text-fg-muted tabular">
                      {fmtDuration(inc.duration_ms)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : incidents ? (
              <p className="font-mono text-xs text-fg-subtle px-3 py-2 border border-border">
                no incidents in window
              </p>
            ) : (
              <div className="h-10 bg-border/40" />
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function Trend({
  label,
  values,
  autoScale,
  color,
}: {
  label: string
  values: number[]
  autoScale?: boolean
  color?: string
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle mb-1">
        {label} · 30m
      </div>
      <Sparkline values={values} height={24} autoScale={autoScale} color={color} />
    </div>
  )
}

function ResourceBar({ label, pct, value }: { label: string; pct: number; value: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] mb-1">
        <span className="uppercase tracking-wider text-fg-muted">{label}</span>
        <span className="tabular text-fg">{value}</span>
      </div>
      <div className="h-1.5 bg-border/50">
        <div
          className={`h-full transition-all ${clamped >= 90 ? 'bg-offline' : 'bg-accent'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

function BigStat({
  label,
  value,
  mute,
  small,
}: {
  label: string
  value: string
  mute?: boolean
  small?: boolean
}) {
  return (
    <div>
      <div
        className={`font-mono tabular ${small ? 'text-xs' : 'text-xl'} ${
          mute ? 'text-fg-muted' : 'text-fg'
        }`}
      >
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle mt-0.5">
        {label}
      </div>
    </div>
  )
}
