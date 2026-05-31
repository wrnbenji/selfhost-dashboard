import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { forgetCardStats, getAllCardStats, setCardStats } from '../src/stats-store.js'

describe('card stats store', () => {
  test('stores only cpu_pct and mem_used_bytes, keyed by id', () => {
    setCardStats('docker:abc', {
      cpu_pct: 12.5,
      mem_pct: 40,
      mem_used_bytes: 999,
      mem_limit_bytes: 9999,
    })
    const all = getAllCardStats()
    assert.deepEqual(all['docker:abc'], { cpu_pct: 12.5, mem_used_bytes: 999 })
    // the limit/pct fields are not retained for the cards
    assert.equal('mem_limit_bytes' in all['docker:abc'], false)
  })

  test('forget removes an entry', () => {
    setCardStats('docker:gone', { cpu_pct: 1, mem_pct: 1, mem_used_bytes: 1, mem_limit_bytes: 1 })
    forgetCardStats('docker:gone')
    assert.equal('docker:gone' in getAllCardStats(), false)
  })
})
