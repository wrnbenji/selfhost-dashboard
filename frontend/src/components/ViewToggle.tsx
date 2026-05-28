import type { ViewMode } from '../types'

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
}) {
  return (
    <div className="flex border border-border">
      <button
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        className={`p-1.5 transition-colors ${
          mode === 'grid'
            ? 'bg-fg text-bg'
            : 'text-fg-muted hover:text-fg'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <rect x="0" y="0" width="6" height="6" />
          <rect x="8" y="0" width="6" height="6" />
          <rect x="0" y="8" width="6" height="6" />
          <rect x="8" y="8" width="6" height="6" />
        </svg>
      </button>
      <button
        onClick={() => onChange('list')}
        aria-label="List view"
        className={`p-1.5 transition-colors ${
          mode === 'list'
            ? 'bg-fg text-bg'
            : 'text-fg-muted hover:text-fg'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <rect x="0" y="1" width="14" height="2" />
          <rect x="0" y="6" width="14" height="2" />
          <rect x="0" y="11" width="14" height="2" />
        </svg>
      </button>
    </div>
  )
}
