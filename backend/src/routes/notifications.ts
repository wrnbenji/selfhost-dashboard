import { Hono } from 'hono'
import { getConfig, maskConfig, saveConfig, sendTest } from '../notify.js'
import { validateConfig, type NotificationConfig } from '../notify-core.js'

export const notifications = new Hono()

// Keys a client may set. Secrets are only overwritten when explicitly provided,
// so a GET (which never returns them) followed by a PATCH won't wipe them.
const WRITABLE: (keyof NotificationConfig)[] = [
  'enabled',
  'channel',
  'webhook_url',
  'notify_on_recovery',
  'failure_threshold',
  'muted',
]

notifications.get('/', (c) => {
  return c.json(maskConfig(getConfig()))
})

notifications.patch('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const merged: Record<string, unknown> = { ...getConfig() }
  for (const key of WRITABLE) {
    if (key in body) merged[key] = body[key]
  }

  const result = validateConfig(merged)
  if (!result.ok) {
    return c.json({ error: result.error }, 400)
  }
  saveConfig(result.config)
  return c.json(maskConfig(result.config))
})

notifications.post('/test', async (c) => {
  const result = await sendTest()
  return c.json(result, result.ok ? 200 : 502)
})
