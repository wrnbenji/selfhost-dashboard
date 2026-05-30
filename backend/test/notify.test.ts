import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPayload,
  reduceCheck,
  shouldNotify,
  validateConfig,
  type NotificationConfig,
} from '../src/notify-core.js'

describe('reduceCheck — confirmation / debounce', () => {
  test('first observation baselines without a transition', () => {
    const r = reduceCheck(undefined, 'online', 2)
    assert.equal(r.transition, null)
    assert.equal(r.state.confirmed, 'online')
  })

  test('a single offline blip does not fire with threshold 2', () => {
    const baseline = reduceCheck(undefined, 'online', 2).state
    const r = reduceCheck(baseline, 'offline', 2)
    assert.equal(r.transition, null)
    assert.equal(r.state.confirmed, 'online')
  })

  test('two consecutive offline checks fire down', () => {
    let r = reduceCheck(undefined, 'online', 2)
    r = reduceCheck(r.state, 'offline', 2)
    assert.equal(r.transition, null)
    r = reduceCheck(r.state, 'offline', 2)
    assert.equal(r.transition, 'down')
    assert.equal(r.state.confirmed, 'offline')
  })

  test('recovery fires after threshold online checks', () => {
    let r = reduceCheck(undefined, 'offline', 2) // baseline offline
    r = reduceCheck(r.state, 'online', 2) // 1 online
    assert.equal(r.transition, null)
    r = reduceCheck(r.state, 'online', 2) // 2 online
    assert.equal(r.transition, 'recovered')
    assert.equal(r.state.confirmed, 'online')
  })

  test('a blip back to the confirmed status resets the streak', () => {
    let r = reduceCheck(undefined, 'online', 2)
    r = reduceCheck(r.state, 'offline', 2) // streak 1
    r = reduceCheck(r.state, 'online', 2) // back to confirmed → reset
    assert.equal(r.transition, null)
    assert.equal(r.state.streak, 0)
    r = reduceCheck(r.state, 'offline', 2) // streak 1 again, not 2
    assert.equal(r.transition, null)
  })

  test('threshold 1 fires immediately', () => {
    let r = reduceCheck(undefined, 'online', 1)
    r = reduceCheck(r.state, 'offline', 1)
    assert.equal(r.transition, 'down')
  })

  test('unknown status never emits a transition', () => {
    let r = reduceCheck(undefined, 'online', 1)
    r = reduceCheck(r.state, 'unknown', 1)
    assert.equal(r.transition, null)
  })
})

describe('validateConfig', () => {
  test('accepts a valid discord config', () => {
    const r = validateConfig({
      enabled: true,
      channel: 'discord',
      webhook_url: 'https://discord.com/api/webhooks/1/abc',
    })
    assert.equal(r.ok, true)
  })

  test('rejects an unknown channel', () => {
    const r = validateConfig({ channel: 'telegram' })
    assert.equal(r.ok, false)
  })

  test('rejects an enabled webhook/discord channel without a valid url', () => {
    const r = validateConfig({ enabled: true, channel: 'webhook', webhook_url: '' })
    assert.equal(r.ok, false)
  })

  test('rejects an out-of-range failure_threshold', () => {
    const r = validateConfig({
      channel: 'discord',
      webhook_url: 'https://x.test/h',
      failure_threshold: 0,
    })
    assert.equal(r.ok, false)
  })

  test('allows a disabled config with empty fields', () => {
    const r = validateConfig({ enabled: false, channel: 'discord', webhook_url: '' })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.config.enabled, false)
  })
})

describe('buildPayload', () => {
  const event = {
    name: 'Plex',
    url: 'http://192.168.1.10:32400',
    transition: 'down' as const,
    ts: 1_700_000_000_000,
  }

  test('webhook payload carries service + status in a JSON body', () => {
    const cfg = {
      channel: 'webhook',
      webhook_url: 'https://hook.test/abc',
    } as NotificationConfig
    const p = buildPayload(cfg, event)
    assert.equal(p.url, 'https://hook.test/abc')
    const body = JSON.parse(p.body)
    assert.equal(body.service, 'Plex')
    assert.equal(body.status, 'down')
    assert.equal(body.url, event.url)
  })

  test('discord payload uses the content field', () => {
    const cfg = {
      channel: 'discord',
      webhook_url: 'https://discord.com/api/webhooks/1/abc',
    } as NotificationConfig
    const p = buildPayload(cfg, event)
    const body = JSON.parse(p.body)
    assert.equal(typeof body.content, 'string')
    assert.match(body.content, /Plex/)
  })
})

describe('shouldNotify — gating', () => {
  const base: NotificationConfig = {
    enabled: true,
    channel: 'discord',
    webhook_url: 'https://discord.com/api/webhooks/1/abc',
    notify_on_recovery: true,
    failure_threshold: 2,
    muted: [],
  }

  test('false when disabled', () => {
    assert.equal(shouldNotify({ ...base, enabled: false }, 'id', 'down'), false)
  })

  test('false when the channel is not configured', () => {
    assert.equal(shouldNotify({ ...base, webhook_url: '' }, 'id', 'down'), false)
  })

  test('false when the service is muted', () => {
    assert.equal(shouldNotify({ ...base, muted: ['id'] }, 'id', 'down'), false)
  })

  test('false for recovery when notify_on_recovery is off', () => {
    assert.equal(
      shouldNotify({ ...base, notify_on_recovery: false }, 'id', 'recovered'),
      false,
    )
  })

  test('true for a down event with a valid config', () => {
    assert.equal(shouldNotify(base, 'id', 'down'), true)
  })
})
