import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// set DB_PATH BEFORE importing modules that touch the db
const tmp = mkdtempSync(join(tmpdir(), 'selfhost-test-'))
process.env.DB_PATH = join(tmp, 'test.db')
process.env.YAML_PATH = join(tmp, 'nope.yaml')
// point at a socket that cannot exist so dockerAvailable() is deterministically false
process.env.DOCKER_SOCKET = join(tmp, 'no-docker.sock')

const { createApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')

const app = createApp({ enableLogger: false, serveStaticDir: null })

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://t${path}`, init))
}

async function postJSON(path: string, body: unknown) {
  return req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function patchJSON(path: string, body: unknown) {
  return req(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function resetTables() {
  db.exec('DELETE FROM checks; DELETE FROM services; DELETE FROM monitor_sessions;')
}

before(() => {
  resetTables()
})

after(() => {
  db.close()
  rmSync(tmp, { recursive: true, force: true })
})

beforeEach(() => {
  resetTables()
})

describe('GET /api/health', () => {
  test('returns ok', async () => {
    const r = await req('/api/health')
    assert.equal(r.status, 200)
    const body = (await r.json()) as { ok: boolean; ts: number }
    assert.equal(body.ok, true)
    assert.ok(body.ts > 0)
  })
})

describe('services CRUD', () => {
  test('list empty', async () => {
    const r = await req('/api/services')
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), [])
  })

  test('create + list returns row', async () => {
    const r = await postJSON('/api/services', {
      name: 'Plex',
      url: 'http://example.com',
      category: 'Media',
    })
    assert.equal(r.status, 201)
    const { id } = (await r.json()) as { id: string }
    assert.ok(id)

    const list = (await (await req('/api/services')).json()) as {
      id: string
      name: string
      category: string
    }[]
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'Plex')
    assert.equal(list[0].category, 'Media')
  })

  test('patch updates fields', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }

    const r = await patchJSON(`/api/services/${id}`, {
      name: 'Renamed',
      category: 'Other',
    })
    assert.equal(r.status, 200)

    const list = (await (await req('/api/services')).json()) as { name: string; category: string }[]
    assert.equal(list[0].name, 'Renamed')
    assert.equal(list[0].category, 'Other')
  })

  test('delete removes row', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }

    const r = await req(`/api/services/${id}`, { method: 'DELETE' })
    assert.equal(r.status, 204)
    const list = await (await req('/api/services')).json()
    assert.deepEqual(list, [])
  })

  test('reorder persists sort_order', async () => {
    const a = (await (
      await postJSON('/api/services', { name: 'A', url: 'http://a' })
    ).json()) as { id: string }
    const b = (await (
      await postJSON('/api/services', { name: 'B', url: 'http://b' })
    ).json()) as { id: string }

    const r = await patchJSON('/api/services/reorder', { order: [b.id, a.id] })
    assert.equal(r.status, 200)

    const list = (await (await req('/api/services')).json()) as {
      id: string
      sort_order: number
    }[]
    const map = Object.fromEntries(list.map((s) => [s.id, s.sort_order]))
    assert.equal(map[b.id], 0)
    assert.equal(map[a.id], 1)
  })
})

describe('settings', () => {
  test('defaults to 7 days', async () => {
    db.exec("DELETE FROM settings; INSERT INTO settings (key, value) VALUES ('retention_days', '7')")
    const r = await req('/api/settings')
    const body = (await r.json()) as { retention_days: number }
    assert.equal(body.retention_days, 7)
  })

  test('PATCH accepts 1, 7, 30 and rejects others', async () => {
    for (const v of [1, 7, 30]) {
      const r = await patchJSON('/api/settings', { retention_days: v })
      assert.equal(r.status, 200)
      const body = (await r.json()) as { retention_days: number }
      assert.equal(body.retention_days, v)
    }
    const bad = await patchJSON('/api/settings', { retention_days: 5 })
    assert.equal(bad.status, 400)
  })

  test('PATCH retention prunes old checks immediately', async () => {
    // seed a 10-day-old check + a fresh one
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const oldTs = Date.now() - 10 * 86_400_000
    const freshTs = Date.now() - 60_000
    insert.run('svc1', oldTs, 'online', 100)
    insert.run('svc1', freshTs, 'online', 100)
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM checks').get() as { c: number }).c,
      2,
    )

    await patchJSON('/api/settings', { retention_days: 7 })

    const remaining = (
      db.prepare('SELECT ts FROM checks ORDER BY ts').all() as { ts: number }[]
    ).map((r) => r.ts)
    assert.deepEqual(remaining, [freshTs])
  })
})

