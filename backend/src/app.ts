import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authMiddleware } from './auth.js'
import { auth } from './routes/auth.js'
import { events } from './routes/events.js'
import { monitor } from './routes/monitor.js'
import { notifications } from './routes/notifications.js'
import { services } from './routes/services.js'
import { settings } from './routes/settings.js'
import { stats } from './routes/stats.js'

export interface AppOptions {
  serveStaticDir?: string | null
  enableLogger?: boolean
}

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono()
  if (opts.enableLogger !== false) app.use('*', logger())
  // Same-origin in production (frontend is served statically). CORS_ORIGIN lets
  // operators restrict cross-origin callers; defaults to open for LAN/dev use.
  app.use('/api/*', cors({ origin: process.env.CORS_ORIGIN ?? '*' }))

  // Convert any uncaught handler error into a clean JSON 500 (no stack leak).
  app.onError((err, c) => {
    console.error('[api] unhandled error:', err)
    return c.json({ error: 'internal server error' }, 500)
  })

  // Gate the API when AUTH_PASSWORD is set (no-op otherwise). Must run before
  // the routes; it lets /api/health and /api/auth/* through itself.
  app.use('/api/*', authMiddleware())

  app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
  app.route('/api/auth', auth)
  app.route('/api/services', services)
  app.route('/api/events', events)
  app.route('/api/stats', stats)
  app.route('/api/settings', settings)
  app.route('/api/monitor', monitor)
  app.route('/api/notifications', notifications)

  // Unknown API routes get a JSON 404 — never fall through to the SPA index.html.
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))

  const staticDir =
    opts.serveStaticDir === null
      ? null
      : opts.serveStaticDir ??
        resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

  if (staticDir && existsSync(staticDir)) {
    app.use('/*', serveStatic({ root: staticDir }))
    app.get('*', serveStatic({ path: `${staticDir}/index.html` }))
  }

  return app
}
