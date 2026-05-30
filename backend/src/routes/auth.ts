import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { signSession } from '../auth-core.js'
import {
  clearStoredPassword,
  COOKIE_NAME,
  failDelayMs,
  getSecret,
  isAuthed,
  isAuthEnabled,
  isEnvManaged,
  setStoredPassword,
  ttlMs,
  verifyLogin,
} from '../auth.js'

export const auth = new Hono()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cookieSecure = (): boolean => process.env.AUTH_COOKIE_SECURE === '1'

function issueSession(c: Context) {
  setCookie(c, COOKIE_NAME, signSession(getSecret(), Date.now() + ttlMs()), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: Math.floor(ttlMs() / 1000),
  })
}

auth.get('/status', (c) => {
  const required = isAuthEnabled()
  return c.json({
    required,
    authed: required ? isAuthed(c) : true,
    env_managed: isEnvManaged(),
  })
})

auth.post('/login', async (c) => {
  if (!isAuthEnabled()) {
    return c.json({ error: 'auth is not enabled' }, 400)
  }
  let body: { password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  const submitted = typeof body.password === 'string' ? body.password : ''
  if (!verifyLogin(submitted)) {
    await sleep(failDelayMs()) // slow brute-force attempts
    return c.json({ error: 'invalid password' }, 401)
  }
  issueSession(c)
  return c.json({ ok: true })
})

auth.post('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.json({ ok: true })
})

/**
 * Set, change, or disable the UI-managed password.
 * - Env-managed → refused (the operator pinned it via AUTH_PASSWORD).
 * - A password already set → requires a valid session AND the current password.
 * - No password yet → bootstrap: allowed without a session (the dashboard is
 *   open anyway until a password exists).
 * - An empty `new_password` disables auth.
 * On success the secret rotates (logging out other sessions); the caller gets a
 * fresh cookie so they stay signed in.
 */
auth.post('/password', async (c) => {
  if (isEnvManaged()) {
    return c.json({ error: 'password is managed by the AUTH_PASSWORD environment variable' }, 400)
  }
  let body: { current_password?: unknown; new_password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const alreadySet = isAuthEnabled()
  if (alreadySet) {
    if (!isAuthed(c)) return c.json({ error: 'unauthorized' }, 401)
    const current = typeof body.current_password === 'string' ? body.current_password : ''
    if (!verifyLogin(current)) {
      await sleep(failDelayMs())
      return c.json({ error: 'current password is incorrect' }, 401)
    }
  }

  const next = typeof body.new_password === 'string' ? body.new_password : ''
  if (!next) {
    clearStoredPassword()
    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return c.json({ ok: true, enabled: false })
  }
  if (next.length < 4) {
    return c.json({ error: 'password must be at least 4 characters' }, 400)
  }
  setStoredPassword(next)
  issueSession(c) // fresh cookie signed with the rotated secret
  return c.json({ ok: true, enabled: true })
})
