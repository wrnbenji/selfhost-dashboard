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
