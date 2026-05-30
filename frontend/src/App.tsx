import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler } from './api'
import { Login } from './components/Login'
import { ServiceModal } from './components/ServiceModal'
import { DetailPanel } from './components/DetailPanel'
import { MonitorPill } from './components/MonitorPill'
import { ServiceCard } from './components/ServiceCard'
import { ServiceTile } from './components/ServiceTile'
import { SettingsMenu } from './components/SettingsMenu'
import { Sidebar } from './components/Sidebar'
import { StatCards } from './components/StatCards'
import { ViewToggle } from './components/ViewToggle'
import { useServiceEvents } from './hooks/useServiceEvents'
import {
  ALL_CATEGORY,
  UNCATEGORIZED,
  type AuthStatus,
  type NewService,
  type Service,
  type StatsWindow,
  type ViewMode,
} from './types'

function loadViewMode(): ViewMode {
  const v = localStorage.getItem('viewMode')
  return v === 'list' ? 'list' : 'grid'
}

function loadCategory(): string {
  return localStorage.getItem('category') ?? ALL_CATEGORY
}

export function App() {
  const [services, setServices] = useState<Service[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [statsWindow, setStatsWindow] = useState<StatsWindow>('24h')
  const [statsBump, setStatsBump] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [category, setCategory] = useState<string>(loadCategory)
  const [navOpen, setNavOpen] = useState(false)
  const [auth, setAuth] = useState<AuthStatus | null>(null)

  // Register the 401 handler first, then probe auth status. An expired session
  // (or no session when a password is set) flips us to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setAuth({ required: true, authed: false }))
    api
      .authStatus()
      .then(setAuth)
      .catch(() => setAuth({ required: false, authed: true }))
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode)
  }, [viewMode])
  useEffect(() => {
    localStorage.setItem('category', category)
  }, [category])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const load = useCallback(() => {
    api
      .list()
      .then((s) => {
        setServices(s)
        setError(null) // clear any prior error (e.g. a pre-login 401)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useServiceEvents({
    onStatus: useCallback(({ id, status, last_check }) => {
      setServices((prev) =>
        prev
          ? prev.map((s) => (s.id === id ? { ...s, status, last_check } : s))
          : prev,
      )
    }, []),
    onServicesChanged: load,
  })

  useEffect(() => {
    const t = setInterval(() => setStatsBump((b) => b + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const handleAdd = async (s: NewService) => {
    await api.create(s)
    load()
  }

  const handleEdit = async (s: NewService) => {
    if (!editingId) return
    await api.update(editingId, s)
    load()
  }

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await api.update(id, { enabled: enabled ? 1 : 0 })
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async (id: string) => {
    if (!services) return
    setServices(services.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
    try {
      await api.remove(id)
    } catch {
      load()
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || !services || !filtered || active.id === over.id) return
    // Sortable items are the *filtered* list — reorder within it, then splice
    // back into the full list so hidden (filtered-out) services keep their slots.
    const oldIdx = filtered.findIndex((s) => s.id === active.id)
    const newIdx = filtered.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(filtered, oldIdx, newIdx)
    const visibleIds = new Set(filtered.map((s) => s.id))
    let qi = 0
    const next = services.map((s) => (visibleIds.has(s.id) ? reordered[qi++] : s))
    setServices(next)
    api.reorder(next.map((s) => s.id)).catch(load)
  }

  const filtered = useMemo(() => {
    if (!services) return null
    let out = services
    if (category !== ALL_CATEGORY) {
      out = out.filter((s) =>
        category === UNCATEGORIZED ? !s.category : s.category === category,
      )
    }
    const q = filter.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q),
      )
    }
    return out
  }, [services, filter, category])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('filter-input')?.focus()
      } else if (e.key === 'n' && !modalOpen) {
        e.preventDefault()
        setModalOpen(true)
      } else if (e.key === 'g') {
        setViewMode((m) => (m === 'grid' ? 'list' : 'grid'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  if (auth === null) {
    return <div className="min-h-screen" />
  }
  if (auth.required && !auth.authed) {
    return (
      <Login
        onSuccess={() => {
          setAuth({ required: true, authed: true })
          load()
        }}
      />
    )
  }

  const selectedService = services?.find((s) => s.id === selectedId) ?? null

  const sectionTitle =
    category === ALL_CATEGORY
      ? 'All services'
      : category === UNCATEGORIZED
        ? 'Other'
        : category

  return (
    <div className="min-h-screen flex">
      <Sidebar
        services={services}
        selected={category}
        onSelect={setCategory}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-border">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open categories menu"
              className="lg:hidden -ml-1 px-1.5 py-1 text-fg-muted hover:text-fg font-mono text-base leading-none"
            >
              ☰
            </button>
            <h2 className="font-display text-base font-semibold tracking-tight text-fg">
              {sectionTitle}
            </h2>

            <div className="flex-1 flex justify-end items-center gap-1.5">
              <div className="relative max-w-[16rem] w-full hidden sm:block">
                <input
                  id="filter-input"
                  aria-label="Filter services"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="filter"
                  className="w-full bg-transparent border border-border focus:border-border-strong focus:outline-none px-2.5 py-1.5 font-mono text-xs placeholder:text-fg-subtle"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-fg-subtle border border-border px-1 leading-none py-0.5 pointer-events-none">
                  /
                </kbd>
              </div>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <MonitorPill window={statsWindow} bumpKey={statsBump} />
              <SettingsMenu
                showLogout={auth.required}
                onLogout={async () => {
                  await api.logout()
                  setAuth({ required: true, authed: false })
                }}
              />
              <button
                onClick={() => setModalOpen(true)}
                aria-label="Add new service"
                className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1.5 bg-fg text-bg hover:opacity-80 ml-1"
              >
                + new
              </button>
            </div>
          </div>
        </header>

        <StatCards
          services={services}
          window={statsWindow}
          onWindowChange={setStatsWindow}
          bumpKey={statsBump}
        />

        <main className="px-4 sm:px-6 pb-10 flex-1">
          {error && (
            <p className="font-mono text-xs text-offline px-4 py-3 border border-offline/30">
              error: {error}
            </p>
          )}

          {!error && services === null && (
            <div
              className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
              aria-busy="true"
              aria-label="Loading services"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-border bg-surface p-4 animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-border/60 rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 bg-border/60 rounded" />
                      <div className="h-2 w-1/2 bg-border/40 rounded" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 w-full bg-border/40 rounded" />
                </div>
              ))}
            </div>
          )}

          {!error && services?.length === 0 && (
            <div className="border border-border border-dashed px-6 py-16 text-center">
              <p className="font-mono text-xs uppercase tracking-wider text-fg-muted mb-4">
                no services
              </p>
              <p className="text-sm text-fg-muted max-w-md mx-auto">
                Add one with{' '}
                <kbd className="font-mono text-[11px] border border-border px-1.5 py-0.5">
                  n
                </kbd>{' '}
                or label any Docker container with
              </p>
              <pre className="inline-block mt-3 font-mono text-[11px] text-fg-muted bg-surface border border-border px-3 py-2 text-left">
                <span className="text-fg-subtle">labels:</span>
                {'\n  - "dashboard.enable=true"\n  - "dashboard.name=Plex"\n  - "dashboard.url=http://..."\n  - "dashboard.category=Media"'}
              </pre>
            </div>
          )}

          {filtered && filtered.length > 0 && viewMode === 'grid' && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filtered.map((s) => s.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {filtered.map((s) => (
                    <ServiceTile
                      key={s.id}
                      service={s}
                      onDelete={handleDelete}
                      onSelect={setSelectedId}
                      selected={selectedId === s.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {filtered && filtered.length > 0 && viewMode === 'list' && (
            <div className="border border-border bg-surface">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filtered.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-border">
                    {filtered.map((s) => (
                      <li key={s.id}>
                        <ServiceCard
                          service={s}
                          statsWindow={statsWindow}
                          statsBump={statsBump}
                          onDelete={handleDelete}
                          onSelect={setSelectedId}
                          selected={selectedId === s.id}
                        />
                      </li>
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {services && services.length > 0 && filtered?.length === 0 && (
            <p className="font-mono text-xs text-fg-subtle px-4 py-10 text-center">
              no matches{filter ? ` for "${filter}"` : ' in this category'}
            </p>
          )}
        </main>

        <footer className="lg:hidden px-4 sm:px-6 py-3 border-t border-border font-mono text-[10px] text-fg-subtle">
          <kbd className="border border-border px-1 py-0.5 mr-1">/</kbd>filter
          <span className="mx-2">·</span>
          <kbd className="border border-border px-1 py-0.5 mr-1">n</kbd>new
        </footer>
      </div>

      <ServiceModal
        open={modalOpen}
        mode="create"
        onClose={() => setModalOpen(false)}
        onSubmit={handleAdd}
      />

      <ServiceModal
        open={editingId !== null}
        mode="edit"
        initial={services?.find((s) => s.id === editingId) ?? null}
        onClose={() => setEditingId(null)}
        onSubmit={handleEdit}
      />

      <DetailPanel
        service={selectedService}
        window={statsWindow}
        bumpKey={statsBump}
        onClose={() => setSelectedId(null)}
        onEdit={(id) => setEditingId(id)}
        onToggleEnabled={handleToggleEnabled}
      />
    </div>
  )
}
