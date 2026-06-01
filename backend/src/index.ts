import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { startDiscoveryLoop, startK8sDiscoveryLoop } from './discovery.js'
import { dockerAvailable } from './docker.js'
import { kubernetesAvailable } from './kubernetes.js'
import { endMonitorSession, startMonitorSession } from './monitor.js'
import { startHealthChecks } from './scheduler.js'
import { loadYamlConfig, watchYamlConfig } from './yaml-config.js'

const app = createApp()

startMonitorSession()
loadYamlConfig()
const yamlWatcher = watchYamlConfig()
const stopHealthChecks = startHealthChecks(
  Number(process.env.HEALTH_INTERVAL_MS ?? 30000),
)
let discoveryTimer: ReturnType<typeof setInterval> | null = null
if (dockerAvailable()) {
  discoveryTimer = startDiscoveryLoop(
    Number(process.env.DISCOVERY_INTERVAL_MS ?? 30000),
  )
} else {
  console.log('[docker] socket not found — discovery disabled')
}
let k8sDiscoveryTimer: ReturnType<typeof setInterval> | null = null
if (kubernetesAvailable()) {
  k8sDiscoveryTimer = startK8sDiscoveryLoop(
    Number(process.env.DISCOVERY_INTERVAL_MS ?? 30000),
  )
  console.log('[k8s] cluster access detected — ingress discovery enabled')
} else {
  console.log('[k8s] no cluster access — ingress discovery disabled')
}

const port = Number(process.env.PORT ?? 3001)
const server = serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`backend listening on http://localhost:${port}`)
})

function shutdown() {
  stopHealthChecks()
  if (discoveryTimer) clearInterval(discoveryTimer)
  if (k8sDiscoveryTimer) clearInterval(k8sDiscoveryTimer)
  yamlWatcher?.close()
  endMonitorSession()
  server.close(() => process.exit(0))
  // failsafe — if close hangs, force exit
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
