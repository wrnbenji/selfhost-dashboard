import { db, getSetting, type ServiceRow } from './db.js'
import { containerStats } from './docker.js'
import { onCheck } from './notify.js'
import { setCardStats } from './stats-store.js'
import { publish } from './sse.js'

const DOCKER_PREFIX = 'docker:'

const TIMEOUT_MS = 5000

async function probe(url: string): Promise<{ status: 'online' | 'offline'; latency: number }> {
  const start = performance.now()
  const tryFetch = async (method: 'HEAD' | 'GET') => {
    return fetch(url, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    })
  }

  try {
    const res = await tryFetch('HEAD')
    const latency = Math.round(performance.now() - start)
    if (res.status > 0 && res.status < 500) return { status: 'online', latency }
    return { status: 'offline', latency }
  } catch {
    try {
      const res = await tryFetch('GET')
      const latency = Math.round(performance.now() - start)
      return {
        status: res.status > 0 && res.status < 500 ? 'online' : 'offline',
        latency,
      }
    } catch {
      return { status: 'offline', latency: Math.round(performance.now() - start) }
    }
  }
}

async function checkAll() {
  const rows = db
    .prepare('SELECT id, name, url FROM services WHERE enabled = 1')
    .all() as Pick<ServiceRow, 'id' | 'name' | 'url'>[]

  const updateService = db.prepare(
    'UPDATE services SET status = ?, last_check = ?, last_latency_ms = ? WHERE id = ?',
  )
  const insertCheck = db.prepare(
    'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
  )

  await Promise.allSettled(
    rows.map(async (row) => {
      if (!row.url) return
      const { status, latency } = await probe(row.url)
      const ts = Date.now()
      const lat = status === 'online' ? latency : null
      updateService.run(status, ts, lat, row.id)
      insertCheck.run(row.id, ts, status, lat)
      publish('status', { id: row.id, status, last_check: ts, last_latency_ms: lat })
      onCheck(row.id, row.name, row.url, status)

      // Live CPU/RAM for Docker-backed services — piggybacks this loop (no extra
      // timer), runs in parallel with the other probes, and never blocks them.
      if (row.id.startsWith(DOCKER_PREFIX)) {
        const stats = await containerStats(row.id.slice(DOCKER_PREFIX.length))
        if (stats) {
          setCardStats(row.id, stats)
          publish('stats', {
            id: row.id,
            cpu_pct: stats.cpu_pct,
            mem_used_bytes: stats.mem_used_bytes,
          })
        }
      }
    }),
  )
}

function pruneOldChecks() {
  const days = Number(getSetting('retention_days') ?? '7')
  const cutoff = Date.now() - days * 86_400_000
  db.prepare('DELETE FROM checks WHERE ts < ?').run(cutoff)
}

export function startHealthChecks(intervalMs = 30000) {
  // Guard against overlapping runs if a tick's probes outlast the interval.
  let running = false
  const tick = () => {
    if (running) return
    running = true
    checkAll()
      .catch((e) => console.warn('[health]', e))
      .finally(() => {
        running = false
      })
  }

  tick()
  const ticker = setInterval(tick, intervalMs)

  // prune every hour
  const pruner = setInterval(pruneOldChecks, 3_600_000)
  pruneOldChecks()

  return () => {
    clearInterval(ticker)
    clearInterval(pruner)
  }
}
