import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { checkPassword, signSession } from '../auth-core.js'
import {
  COOKIE_NAME,
  failDelayMs,
  getPassword,
  getSecret,
  isAuthEnabled,
  isAuthed,
  ttlMs,
} from '../auth.js'

export const auth = new Hono()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const cookieSecure = (): boolean => process.env.AUTH_COOKIE_SECURE === '1'

auth.get('/status', (c) => {
  const required = isAuthEnabled()
  return c.json({ required, authed: required ? isAuthed(c) : true })
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
  if (!checkPassword(submitted, getPassword())) {
    // Slow brute-force attempts.
    await sleep(failDelayMs())
    return c.json({ error: 'invalid password' }, 401)
  }

  const exp = Date.now() + ttlMs()
  setCookie(c, COOKIE_NAME, signSession(getSecret(), exp), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: Math.floor(ttlMs() / 1000),
  })
  return c.json({ ok: true })
})

auth.post('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.json({ ok: true })
})
