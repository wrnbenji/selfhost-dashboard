import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardStats, Service, StatsWindow } from '../types'
import { fmtBytesShort } from './format'
import { RuntimeButton } from './RuntimeButton'
import { StatusIndicator } from './StatusBadge'

interface Props {
  service: Service
  stats?: CardStats
  // kept for API compatibility with App.tsx; not used in simplified row
  statsWindow?: StatsWindow
  statsBump?: number
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  selected: boolean
}

function fmtLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ServiceCard({ service, stats, onDelete, onSelect, selected }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: service.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const host = (() => {
    try {
      const u = new URL(service.url)
      return u.host + (u.pathname !== '/' ? u.pathname : '')
    } catch {
      return service.url
    }
  })()

  const disabled = !service.enabled

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors cursor-pointer ${
        selected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      } ${disabled ? 'opacity-50' : ''}`}
      onClick={() => onSelect(service.id)}
    >
      {/* left rail: drag handle + status dot */}
      <div className="flex items-center gap-3 pl-2 -ml-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder"
          onClick={(e) => e.stopPropagation()}
          className="text-fg-subtle hover:text-fg-muted cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity -ml-4 pr-1"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2" cy="2" r="1" />
            <circle cx="8" cy="2" r="1" />
            <circle cx="2" cy="7" r="1" />
            <circle cx="8" cy="7" r="1" />
            <circle cx="2" cy="12" r="1" />
            <circle cx="8" cy="12" r="1" />
          </svg>
        </button>
        <StatusIndicator status={service.status} />
      </div>

      {/* main: name + host */}
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="font-display text-[15px] font-medium text-fg truncate">
          {service.name}
        </span>
        <a
          href={service.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-fg-muted hover:text-fg truncate"
        >
          {host}
        </a>
      </div>

      {/* right: single metric + hover actions */}
      <div className="flex items-center gap-3">
        {stats && (
          <span className="hidden md:inline font-mono text-[11px] text-fg-subtle tabular">
            cpu {stats.cpu_pct}% · {fmtBytesShort(stats.mem_used_bytes)}
          </span>
        )}
        <span className="hidden sm:inline font-mono text-xs text-fg-muted tabular">
          {fmtLatency(service.last_latency_ms)}
        </span>
        <div
          onClick={(e) => e.stopPropagation()}
          className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <RuntimeButton serviceId={service.id} align="right" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(service.id)
            }}
            aria-label="Delete"
            className="text-fg-subtle hover:text-offline p-1"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
