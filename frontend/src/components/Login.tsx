import { useState } from 'react'
import { api } from '../api'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.login(password)
      onSuccess()
    } catch (err) {
      setError((err as Error).message)
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs bg-surface border border-border-strong shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="text-accent font-mono text-sm leading-none">▮</span>
          <h1 className="font-display text-sm font-semibold tracking-tight text-fg">
            selfhost
          </h1>
          <span className="font-mono text-[10px] text-fg-subtle">locked</span>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-1.5">
              password
            </span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm bg-bg border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 transition-colors"
            />
          </label>
          {error && <p className="font-mono text-xs text-offline">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full px-3 py-2 font-mono text-[11px] uppercase tracking-wider bg-fg text-bg hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'unlocking…' : 'unlock'}
          </button>
        </div>
      </form>
    </div>
  )
}
