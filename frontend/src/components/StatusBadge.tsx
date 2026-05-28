import type { ServiceStatus } from '../types'

const config: Record<ServiceStatus, { color: string; label: string }> = {
  online: { color: 'bg-online', label: 'up' },
  offline: { color: 'bg-offline', label: 'down' },
  unknown: { color: 'bg-unknown', label: '—' },
}

export function StatusIndicator({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={`inline-block h-2 w-2 ${config[status].color}`}
      style={{
        boxShadow:
          status === 'online'
            ? '0 0 8px 0 var(--online)'
            : status === 'offline'
              ? '0 0 4px 0 var(--offline)'
              : 'none',
      }}
      aria-label={status}
    />
  )
}

export function StatusLabel({ status }: { status: ServiceStatus }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted tabular">
      {config[status].label}
    </span>
  )
}