describe('stats aggregate', () => {
  function seed(serviceId: string, samples: Array<['online' | 'offline', number | null]>) {
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    samples.forEach(([status, latency], i) => {
      insert.run(serviceId, now - (samples.length - i) * 1000, status, latency)
    })
  }

  test('returns null fields when no checks', async () => {
    const r = await req('/api/stats?window=24h')
    const body = (await r.json()) as {
      uptime_pct: number | null
      check_count: number
    }
    assert.equal(body.uptime_pct, null)
    assert.equal(body.check_count, 0)
  })

  test('computes uptime % across all services', async () => {
    seed('s1', [
      ['online', 100],
      ['online', 110],
      ['offline', null],
      ['online', 120],
    ])
    const r = await req('/api/stats?window=24h')
    const body = (await r.json()) as { uptime_pct: number; check_count: number }
    assert.equal(body.check_count, 4)
    assert.equal(Math.round(body.uptime_pct), 75)
  })

  test('computes avg + p95 latency for online checks only', async () => {
    seed('s1', [
      ['online', 100],
      ['online', 200],
      ['online', 300],
      ['offline', null], // should be ignored for latency
      ['online', 1000],
    ])
    const r = await req('/api/stats?window=24h')
    const body = (await r.json()) as { avg_latency: number; p95_latency: number }
    assert.equal(body.avg_latency, 400) // (100+200+300+1000)/4
    assert.equal(body.p95_latency, 1000)
  })

  test('counts incidents (online → offline transitions)', async () => {
    seed('s1', [
      ['online', 100],
      ['offline', null], // incident 1 starts
      ['offline', null],
      ['online', 110],
      ['online', 120],
      ['offline', null], // incident 2 starts
      ['online', 130],
    ])
    const r = await req('/api/stats?window=24h')
    const body = (await r.json()) as { incident_count: number }
    assert.equal(body.incident_count, 2)
  })

  test('respects window — old checks outside window are excluded', async () => {
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    insert.run('s1', Date.now() - 7200_000, 'online', 100) // 2h ago — outside 1h window
    insert.run('s1', Date.now() - 60_000, 'offline', null) // 1min ago — inside

    const r = await req('/api/stats?window=1h')
    const body = (await r.json()) as { check_count: number; uptime_pct: number }
    assert.equal(body.check_count, 1)
    assert.equal(body.uptime_pct, 0)
  })
})

