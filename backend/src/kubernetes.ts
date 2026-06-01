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

/** Shape of the K8s ingress list response; consumed by the API client (later task). */
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
