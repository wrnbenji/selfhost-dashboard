import { Hono } from 'hono'
import type { Context } from 'hono'
import { db, type ServiceRow } from '../db.js'
import { inspectContainer } from '../docker.js'
import { computeGaps } from '../monitor.js'
import { forgetService } from '../notify.js'
import { isValidHttpUrl } from '../validate.js'

export const services = new Hono()

/** Parse a JSON body, returning null on malformed input (caller responds 400). */
async function readJson<T>(c: Context): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== ''

/** Delete a service and its check history together (no FK cascade in SQLite here). */
export const deleteServiceCascade = db.transaction((id: string) => {
  db.prepare('DELETE FROM checks WHERE service_id = ?').run(id)
  db.prepare('DELETE FROM services WHERE id = ?').run(id)
})

services.get('/', (c) => {
  const includeDisabled = c.req.query('include_disabled') === '1'
  const sql = includeDisabled
    ? 'SELECT * FROM services ORDER BY sort_order, name'
    : 'SELECT * FROM services WHERE enabled = 1 ORDER BY sort_order, name'
  const rows = db.prepare(sql).all() as ServiceRow[]
  return c.json(rows)
})

services.post('/', async (c) => {
  const body = await readJson<{
    name: string
    url: string
    icon?: string
    description?: string
    category?: string
  }>(c)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)
  if (!isNonEmptyString(body.name)) return c.json({ error: 'name is required' }, 400)
  if (!isValidHttpUrl(body.url))
    return c.json({ error: 'url must be a valid http(s) URL' }, 400)
  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO services (id, name, url, icon, description, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    body.name,
    body.url,
    body.icon ?? null,
    body.description ?? null,
    body.category ?? null,
  )
  return c.json({ id }, 201)
})

// IMPORTANT: register specific routes before parameterised ones
services.patch('/reorder', async (c) => {
  const body = await readJson<{ order: string[] }>(c)
  if (!body || !Array.isArray(body.order))
    return c.json({ error: 'order must be an array of ids' }, 400)
  const stmt = db.prepare('UPDATE services SET sort_order = ? WHERE id = ?')
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, i) => stmt.run(i, id))
  })
  tx(body.order)
  return c.json({ ok: true })
})

services.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await readJson<{
    name?: string
    url?: string
    icon?: string | null
    description?: string | null
    category?: string | null
    enabled?: boolean | number
  }>(c)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)
  // name and url are NOT NULL columns we later fetch() — validate before mutating
  if ('name' in body && !isNonEmptyString(body.name))
    return c.json({ error: 'name must be a non-empty string' }, 400)
  if ('url' in body && !isValidHttpUrl(body.url))
    return c.json({ error: 'url must be a valid http(s) URL' }, 400)
  const fields: string[] = []
  const params: (string | number | null)[] = []
  for (const key of ['name', 'url', 'icon', 'description', 'category'] as const) {
    if (key in body) {
      fields.push(`${key} = ?`)
      params.push(body[key] ?? null)
    }
  }
  if ('enabled' in body && body.enabled !== undefined) {
    fields.push('enabled = ?')
    params.push(body.enabled ? 1 : 0)
  }
  if (fields.length === 0) return c.json({ ok: true })
  params.push(id)
  db.prepare(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return c.json({ ok: true })
})

services.delete('/:id', (c) => {
  const id = c.req.param('id')
  deleteServiceCascade(id)
  forgetService(id)
  return c.body(null, 204)
})

