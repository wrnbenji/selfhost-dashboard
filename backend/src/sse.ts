type Listener = (event: string, data: unknown) => void

const listeners = new Set<Listener>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function publish(event: string, data: unknown): void {
  for (const fn of listeners) {
    try {
      fn(event, data)
    } catch {
      // ignore listener errors
    }
  }
}
