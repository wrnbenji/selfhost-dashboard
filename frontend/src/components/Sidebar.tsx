import { useMemo } from 'react'
import { ALL_CATEGORY, UNCATEGORIZED, type Service } from '../types'

interface Props {
  services: Service[] | null
  selected: string
  onSelect: (key: string) => void
}

function categoryIcon(key: string): string {
  // simple monochrome glyphs; styling stays consistent with the rest of the UI
  if (key === ALL_CATEGORY) return '▤'
  if (key === UNCATEGORIZED) return '◌'
  const lc = key.toLowerCase()
  if (lc.includes('media')) return '▶'
  if (lc.includes('monitor')) return '◉'
  if (lc.includes('network')) return '◈'
  if (lc.includes('storage')) return '▦'
  if (lc.includes('home')) return '⌂'
  if (lc.includes('product')) return '✦'
  if (lc.includes('security') || lc.includes('auth')) return '✕'
  return '•'
}

export function Sidebar({ services, selected, onSelect }: Props) {
  const groups = useMemo(() => {
    if (!services) return [] as { key: string; label: string; count: number }[]
    const active = services.filter((s) => s.enabled)
    const map = new Map<string, number>()
    for (const s of active) {
      const k = s.category ?? UNCATEGORIZED
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    const sorted = Array.from(map.entries())
      .filter(([k]) => k !== UNCATEGORIZED)
      .sort((a, b) => a[0].localeCompare(b[0]))
    const out: { key: string; label: string; count: number }[] = [
      { key: ALL_CATEGORY, label: 'Overview', count: active.length },
    ]
    for (const [k, count] of sorted) {
      out.push({ key: k, label: k, count })
    }
    const uncatCount = map.get(UNCATEGORIZED) ?? 0
    if (uncatCount > 0) {
      out.push({ key: UNCATEGORIZED, label: 'Other', count: uncatCount })
    }
    return out
  }, [services])

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border h-screen sticky top-0 self-start">
      <div className="px-4 py-4 border-b border-border flex items-center gap-2">
        <span className="text-accent font-mono text-sm leading-none">▮</span>
        <h1 className="font-display text-sm font-semibold tracking-tight text-fg">
          selfhost
        </h1>
        <span className="font-mono text-[10px] text-fg-subtle">v0.1</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-3 mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          Categories
        </div>
        <ul>
          {groups.map((g) => {
            const active = selected === g.key
            return (
              <li key={g.key}>
                <button
                  onClick={() => onSelect(g.key)}
                  className={`group w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors text-left ${
                    active
                      ? 'bg-surface-hover text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  <span
                    className={`font-mono text-[12px] w-4 text-center ${active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted'}`}
                  >
                    {categoryIcon(g.key)}
                  </span>
                  <span className="flex-1 truncate">{g.label}</span>
                  <span className="font-mono text-[10px] text-fg-subtle tabular">
                    {g.count}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-border font-mono text-[10px] text-fg-subtle">
        <kbd className="border border-border px-1 py-0.5 mr-1">/</kbd>filter
        <span className="mx-2">·</span>
        <kbd className="border border-border px-1 py-0.5 mr-1">n</kbd>new
      </div>
    </aside>
  )
}
