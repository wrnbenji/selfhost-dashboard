import type {
  Incident,
  MonitorStatus,
  NewService,
  NotificationConfig,
  NotificationPatch,
  OverviewTimelineBucket,
  Runtime,
  Service,
  ServiceStats,
  Settings,
  Stats,
  StatsWindow,
  TimelineBucket,
} from './types'

export const api = {
  list: async (): Promise<Service[]> => {
    const r = await fetch('/api/services?include_disabled=1')
    if (!r.ok) throw new Error(`GET /api/services ${r.status}`)
    return r.json()
  },
  create: async (s: NewService): Promise<{ id: string }> => {
    const r = await fetch('/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (!r.ok) throw new Error(`POST /api/services ${r.status}`)
    return r.json()
  },
  update: async (id: string, patch: Partial<Service>): Promise<void> => {
    const r = await fetch(`/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error(`PATCH /api/services/${id} ${r.status}`)
  },
  remove: async (id: string): Promise<void> => {
    const r = await fetch(`/api/services/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(`DELETE /api/services/${id} ${r.status}`)
  },
  reorder: async (order: string[]): Promise<void> => {
    const r = await fetch('/api/services/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!r.ok) throw new Error(`PATCH reorder ${r.status}`)
  },
  stats: async (window: StatsWindow = '24h'): Promise<Stats> => {
    const r = await fetch(`/api/stats?window=${window}`)
    if (!r.ok) throw new Error(`GET stats ${r.status}`)
    return r.json()
  },
  overviewTimeline: async (
    window: StatsWindow = '24h',
    buckets = 32,
  ): Promise<{ buckets: OverviewTimelineBucket[] }> => {
    const r = await fetch(
      `/api/stats/overview/timeline?window=${window}&buckets=${buckets}`,
    )
    if (!r.ok) throw new Error(`GET overview timeline ${r.status}`)
    return r.json()
  },
  serviceStats: async (id: string, window: StatsWindow = '24h'): Promise<ServiceStats> => {
    const r = await fetch(`/api/stats/service/${id}?window=${window}`)
    if (!r.ok) throw new Error(`GET service stats ${r.status}`)
    return r.json()
  },
  timeline: async (
    id: string,
    window: StatsWindow = '24h',
    buckets = 48,
  ): Promise<{ buckets: TimelineBucket[] }> => {
    const r = await fetch(
      `/api/stats/service/${id}/timeline?window=${window}&buckets=${buckets}`,
    )
    if (!r.ok) throw new Error(`GET timeline ${r.status}`)
    return r.json()
  },
  incidents: async (
    id: string,
    window: StatsWindow = '24h',
  ): Promise<{ incidents: Incident[] }> => {
    const r = await fetch(`/api/stats/service/${id}/incidents?window=${window}`)
    if (!r.ok) throw new Error(`GET incidents ${r.status}`)
    return r.json()
  },
  monitor: async (window: StatsWindow = '24h'): Promise<MonitorStatus> => {
    const r = await fetch(`/api/monitor?window=${window}`)
    if (!r.ok) throw new Error(`GET monitor ${r.status}`)
    return r.json()
  },
  settings: async (): Promise<Settings> => {
    const r = await fetch('/api/settings')
    if (!r.ok) throw new Error(`GET settings ${r.status}`)
    return r.json()
  },
  runtime: async (id: string): Promise<Runtime> => {
    const r = await fetch(`/api/services/${id}/runtime`)
    if (!r.ok) throw new Error(`GET runtime ${r.status}`)
    return r.json()
  },
  setSettings: async (patch: Partial<Settings>): Promise<Settings> => {
    const r = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error(`PATCH settings ${r.status}`)
    return r.json()
  },
  notifications: async (): Promise<NotificationConfig> => {
    const r = await fetch('/api/notifications')
    if (!r.ok) throw new Error(`GET notifications ${r.status}`)
    return r.json()
  },
  setNotifications: async (patch: NotificationPatch): Promise<NotificationConfig> => {
    const r = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const msg = await r
        .json()
        .then((b) => (b as { error?: string }).error)
        .catch(() => null)
      throw new Error(msg ?? `PATCH notifications ${r.status}`)
    }
    return r.json()
  },
  testNotification: async (): Promise<{ ok: boolean; error?: string }> => {
    const r = await fetch('/api/notifications/test', { method: 'POST' })
    return r.json()
  },
}
