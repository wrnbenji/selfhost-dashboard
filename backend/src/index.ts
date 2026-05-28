import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { startDiscoveryLoop } from './discovery.js'
import { dockerAvailable } from './docker.js'
import { endMonitorSession, startMonitorSession } from './monitor.js'
import { startHealthChecks } from './scheduler.js'
import { loadYamlConfig, watchYamlConfig } from './yaml-config.js'

const app = createApp()

startMonitorSession()
loadYamlConfig()
watchYamlConfig()
startHealthChecks(Number(process.env.HEALTH_INTERVAL_MS ?? 30000))
if (dockerAvailable()) {
  startDiscoveryLoop(Number(process.env.DISCOVERY_INTERVAL_MS ?? 30000))
} else {
  console.log('[docker] socket not found — discovery disabled')
}

const port = Number(process.env.PORT ?? 3001)
const server = serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`backend listening on http://localhost:${port}`)
})

function shutdown() {
  endMonitorSession()
  server.close(() => process.exit(0))
  // failsafe — if close hangs, force exit
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
