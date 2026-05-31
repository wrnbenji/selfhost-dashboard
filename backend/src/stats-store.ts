import type { ContainerStats } from './docker.js'

/** Compact resource snapshot kept per service for the dashboard cards. */
export interface CardStats {
  cpu_pct: number
  mem_used_bytes: number
}

export interface StatsHistory {
  cpu: number[]
  mem: number[]
}

// ~30 min of trend at the 30s health-check cadence.
const MAX_HISTORY = 60

// Latest CPU/RAM per service id + a short rolling history, refreshed by the
// health-check loop. In-memory by design — live telemetry, not durable history;
// a restart simply re-fills it.
const latest = new Map<string, CardStats>()
const history = new Map<string, StatsHistory>()

export function setCardStats(id: string, stats: ContainerStats): void {
  latest.set(id, { cpu_pct: stats.cpu_pct, mem_used_bytes: stats.mem_used_bytes })

  const h = history.get(id) ?? { cpu: [], mem: [] }
  h.cpu.push(stats.cpu_pct)
  h.mem.push(stats.mem_used_bytes)
  if (h.cpu.length > MAX_HISTORY) h.cpu.shift()
  if (h.mem.length > MAX_HISTORY) h.mem.shift()
  history.set(id, h)
}

export function getAllCardStats(): Record<string, CardStats> {
  return Object.fromEntries(latest)
}

export function getStatsHistory(id: string): StatsHistory {
  return history.get(id) ?? { cpu: [], mem: [] }
}

export function forgetCardStats(id: string): void {
  latest.delete(id)
  history.delete(id)
}