describe('runtime endpoint', () => {
  async function createService(name: string, status: 'online' | 'offline' = 'online') {
    const { id } = (await (
      await postJSON('/api/services', { name, url: `http://${name}` })
    ).json()) as { id: string }
    db.prepare('UPDATE services SET status = ? WHERE id = ?').run(status, id)
    return id
  }

  test('404 for unknown id', async () => {
    const r = await req('/api/services/nope/runtime')
    assert.equal(r.status, 404)
  })

  test('returns nulls when service has no check history', async () => {
    const id = await createService('A', 'online')
    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as {
      status_since: number | null
      status_duration_ms: number | null
      total_checks: number
    }
    assert.equal(body.status_since, null)
    assert.equal(body.status_duration_ms, null)
    assert.equal(body.total_checks, 0)
  })

  test('status_since = first online check after the last offline', async () => {
    const id = await createService('B', 'online')
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const t0 = Date.now() - 10_000
    insert.run(id, t0, 'online', 100) // earlier online — should NOT be the answer
    insert.run(id, t0 + 1000, 'offline', null) // last offline transition
    insert.run(id, t0 + 2000, 'online', 110) // ← first online after, status_since
    insert.run(id, t0 + 3000, 'online', 120)

    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as { status_since: number; status_duration_ms: number }
    assert.equal(body.status_since, t0 + 2000)
    assert.ok(body.status_duration_ms >= 5000)
  })

  test('never differed → status_since = first check', async () => {
    const id = await createService('C', 'online')
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const t0 = Date.now() - 5_000
    insert.run(id, t0, 'online', 100)
    insert.run(id, t0 + 1000, 'online', 110)
    insert.run(id, t0 + 2000, 'online', 120)

    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as { status_since: number; total_checks: number }
    assert.equal(body.status_since, t0)
    assert.equal(body.total_checks, 3)
  })

  test('non-docker service returns null for container fields', async () => {
    const id = await createService('D', 'online')
    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as {
      container_started_at: number | null
      container_state: string | null
    }
    assert.equal(body.container_started_at, null)
    assert.equal(body.container_state, null)
  })

  test('extended fields: last_online, last_offline, incident_count, streaks, avg latency', async () => {
    const id = await createService('E', 'online')
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const t0 = Date.now() - 60_000
    insert.run(id, t0, 'online', 100)
    insert.run(id, t0 + 5_000, 'online', 150)
    insert.run(id, t0 + 10_000, 'offline', null) // incident 1
    insert.run(id, t0 + 15_000, 'offline', null)
    insert.run(id, t0 + 20_000, 'online', 200) // recover (longest online run starts here, continues to now)
    insert.run(id, t0 + 25_000, 'online', 250)

    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as {
      last_online_at: number
      last_offline_at: number
      incident_count: number
      longest_uptime_ms: number
      longest_downtime_ms: number
      avg_latency_ms: number
    }
    assert.equal(body.last_online_at, t0 + 25_000)
    assert.equal(body.last_offline_at, t0 + 15_000)
    assert.equal(body.incident_count, 1)
    assert.equal(body.longest_downtime_ms, 10_000) // t0+10 → t0+20
    assert.ok(body.longest_uptime_ms >= 30_000) // recovery to "now"
    assert.equal(body.avg_latency_ms, 175) // (100+150+200+250)/4
  })
})

describe('monitor sessions + gaps', () => {
  const HOUR = 3_600_000

  function seedSession(startedAt: number, endedAt: number | null, lastSeen?: number) {
    const ls = lastSeen ?? endedAt ?? startedAt
    db.prepare(
      'INSERT INTO monitor_sessions (started_at, last_seen_at, ended_at) VALUES (?, ?, ?)',
    ).run(startedAt, ls, endedAt)
  }

  test('no sessions → entire window is a gap', async () => {
    const r = await req('/api/monitor?window=1h')
    const body = (await r.json()) as {
      gaps: { duration_ms: number }[]
      coverage_pct: number
    }
    assert.equal(body.gaps.length, 1)
    assert.equal(Math.round(body.coverage_pct), 0)
  })

  test('one clean session + one gap before it', async () => {
    const now = Date.now()
    // session ran from -45m to -15m, then a 15m gap till now
    seedSession(now - 45 * 60_000, now - 15 * 60_000)
    const r = await req('/api/monitor?window=1h')
    const body = (await r.json()) as {
      sessions: { duration_ms: number; crashed: boolean }[]
      gaps: { duration_ms: number }[]
      coverage_pct: number
    }
    assert.equal(body.sessions.length, 1)
    assert.equal(body.sessions[0].crashed, false)
    // gaps: leading [0..-45m] (15m) + trailing [-15m..now] (15m)
    const totalGap = body.gaps.reduce((a, g) => a + g.duration_ms, 0)
    // ~30 min of gap in a 60 min window → ~50%
    assert.ok(Math.abs(body.coverage_pct - 50) < 5)
    assert.ok(totalGap > 25 * 60_000)
    assert.ok(totalGap < 35 * 60_000)
  })

  test('session with ended_at=null and old last_seen treated as crashed', async () => {
    const now = Date.now()
    seedSession(now - 30 * 60_000, null, now - 20 * 60_000)
    const r = await req('/api/monitor?window=1h')
    const body = (await r.json()) as {
      sessions: { crashed: boolean }[]
      gaps: { duration_ms: number }[]
    }
    assert.equal(body.sessions[0].crashed, true)
    // trailing gap from ~ -20m to now ≈ 20 min
    assert.ok(body.gaps.some((g) => g.duration_ms > 15 * 60_000))
  })

  test('stats include coverage_pct', async () => {
    const now = Date.now()
    seedSession(now - HOUR, now) // full coverage
    const r = await req('/api/stats?window=1h')
    const body = (await r.json()) as { coverage_pct: number }
    assert.ok(body.coverage_pct > 95)
  })

  test('overview timeline marks empty buckets that overlap a gap as gap=true', async () => {
    const now = Date.now()
    // no sessions at all → whole window is gap
    const r = await req('/api/stats/overview/timeline?window=1h&buckets=12')
    const body = (await r.json()) as {
      buckets: { gap: boolean; uptime: number | null }[]
    }
    assert.ok(body.buckets.every((b) => b.gap === true))
  })

  test('service timeline buckets use gap status when no checks AND in gap', async () => {
    const id = (await (
      await postJSON('/api/services', { name: 'A', url: 'http://a' })
    ).json()).id as string
    // no sessions, no checks → buckets should be 'gap'
    const r = await req(`/api/stats/service/${id}/timeline?window=1h&buckets=12`)
    const body = (await r.json()) as { buckets: { status: string }[] }
    assert.ok(body.buckets.every((b) => b.status === 'gap'))
  })

  test('runtime.monitor_downtime_in_status_ms reflects gaps inside the current state period', async () => {
    const id = (await (
      await postJSON('/api/services', { name: 'B', url: 'http://b' })
    ).json()).id as string
    db.prepare('UPDATE services SET status = ? WHERE id = ?').run('online', id)

    const t0 = Date.now() - HOUR
    db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    ).run(id, t0, 'online', 100)

    // dashboard was up for first 30 min after t0, then nothing
    seedSession(t0, t0 + 30 * 60_000)

    const r = await req(`/api/services/${id}/runtime`)
    const body = (await r.json()) as {
      monitor_downtime_in_status_ms: number
      status_duration_ms: number
    }
    // there's ~30 min of unmonitored time within the "Up for ~1h" window
    assert.ok(body.monitor_downtime_in_status_ms > 25 * 60_000)
    assert.ok(body.monitor_downtime_in_status_ms < body.status_duration_ms)
  })
})

