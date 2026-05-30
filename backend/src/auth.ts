import { randomBytes } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { getSetting, setSetting } from './db.js'
import { verifySession } from './auth-core.js'

export const COOKIE_NAME = 'sdash_session'
const SESSION_TTL_MS = 7 * 86_400_000 // 7 days

/** Auth is opt-in: a non-empty AUTH_PASSWORD turns the gate on. */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.AUTH_PASSWORD)
}

export function getPassword(): string {
  return process.env.AUTH_PASSWORD ?? ''
}

export function ttlMs(): number {
  return SESSION_TTL_MS
}

/**
 * The signing secret: AUTH_SECRET if set, otherwise a random one generated once
 * and persisted in settings so sessions survive restarts without operator setup.
 */
export function getSecret(): string {
  const fromEnv = process.env.AUTH_SECRET
  if (fromEnv) return fromEnv
  let stored = getSetting('auth_secret')
  if (!stored) {
    stored = randomBytes(32).toString('hex')
    setSetting('auth_secret', stored)
  }
  return stored
}

export function failDelayMs(): number {
  const v = Number(process.env.AUTH_FAIL_DELAY_MS ?? 400)
  return Number.isFinite(v) && v >= 0 ? v : 400
}

/** True when the request carries a valid session cookie. */
export function isAuthed(c: Context): boolean {
  const raw = c.req.header('cookie') ?? ''
  const token = parseCookie(raw, COOKIE_NAME)
  return verifySession(getSecret(), token, Date.now())
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return undefined
}

/**
 * Gate /api/* when auth is enabled. Always lets /api/health and /api/auth/*
 * through so the frontend can probe status and log in.
 */
export function authMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    if (!isAuthEnabled()) return next()
    const path = c.req.path
    if (path === '/api/health' || path.startsWith('/api/auth/')) return next()
    if (isAuthed(c)) return next()
    return c.json({ error: 'unauthorized' }, 401)
  }
}
