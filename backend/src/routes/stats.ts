import { Hono } from 'hono'
import { db } from '../db.js'
import { computeGaps, coverage, inGap } from '../monitor.js'

export const stats = new Hono()

const WINDOWS: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
}

function windowMs(w: string | undefined): number {
  return WINDOWS[w ?? '24h'] ?? WINDOWS['24h']
}

interface Aggregate {
  uptime_pct: number | null
  avg_latency: number | null
  p95_latency: number | null
  check_count: number
  incident_count: number
}

function aggregate(serviceId: string | null, since: number): Aggregate {
  const where = serviceId
    ? 'WHERE ts >= ? AND service_id = ?'
    : 'WHERE ts >= ?'
  const params: (string | number)[] = serviceId ? [since, serviceId] : [since]

  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS up
       FROM checks ${where}`,
    )
    .get(...params) as { total: number; up: number }

  if (totals.total === 0) {
    return {
      uptime_pct: null,
      avg_latency: null,
      p95_latency: null,
      check_count: 0,
      incident_count: 0,
    }
  }

  const latencies = db
    .prepare(
      `SELECT latency_ms FROM checks
       ${where} AND status = 'online' AND latency_ms IS NOT NULL
       ORDER BY latency_ms`,
    )
    .all(...params) as { latency_ms: number }[]

  let avgLatency: number | null = null
  let p95Latency: number | null = null
  if (latencies.length > 0) {
    const sum = latencies.reduce((acc, r) => acc + r.latency_ms, 0)
    avgLatency = Math.round(sum / latencies.length)
    // nearest-rank percentile, clamped to a valid index
    const rank = Math.min(
      latencies.length - 1,
      Math.max(0, Math.ceil(0.95 * latencies.length) - 1),
    )
    p95Latency = latencies[rank]?.latency_ms ?? null
  }

  // count distinct incidents (transitions from online → offline)
  const rows = db
    .prepare(
      `SELECT status FROM checks ${where} ORDER BY ts`,
    )
    .all(...params) as { status: string }[]
  let incidents = 0
  let prev = 'online'
  for (const r of rows) {
    if (prev === 'online' && r.status === 'offline') incidents++
    prev = r.status
  }

  return {
    uptime_pct: (totals.up / totals.total) * 100,
    avg_latency: avgLatency,
    p95_latency: p95Latency,
    check_count: totals.total,
    incident_count: incidents,
  }
}

stats.get('/', (c) => {
  const w = c.req.query('window')
  const now = Date.now()
  const since = now - windowMs(w)
  const cov = coverage(since, now)
  return c.json({
    window: w ?? '24h',
    ...aggregate(null, since),
    coverage_pct: cov.pct,
    coverage_ms: cov.ms,
  })
})

stats.get('/service/:id', (c) => {
  const id = c.req.param('id')
  const w = c.req.query('window')
  const since = Date.now() - windowMs(w)
  const agg = aggregate(id, since)

  const lastIncident = db
    .prepare(
      `SELECT ts FROM checks
       WHERE service_id = ? AND status = 'offline'
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(id) as { ts: number } | undefined

  return c.json({
    id,
    window: w ?? '24h',
    ...agg,
    last_incident_at: lastIncident?.ts ?? null,
  })
})

stats.get('/service/:id/timeline', (c) => {
  const id = c.req.param('id')
  const w = c.req.query('window') ?? '24h'
  const buckets = Math.min(120, Math.max(12, Number(c.req.query('buckets') ?? '48')))
  const ms = windowMs(w)
  const now = Date.now()
  const since = now - ms
  const bucketMs = ms / buckets
  const gaps = computeGaps(since, now)

  const rows = db
    .prepare(
      `SELECT ts, status FROM checks
       WHERE service_id = ? AND ts >= ?
       ORDER BY ts`,
    )
    .all(id, since) as { ts: number; status: string }[]

  const out: { t: number; status: 'online' | 'offline' | 'mixed' | 'none' | 'gap' }[] = []
  for (let i = 0; i < buckets; i++) {
    const start = since + i * bucketMs
    const end = start + bucketMs
    const slice = rows.filter((r) => r.ts >= start && r.ts < end)
    let status: 'online' | 'offline' | 'mixed' | 'none' | 'gap' = 'none'
    if (slice.length > 0) {
      const ups = slice.filter((r) => r.status === 'online').length
      if (ups === slice.length) status = 'online'
      else if (ups === 0) status = 'offline'
      else status = 'mixed'
    } else if (inGap(start, end, gaps)) {
      status = 'gap'
    }
    out.push({ t: Math.round(start), status })
  }

  return c.json({ id, window: w, buckets: out })
})

stats.get('/overview/timeline', (c) => {
  const w = c.req.query('window') ?? '24h'
  const buckets = Math.min(120, Math.max(12, Number(c.req.query('buckets') ?? '32')))
  const ms = windowMs(w)
  const now = Date.now()
  const since = now - ms
  const bucketMs = ms / buckets
  const gaps = computeGaps(since, now)

  const rows = db
    .prepare(
      `SELECT ts, status FROM checks
       WHERE ts >= ?
       ORDER BY ts`,
    )
    .all(since) as { ts: number; status: string }[]

  const out: { t: number; uptime: number | null; gap: boolean }[] = []
  for (let i = 0; i < buckets; i++) {
    const start = since + i * bucketMs
    const end = start + bucketMs
    let up = 0
    let total = 0
    for (const r of rows) {
      if (r.ts >= start && r.ts < end) {
        total++
        if (r.status === 'online') up++
      }
    }
    out.push({
      t: Math.round(start),
      uptime: total > 0 ? (up / total) * 100 : null,
      gap: total === 0 && inGap(start, end, gaps),
    })
  }
  return c.json({ window: w, buckets: out })
})

stats.get('/service/:id/incidents', (c) => {
  const id = c.req.param('id')
  const w = c.req.query('window') ?? '24h'
  const since = Date.now() - windowMs(w)

  const rows = db
    .prepare(
      `SELECT ts, status FROM checks
       WHERE service_id = ? AND ts >= ?
       ORDER BY ts`,
    )
    .all(id, since) as { ts: number; status: string }[]

  const incidents: { start: number; end: number | null; duration_ms: number | null }[] = []
  let current: { start: number; end: number | null } | null = null
  let prev: string | null = null
  for (const r of rows) {
    if (prev !== 'offline' && r.status === 'offline') {
      current = { start: r.ts, end: null }
    } else if (prev === 'offline' && r.status === 'online' && current) {
      current.end = r.ts
      incidents.push({
        start: current.start,
        end: current.end,
        duration_ms: current.end - current.start,
      })
      current = null
    }
    prev = r.status
  }
  if (current) {
    incidents.push({ start: current.start, end: null, duration_ms: null })
  }

  return c.json({ id, window: w, incidents: incidents.reverse() })
})
