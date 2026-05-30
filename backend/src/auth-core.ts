import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

function hmac(secret: string, msg: string): string {
  return createHmac('sha256', secret).update(msg).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/**
 * A session token is `<expMs>.<hmac>`, where the HMAC-SHA256 is taken over the
 * expiry string with the server secret. Stateless — no server-side session store.
 */
export function signSession(secret: string, expMs: number): string {
  const payload = String(Math.floor(expMs))
  return `${payload}.${hmac(secret, payload)}`
}

export function verifySession(
  secret: string,
  token: string | undefined,
  nowMs: number,
): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d+$/.test(payload)) return false
  if (!safeEqualHex(sig, hmac(secret, payload))) return false
  return Number(payload) > nowMs
}

/**
 * Constant-time password check. Both sides are SHA-256'd first so the comparison
 * is fixed-length and never leaks the password length through timing.
 */
export function checkPassword(submitted: string, expected: string): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(String(submitted)).digest()
  const b = createHash('sha256').update(String(expected)).digest()
  return timingSafeEqual(a, b)
}