describe('enable / disable', () => {
  test('PATCH enabled=false hides from default list, surfaces with include_disabled=1', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }

    const visible1 = (await (await req('/api/services')).json()) as unknown[]
    assert.equal(visible1.length, 1)

    await patchJSON(`/api/services/${id}`, { enabled: false })

    const visible2 = (await (await req('/api/services')).json()) as unknown[]
    assert.equal(visible2.length, 0)

    const withDisabled = (await (
      await req('/api/services?include_disabled=1')
    ).json()) as { id: string; enabled: number }[]
    assert.equal(withDisabled.length, 1)
    assert.equal(withDisabled[0].enabled, 0)
  })

  test('PATCH enabled=true re-enables', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'Y', url: 'http://y' })
    ).json()) as { id: string }
    await patchJSON(`/api/services/${id}`, { enabled: false })
    await patchJSON(`/api/services/${id}`, { enabled: true })

    const visible = (await (await req('/api/services')).json()) as unknown[]
    assert.equal(visible.length, 1)
  })
})

describe('per-service stats + timeline', () => {
  test('GET /api/stats/service/:id returns scoped stats', async () => {
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    insert.run('a', now - 1000, 'online', 50)
    insert.run('a', now - 500, 'online', 60)
    insert.run('b', now - 800, 'offline', null) // different service

    const r = await req('/api/stats/service/a?window=24h')
    const body = (await r.json()) as {
      id: string
      check_count: number
      uptime_pct: number
    }
    assert.equal(body.id, 'a')
    assert.equal(body.check_count, 2)
    assert.equal(body.uptime_pct, 100)
  })

  test('timeline returns N buckets with status classification', async () => {
    // simulate a continuously-running monitor session covering the window
    const now = Date.now()
    db.prepare(
      'INSERT INTO monitor_sessions (started_at, last_seen_at, ended_at) VALUES (?, ?, ?)',
    ).run(now - 3_600_000, now, null)

    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    insert.run('a', now - 2_000, 'online', 100)
    insert.run('a', now - 1_500, 'online', 110)

    const r = await req('/api/stats/service/a/timeline?window=1h&buckets=12')
    const body = (await r.json()) as {
      buckets: { t: number; status: string }[]
    }
    assert.equal(body.buckets.length, 12)
    // some bucket should be 'online'; the rest are 'none' (monitor ran, no checks)
    const statuses = new Set(body.buckets.map((b) => b.status))
    assert.ok(statuses.has('online'))
    assert.ok(statuses.has('none'))
    assert.ok(!statuses.has('gap'))
  })

  test('incidents endpoint pairs offline→online into durations', async () => {
    const insert = db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    )
    const t0 = Date.now() - 60_000
    insert.run('a', t0, 'online', 100)
    insert.run('a', t0 + 5_000, 'offline', null)
    insert.run('a', t0 + 10_000, 'offline', null)
    insert.run('a', t0 + 15_000, 'online', 110)

    const r = await req('/api/stats/service/a/incidents?window=24h')
    const body = (await r.json()) as {
      incidents: { start: number; end: number | null; duration_ms: number }[]
    }
    assert.equal(body.incidents.length, 1)
    assert.equal(body.incidents[0].duration_ms, 10_000)
  })
})

