import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// DB-managed password: no AUTH_PASSWORD env, isolated DB, no AUTH_SECRET (so the
// secret is DB-managed and rotation actually invalidates old sessions).
const tmp = mkdtempSync(join(tmpdir(), 'selfhost-pw-'))
process.env.DB_PATH = join(tmp, 'test.db')
process.env.YAML_PATH = join(tmp, 'nope.yaml')
process.env.DOCKER_SOCKET = join(tmp, 'no-docker.sock')
delete process.env.AUTH_PASSWORD
delete process.env.AUTH_SECRET
process.env.AUTH_FAIL_DELAY_MS = '0'

const { createApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const app = createApp({ enableLogger: false, serveStaticDir: null })

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://t${path}`, init))
}
function postJSON(path: string, body: unknown, headers: Record<string, string> = {}) {
  return req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
const cookieFrom = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]

after(() => {
  db.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('DB-managed password (no AUTH_PASSWORD env)', () => {
  let session = ''

  test('starts with auth off — API is open', async () => {
    const s = await (await req('/api/auth/status')).json()
    assert.deepEqual(s, { required: false, authed: true, env_managed: false })
    assert.equal((await req('/api/services')).status, 200)
  })

  test('bootstrap: set a password with no current one, gets a session', async () => {
    const r = await postJSON('/api/auth/password', { new_password: 'secret123' })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true, enabled: true })
    session = cookieFrom(r)
    assert.match(session, /sdash_session=/)
  })

  test('auth is now required and the API is locked', async () => {
    const s = await (await req('/api/auth/status')).json()
    assert.equal(s.required, true)
    assert.equal((await req('/api/services')).status, 401)
  })

  test('the bootstrap session unlocks the API', async () => {
    assert.equal((await req('/api/services', { headers: { cookie: session } })).status, 200)
  })

  test('login with the new password works', async () => {
    assert.equal((await postJSON('/api/auth/login', { password: 'secret123' })).status, 200)
  })

  test('changing the password without a session is rejected', async () => {
    const r = await postJSON('/api/auth/password', {
      current_password: 'secret123',
      new_password: 'newpass1',
    })
    assert.equal(r.status, 401)
  })

  test('changing with a wrong current password is rejected', async () => {
    const r = await postJSON(
      '/api/auth/password',
      { current_password: 'wrong', new_password: 'newpass1' },
      { cookie: session },
    )
    assert.equal(r.status, 401)
  })

  test('changing with session + correct current rotates the secret', async () => {
    const r = await postJSON(
      '/api/auth/password',
      { current_password: 'secret123', new_password: 'newpass1' },
      { cookie: session },
    )
    assert.equal(r.status, 200)
    const fresh = cookieFrom(r)
    // the old session no longer verifies (secret rotated)
    assert.equal((await req('/api/services', { headers: { cookie: session } })).status, 401)
    // the fresh cookie does
    assert.equal((await req('/api/services', { headers: { cookie: fresh } })).status, 200)
    session = fresh
  })

  test('a too-short password is rejected', async () => {
    const r = await postJSON(
      '/api/auth/password',
      { current_password: 'newpass1', new_password: 'ab' },
      { cookie: session },
    )
    assert.equal(r.status, 400)
  })

  test('disable by setting an empty password — API opens again', async () => {
    const r = await postJSON(
      '/api/auth/password',
      { current_password: 'newpass1', new_password: '' },
      { cookie: session },
    )
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true, enabled: false })
    const s = await (await req('/api/auth/status')).json()
    assert.equal(s.required, false)
    assert.equal((await req('/api/services')).status, 200)
  })
})
