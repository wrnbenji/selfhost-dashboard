import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ServiceStats, StatsWindow, TimelineBucket } from '../types'

export function useRowStats(
  serviceId: string,
  window: StatsWindow,
  bumpKey: number,
) {
  const [stats, setStats] = useState<ServiceStats | null>(null)
  const [timeline, setTimeline] = useState<TimelineBucket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.serviceStats(serviceId, window),
      api.timeline(serviceId, window, 32),
    ])
      .then(([s, t]) => {
        if (!cancelled) {
          setStats(s)
          setTimeline(t.buckets)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [serviceId, window, bumpKey])

  return { stats, timeline }
}
