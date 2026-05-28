import { existsSync, readFileSync, watch } from 'node:fs'
import { parse } from 'yaml'
import { db } from './db.js'
import { deleteServiceCascade } from './routes/services.js'
import { publish } from './sse.js'
import { isValidHttpUrl } from './validate.js'

const YAML_PATH = process.env.YAML_PATH ?? './services.yaml'

interface YamlService {
  id?: string
  name: string
  url: string
  icon?: string
  description?: string
  category?: string
}

interface YamlFile {
  services?: YamlService[]
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function syncYaml(): { added: number; removed: number } {
  if (!existsSync(YAML_PATH)) return { added: 0, removed: 0 }

  let parsed: YamlFile
  try {
    parsed = parse(readFileSync(YAML_PATH, 'utf8')) as YamlFile
  } catch (e) {
    console.warn('[yaml] parse error:', (e as Error).message)
    return { added: 0, removed: 0 }
  }

  const items = (parsed?.services ?? [])
    .filter((s) => {
      if (s?.name && isValidHttpUrl(s.url)) return true
      console.warn(`[yaml] skipping invalid service entry: ${s?.name ?? '(no name)'}`)
      return false
    })
    .map((s) => ({
      id: `yaml:${s.id ?? slugify(s.name)}`,
      name: s.name,
      url: s.url,
      icon: s.icon ?? null,
      description: s.description ?? null,
      category: s.category ?? null,
    }))
  const ids = new Set(items.map((i) => i.id))

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

  let added = 0
  const existing = db
    .prepare("SELECT id FROM services WHERE id LIKE 'yaml:%'")
    .all() as { id: string }[]
  const existingIds = new Set(existing.map((e) => e.id))

  const tx = db.transaction(() => {
    for (const it of items) {
      if (!existingIds.has(it.id)) added++
      upsert.run(it)
    }
  })
  tx()

  let removed = 0
  for (const id of existingIds) {
    if (!ids.has(id)) {
      deleteServiceCascade(id)
      removed++
    }
  }
  return { added, removed }
}

export function loadYamlConfig() {
  const r = syncYaml()
  if (r.added || r.removed) {
    console.log(`[yaml] +${r.added} -${r.removed}`)
    publish('services-changed', r)
  }
}

export function watchYamlConfig() {
  if (!existsSync(YAML_PATH)) return
  let timer: NodeJS.Timeout | null = null
  watch(YAML_PATH, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      console.log('[yaml] reloading')
      loadYamlConfig()
    }, 250)
  })
}
