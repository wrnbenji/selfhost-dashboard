import { useEffect } from 'react'

interface Handlers {
  onStatus: (msg: { id: string; status: 'online' | 'offline' | 'unknown'; last_check: number }) => void
  onServicesChanged: () => void
}

export function useServiceEvents({ onStatus, onServicesChanged }: Handlers) {
  useEffect(() => {
    const es = new EventSource('/api/events')

    const statusHandler = (e: MessageEvent) => {
      try {
        onStatus(JSON.parse(e.data))
      } catch {}
    }
    const changedHandler = () => onServicesChanged()

    es.addEventListener('status', statusHandler)
    es.addEventListener('services-changed', changedHandler)
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    }

    return () => {
      es.removeEventListener('status', statusHandler)
      es.removeEventListener('services-changed', changedHandler)
      es.close()
    }
  }, [onStatus, onServicesChanged])
}
