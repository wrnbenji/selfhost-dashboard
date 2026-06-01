import { useEffect, useRef, useState } from 'react'
import type { NewService, Service } from '../types'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Service | null
  onClose: () => void
  onSubmit: (data: NewService) => Promise<void>
}

export function ServiceModal({ open, mode, initial, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [category, setCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setUrl(initial?.url ?? '')
    setDescription(initial?.description ?? '')
    setIcon(initial?.icon ?? '')
    setCategory(initial?.category ?? '')
    setError(null)
    setTimeout(() => firstFieldRef.current?.focus(), 0)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: keep Tab cycling within the dialog.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        category: category.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const isReadonly = mode === 'edit' && initial && initial.id.startsWith('yaml:')
  const idHint = initial?.id.startsWith('docker:')
    ? 'this service is auto-discovered from Docker labels — name/url updates here will be overwritten on the next scan'
    : initial?.id.startsWith('k8s:')
      ? 'this service is auto-discovered from a Kubernetes ingress — name/url updates here will be overwritten on the next scan'
      : initial?.id.startsWith('yaml:')
        ? 'this service is defined in services.yaml — edit the YAML to change it'
        : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-bg/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'New service' : 'Edit service'}
        className="w-full max-w-md bg-surface border border-border-strong shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            {mode === 'create' ? 'new service' : 'edit service'}
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-fg-subtle hover:text-fg"
            aria-label="Close"
          >
            esc
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {idHint && (
            <p className="font-mono text-[10px] text-fg-muted bg-bg border border-border px-2.5 py-1.5">
              {idHint}
            </p>
          )}

          <Field label="name">
            <input
              ref={firstFieldRef}
              required
              disabled={isReadonly ?? undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Plex"
              className={inputCls}
            />
          </Field>

          <Field label="url">
            <input
              required
              type="url"
              disabled={isReadonly ?? undefined}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:32400"
              className={`${inputCls} font-mono text-[13px]`}
            />
          </Field>

          <Field label="description" optional>
            <input
              value={description}
              disabled={isReadonly ?? undefined}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Media server"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="category" optional>
              <input
                value={category}
                disabled={isReadonly ?? undefined}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Media"
                className={inputCls}
              />
            </Field>
            <Field label="icon" optional>
              <input
                value={icon}
                disabled={isReadonly ?? undefined}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="plex"
                className={`${inputCls} font-mono text-[13px]`}
              />
            </Field>
          </div>

          {error && (
            <p className="font-mono text-xs text-offline">{error}</p>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-border -mx-4 -mb-4 px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
              ⏎ to submit
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:text-fg"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={submitting || (isReadonly ?? false)}
                className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-fg text-bg hover:opacity-80 disabled:opacity-40"
              >
                {submitting
                  ? mode === 'create'
                    ? 'adding…'
                    : 'saving…'
                  : mode === 'create'
                    ? 'add'
                    : 'save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-bg border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-wider text-fg-muted mb-1.5">
        {label}
        {optional && (
          <span className="ml-1 normal-case tracking-normal text-fg-subtle">(optional)</span>
        )}
      </span>
      {children}
    </label>
  )
}
