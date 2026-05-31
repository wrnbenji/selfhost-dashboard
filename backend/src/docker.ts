import { request } from 'node:http'
import { existsSync } from 'node:fs'
import { isValidHttpUrl } from './validate.js'

const SOCKET_PATH = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'

interface ContainerSummary {
  Id: string
  Names: string[]
  Labels: Record<string, string> | null
  State: string
}

export interface DiscoveredService {
  id: string
  name: string
  url: string
  icon: string | null
  description: string | null
  category: string | null
}

export function dockerAvailable(): boolean {
  return existsSync(SOCKET_PATH)
}

function getJSON<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath: SOCKET_PATH, path, method: 'GET' },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`docker ${path} → ${res.statusCode}: ${body}`))
            return
          }
          try {
            resolve(JSON.parse(body) as T)
          } catch (e) {
            reject(e)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export async function listContainers(): Promise<ContainerSummary[]> {
  return getJSON<ContainerSummary[]>('/containers/json?all=false')
}

interface ContainerInspect {
  Id: string
  State: { StartedAt: string; Status: string; Running: boolean }
}

export async function inspectContainer(
  shortId: string,
): Promise<{ started_at: number | null; status: string | null } | null> {
  if (!dockerAvailable()) return null
  try {
    const c = await getJSON<ContainerInspect>(`/containers/${shortId}/json`)
    const ts = c.State?.StartedAt ? Date.parse(c.State.StartedAt) : NaN
    return {
      started_at: Number.isFinite(ts) ? ts : null,
      status: c.State?.Status ?? null,
    }
  } catch {
    return null
  }
}

interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] }
    system_cpu_usage?: number
    online_cpus?: number
  }
  precpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
  }
  memory_stats?: {
    usage?: number
    limit?: number
    stats?: { inactive_file?: number; total_inactive_file?: number; cache?: number }
  }
}

export interface ContainerStats {
  cpu_pct: number
  mem_used_bytes: number
  mem_limit_bytes: number
  mem_pct: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Pure: turn a Docker `/stats?stream=false` sample into CPU% and memory usage.
 * Mirrors the docker CLI math (CPU delta over system delta × cores; memory minus
 * the inactive-file cache). Returns null when the sample has no usable data — e.g.
 * a stopped container.
 */
export function computeStats(raw: RawStats): ContainerStats | null {
  const cpuTotal = raw.cpu_stats?.cpu_usage?.total_usage
  const usage = raw.memory_stats?.usage
  if (cpuTotal === undefined || usage === undefined) return null

  const cpuDelta = cpuTotal - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0)
  const cores =
    raw.cpu_stats?.online_cpus ?? raw.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1
  const cpu_pct =
    systemDelta > 0 && cpuDelta > 0 ? round1((cpuDelta / systemDelta) * cores * 100) : 0

  const mstats = raw.memory_stats?.stats ?? {}
  const inactive = mstats.total_inactive_file ?? mstats.inactive_file ?? 0
  const mem_used_bytes = Math.max(0, usage - inactive)
  const mem_limit_bytes = raw.memory_stats?.limit ?? 0
  const mem_pct = mem_limit_bytes > 0 ? round1((mem_used_bytes / mem_limit_bytes) * 100) : 0

  return { cpu_pct, mem_used_bytes, mem_limit_bytes, mem_pct }
}

/** Fetch a one-shot stats sample for a container and reduce it to ContainerStats. */
export async function containerStats(shortId: string): Promise<ContainerStats | null> {
  if (!dockerAvailable()) return null
  try {
    const raw = await getJSON<RawStats>(`/containers/${shortId}/stats?stream=false`)
    return computeStats(raw)
  } catch {
    return null
  }
}

/**
 * Returns the discovered services, or `null` when discovery could not run
 * (no socket / Docker API error). `null` is distinct from `[]` ("ran fine,
 * nothing matched") so callers never mistake an outage for "remove everything".
 */
export async function discoverFromLabels(): Promise<DiscoveredService[] | null> {
  if (!dockerAvailable()) return null
  let containers: ContainerSummary[]
  try {
    containers = await listContainers()
  } catch (e) {
    console.warn('[docker] discovery failed:', (e as Error).message)
    return null
  }
  return containers
    .filter((c) => c.Labels?.['dashboard.enable'] === 'true')
    .map((c) => {
      const labels = c.Labels ?? {}
      return {
        id: `docker:${c.Id.slice(0, 12)}`,
        name: labels['dashboard.name'] || c.Names[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
        url: labels['dashboard.url'] || '',
        icon: labels['dashboard.icon'] || null,
        description: labels['dashboard.description'] || null,
        category: labels['dashboard.category'] || null,
      }
    })
    .filter((s) => isValidHttpUrl(s.url))
}
