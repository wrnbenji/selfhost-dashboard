import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardStats, Service } from '../types'
import { fmtBytesShort } from './format'
import { RuntimeButton } from './RuntimeButton'
import { ServiceIcon } from './ServiceIcon'

interface Props {
  service: Service
  stats?: CardStats
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  selected: boolean
}

const statusStyles = {
  online: { dot: 'bg-online', text: 'text-online', label: 'Online' },
  offline: { dot: 'bg-offline', text: 'text-offline', label: 'Offline' },
  unknown: { dot: 'bg-unknown', text: 'text-fg-subtle', label: 'Unknown' },
} as const

export function ServiceTile({ service, stats, onDelete, onSelect, selected }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: service.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const status = statusStyles[service.status]
  const disabled = !service.enabled

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-surface border ${selected ? 'border-border-strong' : 'border-border hover:border-border-strong'} p-4 flex flex-col gap-3 transition-colors ${disabled ? 'opacity-50' : ''}`}
    >
      {disabled && (
        <span className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
          paused
        </span>
      )}
      {/* drag handle — top-left, very subtle, only visible on hover */}
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2.5 left-2.5 text-fg-subtle/60 hover:text-fg-muted cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
            <circle cx="2" cy="2" r="0.8" />
            <circle cx="6" cy="2" r="0.8" />
            <circle cx="2" cy="6" r="0.8" />
            <circle cx="6" cy="6" r="0.8" />
            <circle cx="2" cy="10" r="0.8" />
            <circle cx="6" cy="10" r="0.8" />
          </svg>
        </button>
      )}

      {/* header: icon + name */}
      <button
        onClick={() => onSelect(service.id)}
        className="flex items-start gap-3 text-left min-w-0"
      >
        <ServiceIcon name={service.name} icon={service.icon} size={40} />
        <div className="min-w-0 flex-1 pr-4">
          <h3 className="font-display font-medium text-fg truncate">
            {service.name}
          </h3>
          <p className="text-xs text-fg-muted truncate mt-0.5">
            {service.description ??
              (() => {
                try {
                  return new URL(service.url).host
                } catch {
                  return service.url
                }
              })()}
          </p>
        </div>
      </button>

      {/* hover-only actions, top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <RuntimeButton serviceId={service.id} align="right" />
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(service.id)
          }}
          aria-label="Delete"
          className="text-fg-subtle hover:text-offline p-1"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* live CPU/RAM — only for Docker-discovered services */}
      {stats && (
        <div className="flex items-center gap-2 font-mono text-[10px] text-fg-subtle tabular">
          <span>cpu {stats.cpu_pct}%</span>
          <span className="text-border-strong">·</span>
          <span>{fmtBytesShort(stats.mem_used_bytes)}</span>
        </div>
      )}

      {/* footer: status + open */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 ${status.dot}`}
            aria-hidden
          />
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${status.text}`}
          >
            {status.label}
          </span>
        </span>
        <a
          href={service.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-border hover:bg-surface-hover hover:border-border-strong text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1"
        >
          Open
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 1.5h5.5V7M8.5 1.5L1.5 8.5" />
          </svg>
        </a>
      </div>
    </div>
  )
}
