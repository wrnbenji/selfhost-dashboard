import { isValidHttpUrl } from './validate.js'

export type Status = 'online' | 'offline' | 'unknown'
export type Transition = 'down' | 'recovered'
export type Channel = 'webhook' | 'discord'

export interface NotificationConfig {
  enabled: boolean
  channel: Channel
  webhook_url: string
  notify_on_recovery: boolean
  failure_threshold: number
  muted: string[]
}

export const DEFAULT_CONFIG: NotificationConfig = {
  enabled: false,
  channel: 'webhook',
  webhook_url: '',
  notify_on_recovery: true,
  failure_threshold: 2,
  muted: [],
}

export interface ConfirmState {
  confirmed: Status | null
  candidate: Status | null
  streak: number
}

/**
 * Pure confirmation reducer. A status change only becomes "confirmed" — and emits
 * a transition — once the new status has held for `threshold` consecutive checks.
 * The first observation baselines silently so a fresh start (or restart) never
 * emits a spurious alert.
 */
export function reduceCheck(
  prev: ConfirmState | undefined,
  status: Status,
  threshold: number,
): { state: ConfirmState; transition: Transition | null } {
  const t = Math.max(1, Math.floor(threshold) || 1)

  if (!prev || prev.confirmed === null) {
    return { state: { confirmed: status, candidate: null, streak: 0 }, transition: null }
  }

  if (status === prev.confirmed) {
    return {
      state: { confirmed: prev.confirmed, candidate: null, streak: 0 },
      transition: null,
    }
  }

  const streak = prev.candidate === status ? prev.streak + 1 : 1
  if (streak >= t) {
    let transition: Transition | null = null
    if (status === 'offline') transition = 'down'
    else if (status === 'online') transition = 'recovered'
    return { state: { confirmed: status, candidate: null, streak: 0 }, transition }
  }

  return {
    state: { confirmed: prev.confirmed, candidate: status, streak },
    transition: null,
  }
}

export function validateConfig(
  input: Record<string, unknown>,
):
  | { ok: true; config: NotificationConfig }
  | { ok: false; error: string } {
  const channel = input.channel
  if (channel !== 'webhook' && channel !== 'discord') {
    return { ok: false, error: 'channel must be webhook or discord' }
  }

  const enabled = Boolean(input.enabled)
  const notify_on_recovery =
    input.notify_on_recovery === undefined ? true : Boolean(input.notify_on_recovery)

  const failure_threshold = Number(input.failure_threshold ?? 2)
  if (
    !Number.isInteger(failure_threshold) ||
    failure_threshold < 1 ||
    failure_threshold > 10
  ) {
    return { ok: false, error: 'failure_threshold must be an integer between 1 and 10' }
  }

  const webhook_url = String(input.webhook_url ?? '').trim()
  const muted = Array.isArray(input.muted)
    ? input.muted.filter((x): x is string => typeof x === 'string')
    : []

  if (enabled && !isValidHttpUrl(webhook_url)) {
    return { ok: false, error: `${channel} requires a valid http(s) webhook_url` }
  }

  return {
    ok: true,
    config: {
      enabled,
      channel,
      webhook_url,
      notify_on_recovery,
      failure_threshold,
      muted,
    },
  }
}

export interface NotifyEvent {
  name: string
  url: string
  transition: Transition
  ts: number
}

export function formatMessage(e: NotifyEvent): string {
  return e.transition === 'down'
    ? `🔴 ${e.name} is DOWN — ${e.url}`
    : `🟢 ${e.name} recovered — ${e.url}`
}

export interface HttpRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export function buildPayload(config: NotificationConfig, event: NotifyEvent): HttpRequest {
  const headers = { 'content-type': 'application/json' }
  const message = formatMessage(event)

  if (config.channel === 'discord') {
    return { url: config.webhook_url, headers, body: JSON.stringify({ content: message }) }
  }

  return {
    url: config.webhook_url,
    headers,
    body: JSON.stringify({
      service: event.name,
      status: event.transition,
      url: event.url,
      timestamp: event.ts,
      message,
    }),
  }
}

export function channelConfigured(c: NotificationConfig): boolean {
  return isValidHttpUrl(c.webhook_url)
}

export function shouldNotify(
  c: NotificationConfig,
  serviceId: string,
  transition: Transition,
): boolean {
  if (!c.enabled) return false
  if (!channelConfigured(c)) return false
  if (c.muted.includes(serviceId)) return false
  if (transition === 'recovered' && !c.notify_on_recovery) return false
  return true
}
