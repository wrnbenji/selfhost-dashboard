import { useEffect, useState } from 'react'
import { api } from '../api'
import type {
  AuthStatus,
  NotificationChannel,
  NotificationConfig,
  NotificationPatch,
  Settings,
} from '../types'
import type { Theme } from '../hooks/useTheme'

interface Props {
  open: boolean
  onClose: () => void
  theme: Theme
  setTheme: (t: Theme) => void
  auth: AuthStatus
  onAuthChange: (a: AuthStatus) => void
  onLogout: () => void
}

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'webhook', label: 'webhook' },
  { key: 'discord', label: 'discord' },
]
const RETENTION: Settings['retention_days'][] = [1, 7, 30]

export function SettingsPanel({
  open,
  onClose,
  theme,
  setTheme,
  auth,
  onAuthChange,
  onLogout,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-bg/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-surface border-l border-border-strong overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border sticky top-0 bg-surface z-10">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            settings
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[11px] text-fg-subtle hover:text-fg"
          >
            esc
          </button>
        </div>

        <div className="divide-y divide-border">
          <Section title="appearance">
            <Segmented
              options={[
                { key: 'light', label: 'light' },
                { key: 'dark', label: 'dark' },
              ]}
              value={theme}
              onChange={setTheme}
            />
          </Section>

          <RetentionSection />
          <NotificationsSection />
          <SecuritySection auth={auth} onAuthChange={onAuthChange} />

          {auth.required && (
            <Section title="session">
              <button
                onClick={onLogout}
                className="w-full px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-border text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                log out
              </button>
            </Section>
          )}
        </div>
      </aside>
    </div>
  )
}

function RetentionSection() {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    api.settings().then(setSettings).catch(() => {})
  }, [])
  const save = async (d: Settings['retention_days']) => {
    setSettings(await api.setSettings({ retention_days: d }))
  }
  return (
    <Section title="monitoring · history retention">
      <Segmented
        options={RETENTION.map((d) => ({ key: d, label: d === 1 ? '24h' : `${d}d` }))}
        value={settings?.retention_days ?? 7}
        onChange={save}
      />
    </Section>
  )
}

function NotificationsSection() {
  const [cfg, setCfg] = useState<NotificationConfig | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    api
      .notifications()
      .then(setCfg)
      .catch((e) => setError(String(e)))
  }, [])

  const buildPatch = (extra: NotificationPatch): NotificationPatch => {
    const p: NotificationPatch = {
      enabled: cfg?.enabled,
      channel: cfg?.channel,
      notify_on_recovery: cfg?.notify_on_recovery,
      failure_threshold: cfg?.failure_threshold,
      ...extra,
    }
    if (webhookUrl.trim()) p.webhook_url = webhookUrl.trim()
    return p
  }
  const save = async (extra: NotificationPatch = {}) => {
    setError(null)
    setSaving(true)
    try {
      setCfg(await api.setNotifications(buildPatch(extra)))
      setWebhookUrl('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const runTest = async () => {
    setTestResult('sending…')
    try {
      await save()
    } catch {
      /* surfaced via error */
    }
    const r = await api.testNotification()
    setTestResult(r.ok ? 'sent ✓' : `failed: ${r.error ?? 'unknown'}`)
  }

  if (!cfg) return <Section title="notifications">…</Section>
  const channel = cfg.channel

  return (
    <Section title="notifications">
      <div className="space-y-3">
        <Row label="enabled">
          <Toggle value={cfg.enabled} onChange={(v) => save({ enabled: v })} disabled={saving} />
        </Row>
        <Row label="channel">
          <Segmented
            options={CHANNELS}
            value={channel}
            onChange={(v) => save({ channel: v })}
            disabled={saving}
          />
        </Row>
        <label className="block">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
            {channel === 'discord' ? 'discord webhook url' : 'webhook url'}
          </span>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={cfg.webhook_url_set ? 'configured — type to replace' : 'https://…'}
            className={inputCls}
          />
        </label>
        <Row label="notify on recovery">
          <Toggle
            value={cfg.notify_on_recovery}
            onChange={(v) => save({ notify_on_recovery: v })}
            disabled={saving}
          />
        </Row>
        <Row label="confirm after">
          <Segmented
            options={[1, 2, 3].map((n) => ({ key: n, label: `${n}` }))}
            value={cfg.failure_threshold}
            onChange={(v) => save({ failure_threshold: v })}
            disabled={saving}
          />
        </Row>
        {error && <p className="font-mono text-xs text-offline">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-fg-subtle">{testResult ?? ''}</span>
          <button
            type="button"
            onClick={runTest}
            disabled={saving}
            className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-border text-fg-muted hover:text-fg hover:border-border-strong disabled:opacity-40 transition-colors"
          >
            send test
          </button>
        </div>
      </div>
    </Section>
  )
}

function SecuritySection({
  auth,
  onAuthChange,
}: {
  auth: AuthStatus
  onAuthChange: (a: AuthStatus) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refresh = async () => onAuthChange(await api.authStatus())

  const submit = async (newPassword: string) => {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      const body = auth.required
        ? { current_password: current, new_password: newPassword }
        : { new_password: newPassword }
      const r = await api.setPassword(body)
      setCurrent('')
      setNext('')
      setOk(r.enabled ? 'password updated ✓' : 'password protection disabled ✓')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (auth.env_managed) {
    return (
      <Section title="security · password">
        <p className="font-mono text-[11px] text-fg-muted leading-relaxed">
          Managed by the <code className="text-fg">AUTH_PASSWORD</code> environment
          variable. Unset it to manage the password here.
        </p>
      </Section>
    )
  }

  return (
    <Section title="security · password">
      <div className="space-y-3">
        <p className="font-mono text-[11px] text-fg-subtle leading-relaxed">
          {auth.required
            ? 'A password is set. Enter it to change or remove protection.'
            : 'Set a password to lock the dashboard behind a login.'}
        </p>
        {auth.required && (
          <PwField
            label="current password"
            value={current}
            onChange={setCurrent}
            placeholder="current"
          />
        )}
        <PwField
          label="new password"
          value={next}
          onChange={setNext}
          placeholder={auth.required ? 'new password' : 'choose a password'}
        />
        {error && <p className="font-mono text-xs text-offline">{error}</p>}
        {ok && <p className="font-mono text-xs text-accent">{ok}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !next}
            onClick={() => submit(next)}
            className="flex-1 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-fg text-bg hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {auth.required ? 'change password' : 'enable lock'}
          </button>
          {auth.required && (
            <button
              type="button"
              disabled={busy || !current}
              onClick={() => submit('')}
              title="Disable password protection"
              className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-border text-fg-muted hover:text-offline hover:border-offline/40 disabled:opacity-40 transition-colors"
            >
              disable
            </button>
          )}
        </div>
      </div>
    </Section>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-bg border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 transition-colors'

function PwField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle mb-2.5">
        {title}
      </div>
      {children}
    </div>
  )
}

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
