import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { subscribe } from '../sse.js'

export const events = new Hono()

events.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0
    const unsubscribe = subscribe((event, data) => {
      stream
        .writeSSE({
          id: String(id++),
          event,
          data: JSON.stringify(data),
        })
        .catch(() => {})
    })

    await stream.writeSSE({
      event: 'hello',
      data: JSON.stringify({ ts: Date.now() }),
    })

    const ping = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {})
    }, 25000)

    stream.onAbort(() => {
      clearInterval(ping)
      unsubscribe()
    })

    await new Promise<void>((resolve) => {
      stream.onAbort(resolve)
    })
  })
})
