import { db } from './db.js'

export interface MonitorSession {
  id: number
  started_at: number
  last_seen_at: number
  /** null = currently running OR crashed (use last_seen_at as effective end) */
  ended_at: number | null
}

export interface MonitorGap {
  /** end of previous session (ended_at or last_seen_at if crashed) */
  start: number
  /** start of next session */
  end: number
  duration_ms: number
  /** true when the previous session crashed (no graceful shutdown) */
  crashed: boolean
}

let currentSessionId: number | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let shuttingDown = false

export function startMonitorSession(heartbeatMs = 10_000): number {
  const now = Date.now()
  const res = db
    .prepare(
      'INSERT INTO monitor_sessions (started_at, last_seen_at) VALUES (?, ?)',
    )
    .run(now, now)
  currentSessionId = Number(res.lastInsertRowid)

  const beat = () => {
    if (currentSessionId === null || shuttingDown) return
    db.prepare('UPDATE monitor_sessions SET last_seen_at = ? WHERE id = ?').run(
      Date.now(),
      currentSessionId,
    )
  }
  beat()
  heartbeatTimer = setInterval(beat, heartbeatMs)
  return currentSessionId
}

export function endMonitorSession() {
  if (currentSessionId === null || shuttingDown) return
  shuttingDown = true
  const now = Date.now()
  db.prepare(
    'UPDATE monitor_sessions SET ended_at = ?, last_seen_at = ? WHERE id = ?',
  ).run(now, now, currentSessionId)
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

export function getCurrentSessionId(): number | null {
  return currentSessionId
}

export function listSessions(sinceMs?: number): MonitorSession[] {
  if (sinceMs !== undefined) {
    return db
      .prepare(
        'SELECT * FROM monitor_sessions WHERE last_seen_at >= ? OR started_at >= ? ORDER BY started_at ASC',
      )
      .all(sinceMs, sinceMs) as MonitorSession[]
  }
  return db
    .prepare('SELECT * FROM monitor_sessions ORDER BY started_at ASC')
    .all() as MonitorSession[]
}

/**
 * Build the list of gaps (periods when no dashboard session was active)
 * within [windowStart, windowEnd].
 *
 * A session that has no `ended_at` is treated as having ended at `last_seen_at`
 * (crashed). The currently-running session is excluded from "crashed" — its end
 * is `windowEnd`.
 */
export function computeGaps(
  windowStart: number,
  windowEnd: number,
  /** sessions inferred to be crashed end this many ms after their last heartbeat */
  graceMs = 30_000,
): MonitorGap[] {
  const sessions = listSessions(windowStart)
  if (sessions.length === 0) {
    return [{ start: windowStart, end: windowEnd, duration_ms: windowEnd - windowStart, crashed: false }]
  }

  const gaps: MonitorGap[] = []
  let cursor = windowStart

  for (const s of sessions) {
    const sessionStart = Math.max(windowStart, s.started_at)
    if (sessionStart > cursor) {
      // there is a gap before this session
      gaps.push({
        start: cursor,
        end: sessionStart,
        duration_ms: sessionStart - cursor,
        crashed: false,
      })
    }
    // advance cursor past this session
    const effectiveEnd =
      s.id === currentSessionId
        ? windowEnd
        : s.ended_at ?? s.last_seen_at + graceMs
    cursor = Math.max(cursor, Math.min(windowEnd, effectiveEnd))
    if (cursor >= windowEnd) break
  }

  // trailing gap after last session ended
  if (cursor < windowEnd) {
    gaps.push({
      start: cursor,
      end: windowEnd,
      duration_ms: windowEnd - cursor,
      crashed: true,
    })
  }

  return gaps
}

/** total coverage ms within window */
export function coverageMs(windowStart: number, windowEnd: number): number {
  const totalWindow = windowEnd - windowStart
  const gaps = computeGaps(windowStart, windowEnd)
  const gapMs = gaps.reduce((acc, g) => acc + g.duration_ms, 0)
  return Math.max(0, totalWindow - gapMs)
}

/** earliest monitor session start ever recorded, or null if none exist */
export function firstSessionStart(): number | null {
  const row = db
    .prepare('SELECT MIN(started_at) AS first FROM monitor_sessions')
    .get() as { first: number | null }
  return row.first
}

/**
 * Coverage over [windowStart, windowEnd] that does not penalise time before the
 * monitor first existed. The effective window starts at the later of
 * `windowStart` and the first-ever session start, so a brand-new install reports
 * ~100% (no gaps since it started) instead of ~0% (most of the window predates
 * the dashboard). Real gaps that occur after the monitor's birth still count.
 */
export function coverage(
  windowStart: number,
  windowEnd: number,
): { pct: number; ms: number; effective_start: number } {
  const first = firstSessionStart()
  const effStart = first === null ? windowStart : Math.max(windowStart, first)
  const denom = windowEnd - effStart
  const ms = coverageMs(effStart, windowEnd)
  const pct = denom <= 0 ? 100 : (ms / denom) * 100
  return { pct, ms, effective_start: effStart }
}

/** does this time range fall (mostly) inside a known gap? */
export function inGap(
  start: number,
  end: number,
  gaps: MonitorGap[],
  threshold = 0.5,
): boolean {
  const range = end - start
  if (range <= 0) return false
  let overlap = 0
  for (const g of gaps) {
    const s = Math.max(g.start, start)
    const e = Math.min(g.end, end)
    if (e > s) overlap += e - s
  }
  return overlap / range >= threshold
}
