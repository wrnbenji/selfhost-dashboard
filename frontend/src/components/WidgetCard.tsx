import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EmbedConfig, NoteConfig, Widget } from '../types'

interface Props {
  widget: Widget
  onEdit: (w: Widget) => void
  onDelete: (id: string) => void
}

const URL_RE = /(https?:\/\/[^\s]+)/g

/**
 * Render note text as React nodes: plain text is escaped by React, URLs become
 * links. No dangerouslySetInnerHTML, so it's XSS-safe by construction.
 */
function renderNote(text: string) {
  return text.split(URL_RE).map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-accent hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export function WidgetCard({ widget, onEdit, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-surface border border-border hover:border-border-strong transition-colors flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <button
            {...attributes}
            {...listeners}
            aria-label="Reorder"
            className="text-fg-subtle/60 hover:text-fg-muted cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
              <circle cx="2" cy="2" r="0.8" /><circle cx="6" cy="2" r="0.8" />
              <circle cx="2" cy="6" r="0.8" /><circle cx="6" cy="6" r="0.8" />
              <circle cx="2" cy="10" r="0.8" /><circle cx="6" cy="10" r="0.8" />
            </svg>
          </button>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted truncate">
            {widget.title || widget.type}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(widget)}
            aria-label="Edit widget"
            className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:text-fg px-1"
          >
            edit
          </button>
          <button
            onClick={() => onDelete(widget.id)}
            aria-label="Delete widget"
            className="text-fg-subtle hover:text-offline p-1"
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {widget.type === 'embed' ? (
        <iframe
          src={(widget.config as EmbedConfig).url}
          title={widget.title || 'embed'}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full border-0 bg-bg"
          style={{ height: (widget.config as EmbedConfig).height }}
        />
      ) : (
        <p className="px-3 py-3 text-sm text-fg-muted whitespace-pre-wrap break-words">
          {renderNote((widget.config as NoteConfig).text)}
        </p>
      )}
    </div>
  )
}
