import { useEffect } from 'react'
import type { CardStats } from '../types'

interface Handlers {
  onStatus: (msg: { id: string; status: 'online' | 'offline' | 'unknown'; last_check: number }) => void
  onServicesChanged: () => void
  onContainerStats: (msg: { id: string } & CardStats) => void
}

export function useServiceEvents({ onStatus, onServicesChanged, onContainerStats }: Handlers) {
  useEffect(() => {
    const es = new EventSource('/api/events')

    const statusHandler = (e: MessageEvent) => {
      try {
        onStatus(JSON.parse(e.data))
      } catch {}
    }
    const changedHandler = () => onServicesChanged()
    const statsHandler = (e: MessageEvent) => {
      try {
        onContainerStats(JSON.parse(e.data))
      } catch {}
    }

    es.addEventListener('status', statusHandler)
    es.addEventListener('services-changed', changedHandler)
    es.addEventListener('stats', statsHandler)
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    }

    return () => {
      es.removeEventListener('status', statusHandler)
      es.removeEventListener('services-changed', changedHandler)
      es.removeEventListener('stats', statsHandler)
      es.close()
    }
  }, [onStatus, onServicesChanged, onContainerStats])
}
