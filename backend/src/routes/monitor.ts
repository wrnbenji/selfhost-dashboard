import { Hono } from 'hono'
import {
  computeGaps,
  coverageMs,
  getCurrentSessionId,
  listSessions,
} from '../monitor.js'

export const monitor = new Hono()

const WINDOWS: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
}

function windowMs(w: string | undefined): number {
  return WINDOWS[w ?? '24h'] ?? WINDOWS['24h']
}

monitor.get('/', (c) => {
  const w = c.req.query('window') ?? '24h'
  const ms = windowMs(w)
  const now = Date.now()
  const since = now - ms

  const sessions = listSessions(since)
  const gaps = computeGaps(since, now)
  const coverage = coverageMs(since, now)

  const currentId = getCurrentSessionId()
  const current = sessions.find((s) => s.id === currentId) ?? null

  return c.json({
    window: w,
    now,
    current_session: current
      ? {
          id: current.id,
          started_at: current.started_at,
          uptime_ms: now - current.started_at,
        }
      : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      last_seen_at: s.last_seen_at,
      duration_ms: (s.ended_at ?? s.last_seen_at) - s.started_at,
      crashed: s.id !== currentId && s.ended_at === null,
    })),
    gaps,
    coverage_pct: (coverage / ms) * 100,
    coverage_ms: coverage,
    gap_count: gaps.length,
    total_gap_ms: gaps.reduce((a, g) => a + g.duration_ms, 0),
  })
})
