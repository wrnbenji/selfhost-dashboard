import type { ContainerStats } from './docker.js'

/** Compact resource snapshot kept per service for the dashboard cards. */
export interface CardStats {
  cpu_pct: number
  mem_used_bytes: number
}

// Latest CPU/RAM per service id, refreshed by the health-check loop. In-memory by
// design — it's live telemetry, not history; a restart simply re-fills it.
const latest = new Map<string, CardStats>()

export function setCardStats(id: string, stats: ContainerStats): void {
  latest.set(id, { cpu_pct: stats.cpu_pct, mem_used_bytes: stats.mem_used_bytes })
}

export function getAllCardStats(): Record<string, CardStats> {
  return Object.fromEntries(latest)
}

export function forgetCardStats(id: string): void {
  latest.delete(id)
}
