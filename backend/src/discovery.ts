import { db } from './db.js'
import { discoverFromLabels, type DiscoveredService } from './docker.js'
import { discoverFromIngresses } from './kubernetes.js'
import { deleteServiceCascade } from './routes/services.js'
import { publish } from './sse.js'

/**
 * Sync a set of discovered services for one source, identified by its id prefix
 * (e.g. 'docker:' or 'k8s:'). Only rows with that prefix are added/removed, so
 * sources never clobber each other. `discovered === null` means discovery could
 * not run — do nothing rather than wipe the source's services.
 */
function syncSource(
  prefix: string,
  discovered: DiscoveredService[] | null,
): { added: number; updated: number; removed: number } {
  if (discovered === null) return { added: 0, updated: 0, removed: 0 }
  const discoveredIds = new Set(discovered.map((s) => s.id))

  const existing = db
    .prepare('SELECT id FROM services WHERE id LIKE ?')
    .all(`${prefix}%`) as { id: string }[]
  const existingIds = new Set(existing.map((e) => e.id))

  let added = 0
  let updated = 0
  const upsert = db.prepare(`
    INSERT INTO services (id, name, url, icon, description, category)
    VALUES (@id, @name, @url, @icon, @description, @category)
    ON CONFLICT(id) DO UPDATE SET
      name        = excluded.name,
      url         = excluded.url,
      icon        = excluded.icon,
      description = excluded.description,
      category    = excluded.category
  `)

  const tx = db.transaction((items: DiscoveredService[]) => {
    for (const s of items) {
      if (existingIds.has(s.id)) updated++
      else added++
      upsert.run(s)
    }
  })
  tx(discovered)

  let removed = 0
  for (const id of existingIds) {
    if (!discoveredIds.has(id)) {
      deleteServiceCascade(id)
      removed++
    }
  }

  if (added || removed) publish('services-changed', { added, removed })
  return { added, updated, removed }
}

export async function syncDockerServices() {
  return syncSource('docker:', await discoverFromLabels())
}

export async function syncK8sServices() {
  return syncSource('k8s:', await discoverFromIngresses())
}

function startLoop(
  tag: string,
  sync: () => Promise<{ added: number; updated: number; removed: number }>,
  intervalMs: number,
) {
  const run = () => {
    sync()
      .then((r) => {
        if (r.added || r.removed) {
          console.log(`[${tag}] +${r.added} ~${r.updated} -${r.removed}`)
        }
      })
      .catch((e) => console.warn(`[${tag}]`, e.message))
  }
  run()
  return setInterval(run, intervalMs)
}

export function startDiscoveryLoop(intervalMs = 30000) {
  return startLoop('discovery', syncDockerServices, intervalMs)
}

export function startK8sDiscoveryLoop(intervalMs = 30000) {
  return startLoop('k8s-discovery', syncK8sServices, intervalMs)
}
