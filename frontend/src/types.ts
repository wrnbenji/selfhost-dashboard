export type ServiceStatus = 'online' | 'offline' | 'unknown'

export interface Service {
  id: string
  name: string
  url: string
  icon: string | null
  description: string | null
  category: string | null
  sort_order: number
  enabled: number
  status: ServiceStatus
  last_check: number | null
  last_latency_ms: number | null
}

export type ViewMode = 'grid' | 'list'

export type CategoryKey = string
export const ALL_CATEGORY = '__all__'
export const UNCATEGORIZED = '__uncat__'

export type StatsWindow = '1h' | '24h' | '7d' | '30d'

export interface Stats {
  window: StatsWindow
  uptime_pct: number | null
  avg_latency: number | null
  p95_latency: number | null
  check_count: number
  incident_count: number
  coverage_pct: number
  coverage_ms: number
}

export interface ServiceStats extends Stats {
  id: string
  last_incident_at: number | null
}

export type TimelineBucketStatus = 'online' | 'offline' | 'mixed' | 'none' | 'gap'

export interface TimelineBucket {
  t: number
  status: TimelineBucketStatus
}

export interface Incident {
  start: number
  end: number | null
  duration_ms: number | null
}

export interface OverviewTimelineBucket {
  t: number
  uptime: number | null
  gap: boolean
}

export interface MonitorSession {
  id: number
  started_at: number
  ended_at: number | null
  last_seen_at: number
  duration_ms: number
  crashed: boolean
}

export interface MonitorGap {
  start: number
  end: number
  duration_ms: number
  crashed: boolean
}

export interface MonitorStatus {
  window: StatsWindow
  now: number
  current_session: {
    id: number
    started_at: number
    uptime_ms: number
  } | null
  sessions: MonitorSession[]
  gaps: MonitorGap[]
  coverage_pct: number
  coverage_ms: number
  gap_count: number
  total_gap_ms: number
}

export interface Settings {
  retention_days: 1 | 7 | 30
}

export type NotificationChannel = 'webhook' | 'discord'

/** Masked notification config as returned by the API — secrets never echoed. */
export interface NotificationConfig {
  enabled: boolean
  channel: NotificationChannel
  notify_on_recovery: boolean
  failure_threshold: number
  muted: string[]
  webhook_url_set: boolean
}

/** Fields a client may write. Secrets are only sent when (re)set by the user. */
export interface NotificationPatch {
  enabled?: boolean
  channel?: NotificationChannel
  webhook_url?: string
  notify_on_recovery?: boolean
  failure_threshold?: number
  muted?: string[]
}

export interface Runtime {
  id: string
  current_status: ServiceStatus
  status_since: number | null
  status_duration_ms: number | null
  monitor_downtime_in_status_ms: number | null
  first_seen: number | null
  last_online_at: number | null
  last_offline_at: number | null
  total_checks: number
  successful_checks: number
  incident_count: number
  longest_uptime_ms: number | null
  longest_downtime_ms: number | null
  avg_latency_ms: number | null
  last_latency_ms: number | null
  container_started_at: number | null
  container_state: string | null
}

export interface NewService {
  name: string
  url: string
  icon?: string
  description?: string
  category?: string
}
