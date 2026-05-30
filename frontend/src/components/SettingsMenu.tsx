import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Settings } from '../types'
import { NotificationsModal } from './NotificationsModal'

const RETENTION_OPTIONS: Settings['retention_days'][] = [1, 7, 30]

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface SettingsMenuProps {
  showLogout?: boolean
  onLogout?: () => void
}

export function SettingsMenu({ showLogout, onLogout }: SettingsMenuProps = {}) {
  const [open, setOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const saveRetention = async (d: Settings['retention_days']) => {
    const next = await api.setSettings({ retention_days: d })
    setSettings(next)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        className="p-1.5 text-fg-muted hover:text-fg transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-60 bg-surface border border-border-strong shadow-xl z-30">
          <Section title="theme">
            <div className="flex border border-border">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    theme === t
                      ? 'bg-fg text-bg'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Section>
          <Section title="retention">
            <div className="flex border border-border">
              {RETENTION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => saveRetention(d)}
                  className={`flex-1 px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    settings?.retention_days === d
                      ? 'bg-fg text-bg'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {d === 1 ? '24h' : `${d}d`}
                </button>
              ))}
            </div>
          </Section>
          <Section title="notifications">
            <button
              onClick={() => {
                setOpen(false)
                setNotifyOpen(true)
              }}
              className="w-full px-2 py-1 font-mono text-[11px] uppercase tracking-wider border border-border text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
            >
              configure…
            </button>
          </Section>
          {showLogout && (
            <Section title="session">
              <button
                onClick={() => {
                  setOpen(false)
                  onLogout?.()
                }}
                className="w-full px-2 py-1 font-mono text-[11px] uppercase tracking-wider border border-border text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                log out
              </button>
            </Section>
          )}
        </div>
      )}
      <NotificationsModal open={notifyOpen} onClose={() => setNotifyOpen(false)} />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="px-3 py-2.5 border-b border-border last:border-b-0">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}
