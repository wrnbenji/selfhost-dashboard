/**
 * URL guard for everything we will later fetch() during health checks.
 * Only http(s) is allowed — this blocks file://, javascript:, and other
 * schemes that turn the health-check probe into an SSRF / local-file vector.
 */
export function isValidHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
