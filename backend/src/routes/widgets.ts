import { Hono } from 'hono'
import type { Context } from 'hono'
import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { validateWidget } from '../widgets-core.js'

export const widgets = new Hono()

interface WidgetRow {
  id: string
  type: string
  title: string | null
  config: string
  sort_order: number
}

function toWidget(row: WidgetRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? '',
    config: JSON.parse(row.config),
    sort_order: row.sort_order,
  }
}

async function readJson<T>(c: Context): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

widgets.get('/', (c) => {
  const rows = db
    .prepare('SELECT * FROM widgets ORDER BY sort_order ASC, rowid ASC')
    .all() as WidgetRow[]
  return c.json(rows.map(toWidget))
})

widgets.post('/', async (c) => {
  const body = await readJson<Record<string, unknown>>(c)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)
  const result = validateWidget(body)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const id = randomUUID()
  const next =
    (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM widgets').get() as {
      n: number
    }).n
  db.prepare(
    'INSERT INTO widgets (id, type, title, config, sort_order) VALUES (?, ?, ?, ?, ?)',
  ).run(id, result.type, result.title, JSON.stringify(result.config), next)
  return c.json({ id }, 201)
})

// Must precede '/:id' so the literal isn't captured as an id.
widgets.patch('/reorder', async (c) => {
  const body = await readJson<{ order?: unknown }>(c)
  const order = Array.isArray(body?.order) ? body!.order : null
  if (!order) return c.json({ error: 'order must be an array of ids' }, 400)
  const stmt = db.prepare('UPDATE widgets SET sort_order = ? WHERE id = ?')
  const tx = db.transaction((ids: unknown[]) => {
    ids.forEach((id, i) => {
      if (typeof id === 'string') stmt.run(i, id)
    })
  })
  tx(order)
  return c.json({ ok: true })
})

widgets.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as
    | WidgetRow
    | undefined
  if (!existing) return c.json({ error: 'not found' }, 404)

  const body = await readJson<Record<string, unknown>>(c)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)

  // Type is fixed after creation; merge title/config over the existing widget.
  const merged = {
    type: existing.type,
    title: 'title' in body ? body.title : existing.title,
    config: 'config' in body ? body.config : JSON.parse(existing.config),
  }
  const result = validateWidget(merged)
  if (!result.ok) return c.json({ error: result.error }, 400)

  db.prepare('UPDATE widgets SET title = ?, config = ? WHERE id = ?').run(
    result.title,
    JSON.stringify(result.config),
    id,
  )
  return c.json({ ok: true })
})

widgets.delete('/:id', (c) => {
  db.prepare('DELETE FROM widgets WHERE id = ?').run(c.req.param('id'))
  return c.body(null, 204)
})
