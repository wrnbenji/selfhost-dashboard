import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWidget } from '../src/widgets-core.js'

describe('validateWidget — embed', () => {
  test('accepts a valid embed and trims the title', () => {
    const r = validateWidget({ type: 'embed', title: '  Grafana  ', config: { url: 'http://x.test/d' } })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.title, 'Grafana')
      assert.equal((r.config as { url: string }).url, 'http://x.test/d')
    }
  })

  test('rejects an embed without a valid http url', () => {
    assert.equal(validateWidget({ type: 'embed', config: { url: 'ftp://x' } }).ok, false)
    assert.equal(validateWidget({ type: 'embed', config: {} }).ok, false)
  })

  test('clamps height into range and defaults when absent', () => {
    const tall = validateWidget({ type: 'embed', config: { url: 'http://x.test', height: 99999 } })
    const none = validateWidget({ type: 'embed', config: { url: 'http://x.test' } })
    if (tall.ok) assert.ok((tall.config as { height: number }).height <= 1200)
    if (none.ok) assert.ok((none.config as { height: number }).height > 0)
  })
})

describe('validateWidget — note', () => {
  test('accepts a note with text', () => {
    const r = validateWidget({ type: 'note', title: 'Links', config: { text: 'router: http://10.0.0.1' } })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal((r.config as { text: string }).text, 'router: http://10.0.0.1')
  })

  test('rejects a note with empty text', () => {
    assert.equal(validateWidget({ type: 'note', config: { text: '   ' } }).ok, false)
    assert.equal(validateWidget({ type: 'note', config: {} }).ok, false)
  })
})

describe('validateWidget — type', () => {
  test('rejects an unknown type', () => {
    assert.equal(validateWidget({ type: 'weather', config: {} }).ok, false)
  })
})
