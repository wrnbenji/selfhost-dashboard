import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { NotificationChannel, NotificationConfig, NotificationPatch } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'webhook', label: 'webhook' },
  { key: 'discord', label: 'discord' },
]

export function NotificationsModal({ open, onClose }: Props) {
  const [cfg, setCfg] = useState<NotificationConfig | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setTestResult(null)
    setWebhookUrl('')
    api
      .notifications()
      .then(setCfg)
      .catch((e) => setError(String(e)))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const patch = (extra: NotificationPatch): NotificationPatch => {
    if (!cfg) return extra
    const p: NotificationPatch = {
      enabled: cfg.enabled,
      channel: cfg.channel,
      notify_on_recovery: cfg.notify_on_recovery,
      failure_threshold: cfg.failure_threshold,
      ...extra,
    }
    // The url is only sent when the user typed a new value — an empty field
    // leaves the stored value untouched on the server.
    if (webhookUrl.trim()) p.webhook_url = webhookUrl.trim()
    return p
  }

  const save = async (extra: NotificationPatch = {}) => {
    setError(null)
    setSaving(true)
    try {
      const next = await api.setNotifications(patch(extra))
      setCfg(next)
      setWebhookUrl('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTestResult('sending…')
    // Persist current edits first so the test uses what the user sees.
    try {
      await save()
    } catch {
      /* save() already surfaced the error */
    }
    const r = await api.testNotification()
    setTestResult(r.ok ? 'sent ✓' : `failed: ${r.error ?? 'unknown'}`)
  }

  const channel = cfg?.channel ?? 'webhook'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-bg/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="w-full max-w-md bg-surface border border-border-strong shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            notifications
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-fg-subtle hover:text-fg"
            aria-label="Close"
          >
            esc
          </button>
        </div>

        {!cfg ? (
          <p className="font-mono text-xs text-fg-subtle px-4 py-6">loading…</p>
        ) : (
          <div className="p-4 space-y-4">
            <Row label="enabled">
              <Toggle
                value={cfg.enabled}
                onChange={(v) => save({ enabled: v })}
                disabled={saving}
              />
            </Row>

            <Row label="channel">
              <Segmented
                options={CHANNELS}
                value={channel}
                onChange={(v) => save({ channel: v })}
                disabled={saving}
              />
            </Row>

            <Field label={channel === 'discord' ? 'discord webhook url' : 'webhook url'}>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={
                  cfg.webhook_url_set ? 'configured — type to replace' : 'https://…'
                }
                className={inputCls}
              />
            </Field>

            <Row label="notify on recovery">
              <Toggle
                value={cfg.notify_on_recovery}
                onChange={(v) => save({ notify_on_recovery: v })}
                disabled={saving}
              />
            </Row>

            <Row label="confirm after">
              <Segmented
                options={[1, 2, 3].map((n) => ({
                  key: n,
                  label: `${n} check${n > 1 ? 's' : ''}`,
                }))}
                value={cfg.failure_threshold}
                onChange={(v) => save({ failure_threshold: v })}
                disabled={saving}
              />
            </Row>

            {error && <p className="font-mono text-xs text-offline">{error}</p>}

            <div className="flex justify-between items-center pt-3 border-t border-border -mx-4 -mb-4 px-4 py-3">
              <span className="font-mono text-[10px] text-fg-subtle">
                {testResult ?? ''}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={runTest}
                  disabled={saving}
                  className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:text-fg disabled:opacity-40"
                >
                  send test
                </button>
                <button
                  type="button"
                  onClick={() => save()}
                  disabled={saving}
                  className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-fg text-bg hover:opacity-80 disabled:opacity-40"
                >
                  {saving ? 'saving…' : 'save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-bg border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 transition-colors'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`w-10 h-5 border transition-colors disabled:opacity-40 ${
        value ? 'bg-accent border-accent' : 'bg-bg border-border'
      }`}
    >
      <span
        className={`block w-4 h-4 bg-bg transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex border border-border">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={`flex-1 px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
            value === o.key ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
