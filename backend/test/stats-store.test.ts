import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  forgetCardStats,
  getAllCardStats,
  getStatsHistory,
  setCardStats,
} from '../src/stats-store.js'

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

describe('stats history (ring buffer)', () => {
  test('accumulates cpu and mem samples in order', () => {
    forgetCardStats('docker:hist')
    for (const cpu of [10, 20, 30]) {
      setCardStats('docker:hist', { cpu_pct: cpu, mem_pct: 0, mem_used_bytes: cpu * 1000, mem_limit_bytes: 1 })
    }
    const h = getStatsHistory('docker:hist')
    assert.deepEqual(h.cpu, [10, 20, 30])
    assert.deepEqual(h.mem, [10000, 20000, 30000])
  })

  test('caps the buffer at 60 samples, dropping the oldest', () => {
    forgetCardStats('docker:cap')
    for (let i = 1; i <= 65; i++) {
      setCardStats('docker:cap', { cpu_pct: i, mem_pct: 0, mem_used_bytes: i, mem_limit_bytes: 1 })
    }
    const h = getStatsHistory('docker:cap')
    assert.equal(h.cpu.length, 60)
    assert.equal(h.cpu[0], 6) // 1..5 dropped
    assert.equal(h.cpu[59], 65)
  })

  test('forget clears history too', () => {
    setCardStats('docker:gone2', { cpu_pct: 1, mem_pct: 0, mem_used_bytes: 1, mem_limit_bytes: 1 })
    forgetCardStats('docker:gone2')
    assert.deepEqual(getStatsHistory('docker:gone2'), { cpu: [], mem: [] })
  })

  test('unknown id returns empty arrays', () => {
    assert.deepEqual(getStatsHistory('docker:never'), { cpu: [], mem: [] })
  })
})