describe('url validation', () => {
  test('isValidHttpUrl accepts http/https and rejects everything else', async () => {
    const { isValidHttpUrl } = await import('../src/validate.js')
    assert.equal(isValidHttpUrl('http://x'), true)
    assert.equal(isValidHttpUrl('https://x.example.com:8080/path?q=1'), true)
    assert.equal(isValidHttpUrl('file:///etc/passwd'), false)
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false)
    assert.equal(isValidHttpUrl('ftp://host/x'), false)
    assert.equal(isValidHttpUrl(''), false)
    assert.equal(isValidHttpUrl('not a url'), false)
    // @ts-expect-error runtime guard for non-strings
    assert.equal(isValidHttpUrl(null), false)
  })
})

describe('service input validation', () => {
  test('rejects create with missing name', async () => {
    const r = await postJSON('/api/services', { url: 'http://x' })
    assert.equal(r.status, 400)
  })

  test('rejects create with empty/whitespace name', async () => {
    const r = await postJSON('/api/services', { name: '   ', url: 'http://x' })
    assert.equal(r.status, 400)
  })

  test('rejects create with non-http(s) url', async () => {
    const r = await postJSON('/api/services', { name: 'X', url: 'file:///etc/passwd' })
    assert.equal(r.status, 400)
  })

  test('rejects malformed JSON body with 400 (not unhandled 500)', async () => {
    const r = await req('/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })
    assert.equal(r.status, 400)
  })

  test('rejects patch setting url to a non-http(s) scheme', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }
    const r = await patchJSON(`/api/services/${id}`, { url: 'javascript:alert(1)' })
    assert.equal(r.status, 400)
  })

  test('rejects patch clearing name to empty', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }
    const r = await patchJSON(`/api/services/${id}`, { name: '' })
    assert.equal(r.status, 400)
  })
})

describe('docker discovery resilience', () => {
  test('does not remove docker services when discovery is unavailable', async () => {
    const { syncDockerServices } = await import('../src/discovery.js')
    db.prepare(
      "INSERT INTO services (id, name, url) VALUES ('docker:abc123', 'Cached', 'http://x')",
    ).run()

    // socket does not exist → discoverFromLabels signals unavailable, must NOT wipe
    const r = await syncDockerServices()
    assert.equal(r.removed, 0)
    const row = db
      .prepare("SELECT id FROM services WHERE id = 'docker:abc123'")
      .get()
    assert.ok(row, 'cached docker service should survive a failed discovery pass')
  })
})

describe('unknown api routes', () => {
  test('unknown /api path returns JSON 404, not HTML', async () => {
    const r = await req('/api/does-not-exist')
    assert.equal(r.status, 404)
    const body = (await r.json()) as { error: string }
    assert.equal(body.error, 'not found')
  })
})

describe('orphaned checks cleanup', () => {
  test('deleting a service removes its checks', async () => {
    const { id } = (await (
      await postJSON('/api/services', { name: 'X', url: 'http://x' })
    ).json()) as { id: string }
    db.prepare(
      'INSERT INTO checks (service_id, ts, status, latency_ms) VALUES (?, ?, ?, ?)',
    ).run(id, Date.now(), 'online', 10)

    await req(`/api/services/${id}`, { method: 'DELETE' })

    const c = (
      db
        .prepare('SELECT COUNT(*) AS c FROM checks WHERE service_id = ?')
        .get(id) as { c: number }
    ).c
    assert.equal(c, 0)
  })
})