services.get('/:id/runtime', async (c) => {
  const id = c.req.param('id')
  const svc = db
    .prepare('SELECT * FROM services WHERE id = ?')
    .get(id) as ServiceRow | undefined
  if (!svc) return c.json({ error: 'not found' }, 404)

  // find when the current status started: walk back through checks until the status differs
  const currentStatus = svc.status
  const transition = db
    .prepare(
      `SELECT ts FROM checks
       WHERE service_id = ? AND status != ?
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(id, currentStatus) as { ts: number } | undefined

  let statusSince: number | null = null
  if (transition) {
    // first check AFTER the last differing check that matches currentStatus
    const firstAfter = db
      .prepare(
        `SELECT ts FROM checks
         WHERE service_id = ? AND ts > ? AND status = ?
         ORDER BY ts ASC LIMIT 1`,
      )
      .get(id, transition.ts, currentStatus) as { ts: number } | undefined
    statusSince = firstAfter?.ts ?? null
  } else {
    // never differed → use the earliest check ever
    const first = db
      .prepare(
        `SELECT ts FROM checks
         WHERE service_id = ? AND status = ?
         ORDER BY ts ASC LIMIT 1`,
      )
      .get(id, currentStatus) as { ts: number } | undefined
    statusSince = first?.ts ?? null
  }

  const firstSeen = db
    .prepare(
      `SELECT ts FROM checks WHERE service_id = ? ORDER BY ts ASC LIMIT 1`,
    )
    .get(id) as { ts: number } | undefined

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS up,
         AVG(CASE WHEN status = 'online' AND latency_ms IS NOT NULL THEN latency_ms END) AS avg_lat
       FROM checks WHERE service_id = ?`,
    )
    .get(id) as { total: number; up: number; avg_lat: number | null }

  const lastOnline = db
    .prepare(
      `SELECT ts FROM checks
       WHERE service_id = ? AND status = 'online'
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(id) as { ts: number } | undefined

  const lastOffline = db
    .prepare(
      `SELECT ts FROM checks
       WHERE service_id = ? AND status = 'offline'
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(id) as { ts: number } | undefined

  // compute streaks: longest continuous online and offline runs
  const all = db
    .prepare(
      `SELECT ts, status FROM checks WHERE service_id = ? ORDER BY ts ASC`,
    )
    .all(id) as { ts: number; status: string }[]

  let incidents = 0
  let longestOnline = 0
  let longestOffline = 0
  let runStart: number | null = null
  let runStatus: string | null = null
  for (const r of all) {
    if (runStatus !== r.status) {
      // close previous run
      if (runStart !== null && runStatus) {
        const dur = r.ts - runStart
        if (runStatus === 'online') longestOnline = Math.max(longestOnline, dur)
        if (runStatus === 'offline') longestOffline = Math.max(longestOffline, dur)
      }
      if (runStatus === 'online' && r.status === 'offline') incidents++
      runStart = r.ts
      runStatus = r.status
    }
  }
  // close trailing run with "now"
  if (runStart !== null && runStatus) {
    const dur = Date.now() - runStart
    if (runStatus === 'online') longestOnline = Math.max(longestOnline, dur)
    if (runStatus === 'offline') longestOffline = Math.max(longestOffline, dur)
  }

  let container: { started_at: number | null; status: string | null } | null = null
  if (id.startsWith('docker:')) {
    const shortId = id.slice('docker:'.length)
    container = await inspectContainer(shortId)
  }

  const now = Date.now()

  // how much of the current status duration was actually monitored?
  let monitorDowntimeMs: number | null = null
  if (statusSince !== null) {
    const gaps = computeGaps(statusSince, now)
    monitorDowntimeMs = gaps.reduce((acc, g) => acc + g.duration_ms, 0)
  }

  return c.json({
    id,
    current_status: currentStatus,
    status_since: statusSince,
    status_duration_ms: statusSince ? now - statusSince : null,
    monitor_downtime_in_status_ms: monitorDowntimeMs,
    first_seen: firstSeen?.ts ?? null,
    last_online_at: lastOnline?.ts ?? null,
    last_offline_at: lastOffline?.ts ?? null,
    total_checks: totals.total,
    successful_checks: totals.up,
    incident_count: incidents,
    longest_uptime_ms: longestOnline || null,
    longest_downtime_ms: longestOffline || null,
    avg_latency_ms: totals.avg_lat ? Math.round(totals.avg_lat) : null,
    last_latency_ms: svc.last_latency_ms,
    container_started_at: container?.started_at ?? null,
    container_state: container?.status ?? null,
  })
})
