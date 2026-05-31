import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStats } from '../src/docker.js'

const MB = 1024 * 1024
const GB = 1024 * MB

describe('computeStats — CPU%', () => {
  test('cgroup v1 sample with online_cpus', () => {
    const s = computeStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000_000 },
        system_cpu_usage: 20_000_000_000,
        online_cpus: 4,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000_000 },
        system_cpu_usage: 10_000_000_000,
      },
      memory_stats: { usage: 500 * MB, limit: GB, stats: { total_inactive_file: 100 * MB } },
    })
    // (1e9/1e10) * 4 * 100 = 40
    assert.equal(s!.cpu_pct, 40)
  })

  test('falls back to percpu_usage length when online_cpus is absent', () => {
    const s = computeStats({
      cpu_stats: {
        cpu_usage: { total_usage: 1_500_000_000, percpu_usage: [0, 0] },
        system_cpu_usage: 20_000_000_000,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000_000 },
        system_cpu_usage: 10_000_000_000,
      },
      memory_stats: { usage: 100 * MB, limit: GB },
    })
    // (5e8/1e10) * 2 * 100 = 10
    assert.equal(s!.cpu_pct, 10)
  })

  test('zero system delta (cold read) yields 0%', () => {
    const s = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 5_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 10_000_000_000 },
      memory_stats: { usage: 50 * MB, limit: GB },
    })
    assert.equal(s!.cpu_pct, 0)
  })
})

describe('computeStats — memory', () => {
  test('cgroup v1 subtracts total_inactive_file', () => {
    const s = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 1 }, system_cpu_usage: 2, online_cpus: 1 },
      precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 1 },
      memory_stats: { usage: 500 * MB, limit: GB, stats: { total_inactive_file: 100 * MB } },
    })
    assert.equal(s!.mem_used_bytes, 400 * MB)
    assert.equal(s!.mem_limit_bytes, GB)
    // 400/1024 * 100 = 39.0625 -> 39.1
    assert.equal(s!.mem_pct, 39.1)
  })

  test('cgroup v2 subtracts inactive_file', () => {
    const s = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 1 }, system_cpu_usage: 2, online_cpus: 1 },
      precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 1 },
      memory_stats: { usage: 300 * MB, limit: GB, stats: { inactive_file: 50 * MB } },
    })
    assert.equal(s!.mem_used_bytes, 250 * MB)
  })

  test('a zero/absent limit gives 0% (no divide-by-zero)', () => {
    const s = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 1 }, system_cpu_usage: 2, online_cpus: 1 },
      precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 1 },
      memory_stats: { usage: 50 * MB, limit: 0 },
    })
    assert.equal(s!.mem_pct, 0)
  })

  test('returns null when the payload has no cpu/memory stats (stopped container)', () => {
    assert.equal(computeStats({} as never), null)
  })
})
