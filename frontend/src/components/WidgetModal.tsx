import { useEffect, useRef, useState } from 'react'
import type { EmbedConfig, NewWidget, NoteConfig, Widget, WidgetType } from '../types'

interface Props {
  open: boolean
  initial?: Widget | null // null/undefined = create
  onClose: () => void
  onSubmit: (data: NewWidget) => Promise<void>
}

export function WidgetModal({ open, initial, onClose, onSubmit }: Props) {
  const [type, setType] = useState<WidgetType>('embed')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [height, setHeight] = useState('320')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const editing = !!initial

  useEffect(() => {
    if (!open) return
    setError(null)
    if (initial) {
      setType(initial.type)
      setTitle(initial.title)
      if (initial.type === 'embed') {
        const c = initial.config as EmbedConfig
        setUrl(c.url)
        setHeight(String(c.height))
      } else {
        setText((initial.config as NoteConfig).text)
      }
    } else {
      setType('embed')
      setTitle('')
      setUrl('')
      setHeight('320')
      setText('')
    }
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data: NewWidget =
        type === 'embed'
          ? { type, title: title.trim(), config: { url: url.trim(), height: Number(height) || 320 } }
          : { type, title: title.trim(), config: { text } }
      await onSubmit(data)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-bg/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit widget' : 'New widget'}
        className="w-full max-w-md bg-surface border border-border-strong shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            {editing ? 'edit widget' : 'new widget'}
          </span>
          <button onClick={onClose} aria-label="Close" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
            esc
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {!editing && (
            <Field label="type">
              <div className="flex border border-border">
                {(['embed', 'note'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                      type === t ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="title" optional>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'embed' ? 'Grafana' : 'Quick links'} className={inputCls} />
          </Field>

          {type === 'embed' ? (
            <>
              <Field label="embed url">
                <input
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://grafana.local/d/abc?kiosk"
                  className={`${inputCls} font-mono text-[13px]`}
                />
              </Field>
              <Field label="height (px)">
                <input
                  type="number"
                  min={120}
                  max={1200}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className={`${inputCls} font-mono text-[13px]`}
                />
              </Field>
            </>
          ) : (
            <Field label="text — urls become links">
              <textarea
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={'Router: http://10.0.0.1\nNAS: http://10.0.0.5'}
                className={`${inputCls} resize-y`}
              />
            </Field>
          )}

          {error && <p className="font-mono text-xs text-offline">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-border -mx-4 -mb-4 px-4 py-3">
            <button type="button" onClick={onClose} className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:text-fg">
              cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-fg text-bg hover:opacity-80 disabled:opacity-40"
            >
              {submitting ? 'saving…' : editing ? 'save' : 'add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-bg border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 transition-colors'

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-1.5">
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal text-fg-subtle">(optional)</span>}
      </span>
      {children}
    </label>
  )
}
