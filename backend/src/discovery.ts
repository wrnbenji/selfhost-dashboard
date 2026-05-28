import { db } from './db.js'
import { discoverFromLabels } from './docker.js'
import { deleteServiceCascade } from './routes/services.js'
import { publish } from './sse.js'

export async function syncDockerServices(): Promise<{
  added: number
  updated: number
  removed: number
}> {
  const discovered = await discoverFromLabels()
  // null = discovery could not run (no socket / API error). Do nothing rather
  // than treating it as "no containers" and wiping every discovered service.
  if (discovered === null) return { added: 0, updated: 0, removed: 0 }
  const discoveredIds = new Set(discovered.map((s) => s.id))

  const existing = db
    .prepare("SELECT id FROM services WHERE id LIKE 'docker:%'")
    .all() as { id: string }[]
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

  const tx = db.transaction((items: typeof discovered) => {
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

export function startDiscoveryLoop(intervalMs = 30000) {
  const run = () => {
    syncDockerServices()
      .then((r) => {
        if (r.added || r.removed) {
          console.log(
            `[discovery] +${r.added} ~${r.updated} -${r.removed}`,
          )
        }
      })
      .catch((e) => console.warn('[discovery]', e.message))
  }
  run()
  return setInterval(run, intervalMs)
}
