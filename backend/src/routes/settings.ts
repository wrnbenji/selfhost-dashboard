import { Hono } from 'hono'
import { db, getSetting, setSetting } from '../db.js'

export const settings = new Hono()

const ALLOWED_RETENTION = new Set(['1', '7', '30'])

settings.get('/', (c) => {
  return c.json({
    retention_days: Number(getSetting('retention_days') ?? '7'),
  })
})

settings.patch('/', async (c) => {
  const body = await c.req.json<{ retention_days?: number }>()
  if (body.retention_days !== undefined) {
    const v = String(body.retention_days)
    if (!ALLOWED_RETENTION.has(v)) {
      return c.json({ error: 'retention_days must be 1, 7, or 30' }, 400)
    }
    setSetting('retention_days', v)
    // immediately prune to reflect new retention
    const cutoff = Date.now() - Number(v) * 86_400_000
    db.prepare('DELETE FROM checks WHERE ts < ?').run(cutoff)
  }
  return c.json({
    retention_days: Number(getSetting('retention_days') ?? '7'),
  })
})
