import { getSetting, setSetting } from './db.js'
import {
  buildPayload,
  DEFAULT_CONFIG,
  reduceCheck,
  shouldNotify,
  type ConfirmState,
  type NotificationConfig,
  type NotifyEvent,
  type Status,
  type Transition,
} from './notify-core.js'

const SETTINGS_KEY = 'notifications'
const DELIVERY_TIMEOUT_MS = 5000

// Per-service confirmation state. In-memory by design: on restart every service
// re-baselines to its current status without emitting, so a restart never spams.
const states = new Map<string, ConfirmState>()

export function getConfig(): NotificationConfig {
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_CONFIG }
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<NotificationConfig>) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: NotificationConfig): void {
  setSetting(SETTINGS_KEY, JSON.stringify(config))
}

/** Public shape returned by the API — secrets are never echoed back. */
export interface MaskedConfig {
  enabled: boolean
  channel: NotificationConfig['channel']
  notify_on_recovery: boolean
  failure_threshold: number
  muted: string[]
  webhook_url_set: boolean
}

export function maskConfig(c: NotificationConfig): MaskedConfig {
  return {
    enabled: c.enabled,
    channel: c.channel,
    notify_on_recovery: c.notify_on_recovery,
    failure_threshold: c.failure_threshold,
    muted: c.muted,
    webhook_url_set: Boolean(c.webhook_url),
  }
}

export function setMuted(serviceId: string, muted: boolean): NotificationConfig {
  const config = getConfig()
  const set = new Set(config.muted)
  if (muted) set.add(serviceId)
  else set.delete(serviceId)
  const next = { ...config, muted: Array.from(set) }
  saveConfig(next)
  return next
}

async function deliver(config: NotificationConfig, event: NotifyEvent): Promise<void> {
  const req = buildPayload(config, event)
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`${config.channel} responded ${res.status}`)
  }
}

/** Send a sample alert through the configured channel. Surfaces errors to the UI. */
export async function sendTest(): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig()
  const event: NotifyEvent = {
    name: 'Test service',
    url: 'http://example.test',
    transition: 'down',
    ts: Date.now(),
  }
  try {
    await deliver(config, event)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Feed one health-check result through the confirmation reducer and fire a
 * notification when a transition is confirmed. Never throws — delivery failures
 * are logged, so this is safe to call (and not await) from the scheduler.
 */
export function onCheck(
  serviceId: string,
  name: string,
  url: string,
  status: Status,
): void {
  const config = getConfig()
  const { state, transition } = reduceCheck(
    states.get(serviceId),
    status,
    config.failure_threshold,
  )
  states.set(serviceId, state)

  if (!transition) return
  if (!config.enabled) return
  if (!shouldNotify(config, serviceId, transition as Transition)) return

  const event: NotifyEvent = { name, url, transition, ts: Date.now() }
  deliver(config, event).catch((e) =>
    console.warn(`[notify] ${config.channel} delivery failed:`, (e as Error).message),
  )
}

/** Drop confirmation state for a removed service so its id can't leak memory. */
export function forgetService(serviceId: string): void {
  states.delete(serviceId)
}
