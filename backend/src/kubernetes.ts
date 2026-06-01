import { existsSync, readFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { parse } from 'yaml'
import { isValidHttpUrl } from './validate.js'
import type { DiscoveredService } from './docker.js'

export interface Ingress {
  metadata: {
    name: string
    namespace: string
    annotations?: Record<string, string> | null
  }
  spec: {
    rules?: { host?: string; http?: { paths?: { path?: string }[] } }[]
    tls?: { hosts?: string[] }[]
  }
}

export interface ResolvedConfig {
  server: string
  ca?: Buffer
  token?: string
  clientCert?: Buffer
  clientKey?: Buffer
  insecure: boolean
}

/**
 * Pure-ish: resolve the current-context cluster/user from kubeconfig YAML into a
 * ResolvedConfig. Inline base64 `*-data` fields are decoded directly; file-path
 * fields are read from disk. Returns null if the current context can't resolve.
 */
export function parseKubeconfig(yamlText: string): ResolvedConfig | null {
  const cfg = parse(yamlText) as any
  const ctx = cfg?.contexts?.find((c: any) => c.name === cfg['current-context'])?.context
  if (!ctx) return null
  const cluster = cfg.clusters?.find((c: any) => c.name === ctx.cluster)?.cluster
  const user = cfg.users?.find((u: any) => u.name === ctx.user)?.user
  if (!cluster?.server) return null

  const out: ResolvedConfig = {
    server: cluster.server,
    insecure: cluster['insecure-skip-tls-verify'] === true,
  }
  if (cluster['certificate-authority-data'])
    out.ca = Buffer.from(cluster['certificate-authority-data'], 'base64')
  else if (cluster['certificate-authority'])
    out.ca = readFileSync(cluster['certificate-authority'])

  if (user?.token) out.token = user.token
  if (user?.['client-certificate-data'])
    out.clientCert = Buffer.from(user['client-certificate-data'], 'base64')
  else if (user?.['client-certificate'])
    out.clientCert = readFileSync(user['client-certificate'])
  if (user?.['client-key-data'])
    out.clientKey = Buffer.from(user['client-key-data'], 'base64')
  else if (user?.['client-key']) out.clientKey = readFileSync(user['client-key'])

  return out
}

/** Shape of the K8s ingress list response; consumed by listIngresses(). */
interface IngressList {
  items?: Ingress[]
}

/** Build the service URL from an ingress, honoring a dashboard.url override. */
function ingressUrl(ing: Ingress): string {
  const ann = ing.metadata.annotations ?? {}
  if (ann['dashboard.url']) return ann['dashboard.url']

  const rule = ing.spec.rules?.find((r) => r.host)
  if (!rule?.host) return ''
  const host = rule.host

  const tlsHosts = new Set((ing.spec.tls ?? []).flatMap((t) => t.hosts ?? []))
  const scheme = tlsHosts.has(host) ? 'https' : 'http'

  // Use the first concrete path, but skip "/" and rewrite-style regex paths
  // (e.g. "/(.*)", "/api(/|$)") that aren't meaningful as a browser URL.
  const path = rule.http?.paths?.find((p) => p.path)?.path ?? ''
  const usePath = path && path !== '/' && !/[*()$]/.test(path) ? path : ''

  return `${scheme}://${host}${usePath}`
}

/**
 * Pure: turn a list of K8s Ingress objects into discovered services.
 * Keeps only ingresses annotated `dashboard.enable=true`; annotations override
 * the derived name/url/icon/description/category. Invalid URLs are dropped.
 */
export function ingressesToServices(items: Ingress[]): DiscoveredService[] {
  return items
    .filter((ing) => ing.metadata.annotations?.['dashboard.enable'] === 'true')
    .map((ing) => {
      const ann = ing.metadata.annotations ?? {}
      return {
        id: `k8s:${ing.metadata.namespace}/${ing.metadata.name}`,
        name: ann['dashboard.name'] || ing.metadata.name,
        url: ingressUrl(ing),
        icon: ann['dashboard.icon'] || null,
        description: ann['dashboard.description'] || null,
        category: ann['dashboard.category'] || null,
      }
    })
    // final safety net: drops empty/malformed URLs (and anything the path filter let through)
    .filter((s) => isValidHttpUrl(s.url))
}

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'

/** ServiceAccount token + CA mounted into the pod, or null if not in-cluster. */
function inClusterConfig(): ResolvedConfig | null {
  if (!existsSync(SA_DIR)) return null
  const host = process.env.KUBERNETES_SERVICE_HOST
  if (!host) return null
  const port = process.env.KUBERNETES_SERVICE_PORT ?? '443'
  try {
    return {
      server: `https://${host}:${port}`,
      ca: readFileSync(`${SA_DIR}/ca.crt`),
      token: readFileSync(`${SA_DIR}/token`, 'utf8').trim(),
      insecure: false,
    }
  } catch {
    return null
  }
}

/** Path to a usable kubeconfig, from $KUBECONFIG or ~/.kube/config. */
function kubeconfigPath(): string | null {
  const fromEnv = process.env.KUBECONFIG
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const home = process.env.HOME
  const fallback = home ? `${home}/.kube/config` : null
  if (fallback && existsSync(fallback)) return fallback
  return null
}

/** In-cluster first, kubeconfig second. Re-read each cycle so rotated tokens are picked up. */
function resolveConfig(): ResolvedConfig | null {
  const inCluster = inClusterConfig()
  if (inCluster) return inCluster
  const kcPath = kubeconfigPath()
  if (!kcPath) return null
  try {
    return parseKubeconfig(readFileSync(kcPath, 'utf8'))
  } catch {
    return null
  }
}

/** True when K8s discovery can run. `K8S_DISCOVERY=off` force-disables it. */
export function kubernetesAvailable(): boolean {
  if (process.env.K8S_DISCOVERY === 'off') return false
  return resolveConfig() !== null
}

function listIngresses(cfg: ResolvedConfig): Promise<Ingress[]> {
  return new Promise((resolve, reject) => {
    const url = new URL('/apis/networking.k8s.io/v1/ingresses', cfg.server)
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || '443',
        path: url.pathname + url.search,
        method: 'GET',
        ca: cfg.ca,
        cert: cfg.clientCert,
        key: cfg.clientKey,
        rejectUnauthorized: !cfg.insecure,
        headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`k8s ingresses → ${res.statusCode}: ${body}`))
            return
          }
          try {
            resolve((JSON.parse(body) as IngressList).items ?? [])
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

/**
 * Returns discovered services, or `null` when discovery could not run (no access
 * / API error). `null` is distinct from `[]` ("ran fine, nothing matched") so a
 * transient outage never wipes discovered services.
 */
export async function discoverFromIngresses(): Promise<DiscoveredService[] | null> {
  const cfg = resolveConfig()
  if (!cfg) return null
  try {
    const items = await listIngresses(cfg)
    return ingressesToServices(items)
  } catch (e) {
    console.warn('[k8s] discovery failed:', (e as Error).message)
    return null
  }
}
