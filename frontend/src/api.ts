import type {
  AuthStatus,
  CardStats,
  ContainerStats,
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
  StatsHistory,
  StatsWindow,
  TimelineBucket,
  Widget,
  NewWidget,
} from './types'

// Global 401 handling: any data call that comes back unauthorized (e.g. an
// expired session) notifies the app so it can show the login screen.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}
async function gfetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const r = await fetch(input, init)
  if (r.status === 401) onUnauthorized?.()
  return r
}

export const api = {
  list: async (): Promise<Service[]> => {
    const r = await gfetch('/api/services?include_disabled=1')
    if (!r.ok) throw new Error(`GET /api/services ${r.status}`)
    return r.json()
  },
  create: async (s: NewService): Promise<{ id: string }> => {
    const r = await gfetch('/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (!r.ok) throw new Error(`POST /api/services ${r.status}`)
    return r.json()
  },
  update: async (id: string, patch: Partial<Service>): Promise<void> => {
    const r = await gfetch(`/api/services/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error(`PATCH /api/services/${id} ${r.status}`)
  },
  remove: async (id: string): Promise<void> => {
    const r = await gfetch(`/api/services/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(`DELETE /api/services/${id} ${r.status}`)
  },
  reorder: async (order: string[]): Promise<void> => {
    const r = await gfetch('/api/services/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!r.ok) throw new Error(`PATCH reorder ${r.status}`)
  },
  stats: async (window: StatsWindow = '24h'): Promise<Stats> => {
    const r = await gfetch(`/api/stats?window=${window}`)
    if (!r.ok) throw new Error(`GET stats ${r.status}`)
    return r.json()
  },
  overviewTimeline: async (
    window: StatsWindow = '24h',
    buckets = 32,
  ): Promise<{ buckets: OverviewTimelineBucket[] }> => {
    const r = await gfetch(
      `/api/stats/overview/timeline?window=${window}&buckets=${buckets}`,
    )
    if (!r.ok) throw new Error(`GET overview timeline ${r.status}`)
    return r.json()
  },
  serviceStats: async (id: string, window: StatsWindow = '24h'): Promise<ServiceStats> => {
    const r = await gfetch(`/api/stats/service/${encodeURIComponent(id)}?window=${window}`)
    if (!r.ok) throw new Error(`GET service stats ${r.status}`)
    return r.json()
  },
  timeline: async (
    id: string,
    window: StatsWindow = '24h',
    buckets = 48,
  ): Promise<{ buckets: TimelineBucket[] }> => {
    const r = await gfetch(
      `/api/stats/service/${encodeURIComponent(id)}/timeline?window=${window}&buckets=${buckets}`,
    )
    if (!r.ok) throw new Error(`GET timeline ${r.status}`)
    return r.json()
  },
  incidents: async (
    id: string,
    window: StatsWindow = '24h',
  ): Promise<{ incidents: Incident[] }> => {
    const r = await gfetch(`/api/stats/service/${encodeURIComponent(id)}/incidents?window=${window}`)
    if (!r.ok) throw new Error(`GET incidents ${r.status}`)
    return r.json()
  },
  monitor: async (window: StatsWindow = '24h'): Promise<MonitorStatus> => {
    const r = await gfetch(`/api/monitor?window=${window}`)
    if (!r.ok) throw new Error(`GET monitor ${r.status}`)
    return r.json()
  },
  settings: async (): Promise<Settings> => {
    const r = await gfetch('/api/settings')
    if (!r.ok) throw new Error(`GET settings ${r.status}`)
    return r.json()
  },
  runtime: async (id: string): Promise<Runtime> => {
    const r = await gfetch(`/api/services/${encodeURIComponent(id)}/runtime`)
    if (!r.ok) throw new Error(`GET runtime ${r.status}`)
    return r.json()
  },
  containerStats: async (id: string): Promise<ContainerStats | null> => {
    const r = await gfetch(`/api/services/${encodeURIComponent(id)}/stats`)
    if (r.status === 404) return null // not a container / stats unavailable
    if (!r.ok) throw new Error(`GET container stats ${r.status}`)
    return r.json()
  },
  allContainerStats: async (): Promise<Record<string, CardStats>> => {
    const r = await gfetch('/api/services/stats')
    if (!r.ok) throw new Error(`GET services stats ${r.status}`)
    return r.json()
  },
  statsHistory: async (id: string): Promise<StatsHistory | null> => {
    const r = await gfetch(`/api/services/${encodeURIComponent(id)}/stats/history`)
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`GET stats history ${r.status}`)
    return r.json()
  },
  setSettings: async (patch: Partial<Settings>): Promise<Settings> => {
    const r = await gfetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error(`PATCH settings ${r.status}`)
    return r.json()
  },
  notifications: async (): Promise<NotificationConfig> => {
    const r = await gfetch('/api/notifications')
    if (!r.ok) throw new Error(`GET notifications ${r.status}`)
    return r.json()
  },
  setNotifications: async (patch: NotificationPatch): Promise<NotificationConfig> => {
    const r = await gfetch('/api/notifications', {
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
    const r = await gfetch('/api/notifications/test', { method: 'POST' })
    return r.json()
  },
  authStatus: async (): Promise<AuthStatus> => {
    const r = await fetch('/api/auth/status')
    if (!r.ok) throw new Error(`GET auth status ${r.status}`)
    return r.json()
  },
  login: async (password: string): Promise<{ ok: boolean }> => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!r.ok) {
      if (r.status === 401) throw new Error('Incorrect password')
      throw new Error(`POST login ${r.status}`)
    }
    return r.json()
  },
  logout: async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST' })
  },
  widgets: async (): Promise<Widget[]> => {
    const r = await gfetch('/api/widgets')
    if (!r.ok) throw new Error(`GET widgets ${r.status}`)
    return r.json()
  },
  createWidget: async (w: NewWidget): Promise<{ id: string }> => {
    const r = await gfetch('/api/widgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(w),
    })
    if (!r.ok) {
      const msg = await r.json().then((b) => (b as { error?: string }).error).catch(() => null)
      throw new Error(msg ?? `POST widget ${r.status}`)
    }
    return r.json()
  },
  updateWidget: async (id: string, patch: Partial<NewWidget>): Promise<void> => {
    const r = await gfetch(`/api/widgets/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const msg = await r.json().then((b) => (b as { error?: string }).error).catch(() => null)
      throw new Error(msg ?? `PATCH widget ${r.status}`)
    }
  },
  deleteWidget: async (id: string): Promise<void> => {
    const r = await gfetch(`/api/widgets/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(`DELETE widget ${r.status}`)
  },
  reorderWidgets: async (order: string[]): Promise<void> => {
    const r = await gfetch('/api/widgets/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!r.ok) throw new Error(`PATCH widget reorder ${r.status}`)
  },
  setPassword: async (body: {
    current_password?: string
    new_password: string
  }): Promise<{ ok: boolean; enabled: boolean }> => {
    const r = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const msg = await r
        .json()
        .then((b) => (b as { error?: string }).error)
        .catch(() => null)
      throw new Error(msg ?? `POST password ${r.status}`)
    }
    return r.json()
  },
}
