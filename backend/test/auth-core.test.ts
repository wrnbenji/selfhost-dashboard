import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkPassword,
  hashPassword,
  signSession,
  verifyPassword,
  verifySession,
} from '../src/auth-core.js'

const SECRET = 'test-secret-abc'

describe('session token', () => {
  test('a freshly signed token verifies before expiry', () => {
    const tok = signSession(SECRET, 1000)
    assert.equal(verifySession(SECRET, tok, 999), true)
  })

  test('an expired token does not verify', () => {
    const tok = signSession(SECRET, 1000)
    assert.equal(verifySession(SECRET, tok, 1001), false)
  })

  test('a token signed with a different secret fails', () => {
    const tok = signSession(SECRET, 9999)
    assert.equal(verifySession('other-secret', tok, 0), false)
  })

  test('a tampered token fails', () => {
    const tok = signSession(SECRET, 9999)
    const bad = tok.slice(0, -1) + (tok.endsWith('a') ? 'b' : 'a')
    assert.equal(verifySession(SECRET, bad, 0), false)
  })

  test('missing or garbage tokens fail safely', () => {
    assert.equal(verifySession(SECRET, undefined, 0), false)
    assert.equal(verifySession(SECRET, '', 0), false)
    assert.equal(verifySession(SECRET, 'nonsense', 0), false)
    assert.equal(verifySession(SECRET, '123.deadbeef', 0), false)
    assert.equal(verifySession(SECRET, 'notanumber.abc', 0), false)
  })
})

describe('checkPassword', () => {
  test('the correct password passes', () => {
    assert.equal(checkPassword('hunter2', 'hunter2'), true)
  })

  test('a wrong password fails', () => {
    assert.equal(checkPassword('nope', 'hunter2'), false)
  })

  test('different lengths fail without throwing', () => {
    assert.equal(checkPassword('short', 'muchlongerpassword'), false)
  })

  test('an empty expected password always fails', () => {
    assert.equal(checkPassword('', ''), false)
    assert.equal(checkPassword('x', ''), false)
  })
})

describe('password hashing (scrypt)', () => {
  test('a hash round-trips with the correct password', () => {
    const stored = hashPassword('hunter2')
    assert.match(stored, /^[0-9a-f]+:[0-9a-f]+$/)
    assert.equal(verifyPassword('hunter2', stored), true)
  })

  test('a wrong password does not verify', () => {
    const stored = hashPassword('hunter2')
    assert.equal(verifyPassword('nope', stored), false)
  })

  test('the same password hashes differently each time (random salt)', () => {
    assert.notEqual(hashPassword('same'), hashPassword('same'))
  })

  test('garbage or empty stored values fail safely', () => {
    assert.equal(verifyPassword('x', ''), false)
    assert.equal(verifyPassword('x', 'nosalt'), false)
    assert.equal(verifyPassword('x', 'a:b:c'), false)
  })
})
