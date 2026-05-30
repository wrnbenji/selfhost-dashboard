import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Configure auth + isolated DB BEFORE importing modules that read them.
const tmp = mkdtempSync(join(tmpdir(), 'selfhost-auth-'))
process.env.DB_PATH = join(tmp, 'test.db')
process.env.YAML_PATH = join(tmp, 'nope.yaml')
process.env.DOCKER_SOCKET = join(tmp, 'no-docker.sock')
process.env.AUTH_PASSWORD = 'hunter2'
process.env.AUTH_SECRET = 'fixed-test-secret'
process.env.AUTH_FAIL_DELAY_MS = '0'

const { createApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const app = createApp({ enableLogger: false, serveStaticDir: null })

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://t${path}`, init))
}
async function postJSON(path: string, body: unknown, headers: Record<string, string> = {}) {
  return req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

after(() => {
  db.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('auth gate (AUTH_PASSWORD set)', () => {
  test('health is reachable without a session', async () => {
    assert.equal((await req('/api/health')).status, 200)
  })

  test('status reports auth required and not yet authed', async () => {
    const r = await req('/api/auth/status')
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), {
      required: true,
      authed: false,
      env_managed: true,
    })
  })

  test('a protected route is 401 without a session', async () => {
    assert.equal((await req('/api/services')).status, 401)
  })

  test('login with a wrong password is 401', async () => {
    const r = await postJSON('/api/auth/login', { password: 'wrong' })
    assert.equal(r.status, 401)
  })

  test('login with the correct password sets a session cookie and unlocks the API', async () => {
    const r = await postJSON('/api/auth/login', { password: 'hunter2' })
    assert.equal(r.status, 200)
    const setCookie = r.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /sdash_session=/)
    assert.match(setCookie, /HttpOnly/i)

    const cookie = setCookie.split(';')[0]
    const protectedRes = await req('/api/services', { headers: { cookie } })
    assert.equal(protectedRes.status, 200)

    const status = await (await req('/api/auth/status', { headers: { cookie } })).json()
    assert.deepEqual(status, { required: true, authed: true, env_managed: true })
  })

  test('logout clears the cookie', async () => {
    const r = await postJSON('/api/auth/logout', {})
    assert.equal(r.status, 200)
    assert.match(r.headers.get('set-cookie') ?? '', /sdash_session=/)
  })

  test('a forged cookie does not unlock the API', async () => {
    const r = await req('/api/services', {
      headers: { cookie: 'sdash_session=9999999999999.deadbeef' },
    })
    assert.equal(r.status, 401)
  })

  test('changing the password is refused when env-managed', async () => {
    const r = await postJSON('/api/auth/password', { new_password: 'whatever' })
    assert.equal(r.status, 400)
  })
})
