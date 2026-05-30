import { randomBytes } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteSetting, getSetting, setSetting } from './db.js'
import { checkPassword, hashPassword, verifyPassword, verifySession } from './auth-core.js'

export const COOKIE_NAME = 'sdash_session'
const HASH_KEY = 'auth_password_hash'
const SESSION_TTL_MS = 7 * 86_400_000 // 7 days

const envPassword = (): string => process.env.AUTH_PASSWORD ?? ''
const storedHash = (): string | null => getSetting(HASH_KEY)

/** True when the operator pinned the password via the AUTH_PASSWORD env var. */
export function isEnvManaged(): boolean {
  return Boolean(envPassword())
}

/**
 * Auth is on when a password exists — either pinned via AUTH_PASSWORD (env wins)
 * or set from the UI and stored (hashed) in the database.
 */
export function isAuthEnabled(): boolean {
  return isEnvManaged() || Boolean(storedHash())
}

/** Validate a submitted login password against the active source. */
export function verifyLogin(submitted: string): boolean {
  if (isEnvManaged()) return checkPassword(submitted, envPassword())
  return verifyPassword(submitted, storedHash() ?? undefined)
}

/** Set (or change) the UI-managed password. Rotates the secret to drop sessions. */
export function setStoredPassword(plain: string): void {
  setSetting(HASH_KEY, hashPassword(plain))
  rotateSecret()
}

/** Disable UI-managed auth by clearing the stored password. */
export function clearStoredPassword(): void {
  deleteSetting(HASH_KEY)
  rotateSecret()
}

/** Rotate the signing secret so every existing session cookie stops verifying. */
export function rotateSecret(): void {
  setSetting('auth_secret', randomBytes(32).toString('hex'))
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
